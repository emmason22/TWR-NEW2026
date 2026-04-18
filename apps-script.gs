const MAILERLITE_SUBSCRIBERS_ENDPOINT = "https://connect.mailerlite.com/api/subscribers";
const MAILERLITE_FIELDS_ENDPOINT = "https://connect.mailerlite.com/api/fields";
const MAILERLITE_API_TOKEN_PROPERTY = "MAILERLITE_API_TOKEN";
const MAILERLITE_NEWSLETTER_GROUP_ID_PROPERTY = "MAILERLITE_NEWSLETTER_GROUP_ID";
const MAILERLITE_FIELDS_CACHE_KEY = "MAILERLITE_FIELDS_BY_KEY";

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

const SUPPORTED_TABS = ["Need Help", "Crisis Relief", "Newsletter"];
const CUSTOM_FIELD_DEFS = [
  { key: "support_form", name: "support_form", type: "text" },
  { key: "email_opt_in", name: "email_opt_in", type: "text" },
  { key: "person_needing_help", name: "person_needing_help", type: "text" },
  { key: "city_area", name: "city_area", type: "text" },
  { key: "crisis_type", name: "crisis_type", type: "text" },
  { key: "request", name: "request", type: "text" },
];

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

    if (SUPPORTED_TABS.indexOf(tab) === -1) {
      return jsonResponse_({ ok: false, error: "Unknown tab" });
    }

    const payload = applyDefaults_(incoming, tab);
    const mailerLiteResult = syncMailerLiteIfNeeded_(payload, tab);

    return jsonResponse_({
      ok: mailerLiteResult.status !== "failed",
      tab: tab,
      mailerlite_status: mailerLiteResult.status,
      error: mailerLiteResult.status === "failed" ? (mailerLiteResult.message || "MailerLite sync failed") : undefined,
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
  const mailerLiteStatus = payload.mailerlite_status || "pending";

  return {
    ...payload,
    submitted_at: payload.submitted_at || new Date().toISOString(),
    status: payload.status || "new",
    email_opt_in: optedIn ? "yes" : "no",
    mailerlite_group: mailerLiteLabel,
    mailerlite_status: mailerLiteStatus,
  };
}

function toBoolean_(value) {
  return value === true || value === "true" || value === "1" || value === 1 || value === "yes" || value === "on";
}

function normalizeCell_(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function getMailerLiteGroup_(tab) {
  if (tab === "Newsletter") {
    const groupId = getNewsletterGroupId_();
    if (!groupId) {
      return {
        id: "",
        label: "Newsletter",
        missingConfig: true,
      };
    }
    return {
      id: groupId,
      label: "Newsletter",
    };
  }

  return MAILERLITE_GROUPS[tab] || null;
}

function getNewsletterGroupId_() {
  return PropertiesService.getScriptProperties().getProperty(MAILERLITE_NEWSLETTER_GROUP_ID_PROPERTY) || "";
}

function getMailerLiteToken_() {
  return PropertiesService.getScriptProperties().getProperty(MAILERLITE_API_TOKEN_PROPERTY) || "";
}

function syncMailerLiteIfNeeded_(payload, tab) {
  const email = normalizeCell_(payload.email).trim();
  if (!email) {
    return { status: "failed", message: "Email is required for MailerLite intake." };
  }

  const group = getMailerLiteGroup_(tab);
  if (!group || !group.id) {
    if (tab === "Newsletter") {
      return { status: "skipped", message: "Newsletter group is not configured." };
    }
    return { status: "failed", message: "MailerLite group is not configured." };
  }

  const token = getMailerLiteToken_().trim();
  if (!token) {
    return { status: "failed", message: "MailerLite API token is missing." };
  }

  ensureMailerLiteFields_(token);

  const optedIn = toBoolean_(payload.email_opt_in);
  const now = formatMailerLiteTimestamp_(new Date());

  const requestBody = {
    email: email,
    groups: [group.id],
    fields: buildMailerLiteFields_(payload),
    status: optedIn ? "active" : "unconfirmed",
    subscribed_at: now,
  };

  if (optedIn) {
    requestBody.opted_in_at = now;
  }

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
  const fields = {
    support_form: normalizeCell_(payload.tab || ""),
    email_opt_in: toBoolean_(payload.email_opt_in) ? "yes" : "no",
  };

  if (payload.name) {
    fields.name = normalizeCell_(payload.name);
  }

  if (payload.phone) {
    fields.phone = normalizeCell_(payload.phone);
  }

  if (payload.person_needing_help) {
    fields.person_needing_help = normalizeCell_(payload.person_needing_help);
  }

  if (payload.city_area) {
    fields.city_area = normalizeCell_(payload.city_area);
  }

  if (payload.crisis_type) {
    fields.crisis_type = normalizeCell_(payload.crisis_type);
  }

  if (payload.request) {
    fields.request = normalizeCell_(payload.request);
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

function ensureMailerLiteFields_(token) {
  const existing = getMailerLiteFieldsByKey_(token);
  let changed = false;

  CUSTOM_FIELD_DEFS.forEach((fieldDef) => {
    if (existing[fieldDef.key]) return;

    const response = UrlFetchApp.fetch(MAILERLITE_FIELDS_ENDPOINT, {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/json",
      },
      payload: JSON.stringify({
        name: fieldDef.name,
        type: fieldDef.type,
      }),
      muteHttpExceptions: true,
    });

    const code = response.getResponseCode();
    const body = response.getContentText();
    if (code >= 200 && code < 300) {
      existing[fieldDef.key] = true;
      changed = true;
      return;
    }

    if (code === 422 && /already|taken/i.test(body)) {
      existing[fieldDef.key] = true;
      changed = true;
      return;
    }

    throw new Error("MailerLite field setup failed: " + extractMailerLiteError_(body));
  });

  if (changed) {
    CacheService.getScriptCache().put(MAILERLITE_FIELDS_CACHE_KEY, JSON.stringify(existing), 21600);
  }
}

function getMailerLiteFieldsByKey_(token) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(MAILERLITE_FIELDS_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (_) {
      // fall through
    }
  }

  const response = UrlFetchApp.fetch(MAILERLITE_FIELDS_ENDPOINT, {
    method: "get",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/json",
    },
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  const body = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error("MailerLite fields lookup failed: " + extractMailerLiteError_(body));
  }

  const parsed = JSON.parse(body);
  const existing = {};
  (parsed.data || []).forEach((field) => {
    if (field && field.key) {
      existing[String(field.key)] = true;
    }
  });

  cache.put(MAILERLITE_FIELDS_CACHE_KEY, JSON.stringify(existing), 21600);
  return existing;
}

function formatMailerLiteTimestamp_(date) {
  const pad = function(value) {
    return String(value).padStart(2, "0");
  };

  return (
    date.getFullYear() +
    "-" + pad(date.getMonth() + 1) +
    "-" + pad(date.getDate()) +
    " " + pad(date.getHours()) +
    ":" + pad(date.getMinutes()) +
    ":" + pad(date.getSeconds())
  );
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
