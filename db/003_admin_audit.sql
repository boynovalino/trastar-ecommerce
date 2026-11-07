-- Additive development migration: auditable admin mutations; no existing table is dropped.
CREATE TABLE IF NOT EXISTS admin_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  target_id UUID NOT NULL,
  before_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_events_target ON admin_audit_events(target_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_events_actor ON admin_audit_events(actor_user_id,created_at DESC);
