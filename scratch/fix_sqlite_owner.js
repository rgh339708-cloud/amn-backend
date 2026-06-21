const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('SQLite connection error:', err);
    return;
  }
  console.log('Connected to SQLite DB.');

  const ownerIds = ['1334568342345748565', '1120142432554713261', '821825761673478144'];
  
  db.serialize(() => {
    ownerIds.forEach(id => {
      db.run("UPDATE users SET role = 'owner', rank = 'المالك', status = 'active' WHERE id = ?", [id], function(err) {
        if (err) {
          console.error(`Error updating user ${id}:`, err);
        } else {
          console.log(`Updated user ${id}: ${this.changes} row(s) updated.`);
        }
      });
    });

    db.all("SELECT id, username, display_name, role, rank FROM users WHERE id IN (?, ?, ?)", ownerIds, (err, rows) => {
      if (err) {
        console.error('Error querying users:', err);
      } else {
        console.log('Current SQLite Records:', JSON.stringify(rows, null, 2));
      }
      db.close();
    });
  });
});
