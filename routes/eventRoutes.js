import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import multer from "multer";
import xlsx from "xlsx";
import { z } from "zod";
import { pool, query, withTransaction } from "../db.js";
import { requireAuth, requireAdmin, signUser, optionalAuth } from "../middleware/auth.js";
import { encryptQrPayload, exportQrDecryptKey, hashPayload } from "../services/crypto.js";
import { sendQrEmail } from "../services/email.js";
import { parseExcel } from "../services/excel.js";
import { resolveActiveRule, evaluateRule } from "../services/rules.js";

export const eventRoutes = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage() });

// PUBLIC: Get Event info
eventRoutes.get("/", async (req, res, next) => {
  try {
    const { slug } = req.params;
    const result = await query("SELECT * FROM events WHERE slug = $1", [slug]);
    if (!result.rows[0]) {
      return res.status(404).json({ error: "not_found", message: `Event ${slug} not found.` });
    }
    res.json({ event: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// AUTH: Login scoped per event
eventRoutes.post("/auth/login", async (req, res, next) => {
  try {
    const { slug } = req.params;
    const input = z.object({
      email: z.string().email(),
      password: z.string().min(1)
    }).parse(req.body);

    const result = await query(
      `SELECT u.*,
              uc.name AS category_name,
              uc.capabilities AS category_capabilities,
              uc.station_permissions AS category_stations
         FROM users u
         LEFT JOIN user_categories uc ON uc.id = u.category_id AND uc.active = TRUE AND uc.event_slug = $2
        WHERE u.email = $1 AND u.active = TRUE AND ($2 = ANY(u.allowed_events) OR '*' = ANY(u.allowed_events))`,
      [input.email, slug]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
      return res.status(401).json({ error: "invalid_credentials", message: "Email or password is incorrect." });
    }

    const capabilities = {};
    if (user.role === "admin") {
      for (const key of ["can_scan", "can_verify", "can_register", "can_view_attendees", "can_export", "can_transfer"]) {
        capabilities[key] = true;
      }
    } else if (user.category_capabilities) {
      Object.assign(capabilities, user.category_capabilities);
    } else {
      capabilities.can_scan = true;
      capabilities.can_view_attendees = true;
    }

    const signedUser = { id: user.id, email: user.email, name: user.name, role: user.role, allowed_events: user.allowed_events || [] };
    return res.json({
      token: signUser(signedUser),
      user: signedUser,
      qrDecryptKey: exportQrDecryptKey(),
      capabilities,
      categoryName: user.category_name ?? null
    });
  } catch (error) {
    return next(error);
  }
});

// CATEGORIES CRUD per event
eventRoutes.get("/categories", requireAuth, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const result = await query(
      `SELECT id,
              name,
              description,
              color,
              station_permissions::text[] AS "stationPermissions",
              capabilities,
              active,
              created_at AS "createdAt",
              updated_at AS "updatedAt",
              (SELECT count(*)::int FROM users WHERE category_id = user_categories.id AND event_slug = $1) AS "userCount"
         FROM user_categories
        WHERE event_slug = $1
        ORDER BY active DESC, name ASC`,
      [slug]
    );
    res.json({ categories: result.rows, capabilityKeys: ["can_scan", "can_verify", "can_register", "can_view_attendees", "can_export", "can_transfer"] });
  } catch (error) {
    next(error);
  }
});

eventRoutes.post("/categories", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const input = z.object({
      name: z.string().min(1),
      description: z.string().default(""),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"),
      stationPermissions: z.array(z.enum(["entry", "food", "kit", "custom"])).default([]),
      capabilities: z.record(z.boolean()).default({}),
      active: z.boolean().default(true)
    }).parse(req.body);

    const capabilities = {};
    for (const key of ["can_scan", "can_verify", "can_register", "can_view_attendees", "can_export", "can_transfer"]) {
      capabilities[key] = input.capabilities[key] ?? false;
    }

    const result = await query(
      `INSERT INTO user_categories (name, description, color, station_permissions, capabilities, active, event_slug)
       VALUES ($1, $2, $3, $4::station_type[], $5, $6, $7)
       RETURNING id, name, description, color, station_permissions AS "stationPermissions", capabilities, active`,
      [input.name, input.description, input.color, input.stationPermissions, JSON.stringify(capabilities), input.active, slug]
    );
    res.status(201).json({ category: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

eventRoutes.put("/categories/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const input = z.object({
      name: z.string().min(1),
      description: z.string().default(""),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"),
      stationPermissions: z.array(z.enum(["entry", "food", "kit", "custom"])).default([]),
      capabilities: z.record(z.boolean()).default({}),
      active: z.boolean().default(true)
    }).parse(req.body);

    const capabilities = {};
    for (const key of ["can_scan", "can_verify", "can_register", "can_view_attendees", "can_export", "can_transfer"]) {
      capabilities[key] = input.capabilities[key] ?? false;
    }

    const result = await query(
      `UPDATE user_categories
          SET name = $3,
              description = $4,
              color = $5,
              station_permissions = $6::station_type[],
              capabilities = $7,
              active = $8,
              updated_at = now()
        WHERE id = $1 AND event_slug = $2
        RETURNING id, name, description, color, station_permissions AS "stationPermissions", capabilities, active`,
      [req.params.id, slug, input.name, input.description, input.color, input.stationPermissions, JSON.stringify(capabilities), input.active]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: "not_found", message: "Category not found." });
    }
    return res.json({ category: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

eventRoutes.delete("/categories/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const result = await query(
      "UPDATE user_categories SET active = FALSE, updated_at = now() WHERE id = $1 AND event_slug = $2 RETURNING id",
      [req.params.id, slug]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: "not_found", message: "Category not found." });
    }
    await query("UPDATE users SET category_id = NULL WHERE category_id = $1 AND event_slug = $2", [req.params.id, slug]);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

eventRoutes.get("/settings", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const result = await query(
      "SELECT setting_key, setting_value FROM system_settings WHERE event_slug = $1",
      [slug]
    );
    const settings = result.rows.reduce((acc, row) => {
      acc[row.setting_key] = row.setting_value;
      return acc;
    }, {});
    res.json({ settings });
  } catch (error) {
    next(error);
  }
});

eventRoutes.put("/settings", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const input = z.record(z.any()).parse(req.body);
    const keys = Object.keys(input);

    await withTransaction(async (client) => {
      for (const key of keys) {
        await client.query(
          `INSERT INTO system_settings (setting_key, setting_value, event_slug) 
           VALUES ($1, $2, $3)
           ON CONFLICT (setting_key, event_slug) DO UPDATE 
           SET setting_value = EXCLUDED.setting_value,
               updated_at = CURRENT_TIMESTAMP`,
          [key, JSON.stringify(input[key]), slug]
        );
      }
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ATTENDEES per event
eventRoutes.get("/attendees", requireAuth, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const q = String(req.query.q ?? "");
    const result = await query(
      `SELECT id,
              external_ref AS "externalRef",
              name,
              email,
              phone,
              college,
              department,
              metadata,
              registered_on_spot AS "registeredOnSpot",
              created_at AS "createdAt"
         FROM attendees
        WHERE event_slug = $2 AND ($1 = '' OR name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
        ORDER BY created_at DESC
        LIMIT 250`,
      [q, slug]
    );
    res.json({ attendees: result.rows });
  } catch (error) {
    next(error);
  }
});



eventRoutes.post("/attendees", requireAuth, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const settingsRes = await query("SELECT setting_key, setting_value FROM system_settings WHERE event_slug = $1 AND setting_key IN ('all_registrations_enabled', 'admin_onspot_enabled', 'volunteer_onspot_enabled')", [slug]);
    const settings = settingsRes.rows.reduce((acc, row) => ({ ...acc, [row.setting_key]: row.setting_value }), {});

    if (settings.all_registrations_enabled === "false") {
      return res.status(403).json({ error: "forbidden", message: "Registrations are currently disabled." });
    }

    const role = req.user?.role;
    if (role === "admin" && settings.admin_onspot_enabled === "false") {
      return res.status(403).json({ error: "forbidden", message: "Admin on-spot registration is disabled." });
    }
    if (role === "volunteer" && settings.volunteer_onspot_enabled === "false") {
      return res.status(403).json({ error: "forbidden", message: "Volunteer on-spot registration is disabled." });
    }

    const input = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional().nullable(),
      college: z.string().optional().nullable(),
      department: z.string().optional().nullable(),
      externalRef: z.string().optional().nullable(),
      customFields: z.record(z.unknown()).default({})
    }).parse(req.body);

    const result = await query(
      `INSERT INTO attendees (external_ref, name, email, phone, college, department, metadata, registered_on_spot, event_slug)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
       ON CONFLICT (email, event_slug) DO UPDATE
       SET name = EXCLUDED.name,
           phone = EXCLUDED.phone,
           college = EXCLUDED.college,
           department = EXCLUDED.department,
           metadata = attendees.metadata || EXCLUDED.metadata,
           updated_at = now()
       RETURNING *`,
      [
        input.externalRef,
        input.name,
        input.email.toLowerCase(),
        input.phone,
        input.college,
        input.department,
        { customFields: input.customFields, verificationStatus: "verified" },
        slug
      ]
    );
    res.status(201).json({ attendee: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

eventRoutes.put("/attendees/:id", requireAuth, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const input = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional().nullable(),
      college: z.string().optional().nullable(),
      department: z.string().optional().nullable(),
      externalRef: z.string().optional().nullable(),
      customFields: z.record(z.unknown()).default({})
    }).parse(req.body);

    const result = await query(
      `UPDATE attendees
          SET name = $3,
              email = $4,
              phone = $5,
              college = $6,
              department = $7,
              external_ref = $8,
              metadata = attendees.metadata || $9::jsonb,
              updated_at = now()
        WHERE id = $1 AND event_slug = $2
        RETURNING *`,
      [
        req.params.id,
        slug,
        input.name,
        input.email.toLowerCase(),
        input.phone,
        input.college,
        input.department,
        input.externalRef,
        JSON.stringify({ customFields: input.customFields })
      ]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: "not_found", message: "Attendee not found." });
    }
    return res.json({ attendee: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

// Bulk import attendees from frontend JSON
eventRoutes.post("/attendees/import", requireAuth, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { attendees } = req.body;
    if (!Array.isArray(attendees)) {
      return res.status(400).json({ error: "invalid_payload", message: "Expected attendees array." });
    }

    const generatedCredentials = [];
    
    await withTransaction(async (client) => {
      for (const att of attendees) {
        if (!att.email) continue;
        const email = att.email.trim().toLowerCase();
        
        // Ensure user account exists
        let userId = null;
        const userCheck = await client.query("SELECT id FROM users WHERE email = $1", [email]);
        
        if (userCheck.rows[0]) {
          userId = userCheck.rows[0].id;
        } else {
          // Generate an 8 character random password
          const plainPassword = Math.random().toString(36).slice(-8);
          const hash = await bcrypt.hash(plainPassword, 10);
          
          const userInsert = await client.query(
            `INSERT INTO users (name, email, password_hash, role)
             VALUES ($1, $2, $3, 'participant')
             RETURNING id`,
            [att.name || "", email, hash]
          );
          userId = userInsert.rows[0].id;
          generatedCredentials.push({ email, name: att.name || "", password: plainPassword });
        }

        await client.query(
          `INSERT INTO attendees (name, email, phone, college, department, metadata, event_slug, user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (email, event_slug) DO UPDATE
           SET name = EXCLUDED.name,
               phone = EXCLUDED.phone,
               college = EXCLUDED.college,
               department = EXCLUDED.department,
               user_id = EXCLUDED.user_id,
               metadata = attendees.metadata || EXCLUDED.metadata,
               updated_at = now()`,
          [
            att.name || "", 
            email, 
            att.phone || "", 
            att.college || "", 
            att.department || "", 
            { customFields: att.customFields || {} }, 
            slug, 
            userId
          ]
        );
      }
    });

    res.status(201).json({ success: true, count: attendees.length, credentials: generatedCredentials });
  } catch (error) {
    next(error);
  }
});

