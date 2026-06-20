const { Pool } = require('pg');
const DATABASE_URL = 'postgresql://neondb_owner:npg_PQW0dJnf6yjm@ep-billowing-mountain-atlczlqj-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function main() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const res = await pool.query(
      "UPDATE users SET role = 'owner', rank = 'المالك', status = 'active' WHERE id = '1334568342345748565'"
    );
    console.log('Update Result:', res.rowCount, 'row(s) updated.');
    
    const check = await pool.query(
      "SELECT id, username, display_name, role, rank, status FROM users WHERE id = '1334568342345748565'"
    );
    console.log('Current DB Record:', JSON.stringify(check.rows, null, 2));
  } catch (err) {
    console.error('Error updating owner role in PostgreSQL:', err);
  } finally {
    await pool.end();
  }
}

main();
