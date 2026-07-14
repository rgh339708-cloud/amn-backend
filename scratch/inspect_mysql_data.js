const mysql = require('mysql2');

const pool = mysql.createPool({
  host: 'srv1812.hstgr.io',
  user: 'u978543219_amn3user',
  password: 'L198611272m',
  database: 'u978543219_amn3',
  port: 3306
});

pool.query(`SELECT book_id, book_name, status, room_image, course_type, updated_at FROM attendance_books`, (err, res) => {
  if (err) {
    console.error(err);
  } else {
    console.log('Current MySQL Books State:');
    res.forEach(b => {
      console.log(`- ID: ${b.book_id}, Name: ${b.book_name}, Status: ${b.status}, Course: ${b.course_type}, Image: ${b.room_image ? b.room_image.substring(0, 100) : 'null'}, Updated: ${b.updated_at}`);
    });
  }
  pool.end();
});
