const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DATABASE_URL = 'postgresql://neondb_owner:npg_PQW0dJnf6yjm@ep-billowing-mountain-atlczlqj-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require';

const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150"><rect width="200" height="150" fill="#0f172a" stroke="#c9a227" stroke-width="2"/><text x="100" y="80" font-family="sans-serif" font-size="14" fill="#c9a227" text-anchor="middle" font-weight="bold">صورة الروم مؤرشفة</text></svg>`;
const base64Placeholder = 'data:image/svg+xml;base64,' + Buffer.from(svgText).toString('base64');

async function cleanPostgres() {
  console.log('Connecting to PostgreSQL...');
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // 1. Clean attendance_books
    const booksRes = await pool.query('SELECT book_id, length(room_image) as len FROM attendance_books WHERE room_image IS NOT NULL');
    console.log(`Found ${booksRes.rows.length} books with images in Postgres.`);
    for (const row of booksRes.rows) {
      if (row.len > 100000) {
        console.log(`Updating book ${row.book_id} (size: ${row.len} chars) with placeholder...`);
        await pool.query('UPDATE attendance_books SET room_image = $1 WHERE book_id = $2', [base64Placeholder, row.book_id]);
      }
    }

    // 2. Clean attendance_records
    const recordsRes = await pool.query('SELECT id, length(room_image) as len FROM attendance_records WHERE room_image IS NOT NULL');
    console.log(`Found ${recordsRes.rows.length} records with images in Postgres.`);
    let updatedCount = 0;
    for (const row of recordsRes.rows) {
      if (row.len > 100000) {
        await pool.query('UPDATE attendance_records SET room_image = $1 WHERE id = $2', [base64Placeholder, row.id]);
        updatedCount++;
      }
    }
    console.log(`Successfully updated ${updatedCount} records in Postgres with placeholders.`);

  } catch (err) {
    console.error('Error cleaning PostgreSQL:', err);
  } finally {
    await pool.end();
  }
}

async function cleanSqlite() {
  const dbPath = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');
  if (!fs.existsSync(dbPath)) {
    console.log('Local SQLite database file not found, skipping SQLite cleanup.');
    return;
  }

  console.log('Connecting to SQLite...');
  const db = new sqlite3.Database(dbPath);

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 1. Clean attendance_books
      db.all('SELECT book_id, length(room_image) as len FROM attendance_books WHERE room_image IS NOT NULL', [], (err, rows) => {
        if (err) {
          console.error('SQLite error querying books:', err);
          return;
        }
        for (const row of rows) {
          if (row.len > 100000) {
            console.log(`SQLite: Updating book ${row.book_id} with placeholder...`);
            db.run('UPDATE attendance_books SET room_image = ? WHERE book_id = ?', [base64Placeholder, row.book_id]);
          }
        }
      });

      // 2. Clean attendance_records
      db.all('SELECT id, length(room_image) as len FROM attendance_records WHERE room_image IS NOT NULL', [], (err, rows) => {
        if (err) {
          console.error('SQLite error querying records:', err);
          return;
        }
        let count = 0;
        for (const row of rows) {
          if (row.len > 100000) {
            db.run('UPDATE attendance_records SET room_image = ? WHERE id = ?', [base64Placeholder, row.id]);
            count++;
          }
        }
        console.log(`SQLite: Successfully updated ${count} records with placeholders.`);
        db.close((closeErr) => {
          if (closeErr) reject(closeErr);
          else resolve();
        });
      });
    });
  });
}

async function main() {
  await cleanPostgres();
  await cleanSqlite();
  console.log('All database cleanups finished!');
}

main().catch(console.error);
