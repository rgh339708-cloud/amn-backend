const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('Error connecting to DB:', err.message);
    return;
  }
});

db.run("UPDATE users SET role = 'academy_affairs' WHERE id = '750581378168389632'", [], function(err) {
  if (err) {
    console.error('Error updating role:', err.message);
  } else {
    console.log(`Successfully updated role in SQLite. Rows affected: ${this.changes}`);
  }
  db.close();
});
