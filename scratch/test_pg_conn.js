const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

function loadConfig() {
  const config = { databaseUrl: '' };
  const envPath = 'C:\\Users\\rayan\\OneDrive\\Documents\\DISCORD\\.env';
  if (fs.existsSync(envPath)) {
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
      console.log('Loaded env from:', envPath);
    } catch (e) {
      console.error(e);
    }
  }
  return config;
}

const config = loadConfig();
const connStr = config.databaseUrl;
console.log('ConnStr length:', connStr.length);
console.log('ConnStr:', JSON.stringify(connStr));

const pool = new Pool({
  connectionString: connStr,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const res = await pool.query("SELECT id, username, display_name, avatar, banner, role, status FROM users WHERE id = '1334568342345748565'");
    console.log('User row:', res.rows);
  } catch (err) {
    console.error('Query error:', err);
  } finally {
    await pool.end();
  }
}

main();