eventRoutes.post("/attendees/public-register", optionalAuth, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const settingsRes = await query("SELECT setting_key, setting_value FROM system_settings WHERE event_slug = $1 AND setting_key IN ('all_registrations_enabled', 'require_payment_proof')", [slug]);
    const settings = settingsRes.rows.reduce((acc, row) => ({ ...acc, [row.setting_key]: row.setting_value }), {});
    if (settings.all_registrations_enabled === "false") {
      return res.status(403).json({ error: "forbidden", message: "Registrations are currently disabled." });
    }

    const input = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional().nullable(),
      college: z.string().optional().nullable(),
      department: z.string().optional().nullable(),
      externalRef: z.string().optional().nullable(),
      customFields: z.record(z.unknown()).default({})
    }).parse(req.body);
    const paymentProof = req.body.paymentProof;

    const result = await query(
      `INSERT INTO attendees (external_ref, name, email, phone, college, department, metadata, registered_on_spot, event_slug, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8, $9)
       ON CONFLICT (email, event_slug) DO UPDATE
       SET name = EXCLUDED.name,
           phone = EXCLUDED.phone,
           college = EXCLUDED.college,
           department = EXCLUDED.department,
           user_id = EXCLUDED.user_id,
           metadata = attendees.metadata || EXCLUDED.metadata,
           updated_at = now()
       RETURNING *`,
      [
        input.externalRef,
        input.name,
        input.email.toLowerCase(),
        input.phone,
        input.college,
        input.department,
        JSON.stringify({
          verificationStatus: settings.require_payment_proof === "false" ? "verified" : "pending",
          paymentProof,
          customFields: input.customFields
        }),
        slug,
        req.user?.id || null
      ]
    );

    // If logged in, update cross-syncable profile_data
    if (req.user?.id && Object.keys(input.customFields).length > 0) {
      const formFieldsRes = await query("SELECT field_key FROM registration_form_fields WHERE event_slug = $1 AND cross_syncable = TRUE", [slug]);
      const syncableKeys = formFieldsRes.rows.map(row => row.field_key);
      
      const newProfileData = {};
      for (const key of syncableKeys) {
        if (input.customFields[key] !== undefined) {
          newProfileData[key] = input.customFields[key];
        }
      }

      if (Object.keys(newProfileData).length > 0) {
        await query(
          "UPDATE users SET profile_data = profile_data || $1::jsonb WHERE id = $2",
          [JSON.stringify(newProfileData), req.user.id]
        );
      }
    }

    return res.status(201).json({ attendee: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

eventRoutes.post("/attendees/public-transfer", async (req, res, next) => {
  try {
    const { slug } = req.params;
    const settingsRes = await query("SELECT setting_key, setting_value FROM system_settings WHERE event_slug = $1 AND setting_key IN ('all_registrations_enabled', 'require_payment_proof')", [slug]);
    const settings = settingsRes.rows.reduce((acc, row) => ({ ...acc, [row.setting_key]: row.setting_value }), {});
    if (settings.all_registrations_enabled === "false") {
      return res.status(403).json({ error: "forbidden", message: "Transfers are currently disabled." });
    }

    const { originalAttendeeId, recipient, paymentProof } = req.body;
    if (!originalAttendeeId) {
      return res.status(400).json({ error: "missing_original_id", message: "Original attendee ID is required." });
    }

    const parsedRecipient = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional().nullable(),
      college: z.string().optional().nullable(),
      department: z.string().optional().nullable(),
      externalRef: z.string().optional().nullable(),
      customFields: z.record(z.unknown()).default({})
    }).parse(recipient);

    const original = await query("SELECT * FROM attendees WHERE id = $1 AND event_slug = $2", [originalAttendeeId, slug]);
    if (!original.rows[0]) {
      return res.status(404).json({ error: "original_not_found", message: "Original attendee not found. Check the ID and try again." });
    }

    const originalMeta = original.rows[0].metadata || {};
    if (originalMeta.status === "transferred" || originalMeta.verificationStatus === "transferred") {
      return res.status(400).json({ error: "already_transferred", message: "This ticket has already been transferred." });
    }

    const pendingTransfer = await query(
      `SELECT 1 FROM attendees WHERE event_slug = $1 AND metadata->>'transferredFrom' = $2 AND metadata->>'verificationStatus' = 'pending' LIMIT 1`,
      [slug, originalAttendeeId]
    );
    if (pendingTransfer.rows[0]) {
      return res.status(400).json({ error: "pending_transfer", message: "A transfer request is already pending for this ticket." });
    }

    const result = await withTransaction(async (client) => {
      const recipientRes = await client.query(
        `INSERT INTO attendees (name, email, phone, college, department, metadata, registered_on_spot, event_slug)
         VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7)
         RETURNING *`,
        [
          parsedRecipient.name,
          parsedRecipient.email.toLowerCase(),
          parsedRecipient.phone,
          parsedRecipient.college,
          parsedRecipient.department,
          JSON.stringify({
            verificationStatus: settings.require_payment_proof === "false" ? "verified" : "pending",
            paymentProof,
            transferredFrom: originalAttendeeId,
            customFields: parsedRecipient.customFields
          }),
          slug
        ]
      );
      
      const newAttendee = recipientRes.rows[0];
      
      if (settings.require_payment_proof === "false") {
        originalMeta.status = "transferred";
        originalMeta.transferredTo = newAttendee.id;
        originalMeta.verificationStatus = "transferred";
        await client.query("UPDATE attendees SET metadata = $2, updated_at = now() WHERE id = $1 AND event_slug = $3", [originalAttendeeId, JSON.stringify(originalMeta), slug]);
        await client.query("DELETE FROM qr_codes WHERE attendee_id = $1 AND event_slug = $2", [originalAttendeeId, slug]);
      }
      return newAttendee;
    });

    return res.status(201).json({ recipientAttendee: result });
  } catch (error) {
    return next(error);
  }
});

