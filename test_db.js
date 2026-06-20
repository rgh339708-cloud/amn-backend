const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

function loadConfig() {
  const config = { databaseUrl: '' };
  const envPaths = [
    path.join(__dirname, '..', 'DISCORD', '.env'),
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
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const parts = line.trim().split('=');
      if (parts.length >= 2 && !parts[0].startsWith('#')) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        if (key === 'DATABASE_URL') config.databaseUrl = value;
      }
    });
  }
  return config;
}

const config = loadConfig();
const dbUrl = process.env.DATABASE_URL || config.databaseUrl;

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

pool.query("SELECT * FROM users WHERE id = $1", ['1334568342345748565'], (err, res) => {
  if (err) {
    console.error('Error querying users:', err);
  } else {
    console.log('Parameterized Query Result:');
    console.log(res.rows);
  }
  pool.end();
});
