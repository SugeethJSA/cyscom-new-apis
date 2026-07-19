import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import swaggerUi from "swagger-ui-express";
import fs from "fs";
import { runMigrations, query } from "./db.js";
import { requireAuth, requireAdmin, requireSuperAdmin, requireHubAccess, signUser } from "./middleware/auth.js";
import { recruitmentsRoutes } from "./routes/recruitmentsRoutes.js";
import { participantAuthRoutes } from "./routes/participantAuthRoutes.js";
import { blogRoutes } from "./routes/blogRoutes.js";
import { writeupRoutes } from "./routes/writeupRoutes.js";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.static(path.join(__dirname, "public"), { index: false }));

try {
  const swaggerDocument = JSON.parse(fs.readFileSync(path.join(__dirname, "swagger-output.json"), "utf8"));
  app.use("/", swaggerUi.serve);
  app.get("/", swaggerUi.setup(swaggerDocument, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: "CYSCOM API Docs"
  }));
} catch (err) {
  console.log("Swagger docs not generated. Run 'npm run swagger' first.");
  app.get("/", (req, res) => res.send("CySCOM API Server. Swagger docs pending."));
}

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

// Global events catalog endpoints
app.get("/api/events", async (req, res, next) => {
  try {
    const { public: isPublicOnly } = req.query;
    let result;
    if (isPublicOnly === 'true') {
      result = await query("SELECT * FROM events WHERE is_public = true ORDER BY start_date DESC, created_at DESC");
    } else {
      result = await query("SELECT * FROM events ORDER BY start_date DESC, created_at DESC");
    }
    res.json({ events: result.rows });
  } catch (error) {
    next(error);
  }
});

app.use("/api/auth/participant", participantAuthRoutes);
app.use("/api/recruitments", recruitmentsRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/writeups", writeupRoutes);

// In-memory mock database cache with seeder defaults
let projectsDb = [
  {
    name: "cyscom-new-site",
    desc: "The premium visual experience that serves as the official Cyscom VIT Chennai web portal, featuring high-fidelity animations, interactive widgets, and custom loaders.",
    tech: ["React", "GSAP", "Tailwind CSS", "Framer Motion"],
    stars: 14,
    forks: 5,
    github: "https://github.com/SugeethJSA/cyscom-new-site"
  },
  {
    name: "new-blog",
    desc: "A state-of-the-art cyber Chronicles blog portal built for the community to share technical CTF walkthroughs, infosec articles, and challenge writeups.",
    tech: ["React 19", "Tailwind CSS", "React Router v7", "GSAP"],
    stars: 9,
    forks: 3,
    github: "https://github.com/SugeethJSA/cyscom-new-blog"
  }
];

let adminUsersDb = [
  {
    username: "admin",
    passwordHash: "0eb6186d3ac869f24f085c46aee1614cfeccab8008f1294b908a85bdbaefd602", // sha256("cyscom2026")
    role: ["superadmin"],
    permissions: ["manage_users", "manage_projects", "manage_certificates", "manage_leaderboard", "manage_hall_of_fame", "manage_legacy", "manage_events", "manage_intake"],
    departments: ["dev", "con", "tec", "des", "soc", "eve"]
  }
];

let templatesDb = {
  "VALO": {
    templateId: "VALO",
    eventTitle: "ValoOWASP 2025",
    description: "This is to certify that {NAME} has successfully completed their duty as a {ROLE} for the event ValoOWASP 2025.",
    date: "February 22, 2025",
    theme: "cyberpunk",
    signatories: [
      { name: "Dr. Jane Doe", title: "Faculty Coordinator" },
      { name: "Sugeeth JSA", title: "Cabinet Head" }
    ]
  }
};

let certificatesDb = {
  "VIT-OWASP-001": {
    name: "Vatz",
    role: "Winner",
    templateId: "VALO",
    signature: "6320bf21a829c871b54b7fdadfd6ad98b5806db4b8a2594ce731545f243b9f1d",
    details: [
      { id: "VALO-WIN-01", type: "Certificate of Merit", issueDate: "February 22, 2025" }
    ]
  }
};

// Full database container mock for leaderboard acts
let leaderboardDb = {};

// UNIFIED LOGIN ENDPOINT
app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "missing_fields", message: "Username/Email and Credentials Key are required." });
    }

    // 1. Check in-memory global admin database
    const matchedGlobal = adminUsersDb.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
    if (matchedGlobal) {
      // The current admin portal - global admin passwords are SHA-256 hashed client-side.
      // To support unified logins securely, we accept both client-side hashed or plaintext keys.
      const crypto = await import("crypto");
      const enteredHash = crypto.createHash("sha256").update(password).digest("hex");
      if (enteredHash === matchedGlobal.passwordHash || password === matchedGlobal.passwordHash) {
        const payload = {
          username: matchedGlobal.username,
          role: matchedGlobal.role, // array of roles, e.g., ['superadmin'] or ['admin']
          user_groups: ["Superadmins"],
          merged_permissions: {
            hubs: { members: ["*"], opensrc: ["*"] },
            events: { "*": ["*"] }
          },
          global: true
        };
        return res.json({
          token: signUser(payload),
          user: payload
        });
      }
    }

    // 2. Check event-scoped users in Postgres DB (or mock fallback)
    try {
      const dbResult = await query("SELECT * FROM users WHERE email = $1 AND active = TRUE", [username.trim().toLowerCase()]);
      const user = dbResult.rows[0];
      if (user) {
        if (user.is_legacy) {
          return res.status(403).json({ error: "legacy_account", message: "This account has been retired to Legacy status and can no longer log in." });
        }
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (passwordMatch) {
          // Fetch groups and merge permissions
          const groupsResult = await query(
            `SELECT g.id, g.name, g.permissions 
             FROM user_groups g 
             JOIN user_group_members ugm ON g.id = ugm.group_id 
             WHERE ugm.user_id = $1`, 
            [user.id]
          );
          
          let merged_permissions = { hubs: { members: [], opensrc: [] }, events: {} };
          const user_groups = [];

          groupsResult.rows.forEach(g => {
            user_groups.push(g.name);
            const p = g.permissions || {};
            
            // Merge Hubs
            if (p.hubs?.members) merged_permissions.hubs.members.push(...p.hubs.members);
            if (p.hubs?.opensrc) merged_permissions.hubs.opensrc.push(...p.hubs.opensrc);
            
            // Merge Events
            if (p.events) {
              for (const [slug, caps] of Object.entries(p.events)) {
                if (!merged_permissions.events[slug]) merged_permissions.events[slug] = [];
                if (Array.isArray(caps)) merged_permissions.events[slug].push(...caps);
              }
            }
          });

          // Deduplicate arrays
          merged_permissions.hubs.members = [...new Set(merged_permissions.hubs.members)];
          merged_permissions.hubs.opensrc = [...new Set(merged_permissions.hubs.opensrc)];
          for (const slug in merged_permissions.events) {
            merged_permissions.events[slug] = [...new Set(merged_permissions.events[slug])];
          }

          const payload = {
            id: user.id,
            username: user.email,
            email: user.email,
            name: user.name,
            role: [user.role],
            user_groups,
            merged_permissions,
            global: false
          };
          
          // SugeethJSA review: We may need to look at the QR code auth mechanism.
          let qrDecryptKey = "Q1lTQ09NX09XQVNQX1NFQ1JFVF9LRVlfMjAyNg==";
          try {
            const { exportQrDecryptKey } = await import("./services/crypto.js");
            qrDecryptKey = exportQrDecryptKey();
          } catch (e) {
            // keep default
          }

          return res.json({
            token: signUser(payload),
            user: payload,
            qrDecryptKey
          });
        }
      }
    } catch (dbErr) {
      console.warn("DB check failed during login, falling back to mocks:", dbErr.message);
    }

    // 3. Mock Fallback accounts for offline/demo logins
    const cleanUser = username.trim().toLowerCase();
    if ((cleanUser === "volunteer" || cleanUser === "vol@cyscomvit.com") && password === "cyscom2026") {
      const payload = {
        username: "volunteer",
        email: "vol@cyscomvit.com",
        name: "Mock Volunteer",
        role: ["volunteer"],
        departments: ["eve"],
        event_slug: "amaze-2026",
        permissions: ["can_scan", "can_view_attendees"],
        global: false
      };
      return res.json({
        token: signUser(payload),
        user: payload,
        qrDecryptKey: "Q1lTQ09NX09XQVNQX1NFQ1JFVF9LRVlfMjAyNg=="
      });
    }

    return res.status(401).json({ error: "invalid_credentials", message: "Invalid credentials." });
  } catch (error) {
    next(error);
  }
});

