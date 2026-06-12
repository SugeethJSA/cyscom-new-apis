import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

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
    role: "superadmin",
    permissions: ["manage_users", "manage_projects", "manage_certificates", "manage_leaderboard", "manage_hall_of_fame", "manage_legacy"]
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

app.put("/api/templates", async (req, res) => {
  templatesDb = req.body;
  await syncToFirebase("templates", templatesDb);
  res.json({ success: true, templates: templatesDb });
});

// CERTIFICATES REGISTRY ENDPOINTS
app.get("/api/certificates", (req, res) => {
  res.json(certificatesDb);
});

app.put("/api/certificates", async (req, res) => {
  certificatesDb = req.body;
  await syncToFirebase("certificates", certificatesDb);
  res.json({ success: true, certificates: certificatesDb });
});

// PROJECTS CRUD
app.get("/api/projects", (req, res) => {
  res.json(projectsDb);
});

app.post("/api/projects", async (req, res) => {
  const project = req.body;
  if (!project.name) {
    return res.status(400).json({ error: "Missing project name." });
  }
  projectsDb = projectsDb.filter(p => p.name !== project.name);
  projectsDb.push(project);
  await syncToFirebase("projects", projectsDb);
  res.status(201).json(project);
});

app.put("/api/projects", async (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: "Expected an array of projects." });
  }
  projectsDb = req.body;
  await syncToFirebase("projects", projectsDb);
  res.json({ success: true, projects: projectsDb });
});

app.delete("/api/projects/:name", async (req, res) => {
  const { name } = req.params;
  projectsDb = projectsDb.filter(p => p.name !== name);
  await syncToFirebase("projects", projectsDb);
  res.json({ success: true, message: `Project ${name} deleted.` });
});

// HALL OF FAME CRUD
app.get("/api/hall-of-fame", (req, res) => {
  res.json(hallOfFameDb);
});

app.post("/api/hall-of-fame", async (req, res) => {
  const event = req.body;
  if (!event.eventName) {
    return res.status(400).json({ error: "Missing event name." });
  }
  hallOfFameDb = hallOfFameDb.filter(e => e.eventName !== event.eventName);
  hallOfFameDb.push(event);
  await syncToFirebase("hall_of_fame", hallOfFameDb);
  res.status(201).json(event);
});

app.put("/api/hall-of-fame", async (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: "Expected an array of events." });
  }
  hallOfFameDb = req.body;
  await syncToFirebase("hall_of_fame", hallOfFameDb);
  res.json({ success: true, hall_of_fame: hallOfFameDb });
});

app.delete("/api/hall-of-fame/:name", async (req, res) => {
  const { name } = req.params;
  hallOfFameDb = hallOfFameDb.filter(e => e.eventName !== name);
  await syncToFirebase("hall_of_fame", hallOfFameDb);
  res.json({ success: true, message: `Event ${name} deleted.` });
});

// LEGACY MEMBERS CRUD
app.get("/api/legacy", (req, res) => {
  res.json(legacyDb);
});

app.post("/api/legacy", async (req, res) => {
  const member = req.body;
  if (!member.name) {
    return res.status(400).json({ error: "Missing member name." });
  }
  legacyDb = legacyDb.filter(m => m.name !== member.name);
  legacyDb.push(member);
  await syncToFirebase("legacy", legacyDb);
  res.status(201).json(member);
});

app.put("/api/legacy", async (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: "Expected an array of members." });
  }
  legacyDb = req.body;
  await syncToFirebase("legacy", legacyDb);
  res.json({ success: true, legacy: legacyDb });
});

app.delete("/api/legacy/:name", async (req, res) => {
  const { name } = req.params;
  legacyDb = legacyDb.filter(m => m.name !== name);
  await syncToFirebase("legacy", legacyDb);
  res.json({ success: true, message: `Legacy member ${name} deleted.` });
});

// ADMIN USERS CRUD
app.get("/api/users", (req, res) => {
  res.json(adminUsersDb);
});

app.post("/api/users", async (req, res) => {
  const user = req.body;
  if (!user.username) {
    return res.status(400).json({ error: "Missing username." });
  }
  adminUsersDb = adminUsersDb.filter(u => u.username.toLowerCase() !== user.username.toLowerCase());
  adminUsersDb.push(user);
  await syncToFirebase("admin_users", adminUsersDb);
  res.status(201).json(user);
});

app.put("/api/users", async (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: "Expected an array of users." });
  }
  adminUsersDb = req.body;
  await syncToFirebase("admin_users", adminUsersDb);
  res.json({ success: true, users: adminUsersDb });
});

app.delete("/api/users/:username", async (req, res) => {
  const { username } = req.params;
  adminUsersDb = adminUsersDb.filter(u => u.username.toLowerCase() !== username.toLowerCase());
  await syncToFirebase("admin_users", adminUsersDb);
  res.json({ success: true, message: `Admin user ${username} deleted.` });
});


// LEADERBOARD ENDPOINTS
app.get("/api/leaderboard", (req, res) => {
  // Return full mock leaderboard acts
  res.json(leaderboardDb);
});

app.put("/api/leaderboard-act/:actNum", async (req, res) => {
  const { actNum } = req.params;
  const rawMembers = req.body;
  
  // Update internal mock acts cache
  leaderboardDb[`leaderboard-act${actNum}`] = rawMembers;
  
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
});

// Start Express Listener
app.listen(PORT, async () => {
  console.log(`===================================================`);
  console.log(` Cyscom Open Source API Gateway active on Port ${PORT}`);
  console.log(` Access endpoints at http://localhost:${PORT}/api/...`);
  console.log(`===================================================`);
  await initFromFirebase();
});
