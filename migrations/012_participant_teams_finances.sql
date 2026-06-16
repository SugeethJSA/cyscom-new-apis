-- 012_participant_teams_finances.sql

-- 1. Add participant to user_role
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'participant';

-- 2. Add profile_data to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_data JSONB DEFAULT '{}'::jsonb;

-- 3. Add cross_syncable to registration_form_fields
ALTER TABLE registration_form_fields ADD COLUMN IF NOT EXISTS cross_syncable BOOLEAN DEFAULT FALSE;

-- 4. Add user_id and team_id to attendees
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS team_id UUID; -- Will be referenced to teams(id) once created

-- 5. Teams and Team Members
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_slug VARCHAR(255) REFERENCES events(slug) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    leader_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS team_members (
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending', -- pending, accepted
    PRIMARY KEY (team_id, user_id)
);

-- Establish attendees.team_id foreign key constraint safely
ALTER TABLE attendees DROP CONSTRAINT IF EXISTS attendees_team_id_fkey;
ALTER TABLE attendees ADD CONSTRAINT attendees_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;

-- 6. Financial Engine (Budgets and Bills)
CREATE TABLE IF NOT EXISTS event_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_slug VARCHAR(255) REFERENCES events(slug) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    expected_revenue NUMERIC(10, 2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'draft',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_slug VARCHAR(255) REFERENCES events(slug) ON DELETE CASCADE,
    budget_id UUID REFERENCES event_budgets(id) ON DELETE CASCADE,
    category VARCHAR(255) NOT NULL,
    bill_name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    gstin VARCHAR(50),
    amount NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
