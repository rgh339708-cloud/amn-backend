const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error connecting to DB:', err.message);
    return;
  }
});

db.all('SELECT * FROM discord_accounts', [], (err, rows) => {
  if (err) {
    console.error('Error reading discord_accounts:', err.message);
    return;
  }
  console.log('--- DISCORD ACCOUNTS ---');
  console.log(JSON.stringify(rows, null, 2));
});

db.close();
