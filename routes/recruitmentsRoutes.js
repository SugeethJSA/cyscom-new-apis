import { Router } from "express";
import { query } from "../db.js";

export const recruitmentsRoutes = Router();

// POST /api/recruitments
recruitmentsRoutes.post("/", async (req, res, next) => {
  try {
    const body = req.body || {};
    
    // Extract standard fields prioritizing camelCase, fallback to snake_case
    const name = body.name;
    const email = body.email;
    const phone = body.phone;
    const regNumber = body.regNumber || body.reg_number;
    const departmentPrimary = body.departmentPrimary || body.department_primary;
    const departmentSecondary = body.departmentSecondary || body.department_secondary;
    const skills = body.skills;
    const motivation = body.motivation;
    const contribution = body.contribution;

    // Filter out standard fields to capture custom data
    const standardKeys = [
      'name', 'email', 'phone', 'regNumber', 'reg_number', 
      'departmentPrimary', 'department_primary', 
      'departmentSecondary', 'department_secondary', 
      'skills', 'motivation', 'contribution'
    ];
    
    const customData = Object.keys(body)
      .filter(key => !standardKeys.includes(key))
      .reduce((obj, key) => {
        obj[key] = body[key];
        return obj;
      }, {});

    if (!name || !email) {
      return res.status(400).json({ error: "missing_fields", message: "Name and email are required." });
    }

    const result = await query(
      `INSERT INTO recruitments (name, email, phone, reg_number, department_primary, department_secondary, skills, motivation, contribution, custom_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
        contribution || null,
        JSON.stringify(customData || {})
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
