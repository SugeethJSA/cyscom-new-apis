import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const intakeRoutes = Router();

// Get candidates based on interviewer's department access
// Superadmins and those with manage_intake permission can view all, otherwise only their allowed departments
intakeRoutes.get("/candidates", requireAuth, async (req, res, next) => {
  try {
    const roles = Array.isArray(req.user?.role) ? req.user.role : [req.user?.role].filter(Boolean);
    const mergedPerms = req.user?.merged_permissions || { hubs: {} };
    const memHubPerms = mergedPerms.hubs?.members || [];

    let dbQuery = `SELECT * FROM recruitments ORDER BY created_at DESC`;
    let values = [];
    
    // If not superadmin or manage_intake, they have NO access to candidate lists across departments since we don't map by dept anymore,
    // OR we just allow them if they have "manage_intake" or "*"
    if (!roles.includes("superadmin") && !memHubPerms.includes("manage_intake") && !memHubPerms.includes("*") && !roles.includes("interviewer")) {
        // Without granular dept access, just deny them
        return res.json({ candidates: [] });
    }

    const result = await query(dbQuery, values);
    const candidates = result.rows.map(row => ({
      ...row,
      dept: row.department_primary, // Keep for backward compatibility with older components
    }));

    res.json({ candidates });
  } catch (error) {
    next(error);
  }
});

// Update candidate status
intakeRoutes.put("/candidates/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, score } = req.body;
    
    // First verify they have access to this candidate
    const candidateRes = await query(`SELECT department_primary FROM recruitments WHERE id = $1`, [id]);
    if (candidateRes.rows.length === 0) {
      return res.status(404).json({ error: "not_found", message: "Candidate not found." });
    }
    
    const candidateDept = candidateRes.rows[0].department_primary;

    const roles = Array.isArray(req.user?.role) ? req.user.role : [req.user?.role].filter(Boolean);
    const mergedPerms = req.user?.merged_permissions || { hubs: {} };
    const memHubPerms = mergedPerms.hubs?.members || [];

    if (!roles.includes("superadmin") && !memHubPerms.includes("manage_intake") && !memHubPerms.includes("*") && !roles.includes("interviewer")) {
        return res.status(403).json({ error: "forbidden", message: "You do not have permission to update candidates." });
    }

    // Update in postgres
    let updateQuery = `UPDATE recruitments SET `;
    let values = [];
    let setClauses = [];

    if (status !== undefined) {
      setClauses.push(`status = $${values.length + 1}`);
      values.push(status);
    }
    if (score !== undefined) {
      setClauses.push(`score = $${values.length + 1}`);
      values.push(score);
    }

    if (setClauses.length === 0) {
      return res.json({ message: "No updates provided" });
    }

    values.push(id);
    updateQuery += setClauses.join(', ') + ` WHERE id = $${values.length} RETURNING *`;

    const updatedRes = await query(updateQuery, values);
    const updatedCandidate = updatedRes.rows[0];

    res.json({
      message: "Candidate updated successfully.",
      candidate: { ...updatedCandidate, dept: updatedCandidate.department_primary }
    });
  } catch (error) {
    next(error);
  }
});

// Get Intake Settings (Stages, Competencies, Form Schema)
intakeRoutes.get("/settings", async (req, res, next) => {
  try {
    const settingsRes = await query(`
      SELECT setting_key, setting_value 
      FROM system_settings 
      WHERE setting_key IN ('intake_stages', 'intake_competencies', 'intake_form_schema')
    `);
    
    const settings = {
      stages: ["pending", "review", "accepted", "rejected"],
      competencies: [],
      form_schema: []
    };

    settingsRes.rows.forEach(row => {
      if (row.setting_key === 'intake_stages') settings.stages = row.setting_value;
      if (row.setting_key === 'intake_competencies') settings.competencies = row.setting_value;
      if (row.setting_key === 'intake_form_schema') settings.form_schema = row.setting_value;
    });

    res.json(settings);
  } catch (error) {
    next(error);
  }
});

// Update Intake Settings (Superadmin only)
intakeRoutes.put("/settings", requireAuth, async (req, res, next) => {
  try {
    const roles = Array.isArray(req.user?.role) ? req.user.role : [req.user?.role].filter(Boolean);
    if (!roles.includes("superadmin")) {
      return res.status(403).json({ error: "forbidden", message: "Only superadmins can update intake settings." });
    }

    const { stages, competencies, form_schema } = req.body;

    // Run updates in parallel
    const promises = [];
    if (stages) {
      promises.push(query(`UPDATE system_settings SET setting_value = $1::jsonb WHERE setting_key = 'intake_stages'`, [JSON.stringify(stages)]));
    }
    if (competencies) {
      promises.push(query(`UPDATE system_settings SET setting_value = $1::jsonb WHERE setting_key = 'intake_competencies'`, [JSON.stringify(competencies)]));
    }
    if (form_schema) {
      promises.push(query(`UPDATE system_settings SET setting_value = $1::jsonb WHERE setting_key = 'intake_form_schema'`, [JSON.stringify(form_schema)]));
    }

    await Promise.all(promises);

    res.json({ message: "Settings updated successfully" });
  } catch (error) {
    next(error);
  }
});

// Get comments for a candidate
intakeRoutes.get("/candidates/:id/comments", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    // Assume access control is checked via the UI or could be strict here.
    const commentsRes = await query(`
      SELECT * FROM recruitment_comments 
      WHERE recruitment_id = $1 
      ORDER BY created_at ASC
    `, [id]);
    
    res.json({ comments: commentsRes.rows });
  } catch (error) {
    next(error);
  }
});

// Add a comment to a candidate
intakeRoutes.post("/candidates/:id/comments", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { comment, ratings, stage } = req.body;
    
    if (!comment) {
      return res.status(400).json({ error: "missing_fields", message: "Comment is required." });
    }

    const authorId = req.user?.id || null;
    const authorName = req.user?.username || req.user?.email || "Unknown Reviewer";

    const insertRes = await query(`
      INSERT INTO recruitment_comments (recruitment_id, author_id, author_name, comment, ratings, stage)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [id, authorId, authorName, comment, JSON.stringify(ratings || {}), stage || 'pending']);

    res.status(201).json({ success: true, comment: insertRes.rows[0] });
  } catch (error) {
    next(error);
  }
});
