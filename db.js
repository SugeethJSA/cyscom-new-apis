import pg from "pg";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbUrl = process.env.DATABASE_URL;
let pool = null;

if (dbUrl) {
  console.log("Postgres DATABASE_URL detected. Initializing database pool...");
  pool = new pg.Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes("supabase.com") ? { rejectUnauthorized: false } : false
  });
} else {
  console.warn("WARNING: DATABASE_URL is not set. PostgreSQL-backed routes will be disabled.");
}

export { pool };

// In-memory fallback mock storage when DATABASE_URL is not provided
const mockStorage = {
  events: [
    { id: "e1", slug: "amaze-2026", name: "Amaze 2026", description: "Official CySCOM Amaze 2026 Event", status: "active" }
  ],
  users: [
    { id: "u1", name: "Desk Operator", email: "vol@cyscomvit.com", password_hash: "$2a$12$Hk5Jd7eGk09iT46XnO0/tOxC0rKjU2F.M/XzXw9WfI2gG3S6P2nKu", role: "volunteer", active: true, event_slug: "amaze-2026" },
    { id: "u2", name: "Event Admin", email: "admin@cyscomvit.com", password_hash: "$2a$12$Hk5Jd7eGk09iT46XnO0/tOxC0rKjU2F.M/XzXw9WfI2gG3S6P2nKu", role: "admin", active: true, event_slug: "amaze-2026" }
  ],
  user_categories: [
    { id: "c1", name: "General Pass", color: "#00ff41", station_permissions: ["entry", "food", "kit"], active: true, event_slug: "amaze-2026" },
    { id: "c2", name: "VIP Pass", color: "#00bfff", station_permissions: ["entry", "food", "kit", "custom"], active: true, event_slug: "amaze-2026" }
  ],
  attendees: [
    { id: "a1", name: "Aditya Kumar", email: "aditya@example.com", phone: "9876543210", college: "VIT Chennai", department: "BTech CSE", external_ref: "REF-001", checkin_status: "pending", ticket_sent: true, event_slug: "amaze-2026" },
    { id: "a2", name: "Sarah Sen", email: "sarah@example.com", phone: "9876543211", college: "VIT Chennai", department: "BTech ECE", external_ref: "REF-002", checkin_status: "checked_in", ticket_sent: true, event_slug: "amaze-2026" }
  ],
  registration_form_fields: [
    { id: "f1", field_key: "name", label: "Full Name", field_type: "text", required: true, active: true, show_in_list: true, sort_order: 1, event_slug: "amaze-2026" },
    { id: "f2", field_key: "email", label: "Email Address", field_type: "email", required: true, active: true, show_in_list: true, sort_order: 2, event_slug: "amaze-2026" },
    { id: "f3", field_key: "phone", label: "Phone Number", field_type: "text", required: false, active: true, show_in_list: true, sort_order: 3, event_slug: "amaze-2026" }
  ],
  scan_rules: [
    { id: "r1", rule_name: "Single Entry Checkpoint", station: "entry", validation_logic: '{"limit": 1}', active: true, event_slug: "amaze-2026" }
  ],
  scan_events: [],
  system_settings: []
};

