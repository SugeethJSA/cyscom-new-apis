import express from "express";
import { query } from "../db.js";
import { requireAuth, requireSuperAdmin } from "../middleware/auth.js";

const router = express.Router();

// GET all projects (public and internal)
router.get("/", async (req, res, next) => {
  try {
    const result = await query("SELECT * FROM projects ORDER BY created_at DESC");
    res.json({ projects: result.rows });
  } catch (error) {
    next(error);
  }
});

// POST a new project
router.post("/", requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { name, description, status } = req.body;
    if (!name) return res.status(400).json({ error: "missing_fields" });
    
    const result = await query(
      "INSERT INTO projects (name, description, status) VALUES ($1, $2, $3) RETURNING *",
      [name, description, status || "active"]
    );
    res.status(201).json({ project: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// PUT (update) a project
router.put("/:id", requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, status } = req.body;
    
    const result = await query(
      "UPDATE projects SET name = COALESCE($1, name), description = COALESCE($2, description), status = COALESCE($3, status), updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *",
      [name, description, status, id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "not_found" });
    res.json({ project: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE a project
router.delete("/:id", requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    await query("DELETE FROM projects WHERE id = $1", [id]);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export { router as projectRoutes };
