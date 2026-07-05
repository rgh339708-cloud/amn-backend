const sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2');
const path = require('path');
const fs = require('fs');

// Load environment variables from common env path
function loadEnv() {
  const envPaths = [
    path.join(__dirname, '..', 'DISCORD', '.env'),
    path.join(__dirname, '.env'),
    path.join('c:', 'Users', 'rayan', 'OneDrive', 'Documents', 'DISCORD', '.env'),
    path.join(process.env.USERPROFILE || 'C:\\Users\\rayan', 'OneDrive', 'Documents', 'DISCORD', '.env')
  ];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
          const parts = line.trim().split('=');
          if (parts.length >= 2 && !parts[0].startsWith('#')) {
            const key = parts[0].trim();
            const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
            process.env[key] = value;
          }
        });
        console.log(`Loaded environment variables from ${envPath}`);
        break;
      } catch (e) {
        console.error(`Failed to read env file: ${envPath}`, e);
      }
    }
  }
}

loadEnv();

const MYSQL_HOST = process.env.MYSQL_HOST || 'srv1812.hstgr.io';
const MYSQL_USER = process.env.MYSQL_USER || 'u978543219_amn3user';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || 'L198611272m';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'u978543219_amn3';
const MYSQL_PORT = parseInt(process.env.MYSQL_PORT || '3306', 10);

const DB_PATH = path.join(__dirname, 'assets', 'data', 'exam_archive.db');
if (!fs.existsSync(DB_PATH)) {
  console.error(`❌ Error: Local SQLite database not found at ${DB_PATH}`);
  process.exit(1);
}

function normalizeTimestamp(val) {
  if (!val) return null;
  
  if (val instanceof Date) return val;
  if (typeof val === 'number') return new Date(val);
  
  if (typeof val === 'string') {
    let str = val.trim();
    
    // Convert Arabic numerals to Western
    const arabicNums = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    for (let i = 0; i < 10; i++) {
      str = str.replace(new RegExp(arabicNums[i], 'g'), i);
    }
    
    // Remove invisible RTL/LTR markers
    str = str.replace(/[\u200e\u200f\u202a-\u202e]/g, '');
    
    let d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d;
    }
    
    // Match dd/mm/yyyy or yyyy/mm/dd formats
    const parts = str.match(/(\d+)[-\/](\d+)[-\/](\d+)(?:\s+(\d+):(\d+):(\d+))?/);
    if (parts) {
      const dayOrYear = parseInt(parts[1], 10);
      const month = parseInt(parts[2], 10) - 1;
      const yearOrDay = parseInt(parts[3], 10);
      
      const hour = parseInt(parts[4] || '0', 10);
      const min = parseInt(parts[5] || '0', 10);
      const sec = parseInt(parts[6] || '0', 10);
      
      let year, day;
      if (dayOrYear > 1000) {
        year = dayOrYear;
        day = yearOrDay;
      } else {
        year = yearOrDay;
        day = dayOrYear;
      }
      
      d = new Date(year, month, day, hour, min, sec);
      if (!isNaN(d.getTime())) {
        return d;
      }
    }
  }
  return null;
}

async function migrate() {
  console.log('🚀 Starting database migration from SQLite to Hostinger MySQL...');
  
  const sqliteDb = new sqlite3.Database(DB_PATH);
  
  const mysqlConn = mysql.createConnection({
    host: MYSQL_HOST,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
    port: MYSQL_PORT
  });

  const queryAsync = (sql, params = []) => new Promise((resolve, reject) => {
    mysqlConn.query(sql, params, (err, results) => {
      if (err) reject(err); else resolve(results);
    });
  });

  try {
    const tables = [
      { name: 'users', query: 'SELECT * FROM users' },
      { name: 'login_logs', query: 'SELECT * FROM login_logs' },
      { name: 'discord_links', query: 'SELECT * FROM discord_links' },
      { name: 'discord_accounts', query: 'SELECT * FROM discord_accounts' },
      { name: 'courses', query: 'SELECT * FROM courses' },
      { name: 'amn9', query: 'SELECT * FROM exams' },
      { name: 'exam_results', query: 'SELECT * FROM exam_results' },
      { name: 'retake_requests', query: 'SELECT * FROM retake_requests' },
      { name: 'exam_violations', query: 'SELECT * FROM exam_violations' },
      { name: 'audit_logs', query: 'SELECT * FROM audit_logs' },
      { name: 'general_collections', query: 'SELECT * FROM general_collections' },
      { name: 'exam_attempts', query: 'SELECT * FROM exam_attempts' },
      { name: 'exam_errors', query: 'SELECT * FROM exam_errors' },
      { name: 'attendance_books', query: 'SELECT * FROM attendance_books' },
      { name: 'attendance_book_logs', query: 'SELECT * FROM attendance_book_logs' },
      { name: 'attendance_records', query: 'SELECT * FROM attendance_records' }
    ];

    for (const table of tables) {
      console.log(`[Migration] Fetching data for table "${table.name}" from SQLite...`);
      
      const rows = await new Promise((resolve, reject) => {
        sqliteDb.all(table.query, [], (err, resultRows) => {
          if (err) reject(err);
          else resolve(resultRows || []);
        });
      });

      if (rows.length === 0) {
        console.log(`[Migration] Table "${table.name}" has no rows in SQLite. Skipping.`);
        continue;
      }

      console.log(`[Migration] Clearing table "${table.name}" in MySQL...`);
      await queryAsync(`DELETE FROM \`${table.name}\``).catch(e => {
        console.warn(`Warning deleting table ${table.name} in MySQL:`, e.message);
      });

      console.log(`[Migration] Migrating ${rows.length} rows to table "${table.name}" on MySQL...`);
      
      const colNames = Object.keys(rows[0]);
      const columns = colNames.map(c => `\`${c}\``).join(', ');
      const timestampCols = ['last_sync', 'updated_at', 'timestamp', 'linked_at', 'created_at', 'request_time', 'violation_time'];
      
      for (const row of rows) {
        const vals = colNames.map(col => {
          let val = row[col];
          if (val && timestampCols.includes(col.toLowerCase())) {
            val = normalizeTimestamp(val);
          }
          return val;
        });
        const placeholders = vals.map(() => '?').join(', ');
        const query = `REPLACE INTO \`${table.name}\` (${columns}) VALUES (${placeholders})`;
        await queryAsync(query, vals);
      }

      console.log(`✅ Table "${table.name}" migrated successfully.`);
    }

    console.log('\n🎉 Database migration completed successfully with no errors!');
  } catch (err) {
    console.error('❌ Migration failed with error:', err);
  } finally {
    sqliteDb.close();
    mysqlConn.end();
  }
}

migrate();
