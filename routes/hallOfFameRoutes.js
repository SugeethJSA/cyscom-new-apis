import express from "express";
import { query } from "../db.js";
import { requireAuth, requireSuperAdmin } from "../middleware/auth.js";

const router = express.Router();

// GET all hall of fame entries (public)
router.get("/", async (req, res, next) => {
  try {
    const { status } = req.query;
    let result;
    if (status) {
      result = await query("SELECT h.*, u.name as user_name FROM hall_of_fame h JOIN users u ON h.user_id = u.id WHERE h.status = $1 ORDER BY h.created_at DESC", [status]);
    } else {
      result = await query("SELECT h.*, u.name as user_name FROM hall_of_fame h JOIN users u ON h.user_id = u.id ORDER BY h.created_at DESC");
    }
    res.json({ hall_of_fame: result.rows });
  } catch (error) {
    next(error);
  }
});

// POST a new hall of fame entry (members can submit proof)
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { category, reason, proof_url } = req.body;
    if (!category) return res.status(400).json({ error: "missing_fields" });
    
    // Automatically set status to approved if superadmin, else pending
    const isAdmin = Array.isArray(req.user.role) ? req.user.role.includes("superadmin") : req.user.role === "superadmin";
    const status = isAdmin ? "approved" : "pending";
    const approved_by = isAdmin ? req.user.id : null;

    // Use req.body.user_id if admin is submitting for someone else, otherwise req.user.id
    const targetUserId = isAdmin && req.body.user_id ? req.body.user_id : req.user.id;

    const result = await query(
      "INSERT INTO hall_of_fame (user_id, category, reason, proof_url, status, approved_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [targetUserId, category, reason || null, proof_url || null, status, approved_by]
    );
    res.status(201).json({ entry: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// PUT (approve/reject) an entry
router.put("/:id", requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status || !["approved", "rejected", "pending"].includes(status)) {
       return res.status(400).json({ error: "invalid_status" });
    }

    const approved_by = status === "approved" ? req.user.id : null;

    const result = await query(
      "UPDATE hall_of_fame SET status = $1, approved_by = $2 WHERE id = $3 RETURNING *",
      [status, approved_by, id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "not_found" });
    res.json({ entry: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE an entry
router.delete("/:id", requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    await query("DELETE FROM hall_of_fame WHERE id = $1", [id]);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export { router as hallOfFameRoutes };
