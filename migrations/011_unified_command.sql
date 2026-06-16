-- 011_unified_command.sql
-- Integrates OpenSrc and Events into the unified backend.

-- 1. Projects Table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active', -- active, completed, archived
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Add project_id to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- 3. Add is_public to events
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

-- 4. Add event_id to meetings (to link internal meetings to events)
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE SET NULL;

-- 5. Certificates Table (Rendered via HTML/CSS, so we store metadata)
CREATE TABLE IF NOT EXISTS certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- event, leaderboard, term_end, appreciation
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    metadata JSONB, -- stores arbitrary data like rank, title, custom_text
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Hall of Fame Table
CREATE TABLE IF NOT EXISTS hall_of_fame (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL, -- hackathon, ideathon, outstanding_contribution
    reason TEXT,
    proof_url TEXT,
    status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Legacies
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS legacy_date TIMESTAMP WITH TIME ZONE;
