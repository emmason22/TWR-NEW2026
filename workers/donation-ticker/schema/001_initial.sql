CREATE TABLE IF NOT EXISTS stripe_events (
  stripe_event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS donations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_charge_id TEXT NOT NULL UNIQUE,
  amount_cents INTEGER NOT NULL,
  refunded_amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  first_name TEXT NOT NULL DEFAULT 'Supporter',
  status TEXT NOT NULL DEFAULT 'succeeded',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS donations_status_created_at_idx
  ON donations (status, created_at DESC);
