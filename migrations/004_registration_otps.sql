-- Registration email OTP (sent via Resend HTTP API — no SMTP)
CREATE TABLE IF NOT EXISTS registration_otps (
  email         TEXT PRIMARY KEY,
  display_name  TEXT,
  otp_hash      TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  verified      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registration_otps_expires
  ON registration_otps (expires_at);
