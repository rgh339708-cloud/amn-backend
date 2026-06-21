const fs = require('fs');
const path = require('path');

const ROOT_DIR = 'c:\\Users\\rayan\\OneDrive\\Desktop\\AMN-3-90';
const sqlite3 = require('sqlite3').verbose();
const DB_PATH = path.join(ROOT_DIR, 'assets', 'data', 'exam_archive.db');

if (fs.existsSync(DB_PATH)) {
  const db = new sqlite3.Database(DB_PATH);
  
  // Search for the 3 owner IDs
  const ownerIds = ['1334568342345748565', '1120142432554713261', '821825761673478144'];
  const query = `SELECT * FROM users WHERE id IN ('${ownerIds.join("','")}') OR username IN ('3gjo', 'z6tw', 'ifm711') OR discord_id IN ('${ownerIds.join("','")}')`;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error querying:', err);
    } else {
      console.log('Owner Users in SQLite:', rows);
    }
    db.close();
  });
}