eventRoutes.post("/attendees/:id/verify", requireAuth, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { action } = req.body;
    if (action !== "approve" && action !== "reject") {
      return res.status(400).json({ error: "invalid_action", message: "Action must be approve or reject." });
    }

    const result = await withTransaction(async (client) => {
      const attendeeResult = await client.query("SELECT * FROM attendees WHERE id = $1 AND event_slug = $2", [req.params.id, slug]);
      const attendee = attendeeResult.rows[0];
      if (!attendee) {
        throw new Error("Attendee not found.");
      }

      const meta = attendee.metadata || {};
      if (meta.verificationStatus !== "pending") {
        throw new Error("Attendee is not in a pending verification state.");
      }

      if (action === "reject") {
        const updated = await client.query(
          `UPDATE attendees
              SET metadata = jsonb_set(metadata, '{verificationStatus}', '"rejected"'),
                  updated_at = now()
            WHERE id = $1 AND event_slug = $2
            RETURNING *`,
          [req.params.id, slug]
        );
        return updated.rows[0];
      }

      const updatedMeta = {
        ...meta,
        verificationStatus: "verified"
      };
      
      const updatedAttendeeResult = await client.query(
        `UPDATE attendees
            SET metadata = $2,
                updated_at = now()
          WHERE id = $1 AND event_slug = $3
          RETURNING *`,
        [req.params.id, JSON.stringify(updatedMeta), slug]
      );
      const updatedAttendee = updatedAttendeeResult.rows[0];

      if (meta.transferredFrom) {
        const originalId = meta.transferredFrom;
        const originalResult = await client.query("SELECT * FROM attendees WHERE id = $1 AND event_slug = $2", [originalId, slug]);
        const original = originalResult.rows[0];
        if (original) {
          const originalMeta = original.metadata || {};
          originalMeta.status = "transferred";
          originalMeta.transferredTo = updatedAttendee.id;
          originalMeta.verificationStatus = "transferred";

          await client.query(
            `UPDATE attendees
                SET metadata = $2,
                    updated_at = now()
              WHERE id = $1 AND event_slug = $3`,
            [originalId, JSON.stringify(originalMeta), slug]
          );

          await client.query("DELETE FROM qr_codes WHERE attendee_id = $1 AND event_slug = $2", [originalId, slug]);
        }
      }

      const encrypted = encryptQrPayload({
        attendeeId: updatedAttendee.id,
        name: updatedAttendee.name,
        email: updatedAttendee.email,
        issuedAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString()
      });

      await client.query(
        `INSERT INTO qr_codes (attendee_id, encrypted_payload, payload_hash, key_version, event_slug)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (attendee_id) DO UPDATE
         SET encrypted_payload = EXCLUDED.encrypted_payload,
             payload_hash = EXCLUDED.payload_hash,
             key_version = EXCLUDED.key_version`,
        [updatedAttendee.id, encrypted.encryptedPayload, encrypted.payloadHash, encrypted.keyVersion, slug]
      );

      return updatedAttendee;
    });

    return res.json({ attendee: result });
  } catch (error) {
    return next(error);
  }
});

