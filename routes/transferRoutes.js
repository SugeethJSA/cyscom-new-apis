import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const transferRoutes = Router();

// Get all transfers (superadmin only)
transferRoutes.get("/", requireAuth, async (req, res, next) => {
  try {
    const roles = Array.isArray(req.user?.role) ? req.user.role : [req.user?.role].filter(Boolean);
    const isSuperadmin = roles.includes("superadmin") || req.user?.global;

    let transfers;
    if (isSuperadmin) {
      // Superadmins see all transfers
      const result = await query(`
        SELECT t.*, u.name as user_name, u.email as user_email, u.departments as current_departments
        FROM department_transfers t
        JOIN users u ON t.user_id = u.id
        ORDER BY t.created_at DESC
      `);
      transfers = result.rows;
    } else {
      // Regular users see only their own
      const result = await query(`
        SELECT t.*, u.name as user_name, u.email as user_email, u.departments as current_departments
        FROM department_transfers t
        JOIN users u ON t.user_id = u.id
        WHERE t.user_id = $1
        ORDER BY t.created_at DESC
      `, [req.user.id]);
      transfers = result.rows;
    }

    res.json({ transfers });
  } catch (error) {
    next(error);
  }
});

// Create a transfer request
transferRoutes.post("/", requireAuth, async (req, res, next) => {
  try {
    const { target_department, reason } = req.body;
    
    if (!target_department || !reason) {
      return res.status(400).json({ error: "missing_fields", message: "Target department and reason are required." });
    }

    // Check if user already has a pending transfer
    const pendingCheck = await query(`
      SELECT id FROM department_transfers 
      WHERE user_id = $1 AND status = 'pending'
    `, [req.user.id]);

    if (pendingCheck.rows.length > 0) {
      return res.status(400).json({ error: "already_pending", message: "You already have a pending transfer request." });
    }

    const insertResult = await query(`
      INSERT INTO department_transfers (user_id, target_department, reason, status)
      VALUES ($1, $2, $3, 'pending')
      RETURNING *
    `, [req.user.id, target_department, reason]);

    res.status(201).json({ success: true, transfer: insertResult.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Approve or Reject a transfer
transferRoutes.put("/:id", requireAuth, async (req, res, next) => {
  try {
    const roles = Array.isArray(req.user?.role) ? req.user.role : [req.user?.role].filter(Boolean);
    const isSuperadmin = roles.includes("superadmin") || req.user?.global;

    if (!isSuperadmin) {
      return res.status(403).json({ error: "forbidden", message: "Only superadmins can manage transfers." });
    }

    const { id } = req.params;
    const { status } = req.body; // 'approved' or 'rejected'

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: "invalid_status", message: "Status must be approved or rejected." });
    }

    const getResult = await query(`SELECT * FROM department_transfers WHERE id = $1`, [id]);
    const transfer = getResult.rows[0];

    if (!transfer) {
      return res.status(404).json({ error: "not_found", message: "Transfer request not found." });
    }

    // Update the transfer status
    await query(`
      UPDATE department_transfers
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [status, id]);

    // If approved, update the user's department
    if (status === 'approved') {
      // Add target_department to array if not exists
      await query(`
        UPDATE users
        SET departments = array_append(array_remove(departments, $1), $1)
        WHERE id = $2
      `, [transfer.target_department, transfer.user_id]);
    }

    res.json({ success: true, message: `Transfer ${status}` });
  } catch (error) {
    next(error);
  }
});
