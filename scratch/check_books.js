const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error connecting to DB:', err.message);
    process.exit(1);
  }
});

db.all("SELECT * FROM attendance_books", [], (err, rows) => {
  if (err) {
    console.error('Error reading books:', err.message);
  } else {
    console.log('Attendance books in SQLite DB:', rows);
  }
  db.close();
});
