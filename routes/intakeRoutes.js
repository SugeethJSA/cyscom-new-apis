import { Router } from "express";
import { query } from "../db.js";
import { requireAuth, requireDepartment, requirePermission } from "../middleware/auth.js";

export const intakeRoutes = Router();

// Get candidates based on interviewer's department access
// Superadmins and those with manage_intake permission can view all, otherwise only their allowed departments
intakeRoutes.get("/candidates", requireAuth, async (req, res, next) => {
  try {
    const roles = Array.isArray(req.user?.role) ? req.user.role : [req.user?.role].filter(Boolean);
    const permissions = req.user?.permissions || [];
    const depts = Array.isArray(req.user?.departments) ? req.user.departments : [req.user?.department].filter(Boolean);

    let dbQuery = `SELECT * FROM recruitments ORDER BY created_at DESC`;
    let values = [];
    
    // If not superadmin or manage_intake, filter by department
    if (!roles.includes("superadmin") && !permissions.includes("manage_intake")) {
        if (depts.length === 0) {
            return res.json({ candidates: [] }); // No departments access
        }
        dbQuery = `SELECT * FROM recruitments WHERE department_primary = ANY($1) ORDER BY created_at DESC`;
        values = [depts];
    }

    const result = await query(dbQuery, values);
    const candidates = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      dept: row.department_primary,
      status: row.status || 'pending',
      score: row.score || 0
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
    const permissions = req.user?.permissions || [];
    const depts = Array.isArray(req.user?.departments) ? req.user.departments : [req.user?.department].filter(Boolean);

    if (!roles.includes("superadmin") && !permissions.includes("manage_intake")) {
        if (!depts.includes(candidateDept)) {
            return res.status(403).json({ error: "forbidden", message: "You cannot update candidates in this department." });
        }
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
      candidate: {
        id: updatedCandidate.id,
        name: updatedCandidate.name,
        email: updatedCandidate.email,
        dept: updatedCandidate.department_primary,
        status: updatedCandidate.status,
        score: updatedCandidate.score
      }
    });
  } catch (error) {
    next(error);
  }
});
