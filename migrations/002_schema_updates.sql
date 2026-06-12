-- 002: Add show_in_list
ALTER TABLE registration_form_fields ADD COLUMN IF NOT EXISTS show_in_list BOOLEAN DEFAULT TRUE;

-- 003: User Categories
CREATE TABLE IF NOT EXISTS user_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#6366f1',
  station_permissions station_type[] NOT NULL DEFAULT ARRAY[]::station_type[],
  capabilities JSONB NOT NULL DEFAULT '{
    "can_scan": true,
    "can_verify": false,
    "can_register": false,
    "can_view_attendees": true,
    "can_export": false,
    "can_transfer": false
  }'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES user_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_category ON users(category_id);

-- 004: System Fields
ALTER TABLE registration_form_fields 
ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE;

INSERT INTO registration_form_fields (field_key, label, field_type, required, sort_order, active, show_in_list, is_system)
VALUES 
  ('name', 'Full Name', 'text', TRUE, 1, TRUE, TRUE, TRUE),
  ('email', 'Email Address', 'email', TRUE, 2, TRUE, TRUE, TRUE),
  ('phone', 'Phone Number', 'phone', FALSE, 3, TRUE, TRUE, TRUE),
  ('college', 'Club Name / Institution', 'text', FALSE, 4, TRUE, TRUE, TRUE),
  ('department', 'Booking ID / Area Code', 'text', FALSE, 5, TRUE, TRUE, TRUE)
ON CONFLICT (field_key) DO UPDATE 
SET is_system = TRUE;

-- 005: System Settings
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO system_settings (setting_key, setting_value, description)
VALUES 
  ('kit_limit', '1000'::jsonb, 'Maximum number of registration kits that can be deployed.'),
  ('food_limit', '1000'::jsonb, 'Maximum number of food tokens that can be deployed.')
ON CONFLICT (setting_key) DO NOTHING;

-- 006: Branching Logic
ALTER TABLE registration_form_fields 
ADD COLUMN IF NOT EXISTS depends_on_field TEXT,
ADD COLUMN IF NOT EXISTS depends_on_value TEXT;

-- 007: Advanced Form Logic
ALTER TYPE form_field_type ADD VALUE IF NOT EXISTS 'hidden';
ALTER TYPE form_field_type ADD VALUE IF NOT EXISTS 'calculated';

ALTER TABLE registration_form_fields 
ADD COLUMN IF NOT EXISTS visibility_rules JSONB,
ADD COLUMN IF NOT EXISTS validations JSONB,
ADD COLUMN IF NOT EXISTS calculation TEXT;

-- 008: Reevaluate Scans Trigger
CREATE OR REPLACE FUNCTION reevaluate_scans_on_rule_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.active = FALSE THEN
    UPDATE scan_events
    SET status = 'denied', reason = 'Rule was deactivated retroactively.'
    WHERE rule_id = NEW.id AND status = 'accepted';
  ELSE
    UPDATE scan_events
    SET status = 'denied', reason = 'Scan time falls outside the updated rule timeframe.'
    WHERE rule_id = NEW.id AND status = 'accepted'
      AND (
        (NEW.starts_at IS NOT NULL AND scanned_at < NEW.starts_at) OR
        (NEW.ends_at IS NOT NULL AND scanned_at > NEW.ends_at)
      );
      
    UPDATE scan_events
    SET status = 'accepted', reason = 'Accepted retroactively due to rule update.'
    WHERE rule_id = NEW.id AND status = 'denied'
      AND (NEW.starts_at IS NULL OR scanned_at >= NEW.starts_at)
      AND (NEW.ends_at IS NULL OR scanned_at <= NEW.ends_at);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_reevaluate_scans ON scan_rules;

CREATE TRIGGER trigger_reevaluate_scans
AFTER UPDATE ON scan_rules
FOR EACH ROW
WHEN (OLD.active IS DISTINCT FROM NEW.active OR OLD.starts_at IS DISTINCT FROM NEW.starts_at OR OLD.ends_at IS DISTINCT FROM NEW.ends_at)
EXECUTE FUNCTION reevaluate_scans_on_rule_update();
