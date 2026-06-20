const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

function loadConfig() {
  const config = { databaseUrl: '' };
  const envPaths = [
    path.join(__dirname, '..', 'DISCORD', '.env'),
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '.env'),
    path.join('c:', 'Users', 'rayan', 'OneDrive', 'Documents', 'DISCORD', '.env'),
    path.join(process.env.USERPROFILE || 'C:\\Users\\rayan', 'OneDrive', 'Documents', 'DISCORD', '.env')
  ];
  let envPath = '';
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      envPath = p;
      break;
    }
  }
  if (envPath) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const parts = line.trim().split('=');
        if (parts.length >= 2 && !parts[0].startsWith('#')) {
          const key = parts[0].trim();
          const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
          if (key === 'DATABASE_URL') config.databaseUrl = value;
        }
      });
    } catch (e) {}
  }
  return config;
}

const config = loadConfig();
const connStr = process.env.DATABASE_URL || config.databaseUrl;

// SQLite check
const dbPath = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error connecting to SQLite:', err.message);
    return;
  }
});

db.all("SELECT id, username, display_name, role, status FROM users WHERE role != 'viewer'", [], (err, rows) => {
  if (err) {
    console.error('SQLite Error:', err.message);
  } else {
    console.log('--- SQLITE STAFF USERS ---');
    console.log(rows);
  }
  db.get("SELECT COUNT(*) as count FROM users", [], (err, row) => {
    console.log('Total users in SQLite:', row ? row.count : 0);
    db.close();
  });
});

// Postgres check
if (connStr) {
  const pool = new Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false }
  });

  pool.query("SELECT id, username, display_name, role, status FROM users WHERE username LIKE '%اللهيبي%' OR display_name LIKE '%اللهيبي%'")
    .then(res => {
      console.log('--- POSTGRES MATCHES ---');
      console.log(res.rows);
      return pool.end();
    })
    .catch(err => {
      console.error('Postgres Error:', err);
    });
} else {
  console.log('No DATABASE_URL found for Postgres check.');
}
