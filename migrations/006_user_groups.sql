CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS user_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS user_group_members (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID REFERENCES user_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, group_id)
);

-- Seed an initial Superadmin group
INSERT INTO user_groups (name, description, permissions) 
VALUES (
    'Superadmins', 
    'Global administrators with total system control.', 
    '{"hubs": {"members": ["*"], "opensrc": ["*"]}, "events": {"*": ["*"]}}'::jsonb
) ON CONFLICT (name) DO NOTHING;
