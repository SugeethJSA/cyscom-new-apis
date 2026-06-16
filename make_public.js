import { query } from "./db.js";

async function makeEventsPublic() {
  try {
    const res = await query("UPDATE events SET is_public = true RETURNING *");
    console.log(`Updated ${res.rowCount} events to be public.`);
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}

makeEventsPublic();
