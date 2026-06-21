const { Pool } = require('pg');
const connectionString = 'postgresql://neondb_owner:npg_PQW0dJnf6yjm@ep-billowing-mountain-atlczlqj-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

pool.query('SELECT id, exam_name, course_name FROM exams', (err, res) => {
  if (err) {
    console.error('Error executing query', err.stack);
  } else {
    console.log('Exams in PostgreSQL DB after migration:');
    console.log(res.rows);
  }
  pool.end();
});
