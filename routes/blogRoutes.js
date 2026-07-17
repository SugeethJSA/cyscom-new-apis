import express from "express";
import { query } from "../db.js";
import { requireAuth, requireHubAccess } from "../middleware/auth.js";

const router = express.Router();

// Get all blogs (public)
router.get("/", async (req, res, next) => {
  try {
    const result = await query("SELECT * FROM blogs ORDER BY published_at DESC, created_at DESC");
    res.json({ blogs: result.rows });
  } catch (error) {
    next(error);
  }
});

// Get a single blog by slug (public)
router.get("/:slug", async (req, res, next) => {
  try {
    const { slug } = req.params;
    const result = await query("SELECT * FROM blogs WHERE slug = $1", [slug]);
    if (!result.rows[0]) {
      return res.status(404).json({ error: "not_found", message: "Blog not found." });
    }
    res.json({ blog: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

export { router as blogRoutes };
