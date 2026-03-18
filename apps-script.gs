const SPREADSHEET_ID = "PASTE_SPREADSHEET_ID_HERE";

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

    return jsonResponse_({ ok: true, tab: tab });
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
  delete normalized.formName;
  delete normalized.submittedAt;

  return normalized;
}

function applyDefaults_(payload, tab) {
  const optedIn = toBoolean_(payload.email_opt_in);

  return {
    ...payload,
    submitted_at: payload.submitted_at || new Date().toISOString(),
    status: payload.status || "new",
    email_opt_in: optedIn ? "yes" : "no",
    mailerlite_group: payload.mailerlite_group || tab,
    mailerlite_status: payload.mailerlite_status || (optedIn ? "pending" : "skipped"),
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

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
