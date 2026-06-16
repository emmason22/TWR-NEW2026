# Tonight We Ride Donation Ticker Worker

This Cloudflare Worker receives Stripe donation webhooks, stores public-safe donation data in D1, and exposes a read-only ticker endpoint for the static donate page.

## Endpoints

- `POST /stripe/webhook`
  - Requires Stripe's `stripe-signature` header.
  - Handles `charge.succeeded` and `charge.refunded`.
  - Stores first name only, never full name or email.
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
   `STRIPE_SECRET_KEY` is not required for the current webhook-only Worker. Add it later only if you build a reconciliation task that calls Stripe's API directly.
5. Deploy:
   ```sh
   wrangler deploy
   ```
6. In Stripe, add a webhook endpoint:
   ```text
   https://<worker-domain>/stripe/webhook
   ```
   Subscribe it to:
   - `charge.succeeded`
   - `charge.refunded`

## Frontend

After deployment, update the `twr-donation-ticker-endpoint` meta tag in `donate-now.html` to:

```html
<meta name="twr-donation-ticker-endpoint" content="https://<worker-domain>/donations/ticker" />
```

Until that URL is configured, the donate page shows a quiet fallback state and does not block donation checkout.
