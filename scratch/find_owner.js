const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

db.all("SELECT * FROM users WHERE role = 'owner' OR id = '1334568342345748565' OR username LIKE '%3gjo%' OR discord_id = '1334568342345748565'", [], (err, rows) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log('Matching Owner Users:', rows);
});

db.close();
