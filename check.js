import { query } from "./db.js";

async function check() {
  const res = await query("SELECT name, departments, points FROM users WHERE 'dev' = ANY(departments)");
  console.log(res.rows);
  process.exit(0);
}
check();
