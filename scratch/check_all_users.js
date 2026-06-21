const fs = require('fs');
const path = require('path');

const ROOT_DIR = 'c:\\Users\\rayan\\OneDrive\\Desktop\\AMN-3-90';

// Also check SQLite
const sqlite3 = require('sqlite3').verbose();
const DB_PATH = path.join(ROOT_DIR, 'assets', 'data', 'exam_archive.db');
if (fs.existsSync(DB_PATH)) {
  const db = new sqlite3.Database(DB_PATH);
  db.all("SELECT id, username, display_name, role, rank, status FROM users", [], (err, rows) => {
    if (err) {
      console.error('Error querying users from SQLite:', err);
    } else {
      console.log('SQLite Users:');
      console.log(rows);
    }
    db.close();
  });
} else {
  console.log('SQLite DB not found at:', DB_PATH);
}
