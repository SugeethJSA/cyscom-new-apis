import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const resourceRoutes = Router();

// Get all resources
resourceRoutes.get("/", requireAuth, async (req, res, next) => {
  try {
    const resourcesRes = await query(`
      SELECT r.*, u.name as uploader_name 
      FROM resources r
      LEFT JOIN users u ON r.uploader_id = u.id
      ORDER BY r.created_at DESC
    `);

    res.json({ resources: resourcesRes.rows });
  } catch (error) {
    next(error);
  }
});

// Create a new resource
resourceRoutes.post("/", requireAuth, async (req, res, next) => {
  try {
    const { name, url } = req.body;
    
    if (!name || !url) {
      return res.status(400).json({ error: "missing_fields", message: "Name and URL are required." });
    }

    const userId = req.user?.id || null;

    const resourceRes = await query(`
      INSERT INTO resources (name, url, uploader_id)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [name, url, userId]);

    res.status(201).json({ 
      success: true, 
      resource: { ...resourceRes.rows[0], uploader_name: req.user?.name || req.user?.username } 
    });
  } catch (error) {
    next(error);
  }
});

// Delete a resource
resourceRoutes.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const deleteRes = await query(`DELETE FROM resources WHERE id = $1 RETURNING *`, [id]);
    
    if (deleteRes.rows.length === 0) {
      return res.status(404).json({ error: "not_found", message: "Resource not found." });
    }

    res.json({ success: true, message: "Resource deleted." });
  } catch (error) {
    next(error);
  }
});
