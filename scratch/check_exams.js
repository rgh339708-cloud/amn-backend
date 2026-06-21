const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('SQLite connection error:', err);
    return;
  }
  console.log('Connected to SQLite DB at', DB_PATH);
  
  db.all('SELECT id, exam_name, course_name FROM exams', [], (err, rows) => {
    if (err) {
      console.error('Error querying exams in SQLite:', err);
    } else {
      console.log('Exams in SQLite DB:');
      console.log(rows);
    }
    db.close();
  });
});
