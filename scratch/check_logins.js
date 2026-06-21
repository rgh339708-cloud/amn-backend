const { Pool } = require('pg');
const DATABASE_URL = 'postgresql://neondb_owner:npg_PQW0dJnf6yjm@ep-billowing-mountain-atlczlqj-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function main() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const res = await pool.query("SELECT id, user_id, discord_id, ip_address, device, browser, status, timestamp FROM login_logs ORDER BY id DESC LIMIT 20");
    console.log('Recent Logins in PostgreSQL DB:');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