// FORM FIELDS per event
eventRoutes.get("/form-fields/public", async (req, res, next) => {
  try {
    const { slug } = req.params;
    const result = await query(
      `SELECT id,
              field_key AS "fieldKey",
              label,
              field_type AS "fieldType",
              required,
              options,
              sort_order AS "sortOrder",
              active,
              show_in_list AS "showInList",
              is_system AS "isSystem",
              visibility_rules AS "visibilityRules",
              validations,
              calculation
         FROM registration_form_fields
        WHERE active = TRUE AND event_slug = $1
        ORDER BY sort_order ASC, label ASC`,
      [slug]
    );
    res.json({ fields: result.rows });
  } catch (error) {
    next(error);
  }
});

eventRoutes.get("/form-fields", requireAuth, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const result = await query(
      `SELECT id,
              field_key AS "fieldKey",
              label,
              field_type AS "fieldType",
              required,
              options,
              sort_order AS "sortOrder",
              active,
              show_in_list AS "showInList",
              is_system AS "isSystem",
              visibility_rules AS "visibilityRules",
              validations,
              calculation,
              created_at AS "createdAt",
              updated_at AS "updatedAt"
         FROM registration_form_fields
        WHERE event_slug = $1
        ORDER BY active DESC, sort_order ASC, label ASC`,
      [slug]
    );
    res.json({ fields: result.rows });
  } catch (error) {
    next(error);
  }
});

