-- Create events table
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  banner_url TEXT,
  logo_url TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default event
INSERT INTO events (slug, name, description)
VALUES ('amaze-2026', 'Amaze 2026', 'Official CySCOM Amaze 2026 Event')
ON CONFLICT (slug) DO NOTHING;

-- Add event_slug column to tables
ALTER TABLE users ADD COLUMN IF NOT EXISTS event_slug TEXT REFERENCES events(slug) ON DELETE CASCADE DEFAULT 'amaze-2026';
ALTER TABLE user_categories ADD COLUMN IF NOT EXISTS event_slug TEXT REFERENCES events(slug) ON DELETE CASCADE DEFAULT 'amaze-2026';
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS event_slug TEXT REFERENCES events(slug) ON DELETE CASCADE DEFAULT 'amaze-2026';
ALTER TABLE registration_form_fields ADD COLUMN IF NOT EXISTS event_slug TEXT REFERENCES events(slug) ON DELETE CASCADE DEFAULT 'amaze-2026';
ALTER TABLE scan_rules ADD COLUMN IF NOT EXISTS event_slug TEXT REFERENCES events(slug) ON DELETE CASCADE DEFAULT 'amaze-2026';
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS event_slug TEXT REFERENCES events(slug) ON DELETE CASCADE DEFAULT 'amaze-2026';
ALTER TABLE scan_events ADD COLUMN IF NOT EXISTS event_slug TEXT REFERENCES events(slug) ON DELETE CASCADE DEFAULT 'amaze-2026';

-- Additional tables
ALTER TABLE volunteer_keys ADD COLUMN IF NOT EXISTS event_slug TEXT REFERENCES events(slug) ON DELETE CASCADE DEFAULT 'amaze-2026';
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS event_slug TEXT REFERENCES events(slug) ON DELETE CASCADE DEFAULT 'amaze-2026';
ALTER TABLE qr_batches ADD COLUMN IF NOT EXISTS event_slug TEXT REFERENCES events(slug) ON DELETE CASCADE DEFAULT 'amaze-2026';
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS event_slug TEXT REFERENCES events(slug) ON DELETE CASCADE DEFAULT 'amaze-2026';
ALTER TABLE email_send_attempts ADD COLUMN IF NOT EXISTS event_slug TEXT REFERENCES events(slug) ON DELETE CASCADE DEFAULT 'amaze-2026';
ALTER TABLE offline_sync_records ADD COLUMN IF NOT EXISTS event_slug TEXT REFERENCES events(slug) ON DELETE CASCADE DEFAULT 'amaze-2026';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS event_slug TEXT REFERENCES events(slug) ON DELETE CASCADE DEFAULT 'amaze-2026';

-- Adjust constraints to include event_slug
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE users ADD CONSTRAINT users_email_event_key UNIQUE (email, event_slug);

ALTER TABLE user_categories DROP CONSTRAINT IF EXISTS user_categories_name_key;
ALTER TABLE user_categories ADD CONSTRAINT user_categories_name_event_key UNIQUE (name, event_slug);

ALTER TABLE attendees DROP CONSTRAINT IF EXISTS attendees_email_key;
ALTER TABLE attendees ADD CONSTRAINT attendees_email_event_key UNIQUE (email, event_slug);

ALTER TABLE registration_form_fields DROP CONSTRAINT IF EXISTS registration_form_fields_field_key_key;
ALTER TABLE registration_form_fields ADD CONSTRAINT registration_form_fields_field_key_event_key UNIQUE (field_key, event_slug);

ALTER TABLE system_settings DROP CONSTRAINT IF EXISTS system_settings_setting_key_key;
ALTER TABLE system_settings ADD CONSTRAINT system_settings_setting_key_event_key UNIQUE (setting_key, event_slug);

ALTER TABLE scan_events DROP CONSTRAINT IF EXISTS scan_events_local_scan_id_key;
ALTER TABLE scan_events ADD CONSTRAINT scan_events_local_scan_id_event_key UNIQUE (local_scan_id, event_slug);
