const SPREADSHEET_ID = "1R023xpsvux5rK2TvaHP9iEKfsMSd_9flh_WFXzIOwY4";
const MAILERLITE_SUBSCRIBERS_ENDPOINT = "https://connect.mailerlite.com/api/subscribers";
const MAILERLITE_API_TOKEN_PROPERTY = "MAILERLITE_API_TOKEN";

const MAILERLITE_GROUPS = {
  "Need Help": {
    id: "182321240648713577",
    label: "Help Requests",
  },
  "Crisis Relief": {
    id: "182321240648713577",
    label: "Help Requests",
  },
};

const TAB_COLUMNS = {
  "Need Help": [
    "submitted_at",
    "status",
    "name",
    "email",
    "phone",
    "person_needing_help",
    "request",
    "email_opt_in",
    "mailerlite_group",
    "mailerlite_status",
    "internal_notes",
  ],
  "Veteran Outreach": [
    "submitted_at",
    "status",
    "name",
    "email",
    "phone",
    "branch",
    "request",
    "email_opt_in",
    "mailerlite_group",
    "mailerlite_status",
    "internal_notes",
  ],
  "Homeless Outreach": [
    "submitted_at",
    "status",
    "intake_type",
    "name",
    "email",
    "phone",
    "request",
    "email_opt_in",
    "mailerlite_group",
    "mailerlite_status",
    "internal_notes",
  ],
  "Crisis Relief": [
    "submitted_at",
    "status",
    "name",
    "email",
    "phone",
    "city_area",
    "crisis_type",
    "request",
    "email_opt_in",
    "mailerlite_group",
    "mailerlite_status",
    "internal_notes",
  ],
};

function doPost(e) {
  return handleSubmit_(e);
}

function doGet(e) {
  return handleSubmit_(e);
}

function handleSubmit_(e) {
  try {
    const incoming = normalizeIncomingPayload_(parseIncomingPayload_(e));
    const tab = String(incoming.tab || "").trim();

    if (!TAB_COLUMNS[tab]) {
      return jsonResponse_({ ok: false, error: "Unknown tab" });
    }

    const payload = applyDefaults_(incoming, tab);
    const columns = TAB_COLUMNS[tab];
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = getOrCreateSheet_(spreadsheet, tab, columns);
    const row = columns.map((column) => normalizeCell_(payload[column]));

    sheet.appendRow(row);
    const rowNumber = sheet.getLastRow();
    const mailerLiteResult = syncMailerLiteIfNeeded_(payload, tab);
    updateMailerliteStatus_(sheet, rowNumber, columns, payload, mailerLiteResult);

    return jsonResponse_({
      ok: true,
      tab: tab,
      mailerlite_status: mailerLiteResult.status,
    });
  } catch (error) {
    return jsonResponse_({ ok: false, error: String(error) });
  }
}

function parseIncomingPayload_(e) {
  if (!e) return {};

  if (e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (_) {
      // Fall back to e.parameter for form-encoded input.
    }
  }

  return e.parameter || {};
}

function normalizeIncomingPayload_(rawInput) {
  const input = rawInput && typeof rawInput === "object" ? { ...rawInput } : {};
  let normalized = { ...input };

  // Backward compatibility with wrapped payloads: { formName, payload: { ...fields } }
  if (normalized.payload) {
    let nestedPayload = normalized.payload;
    if (typeof nestedPayload === "string") {
      try {
        nestedPayload = JSON.parse(nestedPayload);
      } catch (_) {
        nestedPayload = {};
      }
    }
    if (nestedPayload && typeof nestedPayload === "object") {
      normalized = { ...normalized, ...nestedPayload };
    }
  }

  // Backward compatibility for GET fallback payloads.
  if (normalized.payload_json && typeof normalized.payload_json === "string") {
    try {
      const jsonPayload = JSON.parse(normalized.payload_json);
      if (jsonPayload && typeof jsonPayload === "object") {
        normalized = { ...normalized, ...jsonPayload };
      }
    } catch (_) {
      // Keep non-JSON as-is and continue.
    }
  }

  // Map legacy form names to tab names if tab is missing.
  if (!normalized.tab && normalized.formName) {
    const formName = String(normalized.formName).trim();
    const formNameToTab = {
      "Need Help Request": "Need Help",
      "Veteran Outreach": "Veteran Outreach",
      "Homeless Outreach": "Homeless Outreach",
      "Crisis Relief Request": "Crisis Relief",
    };
    if (formNameToTab[formName]) {
      normalized.tab = formNameToTab[formName];
    }
  }

  // Normalize key aliases from previous versions.
  if (!normalized.city_area && normalized.location) {
    normalized.city_area = normalized.location;
  }
  if (!normalized.intake_type && normalized.intakeType) {
    normalized.intake_type = normalized.intakeType;
  }
  if (!normalized.crisis_type && normalized.crisisType) {
    normalized.crisis_type = normalized.crisisType;
  }
  if (!normalized.person_needing_help && normalized.personNeedingHelp) {
    normalized.person_needing_help = normalized.personNeedingHelp;
  }

  // Legacy combined contact field fallback.
  if (normalized.contact) {
    const contact = String(normalized.contact).trim();
    if (contact) {
      if (!normalized.email && contact.includes("@")) {
        normalized.email = contact;
      }
      if (!normalized.phone && !contact.includes("@")) {
        normalized.phone = contact;
      }
    }
  }

  // Preserve honeypot for anti-spam checks on frontend but never store it.
  delete normalized.company;
  delete normalized.payload;
  delete normalized.payload_json;
  delete normalized.formName;
  delete normalized.submittedAt;

  return normalized;
}

