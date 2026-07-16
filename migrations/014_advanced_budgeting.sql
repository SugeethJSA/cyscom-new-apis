-- 014_advanced_budgeting.sql

-- 1. Modify event_budgets table to support projected logic instead of static target expected fields
ALTER TABLE event_budgets ADD COLUMN IF NOT EXISTS projected_registrations_count INT DEFAULT 0;
ALTER TABLE event_budgets ADD COLUMN IF NOT EXISTS projected_amount_per_registration NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE event_budgets ADD COLUMN IF NOT EXISTS projected_profit_margin NUMERIC(5, 2) DEFAULT 25.00; -- 25% default

-- We keep expected_revenue and target_expenditure as optional fields or fallback, 
-- but they are functionally replaced by the above logic.

-- 2. Create event_budget_estimates table
CREATE TABLE IF NOT EXISTS event_budget_estimates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id UUID REFERENCES event_budgets(id) ON DELETE CASCADE,
    category VARCHAR(255) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    estimated_amount NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Modify standard_expenses table to be global
ALTER TABLE standard_expenses DROP COLUMN IF EXISTS event_slug;
