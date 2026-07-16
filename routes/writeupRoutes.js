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

// Create a new writeup (members only)
router.post("/", requireAuth, requireHubAccess('members', 'writeups'), async (req, res, next) => {
  try {
    const { title, slug, event_name, cover_image_url, author, content_markdown, tags, published_at } = req.body;
    
    if (!title || !slug || !content_markdown) {
      return res.status(400).json({ error: "missing_fields", message: "title, slug, and content_markdown are required." });
    }

    const result = await query(
      `INSERT INTO writeups (title, slug, event_name, cover_image_url, author, content_markdown, tags, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [title, slug.toLowerCase().replace(/[^a-z0-9-]/g, ""), event_name || null, cover_image_url || null, author || null, content_markdown, tags || [], published_at || null]
    );

    res.status(201).json({ writeup: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
       return res.status(409).json({ error: "conflict", message: "Writeup slug already exists." });
    }
    next(error);
  }
});

// Update a writeup (members only)
router.put("/:slug", requireAuth, requireHubAccess('members', 'writeups'), async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { title, event_name, cover_image_url, author, content_markdown, tags, published_at } = req.body;

    const result = await query(
      `UPDATE writeups
       SET title = COALESCE($2, title),
           event_name = COALESCE($3, event_name),
           cover_image_url = $4,
           author = COALESCE($5, author),
           content_markdown = COALESCE($6, content_markdown),
           tags = COALESCE($7, tags),
           published_at = $8
       WHERE slug = $1
       RETURNING *`,
      [slug, title, event_name, cover_image_url, author, content_markdown, tags, published_at]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "not_found", message: "Writeup not found." });
    }
    res.json({ writeup: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

export { router as writeupRoutes };
