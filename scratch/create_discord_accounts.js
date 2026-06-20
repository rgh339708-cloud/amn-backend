const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('Error connecting to DB:', err.message);
    return;
  }
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS discord_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE,
    discord_id TEXT UNIQUE,
    username TEXT,
    avatar TEXT,
    banner TEXT,
    badges TEXT,
    linked_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`, (err) => {
    if (err) {
      console.error('Error creating discord_accounts:', err.message);
    } else {
      console.log('Successfully created discord_accounts table.');
    }
  });
});

db.close();