eventRoutes.post("/form-fields", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const input = z.object({
      fieldKey: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/),
      label: z.string().min(1),
      fieldType: z.enum(["text", "email", "phone", "number", "select", "textarea", "checkbox", "hidden", "calculated"]),
      required: z.boolean().default(false),
      options: z.array(z.string().min(1)).default([]),
      sortOrder: z.coerce.number().int().default(0),
      active: z.boolean().default(true),
      showInList: z.boolean().default(false),
      visibilityRules: z.any().nullable().optional(),
      validations: z.any().nullable().optional(),
      calculation: z.string().nullable().optional()
    }).parse(req.body);

    const result = await query(
      `INSERT INTO registration_form_fields
         (field_key, label, field_type, required, options, sort_order, active, show_in_list, is_system, visibility_rules, validations, calculation, event_slug)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, field_key AS "fieldKey", label, field_type AS "fieldType", required, options, sort_order AS "sortOrder", active, show_in_list AS "showInList", is_system AS "isSystem", visibility_rules AS "visibilityRules", validations, calculation`,
      [input.fieldKey, input.label, input.fieldType, input.required, JSON.stringify(input.options), input.sortOrder, input.active, input.showInList, false, input.visibilityRules ? JSON.stringify(input.visibilityRules) : null, input.validations ? JSON.stringify(input.validations) : null, input.calculation || null, slug]
    );
    res.status(201).json({ field: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

eventRoutes.put("/form-fields/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const input = z.object({
      fieldKey: z.string().min(1),
      label: z.string().min(1),
      fieldType: z.enum(["text", "email", "phone", "number", "select", "textarea", "checkbox", "hidden", "calculated"]),
      required: z.boolean().default(false),
      options: z.array(z.string().min(1)).default([]),
      sortOrder: z.coerce.number().int().default(0),
      active: z.boolean().default(true),
      showInList: z.boolean().default(false),
      visibilityRules: z.any().nullable().optional(),
      validations: z.any().nullable().optional(),
      calculation: z.string().nullable().optional()
    }).parse(req.body);

    const existingResult = await query("SELECT is_system FROM registration_form_fields WHERE id = $1 AND event_slug = $2", [req.params.id, slug]);
    if (!existingResult.rows[0]) {
      return res.status(404).json({ error: "not_found", message: "Form field not found." });
    }
    
    const result = await query(
      `UPDATE registration_form_fields
          SET field_key = CASE WHEN is_system THEN field_key ELSE $3 END,
              field_type = CASE WHEN is_system THEN field_type ELSE $5 END,
              label = $4,
              required = $6,
              options = $7,
              sort_order = $8,
              active = $9,
              show_in_list = $10,
              visibility_rules = $11,
              validations = $12,
              calculation = $13,
              updated_at = now()
        WHERE id = $1 AND event_slug = $2
        RETURNING id, field_key AS "fieldKey", label, field_type AS "fieldType", required, options, sort_order AS "sortOrder", active, show_in_list AS "showInList", is_system AS "isSystem", visibility_rules AS "visibilityRules", validations, calculation`,
      [req.params.id, slug, input.fieldKey, input.label, input.fieldType, input.required, JSON.stringify(input.options), input.sortOrder, input.active, input.showInList, input.visibilityRules ? JSON.stringify(input.visibilityRules) : null, input.validations ? JSON.stringify(input.validations) : null, input.calculation || null]
    );
    return res.json({ field: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

eventRoutes.delete("/form-fields/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const check = await query("SELECT is_system FROM registration_form_fields WHERE id = $1 AND event_slug = $2", [req.params.id, slug]);
    if (!check.rows[0]) {
      return res.status(404).json({ error: "not_found", message: "Form field not found." });
    }
    if (check.rows[0].is_system) {
      return res.status(400).json({ error: "system_field", message: "System fields cannot be deleted." });
    }
    await query("DELETE FROM registration_form_fields WHERE id = $1 AND event_slug = $2", [req.params.id, slug]);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

// IMPORTS per event
eventRoutes.post("/imports/preview", requireAuth, requireAdmin, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "missing_file", message: "Upload an .xlsx file." });
  }
  const rows = parseExcel(req.file.buffer);
  const validRows = rows.filter((row) => row.errors.length === 0);
  res.json({
    totalRows: rows.length,
    acceptedRows: validRows.length,
    rejectedRows: rows.length - validRows.length,
    rows
  });
});

