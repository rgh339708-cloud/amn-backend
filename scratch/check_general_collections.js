const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error connecting to DB:', err.message);
    process.exit(1);
  }
});

db.all("SELECT collection_key, length(data_json) as len FROM general_collections", [], (err, rows) => {
  if (err) {
    console.error('Error reading general_collections:', err.message);
  } else {
    console.log('General collections keys:', rows);
  }
  db.close();
});
