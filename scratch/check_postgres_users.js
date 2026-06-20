const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

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

if (!connStr) {
  console.error('No DATABASE_URL found!');
  process.exit(1);
}

const pool = new Pool({
  connectionString: connStr,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const usersRes = await pool.query("SELECT id, username, display_name, avatar, status FROM users WHERE display_name LIKE '%ريان%' OR username LIKE '%ريان%'");
    console.log('--- POSTGRES MATCHING USERS ---');
    console.log(usersRes.rows);

    const accountsRes = await pool.query("SELECT * FROM discord_accounts");
    console.log('--- POSTGRES DISCORD ACCOUNTS ---');
    console.log(accountsRes.rows);

    const linksRes = await pool.query("SELECT * FROM discord_links");
    console.log('--- POSTGRES DISCORD LINKS ---');
    console.log(linksRes.rows);
  } catch (err) {
    console.error('Error querying Postgres:', err);
  } finally {
    await pool.end();
  }
}

main();
