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

        let userId;
        const exist = await query(`SELECT id FROM users WHERE email = $1`, [email]);
        if (exist.rows[0]) {
          userId = exist.rows[0].id;
          await query(`UPDATE users SET points = $1 WHERE id = $2`, [points, userId]);
        } else {
          const res = await query(`
            INSERT INTO users (name, email, password_hash, role, departments, points)
            VALUES ($1, $2, $3, 'volunteer', $4, $5)
            RETURNING id
          `, [name, email, passwordHash, [dept], points]);
          userId = res.rows[0].id;
        }

        if (userId) {
          await query(`
            INSERT INTO leaderboard (user_id, act_num, points, rating, contributions)
            VALUES ($1, 8, $2, $2, 'Initial testing seed')
            ON CONFLICT (user_id, act_num) DO UPDATE SET points = EXCLUDED.points, rating = EXCLUDED.rating
          `, [userId, points]);
        }

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
