import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from './db.js';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.resolve(__dirname, '../cyscom-finalised-upgraded-website/public');

async function migrateBlogs() {
  const postsPath = path.join(PUBLIC_DIR, 'data/posts.json');
  if (!fs.existsSync(postsPath)) {
    console.log('No posts.json found.');
    return;
  }
  const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
  for (const post of posts) {
    const title = post.title || 'Untitled';
    const slug = title.toLowerCase().replace(/[^a-z0-9-]/g, "-") + "-" + post.id;
    const content = post.content || '';
    const author = post.author || null;
    const cover_image = post.thumbnail || null;
    const tags = post.categories || [];
    const published_at = post.published || null;

    try {
      await query(
        `INSERT INTO blogs (title, slug, cover_image_url, author, content_markdown, tags, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (slug) DO NOTHING`,
        [title, slug, cover_image, author, content, tags, published_at]
      );
      console.log(`Inserted blog: ${title}`);
    } catch (err) {
      console.error(`Error inserting blog ${title}:`, err);
    }
  }
}

async function migrateWriteups() {
  const writeupsIndexPath = path.join(PUBLIC_DIR, 'writeups/index.json');
  if (!fs.existsSync(writeupsIndexPath)) {
    console.log('No writeups index.json found.');
    return;
  }
  const events = JSON.parse(fs.readFileSync(writeupsIndexPath, 'utf8'));
  for (const event of events) {
    const eventName = event.title;
    for (const challenge of event.challenges) {
      const title = challenge.title;
      const slug = (eventName + "-" + title).toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const tags = challenge.categories || [];
      const mdFilePath = path.join(PUBLIC_DIR, challenge.filePath);
      
      let content_markdown = '';
      if (fs.existsSync(mdFilePath)) {
        content_markdown = fs.readFileSync(mdFilePath, 'utf8');
      } else {
        console.warn(`Missing markdown file: ${mdFilePath}`);
        continue;
      }

      try {
        await query(
          `INSERT INTO writeups (title, slug, event_name, content_markdown, tags)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (slug) DO NOTHING`,
          [title, slug, eventName, content_markdown, tags]
        );
        console.log(`Inserted writeup: ${title} from ${eventName}`);
      } catch (err) {
        console.error(`Error inserting writeup ${title}:`, err);
      }
    }
  }
}

async function main() {
  console.log("Starting migration...");
  await migrateBlogs();
  await migrateWriteups();
  console.log("Migration complete.");
  process.exit(0);
}

main();
