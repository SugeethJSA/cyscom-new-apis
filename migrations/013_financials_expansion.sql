ALTER TABLE event_budgets ADD COLUMN IF NOT EXISTS target_expenditure NUMERIC(10, 2) DEFAULT 0;

CREATE TABLE IF NOT EXISTS standard_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_slug VARCHAR(255) REFERENCES events(slug) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  category VARCHAR(50) DEFAULT 'miscellaneous',
  company_name VARCHAR(255),
  gstin VARCHAR(15),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
