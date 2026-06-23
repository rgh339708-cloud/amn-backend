const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: 'srv1812.hstgr.io',
  user: 'u978543219_amn3user',
  password: 'L198611272m',
  database: 'u978543219_amn3',
  port: 3306
});

console.log('Connecting to remote MySQL database to inspect tables...');
connection.connect((err) => {
  if (err) {
    console.error('❌ Connection failed:', err.message);
    return;
  }
  console.log('✅ Connection successful!');

  connection.query('SHOW TABLES', (showErr, tables) => {
    if (showErr) {
      console.error('❌ Failed to show tables:', showErr.message);
      connection.end();
      return;
    }

    const tableNames = tables.map(row => Object.values(row)[0]);
    console.log('Tables in database:', tableNames);

    if (tableNames.length === 0) {
      console.log('No tables found.');
      connection.end();
      return;
    }

    let completed = 0;
    tableNames.forEach(tableName => {
      connection.query(`SELECT COUNT(*) AS cnt FROM \`${tableName}\``, (countErr, countResult) => {
        if (countErr) {
          console.error(`❌ Error counting rows in ${tableName}:`, countErr.message);
        } else {
          console.log(`Table \`${tableName}\`: ${countResult[0].cnt} rows`);
        }
        completed++;
        if (completed === tableNames.length) {
          connection.end();
        }
      });
    });
  });
});
