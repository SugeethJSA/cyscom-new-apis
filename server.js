import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { runMigrations, query } from "./db.js";
import { eventRoutes } from "./routes/eventRoutes.js";
import { intakeRoutes } from "./routes/intakeRoutes.js";
import { taskRoutes } from "./routes/taskRoutes.js";
import { meetingRoutes } from "./routes/meetingRoutes.js";
import { resourceRoutes } from "./routes/resourceRoutes.js";
import { requireAuth, requireAdmin, requireSuperAdmin, requireHubAccess, signUser } from "./middleware/auth.js";
import { recruitmentsRoutes } from "./routes/recruitmentsRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

// Global events catalog endpoints
app.get("/api/events", async (req, res, next) => {
  try {
    const result = await query("SELECT * FROM events ORDER BY start_date DESC, created_at DESC");
    res.json({ events: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post("/api/events", requireAuth, requireHubAccess('members', 'events'), async (req, res, next) => {
  try {
    const { slug, name, description, banner_url, logo_url, start_date, end_date, status } = req.body;
    if (!slug || !name) {
      return res.status(400).json({ error: "missing_fields", message: "slug and name are required." });
    }
    const result = await query(
      `INSERT INTO events (slug, name, description, banner_url, logo_url, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [slug.toLowerCase().replace(/[^a-z0-9-]/g, ""), name, description || null, banner_url || null, logo_url || null, start_date || null, end_date || null, status || "active"]
    );
    res.status(201).json({ event: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.put("/api/events/:slug", requireAuth, requireHubAccess('members', 'events'), async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { name, description, banner_url, logo_url, start_date, end_date, status } = req.body;
    const result = await query(
      `UPDATE events
          SET name = COALESCE($2, name),
              description = $3,
              banner_url = $4,
              logo_url = $5,
              start_date = $6,
              end_date = $7,
              status = COALESCE($8, status),
              updated_at = now()
        WHERE slug = $1
        RETURNING *`,
      [slug, name, description || null, banner_url || null, logo_url || null, start_date || null, end_date || null, status || null]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: "not_found", message: `Event ${slug} not found.` });
    }
    res.json({ event: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/events/:slug", requireAuth, requireHubAccess('members', 'events'), async (req, res, next) => {
  try {
    const { slug } = req.params;
    const result = await query("DELETE FROM events WHERE slug = $1 RETURNING id", [slug]);
    if (!result.rows[0]) {
      return res.status(404).json({ error: "not_found", message: `Event ${slug} not found.` });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Scope registration desk// Use the external routes
app.use("/api/events/:slug", eventRoutes);

// Intake Routes
app.use("/api/intake", intakeRoutes);

// Task Routes
app.use("/api/tasks", taskRoutes);

// Meeting Routes
app.use("/api/meetings", meetingRoutes);

// Resource Routes
app.use("/api/resources", resourceRoutes);

// Recruitments Public Routes
app.use("/api/recruitments", recruitmentsRoutes);

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

let hallOfFameDb = [
  {
    eventName: "Star Wars Hackathon 2024",
    category: "Hackathons",
    altHeading: "Jedi Quest Coding Challenge",
    winners: [
      { rank: "1st Place 🥇", team: "Dark Side Devs", members: ["Anirudh CV", "Aditya V"] },
      { rank: "2nd Place 🥈", team: "Rebel Coder Alliance", members: ["Pranav Shah", "Sneha Sen"] }
    ],
    jediList: ["Vatz", "Saikiran S"]
  }
];

let legacyDb = [
  {
    name: "Sugeeth JSA",
    post: "Cabinet Head & Lead Developer",
    github: "https://github.com/SugeethJSA",
    linkedin: "https://www.linkedin.com/in/sugeethjsa",
    pic: "/img/logo.png"
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
      // In CySCOM Admin, global admin passwords are SHA-256 hashed client-side.
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

// Helper to push update to remote Firebase database if configured
const syncToFirebase = async (node, data) => {
  const fbUrl = process.env.FIREBASE_DB_URL;
  if (!fbUrl) return;

  try {
    const cleanUrl = fbUrl.replace(/\/$/, "");
    await fetch(`${cleanUrl}/vitcc/owasp/${node}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  } catch (err) {
    console.error(`Firebase API proxy sync failed for ${node}:`, err.message);
  }
};

// Sync memory cache from remote Firebase database on startup if configured
const initFromFirebase = async () => {
  const fbUrl = process.env.FIREBASE_DB_URL;
  if (!fbUrl) {
    console.log("No FIREBASE_DB_URL configured. Using seeded default dataset.");
    return;
  }

  try {
    const cleanUrl = fbUrl.replace(/\/$/, "");
    console.log(`Synchronizing cache from Firebase: ${cleanUrl}/vitcc/owasp.json ...`);
    const res = await fetch(`${cleanUrl}/vitcc/owasp.json`);
    if (res.ok) {
      const data = await res.json();
      if (data) {
        if (data.projects) projectsDb = data.projects;
        if (data.hall_of_fame) hallOfFameDb = data.hall_of_fame;
        if (data.legacy) legacyDb = data.legacy;
        if (data.admin_users) adminUsersDb = data.admin_users;
        if (data.templates) templatesDb = data.templates;
        if (data.certificates) certificatesDb = data.certificates;
        
        // Extract leaderboard acts
        Object.keys(data).forEach(key => {
          if (key.startsWith("leaderboard-act")) {
            leaderboardDb[key] = data[key];
          }
        });
        console.log("Database cache fully synchronized from Firebase!");
      }
    } else {
      console.warn(`Firebase response not OK (${res.status}). Using seeded defaults.`);
    }
  } catch (err) {
    console.error("Failed to sync cache from Firebase on startup:", err.message);
  }
};

// Root Health Endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "online",
    timestamp: new Date().toISOString(),
    firebase_proxy: !!process.env.FIREBASE_DB_URL
  });
});

// CERTIFICATE TEMPLATES ENDPOINTS
app.get("/api/templates", (req, res) => {
  res.json(templatesDb);
});

app.put("/api/templates", requireAuth, requireHubAccess('opensrc', 'certificates'), async (req, res) => {
  templatesDb = req.body;
  await syncToFirebase("templates", templatesDb);
  res.json({ success: true, templates: templatesDb });
});

// CERTIFICATES REGISTRY ENDPOINTS
app.get("/api/certificates", (req, res) => {
  res.json(certificatesDb);
});

app.put("/api/certificates", requireAuth, requireHubAccess('opensrc', 'certificates'), async (req, res) => {
  certificatesDb = req.body;
  await syncToFirebase("certificates", certificatesDb);
  res.json({ success: true, certificates: certificatesDb });
});

// PROJECTS CRUD
app.get("/api/projects", (req, res) => {
  res.json(projectsDb);
});

app.post("/api/projects", requireAuth, requireHubAccess('opensrc', 'projects'), async (req, res) => {
  const project = req.body;
  if (!project.name) {
    return res.status(400).json({ error: "Missing project name." });
  }
  projectsDb = projectsDb.filter(p => p.name !== project.name);
  projectsDb.push(project);
  await syncToFirebase("projects", projectsDb);
  res.status(201).json(project);
});

app.put("/api/projects", requireAuth, requireHubAccess('opensrc', 'projects'), async (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: "Expected an array of projects." });
  }
  projectsDb = req.body;
  await syncToFirebase("projects", projectsDb);
  res.json({ success: true, projects: projectsDb });
});

