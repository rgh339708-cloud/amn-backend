const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error connecting to DB:', err.message);
    return;
  }
});

db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
  if (err) {
    console.error('Error listing tables:', err.message);
    return;
  }
  console.log('Tables in SQLite DB:', rows.map(r => r.name));
});

db.close();
