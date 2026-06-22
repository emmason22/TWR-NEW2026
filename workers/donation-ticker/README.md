# Tonight We Ride Donation Ticker Worker

This Cloudflare Worker receives Stripe donation webhooks, stores public-safe donation data in D1, and exposes a read-only ticker endpoint for the static donate page.

## Endpoints

- `POST /stripe/webhook`
  - Requires Stripe's `stripe-signature` header.
  - Handles `charge.succeeded` and `charge.refunded`.
  - Stores first name only, never full name or email.
- `POST /donations/manual`
  - Requires an `Authorization: Bearer <MANUAL_DONATION_SECRET>` header.
  - Adds cash, Venmo, check, or other in-room gifts from the private event entry page.
- `GET /donations/ticker`
  - Returns the running total, recent donations, and `updated_at`.

## Cloudflare Setup

1. Create a D1 database:
   ```sh
   wrangler d1 create twr-donations
   ```
2. Put the returned `database_id` into `wrangler.toml`.
3. Apply the schema:
   ```sh
   wrangler d1 execute twr-donations --file=./schema/001_initial.sql
   ```
4. Set the Stripe webhook secret:
   ```sh
   wrangler secret put STRIPE_WEBHOOK_SECRET
   ```
5. Set the private manual-entry secret for cash/Venmo/check gifts:
   ```sh
   wrangler secret put MANUAL_DONATION_SECRET
   ```
   `STRIPE_SECRET_KEY` is not required for the current webhook-only Worker. Add it later only if you build a reconciliation task that calls Stripe's API directly.
6. Deploy:
   ```sh
   wrangler deploy
   ```
7. In Stripe, add a webhook endpoint:
   ```text
   https://<worker-domain>/stripe/webhook
   ```
   Subscribe it to:
   - `charge.succeeded`
   - `charge.refunded`

## Frontend

The live donate pages use this ticker endpoint:

```text
https://twr-donation-ticker.tonightweride.workers.dev/donations/ticker
```

The hidden manual-entry page is:

```text
https://tonightweride.org/donation-admin.html
```

Use it during the live event for cash, Venmo, check, or other in-room donations. It requires the `MANUAL_DONATION_SECRET`; do not publish that secret or place it in the public site code.
