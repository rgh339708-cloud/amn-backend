const mysql = require('mysql2');

const pool = mysql.createPool({
  host: 'srv1812.hstgr.io',
  user: 'u978543219_amn3user',
  password: 'L198611272m',
  database: 'u978543219_amn3',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
});

console.log('Querying attendance_books...');
pool.query("SELECT * FROM attendance_books", (err, rows) => {
  if (err) {
    console.error('MySQL Error:', err);
  } else {
    console.log('--- Attendance Books ---');
    console.log(rows);
  }
  pool.end();
});
