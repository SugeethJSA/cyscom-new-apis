import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import swaggerUi from "swagger-ui-express";
import fs from "fs";
import { runMigrations, query } from "./db.js";
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

// PROJECTS CRUD
app.get("/api/projects", (req, res) => {
  res.json(projectsDb);
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
