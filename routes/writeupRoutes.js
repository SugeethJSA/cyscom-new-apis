import express from "express";
import { query } from "../db.js";
import { requireAuth, requireHubAccess } from "../middleware/auth.js";

const router = express.Router();

// Get all writeups (public)
router.get("/", async (req, res, next) => {
  try {
    const result = await query("SELECT * FROM writeups ORDER BY published_at DESC, created_at DESC");
    res.json({ writeups: result.rows });
  } catch (error) {
    next(error);
  }
});

// Get a single writeup by slug (public)
router.get("/:slug", async (req, res, next) => {
  try {
    const { slug } = req.params;
    const result = await query("SELECT * FROM writeups WHERE slug = $1", [slug]);
    if (!result.rows[0]) {
      return res.status(404).json({ error: "not_found", message: "Writeup not found." });
    }
    res.json({ writeup: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

export { router as writeupRoutes };
