const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  
  db.all("PRAGMA table_info(users)", [], (err, rows) => {
    if (err) {
      console.error('Error querying table info:', err);
    } else {
      console.log('Columns in users table:');
      rows.forEach(row => {
        console.log(` - ${row.name} (${row.type})`);
      });
    }
    db.close();
  });
});
