-- 015_sponsorships_and_transfers.sql

-- 1. Add projected sponsorships to event_budgets
ALTER TABLE event_budgets ADD COLUMN IF NOT EXISTS projected_sponsorship_amount NUMERIC(10, 2) DEFAULT 0;

-- 2. Create actual sponsorships table
CREATE TABLE IF NOT EXISTS event_sponsorships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_slug VARCHAR(255) NOT NULL,
    budget_id UUID REFERENCES event_budgets(id) ON DELETE CASCADE,
    sponsor_name VARCHAR(255) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