eventRoutes.post("/imports/commit", requireAuth, requireAdmin, upload.single("file"), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: "missing_file", message: "Upload an .xlsx file." });
  }

  try {
    const { slug } = req.params;
    const rows = parseExcel(req.file.buffer);
    const validRows = rows.filter((row) => row.errors.length === 0 && row.data);
    const generatedCredentials = []; // To store email-password pairs for export

    const result = await withTransaction(async (client) => {
      const batch = await client.query(
        `INSERT INTO import_batches (filename, total_rows, accepted_rows, rejected_rows, created_by, event_slug)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [req.file?.originalname ?? "import.xlsx", rows.length, validRows.length, rows.length - validRows.length, req.user?.id, slug]
      );

      for (const row of validRows) {
        const data = row.data;
        
        // Ensure user account exists
        let userId = null;
        const userCheck = await client.query("SELECT id FROM users WHERE email = $1", [data.email]);
        
        if (userCheck.rows[0]) {
          userId = userCheck.rows[0].id;
        } else {
          // Generate an 8 character random password
          const plainPassword = Math.random().toString(36).slice(-8);
          const hash = await bcrypt.hash(plainPassword, 10);
          
          const userInsert = await client.query(
            `INSERT INTO users (name, email, password_hash, role)
             VALUES ($1, $2, $3, 'participant')
             RETURNING id`,
            [data.name, data.email, hash]
          );
          userId = userInsert.rows[0].id;
          generatedCredentials.push({ email: data.email, name: data.name, password: plainPassword });
        }

        await client.query(
          `INSERT INTO attendees (external_ref, name, email, phone, college, department, metadata, event_slug, user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (email, event_slug) DO UPDATE
           SET name = EXCLUDED.name,
               phone = EXCLUDED.phone,
               college = EXCLUDED.college,
               department = EXCLUDED.department,
               user_id = EXCLUDED.user_id,
               updated_at = now()`,
          [data.externalRef, data.name, data.email, data.phone, data.college, data.department, { importBatchId: batch.rows[0].id }, slug, userId]
        );
      }

      return batch.rows[0];
    });

    res.status(201).json({ batch: result, preview: rows, credentials: generatedCredentials });
  } catch (error) {
    next(error);
  }
});

// QR CODES per event
eventRoutes.post("/qr/batches", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const input = z.object({ name: z.string().min(1).default(`QR batch ${new Date().toISOString()}`) }).parse(req.body);

    const batch = await withTransaction(async (client) => {
      const batchResult = await client.query(
        "INSERT INTO qr_batches (name, created_by, event_slug) VALUES ($1, $2, $3) RETURNING *",
        [input.name, req.user?.id, slug]
      );

      const attendees = await client.query(
        `SELECT id, name, email
           FROM attendees
          WHERE event_slug = $1 AND id NOT IN (SELECT attendee_id FROM qr_codes WHERE event_slug = $1)
            AND metadata->>'verificationStatus' = 'verified'`,
        [slug]
      );

      for (const attendee of attendees.rows) {
        const encrypted = encryptQrPayload({
          attendeeId: attendee.id,
          name: attendee.name,
          email: attendee.email,
          issuedAt: new Date().toISOString(),
          batchId: batchResult.rows[0].id
        });
        await client.query(
          `INSERT INTO qr_codes (attendee_id, batch_id, encrypted_payload, payload_hash, key_version, event_slug)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [attendee.id, batchResult.rows[0].id, encrypted.encryptedPayload, encrypted.payloadHash, encrypted.keyVersion, slug]
        );
      }

      return { ...batchResult.rows[0], generatedCount: attendees.rowCount };
    });

    res.status(201).json({ batch });
  } catch (error) {
    next(error);
  }
});

eventRoutes.post("/qr/send", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const input = z.object({
      mode: z.enum(["unsent", "failed"]).default("unsent"),
      batchId: z.string().uuid().optional()
    }).parse(req.body);

    const qrResult = await query(
      `SELECT q.*, a.name, a.email, a.metadata
         FROM qr_codes q
         JOIN attendees a ON a.id = q.attendee_id AND a.event_slug = q.event_slug
        WHERE q.event_slug = $1 AND ($2::uuid IS NULL OR q.batch_id = $2)
          AND a.metadata->>'verificationStatus' = 'verified'
          AND (
            ($3 = 'unsent' AND q.sent_at IS NULL)
            OR
            ($3 = 'failed' AND EXISTS (
              SELECT 1 FROM email_send_attempts e
               WHERE e.qr_code_id = q.id AND e.status = 'failed' AND e.event_slug = $1
            ))
          )
        LIMIT 500`,
      [slug, input.batchId ?? null, input.mode]
    );

    const settingsResult = await query("SELECT setting_key, setting_value FROM system_settings WHERE event_slug = $1 AND setting_key IN ('email_subject_template', 'email_body_template')", [slug]);
    const settings = settingsResult.rows.reduce((acc, row) => ({ ...acc, [row.setting_key]: row.setting_value }), {});

    const results = [];
    for (const row of qrResult.rows) {
      try {
        const qrDataUrl = await QRCode.toDataURL(row.encrypted_payload);
        const variables = { ...row.data, name: row.name };
        const info = await sendQrEmail({
          to: row.email,
          qrDataUrl,
          subjectTemplate: settings.email_subject_template,
          bodyTemplate: settings.email_body_template,
          variables
        });
        await query(
          `INSERT INTO email_send_attempts (qr_code_id, batch_id, recipient_email, status, provider_message_id, event_slug)
           VALUES ($1, $2, $3, 'sent', $4, $5)`,
          [row.id, row.batch_id, row.email, info.messageId, slug]
        );
        await query("UPDATE qr_codes SET sent_at = now() WHERE id = $1 AND event_slug = $2", [row.id, slug]);
        results.push({ qrCodeId: row.id, email: row.email, status: "sent" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown email error.";
        await query(
          `INSERT INTO email_send_attempts (qr_code_id, batch_id, recipient_email, status, error_message, event_slug)
           VALUES ($1, $2, $3, 'failed', $4, $5)`,
          [row.id, row.batch_id, row.email, message, slug]
        );
        results.push({ qrCodeId: row.id, email: row.email, status: "failed", error: message });
      }
    }

    res.json({ attempted: results.length, results });
  } catch (error) {
    next(error);
  }
});

eventRoutes.get("/qr/export.csv", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const result = await query(
      `SELECT a.name, a.email, q.encrypted_payload, q.payload_hash
         FROM qr_codes q
         JOIN attendees a ON a.id = q.attendee_id AND a.event_slug = q.event_slug
        WHERE q.event_slug = $1 AND q.sent_at IS NULL
        ORDER BY a.name`,
      [slug]
    );
    const lines = ["name,email,encrypted_payload,payload_hash"];
    for (const row of result.rows) {
      lines.push([row.name, row.email, row.encrypted_payload, row.payload_hash].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","));
    }
    res.header("content-type", "text/csv");
    res.attachment(`qr-export-${slug}.csv`);
    res.send(lines.join("\n"));
  } catch (error) {
    next(error);
  }
});

