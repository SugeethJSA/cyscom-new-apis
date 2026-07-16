import { query } from "./db.js";
async function run() {
  const res1 = await query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'event_budgets'");
  console.log("event_budgets:", res1.rows);
  process.exit();
}
run();
