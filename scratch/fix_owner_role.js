const { Pool } = require('pg');
const DATABASE_URL = 'postgresql://neondb_owner:npg_PQW0dJnf6yjm@ep-billowing-mountain-atlczlqj-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function main() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const ownerIds = ['1334568342345748565', '1120142432554713261', '821825761673478144'];

  try {
    for (const id of ownerIds) {
      const res = await pool.query(
        "UPDATE users SET role = 'owner', rank = 'المالك', status = 'active' WHERE id = $1",
        [id]
      );
      console.log(`Updated user ${id}: ${res.rowCount} row(s) updated.`);
    }
    
    const check = await pool.query(
      "SELECT id, username, display_name, role, rank, status FROM users WHERE id IN ($1, $2, $3)",
      ownerIds
    );
    console.log('Current DB Records:');
    console.log(JSON.stringify(check.rows, null, 2));
  } catch (err) {
    console.error('Error updating owner roles in PostgreSQL:', err);
  } finally {
    await pool.end();
  }
}

main();
