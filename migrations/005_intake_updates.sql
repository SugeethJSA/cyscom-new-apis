-- 005_intake_updates.sql

-- Add custom data column to recruitments for dynamic form fields
ALTER TABLE recruitments ADD COLUMN IF NOT EXISTS custom_data JSONB DEFAULT '{}';

-- Create table for reviewer comments and ratings
CREATE TABLE IF NOT EXISTS recruitment_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recruitment_id UUID REFERENCES recruitments(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    author_name VARCHAR(255) NOT NULL,
    comment TEXT NOT NULL,
    ratings JSONB DEFAULT '{}',
    stage VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recruitment_comments_recruitment_id ON recruitment_comments(recruitment_id);

-- Insert default system settings for the intake pipeline
INSERT INTO system_settings (setting_key, setting_value, description)
SELECT 'intake_stages', '["pending", "basic review", "interview review", "project review", "accepted", "rejected"]'::jsonb, 'Custom stages for intake processing'
WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE setting_key = 'intake_stages');

INSERT INTO system_settings (setting_key, setting_value, description)
SELECT 'intake_competencies', '["Technical Skills", "Communication", "Culture Fit", "Problem Solving"]'::jsonb, 'Custom competency scales for candidate evaluation'
WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE setting_key = 'intake_competencies');

INSERT INTO system_settings (setting_key, setting_value, description)
SELECT 'intake_form_schema', '[]'::jsonb, 'Dynamic custom form fields for the recruitment application'
WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE setting_key = 'intake_form_schema');
