import { query } from "./db.js";
import bcrypt from "bcryptjs";

const departments = ["dev", "des", "tec", "soc", "eve", "con"];

async function seed() {
  try {
    const passwordHash = await bcrypt.hash("password123", 10);
    let counter = 1;

    for (const dept of departments) {
      for (let i = 0; i < 2; i++) {
        const name = `Test User ${counter}`;
        const email = `user${counter}@${dept}.test`;
        const points = Math.floor(Math.random() * 50) + 10;

        await query(`
          INSERT INTO users (name, email, password_hash, role, departments, points)
          VALUES ($1, $2, $3, 'volunteer', $4, $5)
          ON CONFLICT (email, event_slug) DO NOTHING
        `, [name, email, passwordHash, [dept], points]);

        console.log(`Inserted ${name} into ${dept} with ${points} points.`);
        counter++;
      }
    }
    console.log("Seeding complete!");
  } catch (error) {
    console.error("Seeding failed:", error);
  } finally {
    process.exit(0);
  }
}

seed();