app.delete("/api/projects/:name", requireAuth, requireHubAccess('opensrc', 'projects'), async (req, res) => {
  const { name } = req.params;
  projectsDb = projectsDb.filter(p => p.name !== name);
  await syncToFirebase("projects", projectsDb);
  res.json({ success: true, message: `Project ${name} deleted.` });
});

// HALL OF FAME CRUD
app.get("/api/hall-of-fame", (req, res) => {
  res.json(hallOfFameDb);
});

app.post("/api/hall-of-fame", requireAuth, requireHubAccess('opensrc', 'hall_of_fame'), async (req, res) => {
  const event = req.body;
  if (!event.eventName) {
    return res.status(400).json({ error: "Missing event name." });
  }
  hallOfFameDb = hallOfFameDb.filter(e => e.eventName !== event.eventName);
  hallOfFameDb.push(event);
  await syncToFirebase("hall_of_fame", hallOfFameDb);
  res.status(201).json(event);
});

app.put("/api/hall-of-fame", requireAuth, requireHubAccess('opensrc', 'hall_of_fame'), async (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: "Expected an array of events." });
  }
  hallOfFameDb = req.body;
  await syncToFirebase("hall_of_fame", hallOfFameDb);
  res.json({ success: true, hall_of_fame: hallOfFameDb });
});

app.delete("/api/hall-of-fame/:name", requireAuth, requireHubAccess('opensrc', 'hall_of_fame'), async (req, res) => {
  const { name } = req.params;
  hallOfFameDb = hallOfFameDb.filter(e => e.eventName !== name);
  await syncToFirebase("hall_of_fame", hallOfFameDb);
  res.json({ success: true, message: `Event ${name} deleted.` });
});

// LEGACY MEMBERS CRUD
app.get("/api/legacy", (req, res) => {
  res.json(legacyDb);
});

app.post("/api/legacy", requireAuth, requireHubAccess('opensrc', 'legacy'), async (req, res) => {
  const member = req.body;
  if (!member.name) {
    return res.status(400).json({ error: "Missing member name." });
  }
  legacyDb = legacyDb.filter(m => m.name !== member.name);
  legacyDb.push(member);
  await syncToFirebase("legacy", legacyDb);
  res.status(201).json(member);
});

app.put("/api/legacy", requireAuth, requireHubAccess('opensrc', 'legacy'), async (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: "Expected an array of members." });
  }
  legacyDb = req.body;
  await syncToFirebase("legacy", legacyDb);
  res.json({ success: true, legacy: legacyDb });
});

app.delete("/api/legacy/:name", requireAuth, requireHubAccess('opensrc', 'legacy'), async (req, res) => {
  const { name } = req.params;
  legacyDb = legacyDb.filter(m => m.name !== name);
  await syncToFirebase("legacy", legacyDb);
  res.json({ success: true, message: `Legacy member ${name} deleted.` });
});

