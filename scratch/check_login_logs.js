const fs = require('fs');
const path = require('path');

const ROOT_DIR = 'c:\\Users\\rayan\\OneDrive\\Desktop\\AMN-3-90';
const sqlite3 = require('sqlite3').verbose();
const DB_PATH = path.join(ROOT_DIR, 'assets', 'data', 'exam_archive.db');

if (fs.existsSync(DB_PATH)) {
  const db = new sqlite3.Database(DB_PATH);
  
  db.all("SELECT * FROM login_logs ORDER BY id DESC LIMIT 20", [], (err, rows) => {
    if (err) {
      console.error('Error querying login_logs:', err);
    } else {
      console.log('Recent Login Logs:');
      console.log(rows);
    }
    db.close();
  });
} else {
  console.log('SQLite DB not found at:', DB_PATH);
}
