CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'volunteer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE station_type AS ENUM ('entry', 'food', 'kit', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE scan_status AS ENUM ('accepted', 'duplicate', 'denied', 'conflict', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE send_status AS ENUM ('pending', 'sent', 'failed', 'exported');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE form_field_type AS ENUM ('text', 'email', 'phone', 'number', 'select', 'textarea', 'checkbox');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'volunteer',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS volunteer_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_label TEXT NOT NULL,
  public_hint TEXT NOT NULL,
  station_permissions station_type[] NOT NULL DEFAULT ARRAY[]::station_type[],
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  college TEXT,
  department TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  registered_on_spot BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS registration_form_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  field_type form_field_type NOT NULL DEFAULT 'text',
  required BOOLEAN NOT NULL DEFAULT FALSE,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  total_rows INTEGER NOT NULL,
  accepted_rows INTEGER NOT NULL,
  rejected_rows INTEGER NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qr_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendee_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES qr_batches(id),
  encrypted_payload TEXT NOT NULL,
  payload_hash TEXT NOT NULL UNIQUE,
  key_version TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attendee_id)
);

CREATE TABLE IF NOT EXISTS email_send_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_code_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES qr_batches(id),
  recipient_email TEXT NOT NULL,
  status send_status NOT NULL DEFAULT 'pending',
  provider_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scan_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  station station_type NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  eligibility JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scan_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_scan_id TEXT NOT NULL,
  qr_payload_hash TEXT NOT NULL REFERENCES qr_codes(payload_hash),
  attendee_id UUID NOT NULL REFERENCES attendees(id),
  volunteer_id UUID REFERENCES users(id),
  rule_id UUID REFERENCES scan_rules(id),
  station station_type NOT NULL,
  status scan_status NOT NULL,
  reason TEXT,
  scanned_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  offline_created BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (local_scan_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_events_one_accept_per_rule
  ON scan_events (qr_payload_hash, station, COALESCE(rule_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'accepted';

CREATE TABLE IF NOT EXISTS offline_sync_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id UUID REFERENCES users(id),
  device_id TEXT NOT NULL,
  local_scan_id TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  result_status scan_status NOT NULL,
  result_reason TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendees_name ON attendees USING gin (to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_registration_form_fields_order ON registration_form_fields(active, sort_order, label);
CREATE INDEX IF NOT EXISTS idx_qr_codes_sent ON qr_codes(sent_at);
CREATE INDEX IF NOT EXISTS idx_scan_events_station ON scan_events(station, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_events_attendee ON scan_events(attendee_id);
