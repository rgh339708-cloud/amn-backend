const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');
const db = new sqlite3.Database(DB_PATH);

console.log('Querying database tables...');

db.all("SELECT * FROM attendance_book_logs ORDER BY id DESC LIMIT 5", [], (err, logs) => {
  if (err) {
    console.error('Error fetching logs:', err);
  } else {
    console.log('--- Last 5 Attendance Book Logs ---');
    console.log(logs);
  }

  db.all("SELECT * FROM attendance_records ORDER BY id DESC LIMIT 5", [], (errRecs, records) => {
    if (errRecs) {
      console.error('Error fetching records:', errRecs);
    } else {
      console.log('--- Last 5 Attendance Records ---');
      console.log(records);
    }
    db.close();
  });
});
