const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '../assets/data/exam_archive.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT * FROM attendance_books", [], (err, rows) => {
  if (err) {
    console.error("Error reading attendance_books:", err);
  } else {
    console.log("Attendance Books:", rows);
  }
  db.close();
});