// Update current user's password
app.put("/api/auth/me/password", requireAuth, async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: "invalid_password", message: "Password must be at least 8 characters long." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const result = await query(
      "UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2 RETURNING id",
      [passwordHash, req.user.username]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "not_found", message: "User not found in database." });
    }
    
    return res.json({ success: true, message: "Password updated successfully." });
  } catch (error) {
    next(error);
  }
});

// Root Health Endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "online",
    timestamp: new Date().toISOString(),
    postgres_connected: !!pool
  });
});

// LEADERBOARD ENDPOINTS
app.get("/api/leaderboard", async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT l.act_num, l.points as rating, l.contributions, u.name as name
      FROM leaderboard l
      JOIN users u ON l.user_id = u.id
      ORDER BY l.act_num ASC, l.points DESC
    `);
    
    const db = {};
    rows.forEach(r => {
      const actKey = `leaderboard-act${r.act_num}`;
      if (!db[actKey]) db[actKey] = {};
      const count = Object.keys(db[actKey]).length;
      db[actKey][count] = {
        Name: r.name,
        Rating: r.rating,
        Contributions: r.contributions,
        Image: "unranked"
      };
    });
    res.json(db);
  } catch (err) {
    next(err);
  }
});

app.put("/api/leaderboard-act/:actNum", async (req, res, next) => {
  try {
    const { actNum } = req.params;
    const rawMembers = req.body;
    
    const members = Object.values(rawMembers);
    for (const member of members) {
      const name = member.Name || member.name;
      const userRes = await query('SELECT id FROM users WHERE name = $1 LIMIT 1', [name]);
      if (userRes.rows.length > 0) {
        const userId = userRes.rows[0].id;
        await query(`
          INSERT INTO leaderboard (user_id, act_num, points, rating, contributions)
          VALUES ($1, $2, $3, $3, $4)
          ON CONFLICT (user_id, act_num) DO UPDATE SET
            points = EXCLUDED.points,
            rating = EXCLUDED.rating,
            contributions = EXCLUDED.contributions
        `, [
          userId, 
          actNum, 
          Number(member.Rating || member.rating || 0), 
          member.Contributions || member.contributions || ''
        ]);
      }
    }
    

    res.json({ success: true, act: actNum });
  } catch (err) {
    next(err);
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("API Error:", err);
  res.status(err.status || 500).json({
    error: err.name || "InternalServerError",
    message: err.message || "An unexpected error occurred."
  });
});

// Start Express Listener
app.listen(PORT, async () => {
  console.log(`===================================================`);
  console.log(` Cyscom Open Source API Gateway active on Port ${PORT}`);
  console.log(` Access endpoints at http://localhost:${PORT}/api/...`);
  console.log(`===================================================`);
  await runMigrations();
});