// USER GROUPS CRUD
app.get("/api/user-groups", requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const result = await query("SELECT id, name, description, permissions FROM user_groups ORDER BY name ASC");
    res.json({ groups: result.rows });
  } catch (err) {
    next(err);
  }
});

app.post("/api/user-groups", requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { name, description, permissions } = req.body;
    if (!name) return res.status(400).json({ error: "missing_fields", message: "Name is required." });
    
    const result = await query(
      `INSERT INTO user_groups (name, description, permissions) VALUES ($1, $2, $3) RETURNING id, name, description, permissions`,
      [name, description, permissions || {}]
    );
    res.status(201).json({ group: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

app.put("/api/user-groups/:id", requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, permissions } = req.body;
    const result = await query(
      `UPDATE user_groups SET name = $1, description = $2, permissions = $3 WHERE id = $4 RETURNING id, name, description, permissions`,
      [name, description, permissions || {}, id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "not_found", message: "Group not found." });
    res.json({ success: true, group: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/user-groups/:id", requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    await query(`DELETE FROM user_groups WHERE id = $1`, [id]);
    res.json({ success: true, message: `User group deleted.` });
  } catch (err) {
    next(err);
  }
});

// USERS LIST (For Dropdowns)
app.get("/api/users/list", requireAuth, async (req, res, next) => {
  try {
    const result = await query("SELECT id, name, role FROM users WHERE active = TRUE ORDER BY name ASC");
    res.json({ users: result.rows });
  } catch (err) {
    next(err);
  }
});

// GLOBAL USERS CRUD (Members Dashboard)
app.get("/api/users/manage", requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT u.id, u.name, u.email, u.role, u.active, u.created_at, u.points, 
      COALESCE(json_agg(ugm.group_id) FILTER (WHERE ugm.group_id IS NOT NULL), '[]') as user_groups
      FROM users u
      LEFT JOIN user_group_members ugm ON u.id = ugm.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    res.json({ users: result.rows });
  } catch (err) {
    next(err);
  }
});

app.post("/api/users/manage", requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { name, email, password, role, user_groups } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "missing_fields", message: "Name, email, and password required." });
    
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (name, email, password_hash, role, active)
       VALUES ($1, $2, $3, $4, TRUE) RETURNING id, name, email, role`,
      [name, email, hash, role || 'volunteer']
    );
    
    const userId = result.rows[0].id;
    if (Array.isArray(user_groups) && user_groups.length > 0) {
      for (const groupId of user_groups) {
        await query(`INSERT INTO user_group_members (user_id, group_id) VALUES ($1, $2)`, [userId, groupId]);
      }
    }
    
    res.status(201).json({ user: { ...result.rows[0], user_groups: user_groups || [] } });
  } catch (err) {
    next(err);
  }
});

app.put("/api/users/manage/:id", requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, role, user_groups, password, active } = req.body;
    
    let queryStr = `UPDATE users SET name = $1, email = $2, role = $3`;
    const params = [name, email, role];
    let paramIdx = 4;

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      queryStr += `, password_hash = $${paramIdx++}`;
      params.push(hash);
    }
    
    if (active !== undefined) {
      queryStr += `, active = $${paramIdx++}`;
      params.push(active);
    }

    queryStr += ` WHERE id = $${paramIdx} RETURNING id, name, email, role, active`;
    params.push(id);

    const result = await query(queryStr, params);
    if (!result.rows[0]) return res.status(404).json({ error: "not_found", message: "User not found." });
    
    if (Array.isArray(user_groups)) {
      await query(`DELETE FROM user_group_members WHERE user_id = $1`, [id]);
      for (const groupId of user_groups) {
        await query(`INSERT INTO user_group_members (user_id, group_id) VALUES ($1, $2)`, [id, groupId]);
      }
    }
    
    res.json({ success: true, user: { ...result.rows[0], user_groups: user_groups || [] } });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/users/manage/:id", requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    await query(`DELETE FROM users WHERE id = $1`, [id]);
    res.json({ success: true, message: `User deleted.` });
  } catch (err) {
    next(err);
  }
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
    
    // Proxy to Firebase if configured
    const fbUrl = process.env.FIREBASE_DB_URL;
    if (fbUrl) {
      try {
        const cleanUrl = fbUrl.replace(/\/$/, "");
        await fetch(`${cleanUrl}/vitcc/owasp/leaderboard-act${actNum}.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rawMembers)
        });
      } catch (err) {
        console.error(`Firebase Leaderboard sync failed for Act ${actNum}:`, err.message);
      }
    }
    
    res.json({ success: true, act: actNum });
  } catch (err) {
    next(err);
  }
});

// Start Express Listener
app.listen(PORT, async () => {
  console.log(`===================================================`);
  console.log(` Cyscom Open Source API Gateway active on Port ${PORT}`);
  console.log(` Access endpoints at http://localhost:${PORT}/api/...`);
  console.log(`===================================================`);
  await runMigrations();
  await initFromFirebase();
});
