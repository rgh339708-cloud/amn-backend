const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '../assets/data/exam_archive.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT collection_key FROM general_collections", [], (err, rows) => {
  if (err) {
    console.error("Error reading general_collections:", err);
  } else {
    console.log("Keys in general_collections:", rows.map(r => r.collection_key));
  }
  db.close();
});
