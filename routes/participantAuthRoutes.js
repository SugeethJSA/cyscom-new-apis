import express from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "../db.js";
import { signUser, requireAuth } from "../middleware/auth.js";

const router = express.Router();

// Register new participant
router.post("/register", async (req, res, next) => {
  try {
    const input = z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(6)
    }).parse(req.body);

    const hash = await bcrypt.hash(input.password, 10);
    const result = await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'participant')
       RETURNING id, name, email, role, profile_data`,
      [input.name, input.email, hash]
    );

    const user = result.rows[0];
    const signedUser = { id: user.id, email: user.email, name: user.name, role: user.role };
    
    res.status(201).json({
      token: signUser(signedUser),
      user: signedUser,
      profile_data: user.profile_data
    });
  } catch (error) {
    if (error.code === '23505') { // unique violation
      return res.status(409).json({ error: "email_exists", message: "Email already registered." });
    }
    next(error);
  }
});

// Login participant
router.post("/login", async (req, res, next) => {
  try {
    const input = z.object({
      email: z.string().email(),
      password: z.string().min(1)
    }).parse(req.body);

    const result = await query("SELECT * FROM users WHERE email = $1", [input.email]);
    const user = result.rows[0];
    
    if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
      return res.status(401).json({ error: "invalid_credentials", message: "Email or password incorrect." });
    }

    const signedUser = { id: user.id, email: user.email, name: user.name, role: user.role };
    res.json({
      token: signUser(signedUser),
      user: signedUser,
      profile_data: user.profile_data
    });
  } catch (error) {
    next(error);
  }
});

// Get profile and registered events
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userResult = await query("SELECT id, name, email, role, profile_data, is_legacy FROM users WHERE id = $1", [userId]);
    if (!userResult.rows[0]) return res.status(404).json({ error: "not_found" });

    const attendeesResult = await query(
      `SELECT a.*, e.name as event_name, e.start_date, e.banner_url
       FROM attendees a
       JOIN events e ON a.event_slug = e.slug
       WHERE a.user_id = $1
       ORDER BY e.start_date DESC`,
      [userId]
    );

    const recruitmentsResult = await query(
      `SELECT * FROM recruitments WHERE email = $1 ORDER BY created_at DESC`,
      [userResult.rows[0].email]
    );

    res.json({
      user: userResult.rows[0],
      registrations: attendeesResult.rows,
      recruitments: recruitmentsResult.rows
    });
  } catch (error) {
    next(error);
  }
});

export { router as participantAuthRoutes };
