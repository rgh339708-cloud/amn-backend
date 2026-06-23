const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log('Connected');
  db.configure('busyTimeout', 10000);
  db.run('PRAGMA busy_timeout = 10000', (err2) => {
    if (err2) console.error(err2);
    else console.log('PRAGMA set successfully');
    db.close();
  });
});
