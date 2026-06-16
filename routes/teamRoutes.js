import express from "express";
import { z } from "zod";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// Create team
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const input = z.object({
      event_slug: z.string().min(1),
      name: z.string().min(1)
    }).parse(req.body);

    const result = await query(
      "INSERT INTO teams (event_slug, name, leader_id) VALUES ($1, $2, $3) RETURNING *",
      [input.event_slug, input.name, req.user.id]
    );
    
    // Automatically add leader to team_members
    const teamId = result.rows[0].id;
    await query(
      "INSERT INTO team_members (team_id, user_id, status) VALUES ($1, $2, 'accepted')",
      [teamId, req.user.id]
    );

    res.status(201).json({ team: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// Invite member
router.post("/:id/invite", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const input = z.object({
      participant_id: z.string().uuid()
    }).parse(req.body);

    // Verify team belongs to leader
    const teamRes = await query("SELECT leader_id FROM teams WHERE id = $1", [id]);
    if (!teamRes.rows[0] || teamRes.rows[0].leader_id !== req.user.id) {
      return res.status(403).json({ error: "forbidden", message: "Only leader can invite members." });
    }

    await query(
      "INSERT INTO team_members (team_id, user_id, status) VALUES ($1, $2, 'pending') ON CONFLICT DO NOTHING",
      [id, input.participant_id]
    );

    res.json({ message: "Invite sent successfully." });
  } catch (err) {
    next(err);
  }
});

// Accept invite
router.post("/:id/accept", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      "UPDATE team_members SET status = 'accepted' WHERE team_id = $1 AND user_id = $2 RETURNING *",
      [id, req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "not_found", message: "No pending invite found." });
    }

    res.json({ message: "Invite accepted." });
  } catch (err) {
    next(err);
  }
});

export { router as teamRoutes };
