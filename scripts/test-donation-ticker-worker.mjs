import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import worker, { verifyStripeSignature } from "../workers/donation-ticker/src/index.js";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

class MockD1 {
  constructor() {
    this.events = new Set();
    this.donations = new Map();
  }

  prepare(sql) {
    return new MockStatement(this, sql);
  }
}

class MockStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async run() {
    const normalized = normalizeSql(this.sql);

    if (normalized.startsWith("INSERT INTO STRIPE_EVENTS")) {
      const [eventId] = this.values;
      if (this.db.events.has(eventId)) {
        throw new Error("UNIQUE constraint failed: stripe_events.stripe_event_id");
      }
      this.db.events.add(eventId);
      return { success: true };
    }

    if (normalized.startsWith("INSERT INTO DONATIONS")) {
      const [chargeId, amount, currency, firstName, createdAt, updatedAt] = this.values;
      const existing = this.db.donations.get(chargeId);
      this.db.donations.set(chargeId, {
        stripe_charge_id: chargeId,
        amount_cents: amount,
        refunded_amount_cents: existing?.refunded_amount_cents || 0,
        currency,
        first_name: firstName,
        status: existing?.status === "refunded" ? "refunded" : "succeeded",
        created_at: existing?.created_at || createdAt,
        updated_at: updatedAt,
      });
      return { success: true };
    }

    if (normalized.startsWith("UPDATE DONATIONS")) {
      const [refundedAmount, status, updatedAt, chargeId] = this.values;
      const existing = this.db.donations.get(chargeId);
      if (existing) {
        existing.refunded_amount_cents = refundedAmount;
        existing.status = status;
        existing.updated_at = updatedAt;
      }
      return { success: true };
    }

    throw new Error(`Unhandled SQL in run(): ${this.sql}`);
  }

  async first() {
    const rows = [...this.db.donations.values()];
    const total = rows.reduce((sum, row) => {
      if (!["succeeded", "partially_refunded"].includes(row.status)) return sum;
      return sum + Math.max(row.amount_cents - row.refunded_amount_cents, 0);
    }, 0);

    return {
      total_cents: total,
      currency: rows[0]?.currency || "usd",
      updated_at: rows.map((row) => row.updated_at).sort().at(-1) || null,
    };
  }

  async all() {
    const limit = Number(this.values[0] || 12);
    const results = [...this.db.donations.values()]
      .filter((row) => ["succeeded", "partially_refunded"].includes(row.status))
      .filter((row) => row.amount_cents > row.refunded_amount_cents)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);

    return { results };
  }
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim().toUpperCase();
}

async function signedRequest(event, secret = "whsec_test") {
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sign(secret, `${timestamp}.${body}`);
  return new Request("https://ticker.example.com/stripe/webhook", {
    method: "POST",
    headers: {
      "stripe-signature": `t=${timestamp},v1=${signature}`,
    },
    body,
  });
}

async function sign(secret, payload) {
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

const env = {
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  DONATIONS_DB: new MockD1(),
};

const chargeSucceeded = {
  id: "evt_charge_1",
  type: "charge.succeeded",
  data: {
    object: {
      id: "ch_1",
      amount: 5000,
      amount_captured: 5000,
      currency: "usd",
      created: 1781640000,
      billing_details: {
        name: "Rick Fandrick",
        email: "rick@example.com",
      },
    },
  },
};

const signatureCheck = await verifyStripeSignature(
  JSON.stringify(chargeSucceeded),
  `t=1781640000,v1=${await sign("whsec_test", `1781640000.${JSON.stringify(chargeSucceeded)}`)}`,
  "whsec_test",
  1781640000
);
assert.equal(signatureCheck.ok, true);

let response = await worker.fetch(await signedRequest(chargeSucceeded), env);
assert.equal(response.status, 200);
assert.equal((await response.json()).ok, true);

response = await worker.fetch(await signedRequest(chargeSucceeded), env);
assert.equal(response.status, 200);
assert.equal((await response.json()).duplicate, true);

response = await worker.fetch(new Request("https://ticker.example.com/donations/ticker"), env);
let ticker = await response.json();
assert.equal(ticker.total_cents, 5000);
assert.equal(ticker.recent.length, 1);
assert.equal(ticker.recent[0].display_name, "Rick");

const chargeRefunded = {
  id: "evt_refund_1",
  type: "charge.refunded",
  data: {
    object: {
      id: "ch_1",
      amount: 5000,
      amount_refunded: 2000,
    },
  },
};

response = await worker.fetch(await signedRequest(chargeRefunded), env);
assert.equal(response.status, 200);

response = await worker.fetch(new Request("https://ticker.example.com/donations/ticker"), env);
ticker = await response.json();
assert.equal(ticker.total_cents, 3000);

const badResponse = await worker.fetch(
  new Request("https://ticker.example.com/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=bad" },
    body: JSON.stringify(chargeSucceeded),
  }),
  env
);
assert.equal(badResponse.status, 400);

console.log("Donation ticker Worker tests passed.");
