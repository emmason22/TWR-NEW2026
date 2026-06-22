const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;
const DEFAULT_RECENT_LIMIT = 12;
const MAX_RECENT_LIMIT = 25;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "authorization,content-type,stripe-signature",
  "cache-control": "no-store",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: jsonHeaders });
    }

    if (request.method === "GET" && url.pathname === "/donations/ticker") {
      return jsonResponse(await getTickerData(env, url));
    }

    if (request.method === "POST" && url.pathname === "/stripe/webhook") {
      return handleStripeWebhook(request, env);
    }

    if (request.method === "POST" && url.pathname === "/donations/manual") {
      return handleManualDonation(request, env);
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
};

export async function handleStripeWebhook(request, env) {
  if (!env.DONATIONS_DB) {
    return jsonResponse({ error: "DONATIONS_DB binding is not configured." }, 500);
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    return jsonResponse({ error: "STRIPE_WEBHOOK_SECRET is not configured." }, 500);
  }

  const signatureHeader = request.headers.get("stripe-signature") || "";
  const rawBody = await request.text();
  const verified = await verifyStripeSignature(rawBody, signatureHeader, env.STRIPE_WEBHOOK_SECRET);

  if (!verified.ok) {
    return jsonResponse({ error: verified.error }, 400);
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (_) {
    return jsonResponse({ error: "Invalid JSON payload." }, 400);
  }

  const alreadyProcessed = await recordStripeEvent(env, event);
  if (alreadyProcessed) {
    return jsonResponse({ ok: true, duplicate: true });
  }

  if (event.type === "charge.succeeded") {
    await upsertSuccessfulCharge(env, event);
  } else if (event.type === "charge.refunded") {
    await updateRefundedCharge(env, event);
  }

  return jsonResponse({ ok: true });
}

export async function handleManualDonation(request, env) {
  if (!env.DONATIONS_DB) {
    return jsonResponse({ error: "DONATIONS_DB binding is not configured." }, 500);
  }

  if (!env.MANUAL_DONATION_SECRET) {
    return jsonResponse({ error: "MANUAL_DONATION_SECRET is not configured." }, 500);
  }

  const expectedHeader = `Bearer ${env.MANUAL_DONATION_SECRET}`;
  if (request.headers.get("authorization") !== expectedHeader) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (_) {
    return jsonResponse({ error: "Invalid JSON payload." }, 400);
  }

  const amountCents = normalizeManualAmountCents(payload);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return jsonResponse({ error: "Enter a donation amount greater than $0." }, 400);
  }

  const source = sanitizeManualSource(payload.source);
  const firstName = sanitizePublicName(payload.display_name || payload.first_name || "Supporter");
  const createdAt = normalizeManualCreatedAt(payload.created_at);
  const now = new Date().toISOString();
  const manualId = createManualDonationId(payload, source, amountCents, createdAt);

  await env.DONATIONS_DB.prepare(
    `INSERT INTO donations (
      stripe_charge_id,
      amount_cents,
      refunded_amount_cents,
      currency,
      first_name,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, 0, ?, ?, 'succeeded', ?, ?)
    ON CONFLICT(stripe_charge_id) DO UPDATE SET
      amount_cents = excluded.amount_cents,
      currency = excluded.currency,
      first_name = excluded.first_name,
      status = 'succeeded',
      updated_at = excluded.updated_at`
  ).bind(
    manualId,
    amountCents,
    normalizeCurrency(payload.currency || "usd"),
    firstName,
    createdAt,
    now
  ).run();

  return jsonResponse({
    ok: true,
    donation: {
      id: manualId,
      amount_cents: amountCents,
      currency: normalizeCurrency(payload.currency || "usd"),
      display_name: toPublicDisplayName(firstName),
      source,
      created_at: createdAt,
    },
  });
}

export async function getTickerData(env, url) {
  if (!env.DONATIONS_DB) {
    return {
      total_cents: 0,
      currency: "usd",
      recent: [],
      updated_at: new Date().toISOString(),
    };
  }

  const limitParam = Number(url.searchParams.get("limit") || DEFAULT_RECENT_LIMIT);
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : DEFAULT_RECENT_LIMIT, 1), MAX_RECENT_LIMIT);

  const totalRow = await env.DONATIONS_DB.prepare(
    `SELECT
      COALESCE(SUM(
        CASE
          WHEN status IN ('succeeded', 'partially_refunded')
          THEN MAX(amount_cents - COALESCE(refunded_amount_cents, 0), 0)
          ELSE 0
        END
      ), 0) AS total_cents,
      COALESCE(MIN(currency), 'usd') AS currency,
      MAX(updated_at) AS updated_at
    FROM donations`
  ).first();

  const recentResult = await env.DONATIONS_DB.prepare(
    `SELECT amount_cents, currency, first_name, created_at
     FROM donations
     WHERE status IN ('succeeded', 'partially_refunded')
       AND amount_cents > COALESCE(refunded_amount_cents, 0)
     ORDER BY created_at DESC
     LIMIT ?`
  ).bind(limit).all();

  return {
    total_cents: Number(totalRow?.total_cents || 0),
    currency: normalizeCurrency(totalRow?.currency || "usd"),
    recent: (recentResult.results || []).map((row) => ({
      amount_cents: Number(row.amount_cents || 0),
      currency: normalizeCurrency(row.currency || "usd"),
      display_name: toPublicDisplayName(row.first_name),
      created_at: row.created_at,
    })),
    updated_at: totalRow?.updated_at || new Date().toISOString(),
  };
}

