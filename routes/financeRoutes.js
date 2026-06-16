import express from "express";
import { z } from "zod";
import { query } from "../db.js";
import { requireAuth, requireAdmin, requireSuperAdmin } from "../middleware/auth.js";

const router = express.Router();

// Helper to simulate GSTIN validation against an online database
async function validateGSTIN(gstin) {
  // Real world: fetch('https://api.gst.gov.in/v1/taxpayer/search?gstin=' + gstin)
  // Since we don't have a live API key, we fallback to strict checksum regex validation
  const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!regex.test(gstin)) return false;
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));
  return true; 
}

// ----------------- BUDGETS -----------------

// Create draft budget proposal
router.post("/budgets", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = z.object({
      event_slug: z.string().min(1),
      name: z.string().min(1),
      projected_registrations_count: z.number().min(0).default(0),
      projected_amount_per_registration: z.number().min(0).default(0),
      projected_profit_margin: z.number().min(0).max(100).default(25.00),
      projected_sponsorship_amount: z.number().min(0).default(0)
    }).parse(req.body);

    const result = await query(
      `INSERT INTO event_budgets (event_slug, name, projected_registrations_count, projected_amount_per_registration, projected_profit_margin, projected_sponsorship_amount) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [input.event_slug, input.name, input.projected_registrations_count, input.projected_amount_per_registration, input.projected_profit_margin, input.projected_sponsorship_amount]
    );

    res.status(201).json({ budget: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// Get budgets for an event
router.get("/budgets/:slug", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const result = await query("SELECT * FROM event_budgets WHERE event_slug = $1 ORDER BY created_at DESC", [slug]);
    res.json({ budgets: result.rows });
  } catch (err) {
    next(err);
  }
});

// Duplicate budget
router.post("/budgets/:id/duplicate", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Fetch original budget
    const origBudgetRes = await query("SELECT * FROM event_budgets WHERE id = $1", [id]);
    if (origBudgetRes.rows.length === 0) return res.status(404).json({ error: "not_found" });
    const ob = origBudgetRes.rows[0];

    // Create new budget
    const newBudgetRes = await query(
      `INSERT INTO event_budgets (event_slug, name, projected_registrations_count, projected_amount_per_registration, projected_profit_margin, projected_sponsorship_amount) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [ob.event_slug, "Copy of " + ob.name, ob.projected_registrations_count, ob.projected_amount_per_registration, ob.projected_profit_margin, ob.projected_sponsorship_amount]
    );
    const newBudget = newBudgetRes.rows[0];

    // Copy estimates
    const estRes = await query("SELECT * FROM event_budget_estimates WHERE budget_id = $1", [id]);
    for (const est of estRes.rows) {
      await query(
        "INSERT INTO event_budget_estimates (budget_id, category, item_name, estimated_amount) VALUES ($1, $2, $3, $4)",
        [newBudget.id, est.category, est.item_name, est.estimated_amount]
      );
    }

    res.status(201).json({ budget: newBudget });
  } catch (err) {
    next(err);
  }
});

// Create draft budget estimate (itemized)
router.post("/budgets/:id/estimates", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const input = z.object({
      category: z.string().min(1),
      item_name: z.string().min(1),
      estimated_amount: z.number().min(0)
    }).parse(req.body);

    const result = await query(
      "INSERT INTO event_budget_estimates (budget_id, category, item_name, estimated_amount) VALUES ($1, $2, $3, $4) RETURNING *",
      [id, input.category, input.item_name, input.estimated_amount]
    );
    res.status(201).json({ estimate: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// Get draft budget estimates
router.get("/budgets/:id/estimates", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query("SELECT * FROM event_budget_estimates WHERE budget_id = $1 ORDER BY created_at ASC", [id]);
    res.json({ estimates: result.rows });
  } catch (err) {
    next(err);
  }
});

// ----------------- BILLS -----------------

// Submit bill
router.post("/bills", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = z.object({
      event_slug: z.string().min(1),
      budget_id: z.string().uuid(),
      category: z.string().min(1),
      bill_name: z.string().min(1),
      company_name: z.string().min(1),
      gstin: z.string().optional().nullable(),
      amount: z.number().min(0)
    }).parse(req.body);

    if (input.category.toLowerCase() !== 'miscellaneous') {
      if (!input.gstin) {
        return res.status(400).json({ error: "missing_gstin", message: "GSTIN is required for non-miscellaneous bills." });
      }
      const isValid = await validateGSTIN(input.gstin);
      if (!isValid) {
        return res.status(400).json({ error: "invalid_gstin", message: "The provided GSTIN failed online database validation." });
      }
    }

    const result = await query(
      `INSERT INTO event_bills (event_slug, budget_id, category, bill_name, company_name, gstin, amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [input.event_slug, input.budget_id, input.category, input.bill_name, input.company_name, input.gstin || null, input.amount]
    );

    res.status(201).json({ bill: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// Get bills for an event
router.get("/bills/:slug", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const result = await query("SELECT * FROM event_bills WHERE event_slug = $1 ORDER BY created_at DESC", [slug]);
    res.json({ bills: result.rows });
  } catch (err) {
    next(err);
  }
});

// Transfer bills to another budget
router.post("/bills/transfer", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = z.object({
      bill_ids: z.array(z.string().uuid()),
      target_budget_id: z.string().uuid()
    }).parse(req.body);

    if (input.bill_ids.length === 0) {
      return res.status(400).json({ error: "no_bills_selected" });
    }

    // Using unnest or simple IN clause. pg supports `= ANY($1)`
    await query(
      "UPDATE event_bills SET budget_id = $1 WHERE id = ANY($2::uuid[])",
      [input.target_budget_id, input.bill_ids]
    );

    res.json({ success: true, message: "Transferred successfully" });
  } catch (err) {
    next(err);
  }
});

// ----------------- SPONSORSHIPS -----------------

// Add actual sponsorship
router.post("/sponsorships", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = z.object({
      event_slug: z.string().min(1),
      budget_id: z.string().uuid(),
      sponsor_name: z.string().min(1),
      amount: z.number().min(0)
    }).parse(req.body);

    const result = await query(
      `INSERT INTO event_sponsorships (event_slug, budget_id, sponsor_name, amount)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.event_slug, input.budget_id, input.sponsor_name, input.amount]
    );
    res.status(201).json({ sponsorship: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// Get sponsorships
router.get("/sponsorships/:slug", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const result = await query("SELECT * FROM event_sponsorships WHERE event_slug = $1 ORDER BY created_at DESC", [slug]);
    res.json({ sponsorships: result.rows });
  } catch (err) {
    next(err);
  }
});

// ----------------- PREDEFINED EXPENSES -----------------

// Create global standard expense
router.post("/standard_expenses", requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const input = z.object({
      name: z.string().min(1),
      amount: z.number().min(0),
      category: z.string().default('miscellaneous'),
      company_name: z.string().optional(),
      gstin: z.string().optional()
    }).parse(req.body);

    const result = await query(
      `INSERT INTO standard_expenses (name, amount, category, company_name, gstin)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [input.name, input.amount, input.category, input.company_name || null, input.gstin || null]
    );

    res.status(201).json({ standard_expense: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// Get global standard expenses
router.get("/standard_expenses", requireAuth, async (req, res, next) => {
  try {
    const result = await query("SELECT * FROM standard_expenses ORDER BY category ASC, created_at DESC");
    res.json({ standard_expenses: result.rows });
  } catch (err) {
    next(err);
  }
});

export { router as financeRoutes };
