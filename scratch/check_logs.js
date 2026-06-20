const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Connection error:', err);
    return;
  }
  
  console.log('--- LATEST AUDIT LOGS ---');
  db.all("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 15", [], (err, rows) => {
    if (err) console.error(err);
    else console.log(rows);
    
    console.log('--- LATEST LOGIN LOGS ---');
    db.all("SELECT * FROM login_logs ORDER BY id DESC LIMIT 15", [], (err, rows) => {
      if (err) console.error(err);
      else console.log(rows);
      
      console.log('--- DISCORD LINKS ---');
      db.all("SELECT * FROM discord_links ORDER BY id DESC LIMIT 15", [], (err, rows) => {
        if (err) console.error(err);
        else console.log(rows);
        db.close();
      });
    });
  });
});
