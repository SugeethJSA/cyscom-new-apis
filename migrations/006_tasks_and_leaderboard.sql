-- 006_tasks_and_leaderboard.sql

-- Add missing columns to users for tracking departments and leaderboard points
ALTER TABLE users ADD COLUMN IF NOT EXISTS departments TEXT[] DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS points INT DEFAULT 0;

-- Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority VARCHAR(50) DEFAULT 'medium',
    department VARCHAR(100),
    points_reward INT DEFAULT 10,
    status VARCHAR(50) DEFAULT 'pending',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create task_assignments table for many-to-many user assignment
CREATE TABLE IF NOT EXISTS task_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(task_id, user_id)
);