export async function query(text, params) {
  if (!pool) {
    const lowerText = text.toLowerCase();
    let rows = [];
    if (lowerText.includes("from events")) {
      rows = mockStorage.events;
    } else if (lowerText.includes("from users")) {
      rows = mockStorage.users;
    } else if (lowerText.includes("from user_categories")) {
      rows = mockStorage.user_categories;
    } else if (lowerText.includes("from attendees")) {
      rows = mockStorage.attendees;
    } else if (lowerText.includes("from registration_form_fields")) {
      rows = mockStorage.registration_form_fields;
    } else if (lowerText.includes("from scan_rules")) {
      rows = mockStorage.scan_rules;
    } else if (lowerText.includes("from scan_events")) {
      rows = mockStorage.scan_events;
    } else if (lowerText.includes("from system_settings")) {
      rows = mockStorage.system_settings;
    }
    
    // Simulating updates/inserts
    if (lowerText.includes("insert into users")) {
      const newUser = { id: Math.random().toString(), name: params[0], email: params[1], password_hash: params[2], role: params[3], category_id: params[4], event_slug: params[5], active: true };
      mockStorage.users.push(newUser);
      rows = [newUser];
    } else if (lowerText.includes("insert into attendees")) {
      const newAttendee = { id: Math.random().toString(), name: params[0], email: params[1], checkin_status: "pending", ticket_sent: false, event_slug: params[5] };
      mockStorage.attendees.push(newAttendee);
      rows = [newAttendee];
    } else if (lowerText.includes("insert into system_settings")) {
      const existingIdx = mockStorage.system_settings.findIndex(s => s.setting_key === params[0] && s.event_slug === params[2]);
      if (existingIdx >= 0) {
        mockStorage.system_settings[existingIdx].setting_value = params[1];
      } else {
        mockStorage.system_settings.push({ setting_key: params[0], setting_value: params[1], event_slug: params[2] });
      }
    } else if (lowerText.includes("insert into scan_rules")) {
      const newRule = { id: Math.random().toString(), rule_name: params[0], station: params[1], validation_logic: params[2], active: true, event_slug: params[3] };
      mockStorage.scan_rules.push(newRule);
      rows = [newRule];
    } else if (lowerText.includes("insert into user_categories")) {
      const newCat = { id: Math.random().toString(), name: params[0], color: params[1], station_permissions: params[2], active: true, event_slug: params[3] };
      mockStorage.user_categories.push(newCat);
      rows = [newCat];
    }
    
    return { rows };
  }
  return pool.query(text, params);
}

export async function withTransaction(fn) {
  if (!pool) {
    return fn({
      query: (text, params) => query(text, params)
    });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function runMigrations() {
  if (!pool) {
    console.log("Skipping database migrations (PostgreSQL not configured).");
    return;
  }

  try {
    console.log("Running PostgreSQL migrations...");
    
    // Create migrations table if not exists
    await query("CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(255) PRIMARY KEY)");
    
    // Check if table 'events' exists. If it does, and schema_migrations is empty,
    // we assume initial migrations have already run on this existing database.
    const eventsTableCheck = await query(
      "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'events') AS exists"
    );
    const eventsTableExists = eventsTableCheck.rows[0]?.exists;
    
    if (eventsTableExists) {
      const countCheck = await query("SELECT COUNT(*)::int AS count FROM schema_migrations");
      if (countCheck.rows[0]?.count === 0) {
        console.log("Existing database detected. Seeding schema_migrations table...");
        await query(
          `INSERT INTO schema_migrations (version) 
           VALUES ('001_initial.sql'), ('002_schema_updates.sql'), ('003_multi_event.sql') 
           ON CONFLICT DO NOTHING`
        );
      }
    }

    const migrationsDir = path.join(__dirname, "migrations");
    
    // Ensure migrations directory exists
    await fs.mkdir(migrationsDir, { recursive: true });
    
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files.filter(f => f.endsWith(".sql")).sort();

    console.log(`Found ${sqlFiles.length} migration file(s) available.`);

    for (const file of sqlFiles) {
      const checkResult = await query("SELECT EXISTS (SELECT FROM schema_migrations WHERE version = $1) AS executed", [file]);
      if (checkResult.rows[0]?.executed) {
        console.log(`Migration already executed: ${file} (Skipping)`);
        continue;
      }

      console.log(`Executing migration: ${file}`);
      const filePath = path.join(migrationsDir, file);
      const sql = await fs.readFile(filePath, "utf8");
      
      // Run each migration inside a transaction for safety
      await withTransaction(async (client) => {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
      });
      console.log(`Migration completed successfully: ${file}`);
    }
    console.log("All PostgreSQL migrations verified/executed.");
  } catch (error) {
    console.error("Database migrations failed:", error.message);
  }
}
