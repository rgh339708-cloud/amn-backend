const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
let dbUrl = '';
envContent.split('\n').forEach(line => {
  const parts = line.trim().split('=');
  if (parts.length >= 2 && parts[0].trim() === 'DATABASE_URL') {
    dbUrl = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
  }
});

console.log('Connecting to database:', dbUrl);

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const res = await pool.query('SELECT id, exam_name, course_name, status FROM exams');
    console.log('Exams currently in Postgres:');
    console.table(res.rows);
  } catch (err) {
    console.error('Error querying exams:', err);
  } finally {
    await pool.end();
  }
}

main();
