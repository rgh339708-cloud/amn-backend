const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

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
    console.log('✅ Found .env at:', envPath);
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const parts = line.trim().split('=');
      if (parts.length >= 2 && !parts[0].startsWith('#')) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        if (key === 'DATABASE_URL') config.databaseUrl = value;
      }
    });
  } else {
    console.log('❌ No .env file found');
  }
  return config;
}

const config = loadConfig();
const dbUrl = process.env.DATABASE_URL || config.databaseUrl;

if (!dbUrl) {
  console.error('❌ DATABASE_URL is not set!');
  process.exit(1);
}

console.log('🔌 Connecting to PostgreSQL...');
const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

pool.query("SELECT * FROM exams", (err, res) => {
  if (err) {
    console.error('❌ Error querying remote exams table:', err.message);
  } else {
    console.log(`🎉 Remote database has ${res.rows.length} exams:`);
    res.rows.forEach(r => {
      console.log(`- ID: ${r.id}, Name: ${r.exam_name || r.title}, Course: ${r.course_name || r.category}`);
    });
  }
  pool.end();
});
