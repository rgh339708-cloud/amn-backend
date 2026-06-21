const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('SQLite connection error:', err);
    return;
  }
  
  db.all('SELECT id, COUNT(*) as cnt FROM users GROUP BY id HAVING cnt > 1', [], (err, rows) => {
    if (err) {
      console.error('Error querying SQLite:', err);
    } else {
      console.log('Duplicate IDs in SQLite users table:');
      console.log(rows);
    }
    
    db.all('SELECT id, username, display_name FROM users WHERE id = ?', ['1334568342345748565'], (err, rows2) => {
      console.log('Rows for id 1334568342345748565:');
      console.log(rows2);
      db.close();
    });
  });
});
