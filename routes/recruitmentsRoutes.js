import { Router } from "express";
import { query } from "../db.js";

export const recruitmentsRoutes = Router();

// POST /api/recruitments
recruitmentsRoutes.post("/", async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone,
      regNumber,
      departmentPrimary,
      departmentSecondary,
      skills,
      motivation,
      contribution
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: "missing_fields", message: "Name and email are required." });
    }

    const result = await query(
      `INSERT INTO recruitments (name, email, phone, reg_number, department_primary, department_secondary, skills, motivation, contribution)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        name,
        email,
        phone || null,
        regNumber || null,
        departmentPrimary || null,
        departmentSecondary || null,
        skills || null,
        motivation || null,
        contribution || null
      ]
    );

    res.status(201).json({ success: true, application: result.rows[0] });
  } catch (error) {
    console.error("Error submitting recruitment:", error);
    next(error);
  }
});

// GET /api/recruitments (for admin view, just a basic unprotected version for testing, you might want to add requireAuth later)
recruitmentsRoutes.get("/", async (req, res, next) => {
  try {
    const result = await query("SELECT * FROM recruitments ORDER BY created_at DESC");
    res.json({ recruitments: result.rows });
  } catch (error) {
    next(error);
  }
});
