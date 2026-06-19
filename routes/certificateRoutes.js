import express from "express";
import { query } from "../db.js";
import { requireAuth, requireSuperAdmin } from "../middleware/auth.js";

const router = express.Router();

// GET all certificates (public lookup by user ID or cert ID)
router.get("/", async (req, res, next) => {
  try {
    const { user_id, cert_id } = req.query;
    const baseQuery = `
      SELECT c.*, u.name as user_name, COALESCE(t.name, c.metadata->>'team_name') as team_name
      FROM certificates c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN events e ON c.event_id = e.id
      LEFT JOIN teams t ON t.event_slug = e.slug
      LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = c.user_id
    `;

    let result;
    if (cert_id) {
      result = await query(`${baseQuery} WHERE c.id = $1`, [cert_id]);
    } else if (user_id) {
      result = await query(`${baseQuery} WHERE c.user_id = $1 ORDER BY c.issued_at DESC`, [user_id]);
    } else {
      result = await query(`${baseQuery} ORDER BY c.issued_at DESC LIMIT 50`);
    }
    res.json({ certificates: result.rows });
  } catch (error) {
    next(error);
  }
});

// POST a new certificate
router.post("/", requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { user_id, type, event_id, project_id, metadata } = req.body;
    if (!user_id || !type) return res.status(400).json({ error: "missing_fields" });
    
    const result = await query(
      "INSERT INTO certificates (user_id, type, event_id, project_id, metadata) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [user_id, type, event_id || null, project_id || null, metadata || {}]
    );
    res.status(201).json({ certificate: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE a certificate
router.delete("/:id", requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    await query("DELETE FROM certificates WHERE id = $1", [id]);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export { router as certificateRoutes };
