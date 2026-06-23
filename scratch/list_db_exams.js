const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'exam_archive.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Connection error:', err);
    process.exit(1);
  }
  console.log('✅ SQLite DB connected at', DB_PATH);
});

db.all("SELECT * FROM exams", [], (err, rows) => {
  if (err) {
    console.error('❌ Query failed:', err);
  } else {
    console.log(`🎉 Found ${rows.length} exams in database:`);
    rows.forEach(r => {
      console.log(`- ID: ${r.id}, Name: ${r.exam_name}, Course: ${r.course_name}, Status: ${r.status}`);
    });
  }
  db.close();
});
