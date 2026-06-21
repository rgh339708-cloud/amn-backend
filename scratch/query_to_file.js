const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const DATABASE_URL = 'postgresql://neondb_owner:npg_PQW0dJnf6yjm@ep-billowing-mountain-atlczlqj-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function main() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const res = await pool.query("SELECT id, username, display_name, role, rank, status FROM users WHERE id = '1334568342345748565' OR username = '3gjo'");
    fs.writeFileSync(path.join(__dirname, 'query_output.txt'), JSON.stringify(res.rows, null, 2));
    console.log('Done!');
  } catch (err) {
    fs.writeFileSync(path.join(__dirname, 'query_output.txt'), err.toString());
  } finally {
    await pool.end();
  }
}

main();
