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

export { router as projectRoutes };
