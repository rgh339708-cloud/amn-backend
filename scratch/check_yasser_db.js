const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../assets/data/exam_archive.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT id, discord_id, username, display_name, avatar, banner, role, status FROM users WHERE id = '956940655169515520' OR discord_id = '956940655169515520' OR username LIKE '%ياسر%'", [], (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('User rows in DB:', rows);
  }
  db.close();
});
