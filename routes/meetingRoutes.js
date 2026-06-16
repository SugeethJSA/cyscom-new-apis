import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const meetingRoutes = Router();

// Get all meetings
meetingRoutes.get("/", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id || null;
    
    const meetingsRes = await query(`
      SELECT 
        m.*, 
        u.name as created_by_name,
        (SELECT COUNT(*) FROM meeting_rsvps WHERE meeting_id = m.id AND status = 'attending') as rsvp_count,
        (SELECT status FROM meeting_rsvps WHERE meeting_id = m.id AND user_id = $1) as user_rsvp_status
      FROM meetings m
      LEFT JOIN users u ON m.created_by = u.id
      ORDER BY m.date ASC, m.time ASC
    `, [userId]);

    res.json({ meetings: meetingsRes.rows });
  } catch (error) {
    next(error);
  }
});

// Create a new meeting
meetingRoutes.post("/", requireAuth, async (req, res, next) => {
  try {
    const { title, date, time, department, location, event_id } = req.body;
    
    if (!title || !date || !time) {
      return res.status(400).json({ error: "missing_fields", message: "Title, date, and time are required." });
    }

    const userId = req.user?.id || null;

    const meetingRes = await query(`
      INSERT INTO meetings (title, date, time, department, location, event_id, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [title, date, time, department || 'all', location || '', event_id || null, userId]);

    res.status(201).json({ 
      success: true, 
      meeting: { ...meetingRes.rows[0], created_by_name: req.user?.name || req.user?.username } 
    });
  } catch (error) {
    next(error);
  }
});

// Update a meeting
meetingRoutes.put("/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, date, time, department, location, event_id } = req.body;

    const meetRes = await query(`SELECT * FROM meetings WHERE id = $1`, [id]);
    if (meetRes.rows.length === 0) return res.status(404).json({ error: "not_found", message: "Meeting not found." });
    
    // Check if user is admin or creator
    const isCoreOrSuper = req.user?.role?.includes("core") || req.user?.role?.includes("superadmin") || req.user?.global;
    if (!isCoreOrSuper && meetRes.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: "forbidden", message: "Not authorized to edit this meeting." });
    }

    const updateRes = await query(`
      UPDATE meetings 
      SET title = COALESCE($1, title),
          date = COALESCE($2, date),
          time = COALESCE($3, time),
          department = COALESCE($4, department),
          location = COALESCE($5, location),
          event_id = COALESCE($6, event_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $7 RETURNING *
    `, [title, date, time, department, location, event_id, id]);

    res.json({ success: true, meeting: { ...updateRes.rows[0], created_by_name: req.user?.name || req.user?.username } });
  } catch (error) {
    next(error);
  }
});

// Delete a meeting
meetingRoutes.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const deleteRes = await query(`DELETE FROM meetings WHERE id = $1 RETURNING *`, [id]);
    
    if (deleteRes.rows.length === 0) {
      return res.status(404).json({ error: "not_found", message: "Meeting not found." });
    }

    res.json({ success: true, message: "Meeting deleted." });
  } catch (error) {
    next(error);
  }
});

// RSVP to a meeting
meetingRoutes.post("/:id/rsvp", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'attending', 'declined'
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ error: "unauthorized", message: "Must be logged in to RSVP" });

    await query(`
      INSERT INTO meeting_rsvps (meeting_id, user_id, status)
      VALUES ($1, $2, $3)
      ON CONFLICT (meeting_id, user_id) 
      DO UPDATE SET status = EXCLUDED.status, created_at = CURRENT_TIMESTAMP
    `, [id, userId, status || 'attending']);

    res.json({ success: true, message: "RSVP updated successfully." });
  } catch (error) {
    next(error);
  }
});