// SCANS per event
eventRoutes.post("/scans/sync", requireAuth, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const scans = z.array(z.object({
      localScanId: z.string().min(1),
      encryptedPayload: z.string().min(1),
      payloadHash: z.string().min(1),
      station: z.enum(["entry", "food", "kit", "custom"]),
      ruleId: z.string().uuid().optional(),
      scannedAt: z.string().datetime(),
      offlineCreated: z.boolean(),
      deviceId: z.string().min(1)
    })).parse(req.body.scans);

    const results = await withTransaction(async (client) => {
      const synced = [];

      for (const scan of scans) {
        if (req.user?.role === "volunteer") {
          const permission = await client.query(
            `SELECT 1
               FROM volunteer_keys
              WHERE user_id = $1
                AND revoked_at IS NULL
                AND event_slug = $3
                AND $2::station_type = ANY(station_permissions)
              LIMIT 1`,
            [req.user.id, scan.station, slug]
          );
          if (!permission.rows[0]) {
            synced.push({ localScanId: scan.localScanId, status: "denied", reason: "Volunteer is not permitted for this station." });
            continue;
          }
        }

        const previous = await client.query("SELECT * FROM scan_events WHERE local_scan_id = $1 AND event_slug = $2", [scan.localScanId, slug]);
        if (previous.rows[0]) {
          synced.push({ localScanId: scan.localScanId, status: previous.rows[0].status, reason: "Already synced." });
          continue;
        }

        if (hashPayload(scan.encryptedPayload) !== scan.payloadHash) {
          synced.push({ localScanId: scan.localScanId, status: "denied", reason: "QR hash mismatch." });
          continue;
        }

        const qr = await client.query(
          `SELECT q.*, a.metadata->>'verificationStatus' as verification_status 
             FROM qr_codes q
             JOIN attendees a ON a.id = q.attendee_id AND a.event_slug = q.event_slug
            WHERE q.payload_hash = $1 AND q.event_slug = $2`,
          [scan.payloadHash, slug]
        );
        if (!qr.rows[0]) {
          synced.push({ localScanId: scan.localScanId, status: "denied", reason: "Unknown QR code." });
          continue;
        }
        if (qr.rows[0].verification_status !== "verified") {
          synced.push({ localScanId: scan.localScanId, status: "denied", reason: "Attendee registration is not verified." });
          continue;
        }

        if (scan.station === "kit") {
          const limitRes = await client.query("SELECT setting_value FROM system_settings WHERE event_slug = $1 AND setting_key = 'kit_limit'", [slug]);
          if (limitRes.rows[0]) {
            const limit = parseInt(limitRes.rows[0].setting_value, 10);
            if (!isNaN(limit)) {
              const countRes = await client.query("SELECT count(*) FROM scan_events WHERE station = 'kit' AND status = 'accepted' AND event_slug = $1", [slug]);
              const count = parseInt(countRes.rows[0].count, 10);
              if (count >= limit) {
                synced.push({ localScanId: scan.localScanId, status: "denied", reason: "Kit inventory exhausted." });
                continue;
              }
            }
          }
        }

        const rule = await resolveActiveRule(client, scan.station, scan.ruleId, slug);
        const decision = evaluateRule(rule, scan.station);
        let status = decision.allowed ? "accepted" : "denied";
        let reason = decision.reason;

        try {
          await client.query(
            `INSERT INTO scan_events
              (local_scan_id, qr_payload_hash, attendee_id, volunteer_id, rule_id, station, status, reason, scanned_at, offline_created, event_slug)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              scan.localScanId,
              scan.payloadHash,
              qr.rows[0].attendee_id,
              req.user?.id,
              rule?.id ?? null,
              scan.station,
              status,
              reason,
              scan.scannedAt,
              scan.offlineCreated,
              slug
            ]
          );
        } catch (error) {
          status = "duplicate";
          reason = "This QR has already been accepted for the same station/rule.";
          await client.query(
            `INSERT INTO scan_events
              (local_scan_id, qr_payload_hash, attendee_id, volunteer_id, rule_id, station, status, reason, scanned_at, offline_created, event_slug)
             VALUES ($1, $2, $3, $4, $5, $6, 'duplicate', $7, $8, $9, $10)
             ON CONFLICT (local_scan_id, event_slug) DO NOTHING`,
            [
              scan.localScanId,
              scan.payloadHash,
              qr.rows[0].attendee_id,
              req.user?.id,
              rule?.id ?? null,
              scan.station,
              reason,
              scan.scannedAt,
              scan.offlineCreated,
              slug
            ]
          );
        }

        await client.query(
          `INSERT INTO offline_sync_records
             (volunteer_id, device_id, local_scan_id, payload_hash, result_status, result_reason, event_slug)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (local_scan_id, event_slug) DO NOTHING`,
          [req.user?.id, scan.deviceId, scan.localScanId, scan.payloadHash, status, reason, slug]
        );
        synced.push({ localScanId: scan.localScanId, status, reason });
      }

      return synced;
    });

    res.json({ results });
  } catch (error) {
    next(error);
  }
});

eventRoutes.get("/scans", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const result = await query(
      `SELECT 
         s.id, s.station, s.status, s.reason, s.scanned_at,
         a.name as attendee_name, a.email as attendee_email,
         u.name as volunteer_name,
         r.name as rule_name
       FROM scan_events s
       JOIN attendees a ON a.id = s.attendee_id AND a.event_slug = s.event_slug
       LEFT JOIN users u ON u.id = s.volunteer_id AND u.event_slug = s.event_slug
       LEFT JOIN scan_rules r ON r.id = s.rule_id AND r.event_slug = s.event_slug
       WHERE s.event_slug = $1
       ORDER BY s.scanned_at DESC
       LIMIT 100`,
      [slug]
    );
    res.json({ scans: result.rows });
  } catch (error) {
    next(error);
  }
});

// RULES per event
eventRoutes.get("/rules", requireAuth, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const result = await query("SELECT * FROM scan_rules WHERE event_slug = $1 ORDER BY created_at DESC", [slug]);
    res.json({ rules: result.rows });
  } catch (error) {
    next(error);
  }
});

eventRoutes.post("/rules", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const input = z.object({
      name: z.string().min(1),
      station: z.enum(["entry", "food", "kit", "custom"]),
      startsAt: z.string().datetime().optional(),
      endsAt: z.string().datetime().optional(),
      eligibility: z.record(z.unknown()).default({}),
      active: z.boolean().default(true)
    }).parse(req.body);

    const result = await query(
      `INSERT INTO scan_rules (name, station, starts_at, ends_at, eligibility, active, event_slug)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [input.name, input.station, input.startsAt ?? null, input.endsAt ?? null, input.eligibility, input.active, slug]
    );

    res.status(201).json({ rule: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

eventRoutes.put("/rules/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const input = z.object({
      name: z.string().min(1),
      station: z.enum(["entry", "food", "kit", "custom"]),
      startsAt: z.string().datetime().optional(),
      endsAt: z.string().datetime().optional(),
      eligibility: z.record(z.unknown()).default({}),
      active: z.boolean().default(true)
    }).parse(req.body);

    const result = await query(
      `UPDATE scan_rules
          SET name = $3,
              station = $4,
              starts_at = $5,
              ends_at = $6,
              eligibility = $7,
              active = $8
        WHERE id = $1 AND event_slug = $2
        RETURNING *`,
      [req.params.id, slug, input.name, input.station, input.startsAt ?? null, input.endsAt ?? null, input.eligibility, input.active]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "not_found", message: "Scan rule not found." });
    }

    res.json({ rule: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// STATS per event
eventRoutes.get("/stats/dashboard", requireAuth, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const [attendees, qr, scans, stations, timeline, chartableFields, attendeeMetadata] = await Promise.all([
      query("SELECT count(*)::int AS total FROM attendees WHERE event_slug = $1", [slug]),
      query(
        `SELECT
          count(*)::int AS total,
          count(sent_at)::int AS sent,
          count(*) FILTER (WHERE sent_at IS NULL)::int AS unsent
         FROM qr_codes WHERE event_slug = $1`,
        [slug]
      ),
      query(
        `SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE status = 'accepted')::int AS accepted,
          count(*) FILTER (WHERE status = 'duplicate')::int AS duplicate,
          count(*) FILTER (WHERE status = 'denied')::int AS denied,
          count(*) FILTER (WHERE status = 'pending')::int AS pending,
          count(*) FILTER (WHERE station = 'food' AND status = 'accepted')::int AS food,
          count(*) FILTER (WHERE station = 'kit' AND status = 'accepted')::int AS kit
         FROM scan_events WHERE event_slug = $1`,
        [slug]
      ),
      query(
        `SELECT station, status, count(*)::int AS count
           FROM scan_events
          WHERE event_slug = $1
          GROUP BY station, status
          ORDER BY station, status`,
        [slug]
      ),
      query(
        `SELECT to_char(date_trunc('hour', scanned_at), 'HH24:MI') AS label,
                count(*)::int AS count
           FROM scan_events
          WHERE event_slug = $1 AND scanned_at >= now() - interval '12 hours'
          GROUP BY date_trunc('hour', scanned_at)
          ORDER BY date_trunc('hour', scanned_at)`,
        [slug]
      ),
      query(
        `SELECT field_key AS "fieldKey",
                label,
                field_type AS "fieldType",
                options
           FROM registration_form_fields
          WHERE event_slug = $1 AND active = TRUE
            AND field_type IN ('select', 'checkbox')
          ORDER BY sort_order ASC, label ASC`,
        [slug]
      ),
      query(
        `SELECT metadata
           FROM attendees
          WHERE event_slug = $1 AND metadata ? 'customFields'`,
        [slug]
      )
    ]);

    const customFieldBreakdowns = chartableFields.rows.map((field) => {
      const counts = new Map();
      const options = Array.isArray(field.options) ? field.options : [];
      for (const option of options) {
        counts.set(String(option), 0);
      }
      if (field.fieldType === "checkbox") {
        counts.set("Yes", 0);
        counts.set("No", 0);
      }

      for (const attendee of attendeeMetadata.rows) {
        const customFields = attendee.metadata?.customFields ?? {};
        const rawValue = customFields[field.fieldKey];
        if (rawValue === undefined || rawValue === null || rawValue === "") {
          continue;
        }
        const label = field.fieldType === "checkbox"
          ? (rawValue === true || rawValue === "true" ? "Yes" : "No")
          : String(rawValue);
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }

      return {
        fieldKey: field.fieldKey,
        label: field.label,
        fieldType: field.fieldType,
        values: Array.from(counts.entries())
          .map(([label, count]) => ({ label, count }))
          .filter((item) => item.count > 0 || options.includes(item.label) || field.fieldType === "checkbox")
      };
    });

    const stationTotals = stations.rows.reduce((acc, row) => {
      acc[row.station] = (acc[row.station] ?? 0) + Number(row.count);
      return acc;
    }, {});

    res.json({
      attendees: attendees.rows[0],
      qr: qr.rows[0],
      scans: scans.rows[0],
      stations: stations.rows,
      stationTotals: Object.entries(stationTotals).map(([station, count]) => ({ station, count })),
      timeline: timeline.rows,
      customFieldBreakdowns
    });
  } catch (error) {
    next(error);
  }
});
