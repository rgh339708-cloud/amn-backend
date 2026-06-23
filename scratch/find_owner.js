const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  
  db.all("SELECT id, username, display_name, role, rank FROM users WHERE role IN ('owner', 'assistant_owner')", [], (err, rows) => {
    if (err) {
      console.error('Error querying users:', err);
    } else {
      console.log('Admin Users:');
      console.log(JSON.stringify(rows, null, 2));
    }
    db.close();
  });
});
