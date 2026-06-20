const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error connecting to DB:', err.message);
    return;
  }
});

db.all("SELECT * FROM users WHERE id = '828403621833080832' OR discord_id = '828403621833080832'", [], (err, rows) => {
  if (err) {
    console.error('Error:', err.message);
    return;
  }
  console.log('User details in SQLite DB:');
  console.log(JSON.stringify(rows, null, 2));
});

db.close();
