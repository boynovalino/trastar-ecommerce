CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  ip_hash CHAR(64) NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_email_recent ON admin_login_attempts(email,attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_ip_recent ON admin_login_attempts(ip_hash,attempted_at DESC);
