const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
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
        break; // stop searching once loaded successfully
      } catch (e) {
        console.error(`Failed to read env file: ${envPath}`, e);
      }
    }
  }
}


loadEnv();

let connectionString = process.argv[2] || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Error: DATABASE_URL not specified. Please provide it as a command line argument or set it in your .env file.');
  console.error('Example: node migrate.js "postgresql://username:password@hostname:5432/dbname"');
  process.exit(1);
}

const DB_PATH = path.join(__dirname, 'assets', 'data', 'exam_archive.db');
if (!fs.existsSync(DB_PATH)) {
  console.error(`❌ Error: Local SQLite database not found at ${DB_PATH}`);
  process.exit(1);
}

async function initializePostgresSchema(pool) {
  console.log('[Schema] Initializing database schema on PostgreSQL...');
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id VARCHAR PRIMARY KEY,
    discord_id VARCHAR,
    username VARCHAR,
    display_name VARCHAR,
    global_name VARCHAR,
    avatar VARCHAR,
    banner VARCHAR,
    avatar_url VARCHAR,
    banner_url VARCHAR,
    last_sync TIMESTAMP,
    role VARCHAR,
    rank VARCHAR,
    department VARCHAR,
    code VARCHAR,
    status VARCHAR DEFAULT 'active',
    is_manual_role INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS login_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR,
    discord_id VARCHAR,
    ip_address VARCHAR,
    device VARCHAR,
    browser VARCHAR,
    status VARCHAR,
    avatar_url VARCHAR,
    last_sync TIMESTAMP,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS discord_links (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR,
    discord_id VARCHAR,
    username VARCHAR,
    avatar VARCHAR,
    banner VARCHAR,
    badges TEXT,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS courses (
    id VARCHAR PRIMARY KEY,
    course_name VARCHAR,
    description TEXT,
    instructors VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR DEFAULT 'active'
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS exams (
    id VARCHAR PRIMARY KEY,
    exam_name VARCHAR,
    course_name VARCHAR,
    questions_count INTEGER,
    passing_score INTEGER,
    status VARCHAR DEFAULT 'closed',
    questions_json TEXT,
    details_json TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS exam_results (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR,
    trainee_name VARCHAR,
    rank VARCHAR,
    code VARCHAR,
    course_name VARCHAR,
    exam_name VARCHAR,
    score REAL,
    pass_status VARCHAR,
    start_time VARCHAR,
    end_time VARCHAR,
    duration INTEGER,
    status VARCHAR,
    examiner VARCHAR,
    hand_raised INTEGER DEFAULT 0,
    hand_approved INTEGER DEFAULT 0,
    bypass_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS retake_requests (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR,
    trainee_name VARCHAR,
    rank VARCHAR,
    code VARCHAR,
    course_name VARCHAR,
    exam_name VARCHAR,
    reason TEXT,
    status VARCHAR DEFAULT 'pending',
    request_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_by VARCHAR,
    previous_score REAL,
    exam_id VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS exam_violations (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR,
    trainee_name VARCHAR,
    rank VARCHAR,
    code VARCHAR,
    course_name VARCHAR,
    violation_type VARCHAR,
    violation_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    details TEXT,
    exam_id VARCHAR
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    action_name VARCHAR,
    operator VARCHAR,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    old_data TEXT,
    new_data TEXT,
    action_type VARCHAR,
    username VARCHAR,
    details TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS general_collections (
    collection_key VARCHAR PRIMARY KEY,
    data_json TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS exam_attempts (
    id SERIAL PRIMARY KEY,
    trainee_name VARCHAR,
    rank VARCHAR,
    code VARCHAR,
    course_name VARCHAR,
    exam_name VARCHAR,
    start_time VARCHAR,
    end_time VARCHAR,
    score REAL,
    status VARCHAR,
    pass_status VARCHAR,
    duration INTEGER,
    examiner VARCHAR,
    hand_raised INTEGER DEFAULT 0,
    hand_approved INTEGER DEFAULT 0,
    bypass_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  console.log('✅ Schema initialization completed.');
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
  console.log('🚀 Starting database migration from SQLite to PostgreSQL...');
  
  const sqliteDb = new sqlite3.Database(DB_PATH);
  const pgPool = new Pool({
    connectionString: connectionString,
    ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1') ? false : { rejectUnauthorized: false }
  });

  try {
    // 1. Initialize PostgreSQL Schema
    await initializePostgresSchema(pgPool);

    const tables = [
      { name: 'users', query: 'SELECT * FROM users' },
      { name: 'login_logs', query: 'SELECT * FROM login_logs' },
      { name: 'discord_links', query: 'SELECT * FROM discord_links' },
      { name: 'courses', query: 'SELECT * FROM courses' },
      { name: 'amn9', query: 'SELECT * FROM exams' },
      { name: 'exam_results', query: 'SELECT * FROM exam_results' },
      { name: 'retake_requests', query: 'SELECT * FROM retake_requests' },
      { name: 'exam_violations', query: 'SELECT * FROM exam_violations' },
      { name: 'audit_logs', query: 'SELECT * FROM audit_logs' },
      { name: 'general_collections', query: 'SELECT * FROM general_collections' },
      { name: 'exam_attempts', query: 'SELECT * FROM exam_attempts' }
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

      console.log(`[Migration] Clearing table "${table.name}" in PostgreSQL...`);
      await pgPool.query(`DELETE FROM "${table.name}"`).catch(e => {
        console.warn(`Warning deleting table: ${table.name}`, e.message);
      });

      console.log(`[Migration] Migrating ${rows.length} rows to table "${table.name}" on PostgreSQL...`);
      
      const colNames = Object.keys(rows[0]);
      const columns = colNames.map(c => `"${c}"`).join(', ');
      const timestampCols = ['last_sync', 'updated_at', 'timestamp', 'linked_at', 'created_at', 'request_time', 'violation_time'];
      
      for (const row of rows) {
        const vals = colNames.map(col => {
          let val = row[col];
          if (val && timestampCols.includes(col.toLowerCase())) {
            val = normalizeTimestamp(val);
          }
          return val;
        });
        const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
        const query = `INSERT INTO "${table.name}" (${columns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
        await pgPool.query(query, vals);
      }

      // Reset sequences if it's a serial primary key
      const serialTables = ['login_logs', 'discord_links', 'exam_results', 'retake_requests', 'exam_violations', 'audit_logs', 'exam_attempts'];
      if (serialTables.includes(table.name)) {
        try {
          await pgPool.query(`SELECT setval(pg_get_serial_sequence('"${table.name}"', 'id'), coalesce(max(id), 1)) FROM "${table.name}"`);
        } catch (e) {
          // sequence might not exist or name mismatched, continue silently
        }
      }

      console.log(`✅ Table "${table.name}" migrated successfully.`);
    }

    console.log('\n🎉 Database migration completed successfully with no errors!');
  } catch (err) {
    console.error('❌ Migration failed with error:', err);
  } finally {
    sqliteDb.close();
    await pgPool.end();
  }
}

migrate();
