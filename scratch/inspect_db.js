const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

async function inspectPostgres() {
  console.log('--- Postgres Database ---');
  const DATABASE_URL = 'postgresql://neondb_owner:npg_PQW0dJnf6yjm@ep-billowing-mountain-atlczlqj-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require';
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    const usersRes = await pool.query('SELECT id, username, role, rank FROM users LIMIT 10');
    console.log('Users in Postgres (first 10):', usersRes.rows);
    
    const examsRes = await pool.query('SELECT id, exam_name, status FROM exams');
    console.log('Exams in Postgres:', examsRes.rows);
  } catch (err) {
    console.error('Postgres query error:', err.message);
  } finally {
    await pool.end();
  }
}

inspectPostgres();