function applyDefaults_(payload, tab) {
  const optedIn = toBoolean_(payload.email_opt_in);
  const mailerLiteGroup = getMailerLiteGroup_(tab);
  const mailerLiteLabel = mailerLiteGroup ? mailerLiteGroup.label : (payload.mailerlite_group || tab);
  const mailerLiteStatus = !optedIn ? "skipped" : (payload.mailerlite_status || "pending");

  return {
    ...payload,
    submitted_at: payload.submitted_at || new Date().toISOString(),
    status: payload.status || "new",
    email_opt_in: optedIn ? "yes" : "no",
    mailerlite_group: mailerLiteLabel,
    mailerlite_status: mailerLiteStatus,
    internal_notes: payload.internal_notes || "",
  };
}

function getOrCreateSheet_(spreadsheet, tabName, columns) {
  let sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(tabName);
  }

  const hasHeader = sheet.getLastRow() > 0;
  if (!hasHeader) {
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
  }

  return sheet;
}

function toBoolean_(value) {
  return value === true || value === "true" || value === "1" || value === 1 || value === "yes" || value === "on";
}

function normalizeCell_(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function getMailerLiteGroup_(tab) {
  return MAILERLITE_GROUPS[tab] || null;
}

function getMailerLiteToken_() {
  return PropertiesService.getScriptProperties().getProperty(MAILERLITE_API_TOKEN_PROPERTY) || "";
}

function syncMailerLiteIfNeeded_(payload, tab) {
  if (!toBoolean_(payload.email_opt_in)) {
    return { status: "skipped" };
  }

  const email = normalizeCell_(payload.email).trim();
  if (!email) {
    return { status: "skipped_missing_email" };
  }

  const group = getMailerLiteGroup_(tab);
  if (!group || !group.id) {
    return { status: "skipped_missing_group" };
  }

  const token = getMailerLiteToken_().trim();
  if (!token) {
    return { status: "pending_missing_token" };
  }

  const requestBody = {
    email: email,
    groups: [group.id],
    fields: buildMailerLiteFields_(payload),
  };

  const response = UrlFetchApp.fetch(MAILERLITE_SUBSCRIBERS_ENDPOINT, {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/json",
    },
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code >= 200 && code < 300) {
    return { status: "synced", code: code };
  }

  return {
    status: "failed",
    code: code,
    message: extractMailerLiteError_(body),
  };
}

function buildMailerLiteFields_(payload) {
  const fields = {};

  if (payload.name) {
    fields.name = normalizeCell_(payload.name);
  }

  if (payload.phone) {
    fields.phone = normalizeCell_(payload.phone);
  }

  return fields;
}

function extractMailerLiteError_(body) {
  if (!body) return "Unknown MailerLite error";

  try {
    const parsed = JSON.parse(body);
    if (parsed && parsed.message) {
      return String(parsed.message);
    }
    if (parsed && parsed.error && parsed.error.message) {
      return String(parsed.error.message);
    }
  } catch (_) {
    // Fall through and return raw body.
  }

  return String(body).slice(0, 180);
}

function updateMailerliteStatus_(sheet, rowNumber, columns, payload, result) {
  const statusIndex = columns.indexOf("mailerlite_status");
  if (statusIndex === -1) return;

  let statusValue = result.status || normalizeCell_(payload.mailerlite_status);
  if (result.status === "failed" && result.message) {
    statusValue = result.status + ": " + result.message;
  }

  sheet.getRange(rowNumber, statusIndex + 1).setValue(statusValue);
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
