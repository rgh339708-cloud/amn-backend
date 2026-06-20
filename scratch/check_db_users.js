const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('Error connecting to DB:', err.message);
    return;
  }
  console.log('Connected to SQLite database.');
});

db.all('SELECT * FROM users', [], (err, rows) => {
  if (err) {
    console.error('Error reading users:', err.message);
    return;
  }
  console.log('--- USERS ---');
  console.log(JSON.stringify(rows, null, 2));
});

db.close();
