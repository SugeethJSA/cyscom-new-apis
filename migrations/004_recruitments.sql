-- 004_recruitments.sql

CREATE TABLE IF NOT EXISTS recruitments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    reg_number VARCHAR(50),
    department_primary VARCHAR(100),
    department_secondary VARCHAR(100),
    skills TEXT,
    motivation TEXT,
    contribution TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    score NUMERIC(5,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_recruitments_email ON recruitments(email);
CREATE INDEX IF NOT EXISTS idx_recruitments_status ON recruitments(status);
