import fs from 'fs';
import { query } from './db.js';

async function run() {
  try {
    const sql = fs.readFileSync('./migrations/016_blogs_writeups.sql', 'utf8');
    await query(sql);
    await query("INSERT INTO schema_migrations (version) VALUES ('016_blogs_writeups.sql') ON CONFLICT DO NOTHING");
    console.log('MIGRATION SUCCESS');
  } catch (e) {
    console.error('ERROR', e.message);
  }
  process.exit();
}
run();
