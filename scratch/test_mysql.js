const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: 'srv1812.hstgr.io',
  user: 'u978543219_amn3user',
  password: 'L198611272m',
  database: 'u978543219_amn3',
  port: 3306
});

console.log('Connecting to remote MySQL database to test schema creation...');
connection.connect((err) => {
  if (err) {
    console.error('❌ Connection failed:', err.message);
    return;
  }
  console.log('✅ Connection successful!');
  
  const testTableSql = `CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    discord_id VARCHAR(255),
    username VARCHAR(255),
    display_name VARCHAR(255),
    global_name VARCHAR(255),
    avatar VARCHAR(255),
    banner VARCHAR(255),
    avatar_url VARCHAR(255),
    banner_url VARCHAR(255),
    last_sync TIMESTAMP NULL,
    role VARCHAR(255),
    rank VARCHAR(255),
    department VARCHAR(255),
    code VARCHAR(255),
    status VARCHAR(255) DEFAULT 'active',
    is_manual_role INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`;

  connection.query(testTableSql, (queryErr, results) => {
    if (queryErr) {
      console.error('❌ Table creation failed:', queryErr.message);
    } else {
      console.log('✅ Table users created successfully or already exists!');
      
      // Query table schema
      connection.query('DESCRIBE users', (descErr, descResults) => {
        if (descErr) {
          console.error('❌ Describe failed:', descErr.message);
        } else {
          console.log('Users table schema:', descResults);
        }
        
        // Cleanup test table
        connection.query('DROP TABLE users', (dropErr) => {
          if (dropErr) console.error('Drop failed:', dropErr.message);
          else console.log('Dropped users table successfully.');
          connection.end();
        });
      });
    }
  });
});
