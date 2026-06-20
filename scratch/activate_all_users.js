const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');
const db = new sqlite3.Database(dbPath);

db.run("UPDATE users SET status = 'active'", [], function(err) {
  if (err) {
    console.error('Failed to activate users:', err.message);
  } else {
    console.log(`Successfully activated all users! Rows updated: ${this.changes}`);
  }
  db.close();
});