async function recordStripeEvent(env, event) {
  try {
    await env.DONATIONS_DB.prepare(
      `INSERT INTO stripe_events (stripe_event_id, type, received_at)
       VALUES (?, ?, ?)`
    ).bind(event.id, event.type, new Date().toISOString()).run();
    return false;
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      return true;
    }
    throw error;
  }
}

async function upsertSuccessfulCharge(env, event) {
  const charge = event.data?.object || {};
  const amount = Number(charge.amount_captured || charge.amount || 0);
  if (!charge.id || !Number.isFinite(amount) || amount <= 0) return;

  const createdAt = charge.created ? new Date(charge.created * 1000).toISOString() : new Date().toISOString();
  const firstName = extractFirstName(charge.billing_details?.name, charge.billing_details?.email);
  const now = new Date().toISOString();

  await env.DONATIONS_DB.prepare(
    `INSERT INTO donations (
      stripe_charge_id,
      amount_cents,
      refunded_amount_cents,
      currency,
      first_name,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, 0, ?, ?, 'succeeded', ?, ?)
    ON CONFLICT(stripe_charge_id) DO UPDATE SET
      amount_cents = excluded.amount_cents,
      currency = excluded.currency,
      first_name = excluded.first_name,
      status = CASE
        WHEN donations.status = 'refunded' THEN donations.status
        ELSE 'succeeded'
      END,
      updated_at = excluded.updated_at`
  ).bind(
    charge.id,
    amount,
    normalizeCurrency(charge.currency || "usd"),
    firstName,
    createdAt,
    now
  ).run();
}

async function updateRefundedCharge(env, event) {
  const charge = event.data?.object || {};
  if (!charge.id) return;

  const amount = Number(charge.amount || 0);
  const refundedAmount = Number(charge.amount_refunded || amount || 0);
  const status = amount > 0 && refundedAmount >= amount ? "refunded" : "partially_refunded";

  await env.DONATIONS_DB.prepare(
    `UPDATE donations
     SET refunded_amount_cents = ?,
         status = ?,
         updated_at = ?
     WHERE stripe_charge_id = ?`
  ).bind(
    Math.max(refundedAmount, 0),
    status,
    new Date().toISOString(),
    charge.id
  ).run();
}

export async function verifyStripeSignature(rawBody, signatureHeader, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parts = parseStripeSignatureHeader(signatureHeader);
  if (!parts.timestamp || !parts.signatures.length) {
    return { ok: false, error: "Missing Stripe signature." };
  }

  if (Math.abs(nowSeconds - parts.timestamp) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, error: "Expired Stripe signature." };
  }

  const expectedSignature = await hmacSha256Hex(secret, `${parts.timestamp}.${rawBody}`);
  const matches = parts.signatures.some((signature) => timingSafeEqual(signature, expectedSignature));

  return matches ? { ok: true } : { ok: false, error: "Invalid Stripe signature." };
}

function parseStripeSignatureHeader(header) {
  const output = { timestamp: 0, signatures: [] };

  String(header || "").split(",").forEach((part) => {
    const [key, value] = part.split("=");
    if (key === "t") output.timestamp = Number(value);
    if (key === "v1" && value) output.signatures.push(value);
  });

  return output;
}

async function hmacSha256Hex(secret, payload) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

function extractFirstName(name, email) {
  const normalizedName = String(name || "").trim();
  if (normalizedName) {
    return sanitizePublicName(normalizedName.split(/\s+/)[0]);
  }

  const localPart = String(email || "").split("@")[0] || "";
  const guessedName = localPart.split(/[._+-]/)[0] || "";
  return sanitizePublicName(guessedName);
}

function sanitizePublicName(value) {
  const sanitized = String(value || "").replace(/[^a-zA-Z'-]/g, "").slice(0, 24);
  if (!sanitized) return "Supporter";
  return sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
}

function sanitizeManualSource(value) {
  const source = String(value || "manual").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 20);
  if (source === "cash" || source === "venmo" || source === "check" || source === "manual") return source;
  return "manual";
}

function normalizeManualAmountCents(payload) {
  if (Number.isFinite(Number(payload.amount_cents))) {
    return Math.round(Number(payload.amount_cents));
  }

  const dollars = Number(String(payload.amount || "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(dollars)) return 0;
  return Math.round(dollars * 100);
}

function normalizeManualCreatedAt(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function createManualDonationId(payload, source, amountCents, createdAt) {
  const explicitKey = String(payload.idempotency_key || payload.reference || "").trim();
  if (explicitKey) {
    return `manual_${sanitizeManualSource(source)}_${explicitKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64)}`;
  }

  if (crypto.randomUUID) {
    return `manual_${source}_${crypto.randomUUID()}`;
  }

  return `manual_${source}_${createdAt.replace(/[^0-9]/g, "")}_${amountCents}`;
}

function toPublicDisplayName(firstName) {
  return sanitizePublicName(firstName || "Supporter");
}

function normalizeCurrency(currency) {
  return String(currency || "usd").toLowerCase();
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders,
  });
}
