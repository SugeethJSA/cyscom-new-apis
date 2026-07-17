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

// Create a new blog (members only)
router.post("/", requireAuth, requireHubAccess('members', 'blogs'), async (req, res, next) => {
  try {
    const { title, slug, cover_image_url, author, content_markdown, tags, published_at } = req.body;
    
    if (!title || !slug || !content_markdown) {
      return res.status(400).json({ error: "missing_fields", message: "title, slug, and content_markdown are required." });
    }

    const result = await query(
      `INSERT INTO blogs (title, slug, cover_image_url, author, content_markdown, tags, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [title, slug.toLowerCase().replace(/[^a-z0-9-]/g, ""), cover_image_url || null, author || null, content_markdown, tags || [], published_at || null]
    );

    res.status(201).json({ blog: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') { // unique violation
       return res.status(409).json({ error: "conflict", message: "Blog slug already exists." });
    }
    next(error);
  }
});

export { router as blogRoutes };
