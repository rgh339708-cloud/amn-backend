const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');
if (fs.existsSync(dbPath)) {
  console.log('DB File Size:', (fs.statSync(dbPath).size / 1024 / 1024).toFixed(2), 'MB');
} else {
  console.log('DB File not found at:', dbPath);
  process.exit(1);
}

const db = new sqlite3.Database(dbPath);

db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
  if (err) {
    console.error(err);
    return;
  }
  
  let completed = 0;
  tables.forEach(t => {
    db.get(`SELECT COUNT(*) as cnt FROM ${t.name}`, [], (e, r) => {
      console.log(`${t.name}: ${r ? r.cnt : 0} rows`);
      completed++;
      if (completed === tables.length) {
        db.close();
      }
    });
  });
});
