const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const url = require('url');
const fs = require('fs');
const https = require('https');
const zlib = require('zlib');

// ─── Global Discord Interceptor for Render Hosting ───
// Bypasses Cloudflare Error 1015 (Discord block on Render IP addresses)
const originalHttpsRequest = https.request;
https.request = function(options, callback) {
  let finalOptions = options;
  const isRender = process.env.RENDER === 'true' || process.env.NODE_ENV === 'production';
  
  if (isRender && options) {
    let hostname = '';
    let pathUrl = '';
    
    if (typeof options === 'string') {
      try {
        const parsedUrl = new URL(options);
        if (parsedUrl.hostname === 'discord.com') {
          const rawPath = parsedUrl.pathname.slice(1) + parsedUrl.search;
          const b64 = Buffer.from(rawPath).toString('base64');
          const newUrl = `https://amn-3-90.com/discord_proxy.php?b64path=${b64}`;
          return originalHttpsRequest.call(https, newUrl, callback);
        }
      } catch (e) {}
    } else {
      hostname = options.hostname || options.host;
      pathUrl = options.path;
      
      if (hostname === 'discord.com') {
        finalOptions = { ...options };
        finalOptions.hostname = 'amn-3-90.com';
        delete finalOptions.host;
        
        // ترميز المسار بـ Base64 لتفادي حظر الجدار الناري للاستضافة للكلمات المفتاحية مثل interactions أو webhooks
        const rawPath = pathUrl.startsWith('/') ? pathUrl.slice(1) : pathUrl;
        const b64 = Buffer.from(rawPath).toString('base64');
        finalOptions.path = '/discord_proxy.php?b64path=' + b64;
        
        if (finalOptions.headers) {
          finalOptions.headers = { ...finalOptions.headers };
          const hasAuth = finalOptions.headers['Authorization'] || finalOptions.headers['authorization'];
          const isBot = hasAuth && String(hasAuth).startsWith('Bot ');
          
          if (!finalOptions.headers['User-Agent'] && !finalOptions.headers['user-agent']) {
            finalOptions.headers['User-Agent'] = isBot 
              ? 'DiscordBot (https://github.com/discord/discord-api-docs, 1.0.0)' 
              : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
          }
        }
      }
    }
  }
  return originalHttpsRequest.call(https, finalOptions, callback);
};

const MAINTENANCE_MODE = false; // Enable maintenance mode


// ─── CSV Discord Sync Bot (مستقل عن الموقع) ───
const { runCsvDiscordSync } = require('./csv_discord_sync');

// ─── Discord Gateway (للظهور أونلاين) ───
const { startGateway } = require('./discord_gateway');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const SETTINGS_FILE = path.join(PUBLIC_DIR, 'assets', 'data', 'settings.json');

// ─── Shared Config & Google Sheets Sync Engine ───
function loadConfig() {
  const config = {
    spreadsheetId: '',
    spreadsheetGid: '',
    discordToken: '',
    databaseUrl: '',
    guildId: '',
    managedRoles: [],
    mysqlHost: '',
    mysqlUser: '',
    mysqlPassword: '',
    mysqlDatabase: '',
    mysqlPort: ''
  };
  const envPaths = [
    path.join(process.env.USERPROFILE || 'C:\\Users\\rayan', 'OneDrive', 'Documents', 'DISCORD', '.env'),
    path.join('c:', 'Users', 'rayan', 'OneDrive', 'Documents', 'DISCORD', '.env'),
    path.join(__dirname, '..', 'DISCORD', '.env'),
    path.join(__dirname, '.env')
  ];
  
  let loadedCount = 0;
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        content.split('\n').forEach(line => {
          const parts = line.trim().split('=');
          if (parts.length >= 2 && !parts[0].startsWith('#')) {
            const key = parts[0].trim();
            const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
            if (key === 'SPREADSHEET_ID') config.spreadsheetId = value;
            if (key === 'SPREADSHEET_GID') config.spreadsheetGid = value;
            if (key === 'DISCORD_TOKEN') config.discordToken = value;
            if (key === 'DATABASE_URL') config.databaseUrl = value;
            if (key === 'GUILD_ID') config.guildId = value;
            if (key === 'MANAGED_ROLES') config.managedRoles = value.split(',').map(r => r.trim());
            if (key === 'MYSQL_HOST') config.mysqlHost = value;
            if (key === 'MYSQL_USER') config.mysqlUser = value;
            if (key === 'MYSQL_PASSWORD') config.mysqlPassword = value;
            if (key === 'MYSQL_DATABASE') config.mysqlDatabase = value;
            if (key === 'MYSQL_PORT') config.mysqlPort = value;
          }
        });
        console.log(`[Config] Successfully loaded environment variables from ${p}`);
        loadedCount++;
      } catch (e) {
        console.error(`[Config Error] Failed to read env config from ${p}:`, e.message);
      }
    }
  }
  if (loadedCount === 0) {
    console.warn('[Config Warning] No .env file found in any of the search paths.');
  }

  // Fallback to process.env if variables are not loaded from file (useful for cloud environments like Render/Railway)
  if (!config.spreadsheetId && process.env.SPREADSHEET_ID) config.spreadsheetId = process.env.SPREADSHEET_ID;
  if (!config.spreadsheetGid && process.env.SPREADSHEET_GID) config.spreadsheetGid = process.env.SPREADSHEET_GID;
  if (!config.discordToken && process.env.DISCORD_TOKEN) config.discordToken = process.env.DISCORD_TOKEN;
  if (!config.databaseUrl && process.env.DATABASE_URL) config.databaseUrl = process.env.DATABASE_URL;
  if (!config.guildId && process.env.GUILD_ID) config.guildId = process.env.GUILD_ID;
  if ((!config.managedRoles || config.managedRoles.length === 0) && process.env.MANAGED_ROLES) {
    config.managedRoles = process.env.MANAGED_ROLES.split(',').map(r => r.trim());
  }
  if (!config.mysqlHost && process.env.MYSQL_HOST) config.mysqlHost = process.env.MYSQL_HOST;
  if (!config.mysqlUser && process.env.MYSQL_USER) config.mysqlUser = process.env.MYSQL_USER;
  if (!config.mysqlPassword && process.env.MYSQL_PASSWORD) config.mysqlPassword = process.env.MYSQL_PASSWORD;
  if (!config.mysqlDatabase && process.env.MYSQL_DATABASE) config.mysqlDatabase = process.env.MYSQL_DATABASE;
  if (!config.discordToken) {
    config.discordToken = process.env.DISCORD_TOKEN || '';
  }

  return config;
}


const config = loadConfig();

// Helper to send gzipped response if supported by client
function sendGzippedResponse(req, res, statusCode, headers, body) {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  const bodyBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');

  if (acceptEncoding.includes('gzip')) {
    zlib.gzip(bodyBuffer, (err, gzipped) => {
      if (err) {
        res.writeHead(statusCode, { ...headers, 'Content-Length': bodyBuffer.length });
        res.end(bodyBuffer);
      } else {
        res.writeHead(statusCode, {
          ...headers,
          'Content-Encoding': 'gzip',
          'Content-Length': gzipped.length
        });
        res.end(gzipped);
      }
    });
  } else {
    res.writeHead(statusCode, { ...headers, 'Content-Length': bodyBuffer.length });
    res.end(bodyBuffer);
  }
}

const MYSQL_HOST = config.mysqlHost || 'srv1812.hstgr.io';
const MYSQL_USER = config.mysqlUser || 'u978543219_amn3user';
const MYSQL_PASSWORD = config.mysqlPassword || 'L198611272m';
const MYSQL_DATABASE = config.mysqlDatabase || 'u978543219_amn3';
const MYSQL_PORT = parseInt(config.mysqlPort || '3306', 10);

let isMysql = !!MYSQL_HOST;
let isPostgres = false;
let pgPool = null;
let dbInitError = null;


// Helper to convert sqlite SQL syntax to MySQL syntax
function convertSqlToMysql(sql) {
  let mySql = sql;
  
  // Replace double quotes with backticks for table and column names
  mySql = mySql.replace(/"(\w+)"/g, '`$1`');
  
  // Replace INSERT OR REPLACE INTO with REPLACE INTO
  mySql = mySql.replace(/INSERT OR REPLACE INTO/gi, 'REPLACE INTO');
  
  // Replace SQLite datetimes
  mySql = mySql.replace(/datetime\('now'\)/gi, "NOW()");
  mySql = mySql.replace(/datetime\('now',\s*'localtime'\)/gi, "NOW()");
  mySql = mySql.replace(/datetime\('now',\s*'\+2 hours'\)/gi, "DATE_ADD(NOW(), INTERVAL 2 HOUR)");
  
  // Auto-increment keyword
  mySql = mySql.replace(/AUTOINCREMENT/gi, "AUTO_INCREMENT");
  
  // Convert basic SQLite types if encountered in schema creation
  mySql = mySql.replace(/\bTEXT\b/g, "LONGTEXT");
  mySql = mySql.replace(/\bREAL\b/g, "DOUBLE");

  return mySql;
}

// Helper to convert sqlite SQL syntax to PostgreSQL syntax
function convertSqlToPostgres(sql) {
  let pgSql = sql;
  
  // Replace SQLite datetimes
  pgSql = pgSql.replace(/datetime\('now'\)/gi, "CURRENT_TIMESTAMP");
  pgSql = pgSql.replace(/datetime\('now',\s*'localtime'\)/gi, "CURRENT_TIMESTAMP");
  pgSql = pgSql.replace(/datetime\('now',\s*'\+2 hours'\)/gi, "CURRENT_TIMESTAMP + interval '2 hours'");
  
  // Convert SQLite INSERT OR REPLACE INTO to Postgres ON CONFLICT
  const matchRegex = /insert\s+or\s+replace\s+into\s+["`]?(\w+)["`]?\s*\(([^)]+)\)\s*values\s*\((.*)\)/is;
  if (matchRegex.test(pgSql)) {
    pgSql = pgSql.replace(matchRegex, (match, tableName, columnsStr, valuesStr) => {
      const cols = columnsStr.split(',').map(c => c.trim().replace(/[\[\]"`]/g, ''));
      let primaryKey = 'id';
      const lowerTable = tableName.toLowerCase();
      if (lowerTable === 'general_collections') {
        primaryKey = 'collection_key';
      } else if (lowerTable === 'attendance_books') {
        primaryKey = 'book_id';
      } else if (lowerTable === 'discord_links') {
        primaryKey = 'id';
      }
      
      const updateCols = cols.filter(c => c.toLowerCase() !== primaryKey.toLowerCase());
      const updateClause = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
      
      return `INSERT INTO "${tableName}" (${columnsStr}) VALUES (${valuesStr}) ON CONFLICT ("${primaryKey}") DO UPDATE SET ${updateClause}`;
    });
  }
  
  // Replace ? with $1, $2, etc.
  let index = 1;
  pgSql = pgSql.replace(/\?/g, () => `$${index++}`);
  
  return pgSql;
}

async function initializePostgresSchema(pool) {
  console.log('[Schema] Initializing database schema on PostgreSQL...');
  const queryAsync = (sql, params = []) => new Promise((resolve, reject) => {
    pool.query(sql, params, (err) => {
      if (err) reject(err); else resolve();
    });
  });

  await queryAsync(`CREATE TABLE IF NOT EXISTS users (
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
    real_name VARCHAR,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  try {
    await queryAsync(`ALTER TABLE users ADD COLUMN global_name VARCHAR`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE users ADD COLUMN is_manual_role INTEGER DEFAULT 0`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE users ADD COLUMN real_name VARCHAR`);
  } catch(e) {}

  await queryAsync(`CREATE TABLE IF NOT EXISTS login_logs (
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

  try {
    await queryAsync(`ALTER TABLE login_logs ADD COLUMN avatar_url VARCHAR`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE login_logs ADD COLUMN last_sync TIMESTAMP`);
  } catch(e) {}

  await queryAsync(`CREATE TABLE IF NOT EXISTS discord_links (
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

  await queryAsync(`CREATE TABLE IF NOT EXISTS discord_accounts (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR UNIQUE,
    discord_id VARCHAR UNIQUE,
    username VARCHAR,
    avatar VARCHAR,
    banner VARCHAR,
    badges TEXT,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await queryAsync(`CREATE TABLE IF NOT EXISTS courses (
    id VARCHAR PRIMARY KEY,
    course_name VARCHAR,
    description TEXT,
    instructors VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR DEFAULT 'active'
  )`);

  await queryAsync(`CREATE TABLE IF NOT EXISTS exams (
    id VARCHAR PRIMARY KEY,
    exam_name VARCHAR,
    course_name VARCHAR,
    questions_count INTEGER,
    passing_score INTEGER,
    status VARCHAR DEFAULT 'closed',
    questions_json TEXT,
    details_json TEXT
  )`);

  await queryAsync(`CREATE TABLE IF NOT EXISTS exam_results (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR,
    trainee_name VARCHAR,
    rank VARCHAR,
    code VARCHAR,
    discord_id VARCHAR,
    badge_code VARCHAR,
    attempt_count INTEGER DEFAULT 1,
    course_name VARCHAR,
    exam_name VARCHAR,
    score REAL,
    pass_status VARCHAR,
    start_time VARCHAR,
    end_time VARCHAR,
    duration INTEGER,
    status VARCHAR,
    examiner VARCHAR,
    passing_score INTEGER DEFAULT 80,
    questions_json TEXT,
    user_answers_json TEXT,
    hand_raised INTEGER DEFAULT 0,
    hand_approved INTEGER DEFAULT 0,
    bypass_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  try {
    await queryAsync(`ALTER TABLE exam_results ADD COLUMN discord_id VARCHAR`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_results ADD COLUMN badge_code VARCHAR`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_results ADD COLUMN attempt_count INTEGER DEFAULT 1`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_results ADD COLUMN questions_json TEXT`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_results ADD COLUMN user_answers_json TEXT`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_results ADD COLUMN passing_score INTEGER DEFAULT 80`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_results ADD COLUMN hand_raised INTEGER DEFAULT 0`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_results ADD COLUMN hand_approved INTEGER DEFAULT 0`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_results ADD COLUMN bypass_count INTEGER DEFAULT 0`);
  } catch(e) {}

  await queryAsync(`CREATE TABLE IF NOT EXISTS retake_requests (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR,
    trainee_name VARCHAR,
    rank VARCHAR,
    code VARCHAR,
    course_name VARCHAR,
    exam_name VARCHAR,
    reason TEXT,
    status VARCHAR DEFAULT 'pending',
    request_time VARCHAR,
    approved_by VARCHAR,
    previous_score REAL,
    exam_id VARCHAR
  )`);

  try {
    await queryAsync(`ALTER TABLE retake_requests ADD COLUMN user_id VARCHAR`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE retake_requests ADD COLUMN exam_name VARCHAR`);
  } catch(e) {}

  await queryAsync(`CREATE TABLE IF NOT EXISTS exam_violations (
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

  await queryAsync(`CREATE TABLE IF NOT EXISTS audit_logs (
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

  await queryAsync(`CREATE TABLE IF NOT EXISTS general_collections (
    collection_key VARCHAR PRIMARY KEY,
    data_json TEXT
  )`);

  await queryAsync(`CREATE TABLE IF NOT EXISTS exam_attempts (
    id SERIAL PRIMARY KEY,
    trainee_name VARCHAR,
    rank VARCHAR,
    code VARCHAR,
    discord_id VARCHAR,
    badge_code VARCHAR,
    attempt_count INTEGER DEFAULT 1,
    course_name VARCHAR,
    exam_name VARCHAR,
    start_time VARCHAR,
    end_time VARCHAR,
    score REAL,
    status VARCHAR,
    pass_status VARCHAR,
    duration INTEGER,
    examiner VARCHAR,
    passing_score INTEGER DEFAULT 80,
    questions_json TEXT,
    user_answers_json TEXT,
    hand_raised INTEGER DEFAULT 0,
    hand_approved INTEGER DEFAULT 0,
    bypass_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  try {
    await queryAsync(`ALTER TABLE exam_attempts ADD COLUMN discord_id VARCHAR`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_attempts ADD COLUMN badge_code VARCHAR`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_attempts ADD COLUMN attempt_count INTEGER DEFAULT 1`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_attempts ADD COLUMN questions_json TEXT`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_attempts ADD COLUMN user_answers_json TEXT`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_attempts ADD COLUMN passing_score INTEGER DEFAULT 80`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_attempts ADD COLUMN hand_raised INTEGER DEFAULT 0`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_attempts ADD COLUMN hand_approved INTEGER DEFAULT 0`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_attempts ADD COLUMN bypass_count INTEGER DEFAULT 0`);
  } catch(e) {}

  await queryAsync(`CREATE TABLE IF NOT EXISTS exam_errors (
    id SERIAL PRIMARY KEY,
    trainee_name VARCHAR,
    exam_name VARCHAR,
    error_message TEXT,
    stack_trace TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await queryAsync(`CREATE TABLE IF NOT EXISTS attendance_books (
    book_id VARCHAR PRIMARY KEY,
    book_name VARCHAR,
    status VARCHAR DEFAULT 'closed',
    updated_by VARCHAR,
    room_image TEXT,
    course_type VARCHAR DEFAULT 'أساسية',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  try {
    await queryAsync(`ALTER TABLE attendance_books ADD COLUMN room_image TEXT`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE attendance_books ADD COLUMN course_type VARCHAR DEFAULT 'أساسية'`);
  } catch(e) {}

  await queryAsync(`CREATE TABLE IF NOT EXISTS attendance_book_logs (
    id SERIAL PRIMARY KEY,
    book_id VARCHAR,
    book_name VARCHAR,
    action VARCHAR,
    operator VARCHAR,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await queryAsync(`CREATE TABLE IF NOT EXISTS attendance_records (
    id SERIAL PRIMARY KEY,
    book_id VARCHAR,
    book_name VARCHAR,
    user_id VARCHAR,
    username VARCHAR,
    display_name VARCHAR,
    rank VARCHAR,
    code VARCHAR,
    status VARCHAR DEFAULT 'present',
    notes TEXT,
    room_image TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  try {
    await queryAsync(`ALTER TABLE attendance_records ADD COLUMN room_image TEXT`);
  } catch(e) {}
}

async function initializeMysqlSchema(pool) {
  console.log('[Schema] Initializing database schema on MySQL...');
  
  const queryAsync = (sql, params = []) => new Promise((resolve, reject) => {
    pool.query(convertSqlToMysql(sql), params, (err) => {
      if (err) reject(err); else resolve();
    });
  });

  await queryAsync(`CREATE TABLE IF NOT EXISTS users (
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
  )`);

  try {
    await queryAsync(`ALTER TABLE users ADD COLUMN global_name VARCHAR(255)`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE users ADD COLUMN is_manual_role INTEGER DEFAULT 0`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE users ADD COLUMN real_name VARCHAR(255)`);
  } catch(e) {}

  await queryAsync(`CREATE TABLE IF NOT EXISTS login_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255),
    discord_id VARCHAR(255),
    ip_address VARCHAR(255),
    device VARCHAR(255),
    browser VARCHAR(255),
    status VARCHAR(255),
    avatar_url VARCHAR(255),
    last_sync TIMESTAMP NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await queryAsync(`CREATE TABLE IF NOT EXISTS discord_links (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255),
    discord_id VARCHAR(255),
    username VARCHAR(255),
    avatar VARCHAR(255),
    banner VARCHAR(255),
    badges TEXT,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);

  await queryAsync(`CREATE TABLE IF NOT EXISTS discord_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255) UNIQUE,
    discord_id VARCHAR(255) UNIQUE,
    username VARCHAR(255),
    avatar VARCHAR(255),
    banner VARCHAR(255),
    badges TEXT,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);

  await queryAsync(`CREATE TABLE IF NOT EXISTS courses (
    id VARCHAR(255) PRIMARY KEY,
    course_name VARCHAR(255),
    description TEXT,
    instructors VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(255) DEFAULT 'active'
  )`);

  await queryAsync(`CREATE TABLE IF NOT EXISTS exams (
    id VARCHAR(255) PRIMARY KEY,
    exam_name VARCHAR(255),
    course_name VARCHAR(255),
    questions_count INTEGER,
    passing_score INTEGER,
    status VARCHAR(255) DEFAULT 'closed',
    questions_json LONGTEXT,
    details_json LONGTEXT
  )`);

  await queryAsync(`CREATE TABLE IF NOT EXISTS exam_results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255),
    trainee_name VARCHAR(255),
    rank VARCHAR(255),
    code VARCHAR(255),
    discord_id VARCHAR(255),
    badge_code VARCHAR(255),
    attempt_count INTEGER DEFAULT 1,
    course_name VARCHAR(255),
    exam_name VARCHAR(255),
    score DOUBLE,
    pass_status VARCHAR(255),
    start_time VARCHAR(255),
    end_time VARCHAR(255),
    duration INTEGER,
    status VARCHAR(255),
    examiner VARCHAR(255),
    passing_score INTEGER DEFAULT 80,
    questions_json LONGTEXT,
    user_answers_json LONGTEXT,
    hand_raised INT DEFAULT 0,
    hand_approved INT DEFAULT 0,
    bypass_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await queryAsync(`CREATE TABLE IF NOT EXISTS retake_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255),
    trainee_name VARCHAR(255),
    rank VARCHAR(255),
    code VARCHAR(255),
    course_name VARCHAR(255),
    exam_name VARCHAR(255),
    reason TEXT,
    status VARCHAR(255) DEFAULT 'pending',
    request_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_by VARCHAR(255),
    previous_score DOUBLE,
    exam_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await queryAsync(`CREATE TABLE IF NOT EXISTS exam_violations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255),
    trainee_name VARCHAR(255),
    rank VARCHAR(255),
    code VARCHAR(255),
    course_name VARCHAR(255),
    violation_type VARCHAR(255),
    violation_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    details TEXT,
    exam_id VARCHAR(255)
  )`);

  await queryAsync(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    action_name VARCHAR(255),
    operator VARCHAR(255),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    old_data TEXT,
    new_data TEXT,
    action_type VARCHAR(255),
    username VARCHAR(255),
    details TEXT
  )`);

  await queryAsync(`CREATE TABLE IF NOT EXISTS general_collections (
    collection_key VARCHAR(255) PRIMARY KEY,
    data_json LONGTEXT
  )`);

  await queryAsync(`CREATE TABLE IF NOT EXISTS exam_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trainee_name VARCHAR(255),
    rank VARCHAR(255),
    code VARCHAR(255),
    course_name VARCHAR(255),
    exam_name VARCHAR(255),
    start_time VARCHAR(255),
    end_time VARCHAR(255),
    score DOUBLE,
    status VARCHAR(255),
    pass_status VARCHAR(255),
    duration INTEGER,
    examiner VARCHAR(255),
    passing_score INTEGER DEFAULT 80,
    questions_json LONGTEXT,
    user_answers_json LONGTEXT,
    hand_raised INT DEFAULT 0,
    hand_approved INT DEFAULT 0,
    bypass_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await queryAsync(`CREATE TABLE IF NOT EXISTS exam_errors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trainee_name VARCHAR(255),
    exam_name VARCHAR(255),
    error_message TEXT,
    stack_trace TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await queryAsync(`CREATE TABLE IF NOT EXISTS attendance_books (
    book_id VARCHAR(255) PRIMARY KEY,
    book_name VARCHAR(255),
    status VARCHAR(255) DEFAULT 'closed',
    updated_by VARCHAR(255),
    room_image LONGTEXT,
    course_type VARCHAR(255) DEFAULT 'أساسية',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);

  await queryAsync(`CREATE TABLE IF NOT EXISTS attendance_book_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    book_id VARCHAR(255),
    book_name VARCHAR(255),
    action VARCHAR(255),
    operator VARCHAR(255),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await queryAsync(`CREATE TABLE IF NOT EXISTS attendance_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    book_id VARCHAR(255),
    book_name VARCHAR(255),
    user_id VARCHAR(255),
    username VARCHAR(255),
    display_name VARCHAR(255),
    rank VARCHAR(255),
    code VARCHAR(255),
    status VARCHAR(255) DEFAULT 'present',
    notes TEXT,
    room_image LONGTEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // Column addition checks for schema migrations
  try {
    await queryAsync(`ALTER TABLE users ADD COLUMN avatar_url VARCHAR(255)`);
    await queryAsync(`ALTER TABLE users ADD COLUMN banner_url VARCHAR(255)`);
    await queryAsync(`ALTER TABLE users ADD COLUMN last_sync TIMESTAMP NULL`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE login_logs ADD COLUMN avatar_url VARCHAR(255)`);
    await queryAsync(`ALTER TABLE login_logs ADD COLUMN last_sync TIMESTAMP NULL`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_results ADD COLUMN discord_id VARCHAR(255)`);
    await queryAsync(`ALTER TABLE exam_results ADD COLUMN badge_code VARCHAR(255)`);
    await queryAsync(`ALTER TABLE exam_results ADD COLUMN attempt_count INTEGER DEFAULT 1`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_attempts ADD COLUMN discord_id VARCHAR(255)`);
    await queryAsync(`ALTER TABLE exam_attempts ADD COLUMN badge_code VARCHAR(255)`);
    await queryAsync(`ALTER TABLE exam_attempts ADD COLUMN attempt_count INTEGER DEFAULT 1`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_results ADD COLUMN questions_json LONGTEXT`);
    await queryAsync(`ALTER TABLE exam_results ADD COLUMN user_answers_json LONGTEXT`);
    await queryAsync(`ALTER TABLE exam_results ADD COLUMN passing_score INTEGER DEFAULT 80`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_results ADD COLUMN hand_raised INT DEFAULT 0`);
    await queryAsync(`ALTER TABLE exam_results ADD COLUMN hand_approved INT DEFAULT 0`);
    await queryAsync(`ALTER TABLE exam_results ADD COLUMN bypass_count INT DEFAULT 0`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_attempts ADD COLUMN questions_json LONGTEXT`);
    await queryAsync(`ALTER TABLE exam_attempts ADD COLUMN user_answers_json LONGTEXT`);
    await queryAsync(`ALTER TABLE exam_attempts ADD COLUMN passing_score INTEGER DEFAULT 80`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_attempts ADD COLUMN hand_raised INT DEFAULT 0`);
    await queryAsync(`ALTER TABLE exam_attempts ADD COLUMN hand_approved INT DEFAULT 0`);
    await queryAsync(`ALTER TABLE exam_attempts ADD COLUMN bypass_count INT DEFAULT 0`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE attendance_records ADD COLUMN room_image TEXT`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE attendance_books ADD COLUMN course_type VARCHAR(255) DEFAULT 'أساسية'`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE attendance_books MODIFY COLUMN room_image LONGTEXT`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE exam_violations MODIFY COLUMN violation_time VARCHAR(255)`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE retake_requests ADD COLUMN user_id VARCHAR(255)`);
  } catch(e) {}
  try {
    await queryAsync(`ALTER TABLE retake_requests ADD COLUMN exam_name VARCHAR(255)`);
  } catch(e) {}

  console.log('✅ MySQL Schema initialization completed.');
}

function initializeSqliteSchema(sqliteDb) {
  // 1. users table
  sqliteDb.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    discord_id TEXT,
    username TEXT,
    display_name TEXT,
    global_name TEXT,
    avatar TEXT,
    banner TEXT,
    avatar_url TEXT,
    banner_url TEXT,
    last_sync TEXT,
    role TEXT,
    rank TEXT,
    department TEXT,
    code TEXT,
    status TEXT DEFAULT 'active',
    is_manual_role INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  )`, () => {
    // Migrate: Add columns if not already present
    sqliteDb.run("ALTER TABLE users ADD COLUMN code TEXT", () => {});
    sqliteDb.run("ALTER TABLE users ADD COLUMN avatar_url TEXT", () => {});
    sqliteDb.run("ALTER TABLE users ADD COLUMN banner_url TEXT", () => {});
    sqliteDb.run("ALTER TABLE users ADD COLUMN last_sync TEXT", () => {});
    sqliteDb.run("ALTER TABLE users ADD COLUMN global_name TEXT", () => {});
    sqliteDb.run("ALTER TABLE users ADD COLUMN is_manual_role INTEGER DEFAULT 0", () => {});
    sqliteDb.run("ALTER TABLE users ADD COLUMN real_name TEXT", () => {});
  });

  // 2. login_logs table
  sqliteDb.run(`CREATE TABLE IF NOT EXISTS login_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    discord_id TEXT,
    ip_address TEXT,
    device TEXT,
    browser TEXT,
    status TEXT,
    avatar_url TEXT,
    last_sync TEXT,
    timestamp TEXT DEFAULT (datetime('now'))
  )`, () => {
    sqliteDb.run("ALTER TABLE login_logs ADD COLUMN avatar_url TEXT", () => {});
    sqliteDb.run("ALTER TABLE login_logs ADD COLUMN last_sync TEXT", () => {});
  });

  // 3. discord_links table
  sqliteDb.run(`CREATE TABLE IF NOT EXISTS discord_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    discord_id TEXT,
    username TEXT,
    avatar TEXT,
    banner TEXT,
    badges TEXT,
    linked_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  // 3b. discord_accounts table
  sqliteDb.run(`CREATE TABLE IF NOT EXISTS discord_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE,
    discord_id TEXT UNIQUE,
    username TEXT,
    avatar TEXT,
    banner TEXT,
    badges TEXT,
    linked_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  // 4. courses table
  sqliteDb.run(`CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    course_name TEXT,
    description TEXT,
    instructors TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    status TEXT DEFAULT 'active'
  )`);

  // 5. exams table
  sqliteDb.run(`CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,
    exam_name TEXT,
    course_name TEXT,
    questions_count INTEGER,
    passing_score INTEGER,
    status TEXT DEFAULT 'closed',
    questions_json TEXT,
    details_json TEXT
  )`);

  // 6. exam_results table (exam_attempts renamed/copied)
  sqliteDb.run(`CREATE TABLE IF NOT EXISTS exam_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    trainee_name TEXT,
    rank TEXT,
    code TEXT,
    discord_id TEXT,
    badge_code TEXT,
    attempt_count INTEGER DEFAULT 1,
    course_name TEXT,
    exam_name TEXT,
    score REAL,
    pass_status TEXT,
    start_time TEXT,
    end_time TEXT,
    duration INTEGER,
    status TEXT,
    examiner TEXT,
    passing_score INTEGER DEFAULT 80,
    questions_json TEXT,
    user_answers_json TEXT,
    hand_raised INTEGER DEFAULT 0,
    hand_approved INTEGER DEFAULT 0,
    bypass_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`, () => {
    // Add columns if they do not exist
    sqliteDb.run("ALTER TABLE exam_results ADD COLUMN discord_id TEXT", () => {});
    sqliteDb.run("ALTER TABLE exam_results ADD COLUMN badge_code TEXT", () => {});
    sqliteDb.run("ALTER TABLE exam_results ADD COLUMN attempt_count INTEGER DEFAULT 1", () => {});
    sqliteDb.run("ALTER TABLE exam_results ADD COLUMN questions_json TEXT", () => {});
    sqliteDb.run("ALTER TABLE exam_results ADD COLUMN user_answers_json TEXT", () => {});
    sqliteDb.run("ALTER TABLE exam_results ADD COLUMN passing_score INTEGER DEFAULT 80", () => {});
    sqliteDb.run("ALTER TABLE exam_results ADD COLUMN hand_raised INTEGER DEFAULT 0", () => {});
    sqliteDb.run("ALTER TABLE exam_results ADD COLUMN hand_approved INTEGER DEFAULT 0", () => {});
    sqliteDb.run("ALTER TABLE exam_results ADD COLUMN bypass_count INTEGER DEFAULT 0", () => {});

    // Migrate existing exam_attempts data to exam_results if any
    sqliteDb.get("SELECT COUNT(*) as cnt FROM exam_results", (err, row) => {
      if (!err && row && row.cnt === 0) {
        sqliteDb.run(`INSERT INTO exam_results (id, trainee_name, rank, code, course_name, exam_name, start_time, end_time, score, status, pass_status, duration, examiner, created_at)
                SELECT id, trainee_name, rank, code, course_name, exam_name, start_time, end_time, score, status, pass_status, duration, examiner, created_at
                FROM exam_attempts`, (migErr) => {
          if (!migErr) console.log('✅ Migrated attempts from exam_attempts to exam_results');
        });
      }
    });
  });

  // 7. retake_requests table
  sqliteDb.run(`CREATE TABLE IF NOT EXISTS retake_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    trainee_name TEXT,
    rank TEXT,
    code TEXT,
    course_name TEXT,
    exam_name TEXT,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    request_time TEXT DEFAULT (datetime('now')),
    approved_by TEXT,
    previous_score REAL,
    exam_id TEXT
  )`, () => {
    sqliteDb.run("ALTER TABLE retake_requests ADD COLUMN user_id TEXT", () => {});
    sqliteDb.run("ALTER TABLE retake_requests ADD COLUMN exam_name TEXT", () => {});
  });

  // 8. exam_violations table
  sqliteDb.run(`CREATE TABLE IF NOT EXISTS exam_violations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    trainee_name TEXT,
    rank TEXT,
    code TEXT,
    course_name TEXT,
    violation_type TEXT,
    violation_time TEXT DEFAULT (datetime('now')),
    details TEXT,
    exam_id TEXT
  )`);

  // 9. audit_logs table
  sqliteDb.run(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_name TEXT,
    operator TEXT,
    timestamp TEXT DEFAULT (datetime('now')),
    old_data TEXT,
    new_data TEXT,
    action_type TEXT,
    username TEXT,
    details TEXT
  )`);

  // 10. general_collections table
  sqliteDb.run(`CREATE TABLE IF NOT EXISTS general_collections (
    collection_key TEXT PRIMARY KEY,
    data_json TEXT
  )`);

  // Keep legacy exam_attempts definition just in case or for safety
  sqliteDb.run(`CREATE TABLE IF NOT EXISTS exam_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trainee_name TEXT,
    rank TEXT,
    code TEXT,
    discord_id TEXT,
    badge_code TEXT,
    attempt_count INTEGER DEFAULT 1,
    course_name TEXT,
    exam_name TEXT,
    start_time TEXT,
    end_time TEXT,
    score REAL,
    status TEXT,
    pass_status TEXT,
    duration INTEGER,
    examiner TEXT,
    passing_score INTEGER DEFAULT 80,
    questions_json TEXT,
    user_answers_json TEXT,
    hand_raised INTEGER DEFAULT 0,
    hand_approved INTEGER DEFAULT 0,
    bypass_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`, () => {
    sqliteDb.run("ALTER TABLE exam_attempts ADD COLUMN discord_id TEXT", () => {});
    sqliteDb.run("ALTER TABLE exam_attempts ADD COLUMN badge_code TEXT", () => {});
    sqliteDb.run("ALTER TABLE exam_attempts ADD COLUMN attempt_count INTEGER DEFAULT 1", () => {});
    sqliteDb.run("ALTER TABLE exam_attempts ADD COLUMN questions_json TEXT", () => {});
    sqliteDb.run("ALTER TABLE exam_attempts ADD COLUMN user_answers_json TEXT", () => {});
    sqliteDb.run("ALTER TABLE exam_attempts ADD COLUMN passing_score INTEGER DEFAULT 80", () => {});
    sqliteDb.run("ALTER TABLE exam_attempts ADD COLUMN hand_raised INTEGER DEFAULT 0", () => {});
    sqliteDb.run("ALTER TABLE exam_attempts ADD COLUMN hand_approved INTEGER DEFAULT 0", () => {});
    sqliteDb.run("ALTER TABLE exam_attempts ADD COLUMN bypass_count INTEGER DEFAULT 0", () => {});
  });

  // 11. exam_errors table
  sqliteDb.run(`CREATE TABLE IF NOT EXISTS exam_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trainee_name TEXT,
    exam_name TEXT,
    error_message TEXT,
    stack_trace TEXT,
    timestamp TEXT DEFAULT (datetime('now'))
  )`);

  // 12. attendance_books table
  sqliteDb.run(`CREATE TABLE IF NOT EXISTS attendance_books (
    book_id TEXT PRIMARY KEY,
    book_name TEXT,
    status TEXT DEFAULT 'closed',
    updated_by TEXT,
    room_image TEXT,
    course_type TEXT DEFAULT 'أساسية',
    updated_at TEXT DEFAULT (datetime('now'))
  )`, () => {
    sqliteDb.run("ALTER TABLE attendance_books ADD COLUMN room_image TEXT", () => {
      sqliteDb.run("ALTER TABLE attendance_books ADD COLUMN course_type TEXT DEFAULT 'أساسية'", () => {
        const sqliteWrapper = {
          run(sql, params, cb) { sqliteDb.run(sql, params, cb); },
          get(sql, params, cb) { sqliteDb.get(sql, params, cb); },
          all(sql, params, cb) { sqliteDb.all(sql, params, cb); }
        };
        initializeAttendanceBooks(sqliteWrapper);
      });
    });
  });

  // 13. attendance_book_logs table
  sqliteDb.run(`CREATE TABLE IF NOT EXISTS attendance_book_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id TEXT,
    book_name TEXT,
    action TEXT,
    operator TEXT,
    timestamp TEXT DEFAULT (datetime('now'))
  )`);

  // 14. attendance_records table
  sqliteDb.run(`CREATE TABLE IF NOT EXISTS attendance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id TEXT,
    book_name TEXT,
    user_id TEXT,
    username TEXT,
    display_name TEXT,
    rank TEXT,
    code TEXT,
    status TEXT DEFAULT 'present',
    notes TEXT,
    room_image TEXT,
    timestamp TEXT DEFAULT (datetime('now'))
  )`, () => {
    sqliteDb.run("ALTER TABLE attendance_records ADD COLUMN room_image TEXT", () => {});
  });
}

function initializeAttendanceBooks(targetDb = db) {
  const defaultBooks = [
    { id: 'ops', name: 'دفتر حضور مدربين دورة العمليات' },
    { id: 'traffic', name: 'دفتر حضور مدربين دورة المرور' },
    { id: 'roads', name: 'دفتر حضور مدربين دورة امن الطرق' },
    { id: 'aviation', name: 'دفتر حضور مدربين دورة الطيران الامني' },
    { id: 'district_officers', name: 'دفتر حضور مدربين دورة ضباط المناطق' },
    { id: 'special_tasks', name: 'دفتر حضور مدربين دورة المهمات والواجبات الخاصه' },
    { id: 'narcotics', name: 'دفتر حضور مدربين دورة مكافحة المخدرات' }
  ];

  defaultBooks.forEach(book => {
    targetDb.get('SELECT book_id FROM attendance_books WHERE book_id = ?', [book.id], (err, row) => {
      if (err) {
        console.error(`Error checking attendance book ${book.id}:`, err);
        return;
      }
      if (!row) {
        targetDb.run('INSERT INTO attendance_books (book_id, book_name, status, updated_by) VALUES (?, ?, ?, ?)',
          [book.id, book.name, 'closed', 'system'],
          (insertErr) => {
            if (insertErr) {
              console.error(`Error seeding attendance book ${book.id}:`, insertErr);
            } else {
              console.log(`Seeded attendance book: ${book.name}`);
            }
          }
        );
      }
    });
  });
  updateOpsExamDescription(targetDb);
  seedExamsTableIfEmpty(targetDb);
}

function updateOpsExamDescription(targetDb = db) {
  const examId = 'exam_004';
  const newCategory = 'جندي فما فوق';
  const newDesc = `تنويه هام:

* في حال الخروج من الموقع أو إغلاق صفحة الاختبار أثناء تأدية الاختبار، سيتم اعتبار المتقدم راسباً.
* يجب الالتزام بالموعد المحدد للاختبار وإرساله قبل انتهاء الوقت المخصص.
* يتحمل المتقدم مسؤولية التأكد من استقرار الاتصال بالإنترنت وعدم مغادرة صفحة الاختبار حتى إتمام عملية الإرسال بنجاح.

مع تحيات
الإدارة العامة لشؤون تدريب الأمن العام`;

  targetDb.get('SELECT details_json FROM exams WHERE id = ?', [examId], (err, row) => {
    if (err) {
      console.error('[DB Upgrade] Error selecting exam details:', err);
      return;
    }
    if (row) {
      let details = {};
      try {
        details = JSON.parse(row.details_json || '{}');
      } catch (ex) {}
      
      details.description = newDesc;
      const updatedDetailsJson = JSON.stringify(details);

      targetDb.run('UPDATE exams SET course_name = ?, details_json = ? WHERE id = ?',
        [newCategory, updatedDetailsJson, examId],
        (updateErr) => {
          if (updateErr) {
            console.error('[DB Upgrade] Error updating exam_004:', updateErr);
          } else {
            console.log('✅ Successfully updated exam_004 description and category in DB.');
          }
        }
      );
    }
  });
}

function seedExamsTableIfEmpty(targetDb = db) {
  targetDb.get("SELECT COUNT(*) as cnt FROM exams", [], (err, row) => {
    if (err) {
      console.error('[DB Seed] Failed to count exams:', err.message);
      return;
    }
    const count = row ? (row.cnt || 0) : 0;
    if (count <= 1) { // If empty or only has 1 exam (the Operations exam), let's seed all 9 exams!
      console.log(`[DB Seed] Exams table has ${count} rows. Seeding 9 default exams...`);
      const EXAMS_FILE = path.join(PUBLIC_DIR, 'assets', 'data', 'exams.json');
      if (fs.existsSync(EXAMS_FILE)) {
        try {
          const exams = JSON.parse(fs.readFileSync(EXAMS_FILE, 'utf8'));
          exams.forEach(e => {
            const qJson = JSON.stringify(e.questions || []);
            const details = { ...e };
            delete details.questions;
            delete details.id;
            delete details.title;
            delete details.category;
            delete details.questionsCountToShow;
            delete details.passingScore;
            delete details.isOpen;
            const detJson = JSON.stringify(details);

            targetDb.run(
              `INSERT OR REPLACE INTO exams (id, exam_name, course_name, questions_count, passing_score, status, questions_json, details_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                e.id,
                e.title,
                e.category,
                e.questionsCountToShow || 0,
                e.passingScore || 0,
                e.isOpen ? 'open' : 'closed',
                qJson,
                detJson
              ],
              (insertErr) => {
                if (insertErr) console.error(`[DB Seed] Failed to insert exam ${e.title}:`, insertErr.message);
              }
            );
          });
          console.log('[DB Seed] Successfully queued default exams insertion!');
        } catch (ex) {
          console.error('[DB Seed] Failed to parse exams.json for seeding:', ex.message);
        }
      } else {
        console.warn('[DB Seed] exams.json not found at:', EXAMS_FILE);
      }
    } else {
      console.log(`[DB Seed] Exams table already has ${count} exams. No seeding required.`);
    }
  });
}

function sendDiscordChannelMessage(channelId, payload, botToken) {
  return new Promise((resolve, reject) => {
    if (!botToken) {
      return reject(new Error('Discord Bot Token not configured.'));
    }
    const postData = JSON.stringify(payload);
    const options = {
      hostname: 'discord.com',
      path: `/api/v10/channels/${channelId}/messages`,
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve(body);
          }
        } else {
          reject(new Error(`Discord API status ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

async function sendRecruitmentDecisionWebhook(application, newStatus, operatorName = 'شؤون التجنيد') {
  const ACCEPT_WEBHOOK = 'https://discord.com/api/webhooks/1520733141013364847/jgF85eVWN3gIT3Vo_Ln6x5qtVguFzMcbDWZh7u80rczQSBnVNCmxXpBHkg8OiH3XHKTO';
  const REJECT_WEBHOOK = 'https://discord.com/api/webhooks/1520734010605568090/Kqdh5ZgsH-qCMmrtXeIoaZKTmY7f79tjQ1Hs0VomyT8Ve17M4ZL5CSD0y5Ak-Un-Brtq';

  const targetWebhook = newStatus === 'approved' ? ACCEPT_WEBHOOK : REJECT_WEBHOOK;
  const isApproved = newStatus === 'approved';

  // Resolve numeric Discord ID for applicant
  const rawApplicant = application.discordId || application.userId || application.username || '';
  const resolvedApplicantId = await resolveDiscordUserId(rawApplicant);
  let userMention = resolvedApplicantId ? `<@${resolvedApplicantId}>` : (rawApplicant ? `<@${String(rawApplicant).replace(/^@/, '')}>` : '—');

  // Resolve numeric Discord ID for operator
  const resolvedOpId = await resolveDiscordUserId(operatorName);
  let operatorMention = resolvedOpId ? `<@${resolvedOpId}>` : (operatorName ? `<@${String(operatorName).replace(/^@/, '')}>` : '<@شؤون التجنيد>');

  const embed = {
    title: isApproved ? '✅ قبول نهائي | شؤون التجنيد والقبول' : '❌ اعتذار ورفض طلب | شؤون التجنيد والقبول',
    color: isApproved ? 3066993 : 15158332,
    fields: [
      { name: '👤 اسم المتقدم', value: `**${application.fullName || '—'}**`, inline: true },
      { name: '🆔 معرّف الديسكورد', value: `**${userMention}**`, inline: true },
      { name: '🏢 القطاع', value: `**${application.sector || 'الأمن العام'}**`, inline: true },
      { name: '📊 درجة اختبار القبول', value: `**${application.examScore || 0} / ${application.examTotal || 15}**`, inline: true },
      { name: '📷 صورة الخبرة داخل المدينة', value: application.experienceImage ? '✅ مرفقة (عرض في لوحة التحكم)' : '❌ غير مرفقة', inline: true },
      { name: '👮 المسؤول عن الاجراء', value: `**${operatorMention}**`, inline: true },
      { name: '📝 نتيجة الاجراء', value: isApproved ? '**تم القبول المبدئي في قطاع الأمن العام. يرجى التواجد في الادارة العامه ورومات التوظيف.**' : '**نعتذر عن عدم قبول الطلب لهذه الدورة لعدم استيفاء الشروط أو اكتمال الشاغر.**', inline: false }
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: 'شؤون التجنيد والقبول • القيادة العامة للأمن العام - ( ريان بن محمد )'
    }
  };

  const payload = JSON.stringify({
    content: isApproved ? `**🔔 القبول النهائي للمتقدم: ${userMention}**` : `**🔔 نعتذر عن قبول المتقدم: ${userMention}**`,
    embeds: [embed]
  });
  const parsedUrl = new URL(targetWebhook);
  const options = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => console.log(`[Recruitment Webhook] ${newStatus} sent. Status: ${res.statusCode}`));
  });
  req.on('error', err => console.error('[Recruitment Webhook Error]', err));
  req.write(payload);
  req.end();
}

function sendRecruitmentDecisionDM(userId, fullName, sector, newStatus, examScore = 0, examTotal = 15) {
  return new Promise(async (resolve) => {
    const token = config.discordToken;
    if (!token || !userId) {
      console.warn('[Discord Decision DM] Missing bot token or userId:', userId);
      return resolve(false);
    }

    const cleanUserId = await resolveDiscordUserId(userId);
    if (!cleanUserId) {
      console.warn('[Discord Decision DM] Could not resolve numeric Discord ID for:', userId);
      return resolve(false);
    }

    const postData = JSON.stringify({ recipient_id: cleanUserId });
    const reqOptions = {
      hostname: 'discord.com',
      path: '/api/v10/users/@me/channels',
      method: 'POST',
      headers: {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const channel = JSON.parse(data);
          if (!channel.id) {
            console.warn('[Discord Decision DM] Could not create DM channel for user:', cleanUserId, data);
            return resolve(false);
          }

          const isApproved = newStatus === 'approved';
          const embed = {
            title: isApproved ? '✅ قبول نهائي | شؤون التجنيد والقبول' : '❌ اعتذار ورفض طلب | شؤون التجنيد والقبول',
            description: isApproved 
              ? 'تهانينا! لقد تم **قبولك المبدئي** في قطاع الأمن العام.\n\nيرجى التواجد في رومات المقابلة الشخصية لاستكمال الإجراءات.' 
              : 'نعتذر منك، لم يتم قبول طلبك في هذه الدورة لعدم استيفاء الشروط أو اكتمال الشاغر.\n\nنتمنى لك التوفيق في الدورات القادمة.',
            color: isApproved ? 3066993 : 15158332,
            fields: [
              { name: '👤 اسم المتقدم', value: fullName || '—', inline: true },
              { name: '🏢 القطاع / التخصص', value: sector || 'الأمن العام', inline: true },
              { name: '📊 درجة اختبار القبول', value: `${examScore} / ${examTotal}`, inline: true },
              { name: '⏳ حالة الطلب', value: isApproved ? 'مقبول مبدئياً' : 'مرفوض', inline: false }
            ],
            timestamp: new Date().toISOString(),
            footer: {
              text: 'شؤون التجنيد والقبول • القيادة العامة للأمن العام - ( ريان بن محمد )'
            }
          };

          const msgPayload = {
            content: isApproved 
              ? `🔔 **تهانينا للمتقدم ${fullName}! تم قبولك المبدئي في قطاع الأمن العام.**` 
              : `🔔 **المتقدم ${fullName}، نعتذر عن قبول طلب تجنيدك لعدم استيفاء الشروط.**`,
            embeds: [embed]
          };

          const msgData = JSON.stringify(msgPayload);
          const msgOptions = {
            hostname: 'discord.com',
            path: `/api/v10/channels/${channel.id}/messages`,
            method: 'POST',
            headers: {
              'Authorization': `Bot ${token}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(msgData)
            }
          };

          const msgReq = https.request(msgOptions, (msgRes) => {
            let msgResult = '';
            msgRes.on('data', chunk => msgResult += chunk);
            msgRes.on('end', () => {
              if (msgRes.statusCode === 200 || msgRes.statusCode === 201) {
                console.log('✅ [Discord Decision DM] Sent decision DM to user:', cleanUserId);
                resolve(true);
              } else {
                console.warn('❌ [Discord Decision DM] Failed to send message to channel:', channel.id, msgResult);
                resolve(false);
              }
            });
          });

          msgReq.on('error', err => {
            console.error('[Discord Decision DM Error] Sending message error:', err);
            resolve(false);
          });
          msgReq.write(msgData);
          msgReq.end();
        } catch (e) {
          console.error('[Discord Decision DM Error] Parse error:', e);
          resolve(false);
        }
      });
    });

    req.on('error', err => {
      console.error('[Discord Decision DM Error] Create channel error:', err);
      resolve(false);
    });
    req.write(postData);
    req.end();
  });
}


function sendAttendanceReportToDiscord(bookName, operatorStr, roomImage, records, courseType = 'أساسية', trainingMembers = []) {
  const WEBHOOK_URL = 'https://discord.com/api/webhooks/1519343011417559041/kZrlK9SJX5afM8G8u_uFxhnsTjHQpncdZ8BwyZ89Z_a1VX5QPeWKD_Rc5_Ee4Zj3Vo4h';

  console.log('[Discord Report] Sending report via webhook for book:', bookName);

  let cleanOp = operatorStr || '';
  if (cleanOp) {
    if (!cleanOp.startsWith('<@')) {
      const opDigits = String(cleanOp).replace(/\D/g, '');
      cleanOp = opDigits.length >= 17 ? `<@${opDigits}>` : `<@${cleanOp}>`;
    }
  } else {
    cleanOp = '—';
  }

  const recs = records || [];

  // Filter expected members based on the book's training course type
  let expectedMembers = [];
  if ((trainingMembers || []).length > 0) {
    const nameLower = String(bookName || '').toLowerCase();
    let positionKeywords = [];
    
    if (nameLower.includes('طيران')) {
      positionKeywords = ['طيران'];
    } else if (nameLower.includes('عمليات')) {
      positionKeywords = ['عمليات'];
    } else if (nameLower.includes('مرور')) {
      positionKeywords = ['مرور'];
    } else if (nameLower.includes('طرق')) {
      positionKeywords = ['طرق'];
    } else if (nameLower.includes('مهمات') || nameLower.includes('واجبات')) {
      positionKeywords = ['مهمات'];
    } else if (nameLower.includes('مخدرات')) {
      positionKeywords = ['مخدرات'];
    } else if (nameLower.includes('مناطق')) {
      positionKeywords = ['مناطق'];
    } else if (nameLower.includes('بحث') || nameLower.includes('تحري')) {
      positionKeywords = ['بحث', 'تحري'];
    } else if (nameLower.includes('علوم') || nameLower.includes('كلية')) {
      positionKeywords = ['علوم', 'كلية'];
    }

    if (positionKeywords.length > 0) {
      expectedMembers = trainingMembers.filter(m => {
        const pos = String(m.position || '').toLowerCase();
        return positionKeywords.some(kw => pos.includes(kw));
      });
    } else {
      expectedMembers = trainingMembers;
    }
  }

  // Helper to get Discord mention string
  const getDiscordMention = (rawId, nameFallback) => {
    const discordId = rawId ? String(rawId).replace(/\D/g, '') : '';
    if (discordId.length >= 17) return `<@${discordId}>`;
    if (String(rawId || '').startsWith('<@')) return rawId;
    return nameFallback ? `@${nameFallback}` : `<@${rawId || 'عضو'}>`;
  };

  // Helper to check if an expected member attended
  const memberAttended = (expMem) => {
    const expDiscord = expMem.discord ? String(expMem.discord).replace(/\D/g, '') : '';
    const expBadge = expMem.badge ? String(expMem.badge).replace(/\s+/g, '').toLowerCase() : '';
    const expName = expMem.name ? expMem.name.trim() : '';

    return recs.some(r => {
      const rDiscord = String(r.user_id || r.discord || '').replace(/\D/g, '');
      const rBadge = String(r.code || '').replace(/\s+/g, '').toLowerCase();
      const rName = String(r.display_name || r.username || '').trim();

      if (expDiscord && rDiscord && expDiscord === rDiscord) return true;
      if (expBadge && rBadge && expBadge === rBadge) return true;
      if (expName && rName && expName === rName) return true;
      return false;
    });
  };

  // 1. Absent Members (الغير حاضرين)
  const absentMembers = expectedMembers.filter(m => !memberAttended(m));
  let absentLines = '';
  if (absentMembers.length > 0) {
    if (absentMembers.length > 50) {
      absentLines = absentMembers.slice(0, 50).map(m => getDiscordMention(m.discord || m.id, m.name)).join('\n') + `\n... و ${absentMembers.length - 50} آخرين`;
    } else {
      absentLines = absentMembers.map(m => getDiscordMention(m.discord || m.id, m.name)).join('\n');
    }
  } else {
    absentLines = 'لا يوجد غياب (الجميع حاضرين)';
  }

  // 2. Substitute Members (سد العجز) - Attendees not in expectedMembers
  const substituteRecords = recs.filter(r => {
    const rDiscord = String(r.user_id || r.discord || '').replace(/\D/g, '');
    const rBadge = String(r.code || '').replace(/\s+/g, '').toLowerCase();
    const rName = String(r.display_name || r.username || '').trim();

    return !(expectedMembers || []).some(exp => {
      const expDiscord = exp.discord ? String(exp.discord).replace(/\D/g, '') : '';
      const expBadge = exp.badge ? String(exp.badge).replace(/\s+/g, '').toLowerCase() : '';
      const expName = exp.name ? exp.name.trim() : '';

      if (expDiscord && rDiscord && expDiscord === rDiscord) return true;
      if (expBadge && rBadge && expBadge === rBadge) return true;
      if (expName && rName && expName === rName) return true;
      return false;
    });
  });

  let substituteLines = '';
  if (substituteRecords.length > 0) {
    if (substituteRecords.length > 50) {
      substituteLines = substituteRecords.slice(0, 50).map(r => getDiscordMention(r.user_id || r.discord, r.display_name || r.username)).join('\n') + `\n... و ${substituteRecords.length - 50} آخرين`;
    } else {
      substituteLines = substituteRecords.map(r => getDiscordMention(r.user_id || r.discord, r.display_name || r.username)).join('\n');
    }
  } else {
    substituteLines = 'لا يوجد سد عجز';
  }

  // 3. All Attendees (أسماء الحاضرين) - Show ALL who attended regardless of substitute status
  let attendeesList = '';
  if (recs.length > 0) {
    const attendeesMapped = recs.map((r) => {
      if (r.display_name && String(r.display_name).startsWith('<@')) return r.display_name;
      const rawId = r.user_id || r.discord || r.display_name;
      const cleanId = String(rawId).replace(/\D/g, '');
      if (cleanId.length >= 17) return `<@${cleanId}>`;
      if (String(rawId).startsWith('<@')) return rawId;
      return `<@${rawId}>`;
    });
    if (attendeesMapped.length > 50) {
      attendeesList = attendeesMapped.slice(0, 50).join('\n') + `\n... و ${attendeesMapped.length - 50} آخرين`;
    } else {
      attendeesList = attendeesMapped.join('\n');
    }
  } else {
    attendeesList = 'لا يوجد حضور';
  }

  const countVal = recs.length;
  const reportDescription = `**  تقرير حضور المدربين \n الدورة / الدفتر \n${bookName}\n تصنيف الدورة\n${courseType}\n المسؤول عن التحضير \n${cleanOp}\n عدد الحاضرين \n${countVal}\n أسماء الحاضرين \n${attendeesList}\n\n ❌ الغير حاضرين \n${absentLines}\n\n 🔄 سد العجز \n${substituteLines}**`;

  const embed = {
    description: reportDescription,
    color: 13214247, // Gold #c9a227
    timestamp: new Date().toISOString(),
    footer: {
      text: 'شؤون تدريب الأمن العام • مدينة الـ 90 - ( ريان بن محمد )'
    }
  };

  if (roomImage && (roomImage.startsWith('http://') || roomImage.startsWith('https://'))) {
    embed.image = { url: roomImage };
  }

  const payload = JSON.stringify({ embeds: [embed] });

  // Helper: send webhook with automatic retry on 429 rate limit
  function doSendWebhook(retryCount) {
    if (retryCount > 5) {
      console.error('❌ Gave up sending Discord webhook after 5 retries for:', bookName);
      logSystemActivity('discord_webhook_error', 'النظام', `فشل إرسال تقرير حضور "${bookName}" بعد 5 محاولات (Rate Limited).`);
      return;
    }
    const parsedUrl = new URL(WEBHOOK_URL);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 204) {
          console.log(`✅ Attendance report sent to Discord successfully! (attempt ${retryCount + 1})`);
          logSystemActivity('discord_webhook_success', 'النظام', `تم إرسال تقرير حضور "${bookName}" إلى ديسكورد بنجاح.`);
        } else if (res.statusCode === 429) {
          // Rate limited — parse retry_after from Discord response or use fallback
          let retryAfterMs = 10000; // default 10s
          try {
            const parsed = JSON.parse(body);
            if (parsed.retry_after) retryAfterMs = Math.ceil(parsed.retry_after * 1000);
          } catch (e) {}
          console.warn(`⚠️ Discord rate limited (429). Retrying in ${retryAfterMs}ms... (attempt ${retryCount + 1})`);
          logSystemActivity('discord_webhook_retry', 'النظام', `تقرير حضور "${bookName}" محجوب مؤقتاً من ديسكورد (429). إعادة المحاولة خلال ${Math.ceil(retryAfterMs/1000)} ثانية (المحاولة ${retryCount + 1}).`);
          setTimeout(() => doSendWebhook(retryCount + 1), retryAfterMs);
        } else {
          console.error(`❌ Discord webhook error. Status: ${res.statusCode}, Body: ${body}`);
          logSystemActivity('discord_webhook_error', 'النظام', `فشل إرسال تقرير حضور "${bookName}" إلى ديسكورد. كود الحالة: ${res.statusCode}، الرد: ${body}`);
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ Failed to send Discord webhook:', err.message);
      logSystemActivity('discord_webhook_error', 'النظام', `فشل إرسال تقرير حضور "${bookName}" إلى ديسكورد. الخطأ: ${err.message}`);
    });

    req.write(payload);
    req.end();
  }

  doSendWebhook(0);
}

const sentExamNotifications = new Set();

function sendExamNotificationToDiscord(attempt) {
  if (!attempt || !attempt.id) return;
  const attemptKey = String(attempt.id);
  if (sentExamNotifications.has(attemptKey)) return;
  sentExamNotifications.add(attemptKey);
  
  if (sentExamNotifications.size > 1000) {
    const firstKey = sentExamNotifications.values().next().value;
    sentExamNotifications.delete(firstKey);
  }

  const PASS_CHANNEL_ID = '1523165844778254466';
  const FAIL_CHANNEL_ID = '1523165574874661005';

  const isPass = attempt.pass_status === 'نجاح';
  const targetChannel = isPass ? PASS_CHANNEL_ID : FAIL_CHANNEL_ID;

  const traineeName = attempt.trainee_name || 'غير معروف';
  const rank = attempt.rank || '—';
  const code = attempt.code || '—';
  const examName = attempt.exam_name || attempt.course_name || 'اختبار';
  const score = attempt.score !== undefined ? attempt.score : 0;
  const duration = attempt.duration || 0;
  const discordId = attempt.discord_id || '';
  
  const userMention = discordId ? `<@${discordId}>` : (code !== '—' ? `<@${code}>` : '—');

  const embed = {
    title: isPass ? '🎓 اجتياز اختبار جديد - ناجح' : '❌ عدم اجتياز اختبار - راسب',
    color: isPass ? 3066993 : 15158332,
    fields: [
      { name: '👤 الاسم', value: `**${traineeName}**`, inline: true },
      { name: '🎖️ الرتبة', value: rank, inline: true },
      { name: '🆔 المعرف / الكود', value: userMention, inline: true },
      { name: '📝 اسم الاختبار', value: examName, inline: true },
      { name: '📊 النتيجة', value: `**${score}%**`, inline: true },
      { name: '⏱️ مدة الاختبار', value: `${duration} دقيقة`, inline: true }
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: 'شؤون تدريب الأمن العام • نظام الاختبارات - ( ريان بن محمد )'
    }
  };

  sendDiscordChannelMessage(targetChannel, { embeds: [embed] }, config.discordToken)
    .then(() => console.log(`[Exam Discord Notify] Successfully sent exam result embed to channel ${targetChannel}`))
    .catch(err => console.error('[Exam Discord Notify Error] Failed to send exam result to Discord:', err.message));
}

async function resolveDiscordUserId(inputStr) {
  if (!inputStr) return null;
  const digitsOnly = String(inputStr).replace(/\D/g, '');
  if (digitsOnly.length >= 17) return digitsOnly;

  // Clean the username/input string from trailing decoration like " ->" or spaces/dashes
  let queryName = String(inputStr).replace(/^@/, '').trim();
  queryName = queryName.replace(/\s*->\s*$/, '').trim();
  queryName = queryName.replace(/[-\s>]+$/, '').trim();

  const cleanQuery = queryName.toLowerCase();
  const manualMappings = {
    'onlyryan': '1334568342345748565',
    '3gjo': '1334568342345748565',
    'z6tw': '1120142432554713261',
    'ifm711': '821825761673478144'
  };
  if (manualMappings[cleanQuery]) return manualMappings[cleanQuery];

  // 1. Search in local JSON cache (discord_users.json)
  try {
    const usersPath = path.join(__dirname, 'assets', 'data', 'discord_users.json');
    if (fs.existsSync(usersPath)) {
      const usersData = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
      for (const uid in usersData) {
        const u = usersData[uid];
        if (u.username && u.username.toLowerCase() === queryName.toLowerCase()) {
          return u.id;
        }
      }
      for (const uid in usersData) {
        const u = usersData[uid];
        if (
          (u.globalName && u.globalName.toLowerCase() === queryName.toLowerCase()) ||
          (u.globalName && u.globalName.toLowerCase().includes(queryName.toLowerCase()))
        ) {
          return u.id;
        }
      }
    }
  } catch (e) {
    console.error('Error searching discord_users.json:', e);
  }

  // 2. Search in Database
  try {
    const row = await new Promise((res) => {
      db.get(`SELECT id, discord FROM users WHERE username = ? OR display_name = ? OR discord = ? OR id = ? LIMIT 1`,
        [queryName, queryName, queryName, queryName], (err, r) => res(r));
    });
    if (row) {
      if (row.id && String(row.id).replace(/\D/g, '').length >= 17) return String(row.id).replace(/\D/g, '');
      if (row.discord && String(row.discord).replace(/\D/g, '').length >= 17) return String(row.discord).replace(/\D/g, '');
    }
  } catch (e) {}

  // 3. Search via Discord Guild Search API
  try {
    const token = config.discordToken;
    const guildId = config.guildId || '1272212444936404992';
    const searchRes = await new Promise((res) => {
      const options = {
        hostname: 'discord.com',
        path: `/api/v10/guilds/${guildId}/members/search?query=${encodeURIComponent(queryName)}&limit=1`,
        headers: { 'Authorization': `Bot ${token}` }
      };
      https.get(options, (r) => {
        let body = '';
        r.on('data', chunk => body += chunk);
        r.on('end', () => {
          try { res(JSON.parse(body)); } catch (e) { res(null); }
        });
      }).on('error', () => res(null));
    });

    if (Array.isArray(searchRes) && searchRes.length > 0 && searchRes[0].user && searchRes[0].user.id) {
      return searchRes[0].user.id;
    }
  } catch (e) {}

  return null;
}

function sendDiscordDM(userId, fullName, sector) {
  return new Promise(async (resolve) => {
    const token = config.discordToken;
    if (!token || !userId) {
      console.warn('[Discord DM] Missing bot token or userId:', userId);
      return resolve(false);
    }

    const cleanUserId = await resolveDiscordUserId(userId);
    if (!cleanUserId) {
      console.warn('[Discord DM] Could not resolve numeric Discord ID for:', userId);
      return resolve(false);
    }

    const postData = JSON.stringify({ recipient_id: cleanUserId });
    const reqOptions = {
      hostname: 'discord.com',
      path: '/api/v10/users/@me/channels',
      method: 'POST',
      headers: {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const channel = JSON.parse(data);
          if (!channel.id) {
            console.warn('[Discord DM] Could not create DM channel for user:', cleanUserId, data);
            return resolve(false);
          }

          const embed = {
            title: '🛡️ بوابة التجنيد والقبول | الأمن العام',
            description: 'تم إرسال طلبك بنجاح وهو الآن **بانتظار الاعتماد والمراجعة**.\n\nيرجى التواجد في التجنيد وفي الرومات المخصصة لمتابعة حالة قبولك وسير القبول الميداني.',
            color: 13214247, // Gold #c9a227
            fields: [
              { name: '👤 اسم المتقدم', value: fullName || '—', inline: true },
              { name: '🏢 القطاع / التخصص', value: sector || 'الأمن العام', inline: true },
              { name: '⏳ حالة الطلب', value: 'تم إرسال طلبك وبانتظار الاعتماد', inline: false }
            ],
            timestamp: new Date().toISOString(),
            footer: {
              text: 'شؤون التجنيد والقبول • القيادة العامة للأمن العام - ( ريان بن محمد )'
            }
          };

          const msgPayload = {
            content: `تم إرسال طلبك وبانتظار الاعتماد، يرجى التواجد في التجنيد وفي الرومات المخصصة.`,
            embeds: [embed]
          };

          const msgData = JSON.stringify(msgPayload);
          const msgOptions = {
            hostname: 'discord.com',
            path: `/api/v10/channels/${channel.id}/messages`,
            method: 'POST',
            headers: {
              'Authorization': `Bot ${token}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(msgData)
            }
          };

          const msgReq = https.request(msgOptions, (msgRes) => {
            let msgResult = '';
            msgRes.on('data', chunk => msgResult += chunk);
            msgRes.on('end', () => {
              if (msgRes.statusCode === 200 || msgRes.statusCode === 201) {
                console.log('✅ [Discord DM] Sent direct message to user:', cleanUserId);
                resolve(true);
              } else {
                console.warn('❌ [Discord DM] Failed to send message to channel:', channel.id, msgResult);
                resolve(false);
              }
            });
          });

          msgReq.on('error', err => {
            console.error('[Discord DM Error] Sending message error:', err);
            resolve(false);
          });
          msgReq.write(msgData);
          msgReq.end();
        } catch (e) {
          console.error('[Discord DM Error] Parse error:', e);
          resolve(false);
        }
      });
    });

    req.on('error', err => {
      console.error('[Discord DM Error] Create channel error:', err);
      resolve(false);
    });
    req.write(postData);
    req.end();
  });
}

let db;
let mysqlPool = null;
let globalSqliteDb = null;

function initializeSqliteConnection() {
  const DB_PATH = path.join(__dirname, 'assets', 'data', 'exam_archive.db');
  globalSqliteDb = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('❌ SQLite connection error:', err);
    } else {
      console.log('✅ SQLite DB connected at', DB_PATH);
      globalSqliteDb.configure('busyTimeout', 10000);
      globalSqliteDb.run('PRAGMA busy_timeout = 10000', (pragmaErr) => {
        if (pragmaErr) console.error('❌ Failed to set PRAGMA busy_timeout:', pragmaErr);
      });
      initializeSqliteSchema(globalSqliteDb);
    }
  });
}

function initializeSqlite() {
  if (!globalSqliteDb) {
    initializeSqliteConnection();
  }
  db = {
    run(sql, params, callback) { globalSqliteDb.run(sql, params, callback); },
    get(sql, params, callback) { globalSqliteDb.get(sql, params, callback); },
    all(sql, params, callback) { globalSqliteDb.all(sql, params, callback); },
    serialize(callback) { globalSqliteDb.serialize(callback); },
    prepare(sql) { return globalSqliteDb.prepare(sql); }
  };
}

function fallbackToSqlite(next) {
  if (isMysql) {
    console.warn('⚠️ MySQL query failed or connection lost. Switching to local SQLite database mode (exam_archive.db)...');
    isMysql = false;
    initializeSqlite();
  }
  if (isPostgres) {
    console.warn('⚠️ PostgreSQL query failed or connection lost. Switching to local SQLite database mode (exam_archive.db)...');
    isPostgres = false;
    initializeSqlite();
  }
  if (next) {
    next();
  }
}

function initializePostgresConnection() {
  const { Pool } = require('pg');
  const dbUrl = process.env.DATABASE_URL || config.databaseUrl;
  
  console.log('🔌 Cloud database mode: Connecting to PostgreSQL...');
  pgPool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false }
  });
  
  pgPool.on('error', (err) => {
    console.error('Unexpected error on PostgreSQL pool:', err);
    fallbackToSqlite();
  });
  
  isPostgres = true;
  
  db = {
    run(sql, params = [], callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      if (!isPostgres) {
        globalSqliteDb.run(sql, params, callback);
        return;
      }
      const pgSql = convertSqlToPostgres(sql);
      pgPool.query(pgSql, params, (err, res) => {
        if (err) {
          console.error(`PostgreSQL error on run: ${err.message}. Retrying query on SQLite...`);
          fallbackToSqlite(() => {
            globalSqliteDb.run(sql, params, callback);
          });
        } else {
          const context = {
            lastID: res.rows && res.rows[0] ? (res.rows[0].id || Object.values(res.rows[0])[0]) : null,
            changes: res.rowCount
          };
          if (callback) callback.call(context, null);
        }
      });
    },
    get(sql, params = [], callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      if (!isPostgres) {
        globalSqliteDb.get(sql, params, callback);
        return;
      }
      const pgSql = convertSqlToPostgres(sql);
      pgPool.query(pgSql, params, (err, res) => {
        if (err) {
          console.error(`PostgreSQL error on get: ${err.message}. Retrying query on SQLite...`);
          fallbackToSqlite(() => {
            globalSqliteDb.get(sql, params, callback);
          });
        } else {
          const row = res.rows && res.rows.length > 0 ? res.rows[0] : null;
          if (callback) callback(null, row);
        }
      });
    },
    all(sql, params = [], callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      if (!isPostgres) {
        globalSqliteDb.all(sql, params, callback);
        return;
      }
      const pgSql = convertSqlToPostgres(sql);
      pgPool.query(pgSql, params, (err, res) => {
        if (err) {
          console.error(`PostgreSQL error on all: ${err.message}. Retrying query on SQLite...`);
          fallbackToSqlite(() => {
            globalSqliteDb.all(sql, params, callback);
          });
        } else {
          if (callback) callback(null, res.rows || []);
        }
      });
    },
    serialize(callback) {
      if (callback) callback();
    },
    prepare(sql) {
      return {
        run(params = [], callback) {
          if (typeof params === 'function') {
            callback = params;
            params = [];
          }
          db.run(sql, params, callback);
        },
        finalize(callback) {
          if (callback) callback();
        }
      };
    }
  };
  
  initializePostgresSchema(pgPool).then(() => {
    console.log('✅ PostgreSQL Schema initialized successfully.');
    initializeAttendanceBooks(db);
  }).catch(e => {
    console.error('❌ Failed to initialize PostgreSQL schema:', e.message || e);
    console.log('⚠️ Falling back to local SQLite database...');
    dbInitError = e.message || String(e);
    isPostgres = false;
    initializeSqlite();
  });
}

// Always initialize local SQLite database connection & schema on startup to prevent fallback race conditions
initializeSqliteConnection();

const dbUrl = process.env.DATABASE_URL || config.databaseUrl;
const forceMysql = process.env.FORCE_MYSQL === 'true' || process.env.FORCE_MYSQL === '1';
const isPostgresUrl = !forceMysql && dbUrl && (dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://'));

if (isPostgresUrl) {
  initializePostgresConnection();
} else if (isMysql) {
  console.log('🔌 Cloud database mode: Connecting to MySQL...');
  const mysql = require('mysql2');
  const dns = require('dns');
  
  let mysqlHost = MYSQL_HOST;
  if (mysqlHost === 'srv1812.hstgr.io') {
    mysqlHost = '92.113.22.70';
  }
  
  mysqlPool = mysql.createPool({
    host: mysqlHost,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
    port: MYSQL_PORT,
    charset: 'utf8mb4',
    lookup: (hostname, options, cb) => {
      dns.lookup(hostname, { family: 4 }, cb);
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
  });

  function isConnectionError(err) {
    if (!err) return false;
    const code = err.code || '';
    const msg = String(err.message || '').toUpperCase();
    return code.startsWith('PROTOCOL_') || 
           code === 'ECONNRESET' || 
           code === 'ETIMEDOUT' || 
           code === 'ECONNREFUSED' || 
           code === 'ENOTFOUND' || 
           code === 'EPIPE' || 
           msg.includes('CONNECTION LOST') || 
           msg.includes('TIMEOUT') ||
           msg.includes('CLOSED');
  }

  mysqlPool.on('error', (err) => {
    console.error('Unexpected error on MySQL pool:', err.message || err);
  });

  db = {
    run(sql, params = [], callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      if (!isMysql) {
        globalSqliteDb.run(sql, params, callback);
        return;
      }
      const mySql = convertSqlToMysql(sql);
      mysqlPool.query(mySql, params, (err, res) => {
        if (err) {
          console.error(`MySQL error on run: ${err.message}. SQL: ${mySql}`);
          if (isConnectionError(err)) {
            console.warn('⚠️ MySQL connection error. Temporarily falling back to SQLite for this query...');
            globalSqliteDb.run(sql, params, callback);
          } else {
            if (callback) callback(err);
          }
        } else {
          const context = {
            lastID: res ? res.insertId : null,
            changes: res ? res.affectedRows : 0
          };
          if (callback) callback.call(context, null);
        }
      });
    },
    get(sql, params = [], callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      if (!isMysql) {
        globalSqliteDb.get(sql, params, callback);
        return;
      }
      const mySql = convertSqlToMysql(sql);
      mysqlPool.query(mySql, params, (err, res) => {
        if (err) {
          console.error(`MySQL error on get: ${err.message}. SQL: ${mySql}`);
          if (isConnectionError(err)) {
            console.warn('⚠️ MySQL connection error. Temporarily falling back to SQLite for this query...');
            globalSqliteDb.get(sql, params, callback);
          } else {
            if (callback) callback(err, null);
          }
        } else {
          const row = res && res.length > 0 ? res[0] : null;
          if (callback) callback(null, row);
        }
      });
    },
    all(sql, params = [], callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      if (!isMysql) {
        globalSqliteDb.all(sql, params, callback);
        return;
      }
      const mySql = convertSqlToMysql(sql);
      mysqlPool.query(mySql, params, (err, res) => {
        if (err) {
          console.error(`MySQL error on all: ${err.message}. SQL: ${mySql}`);
          if (isConnectionError(err)) {
            console.warn('⚠️ MySQL connection error. Temporarily falling back to SQLite for this query...');
            globalSqliteDb.all(sql, params, callback);
          } else {
            if (callback) callback(err, []);
          }
        } else {
          if (callback) callback(null, res || []);
        }
      });
    },

    serialize(callback) {
      if (callback) callback();
    },
    prepare(sql) {
      return {
        run(params = [], callback) {
          if (typeof params === 'function') {
            callback = params;
            params = [];
          }
          db.run(sql, params, callback);
        },
        finalize(callback) {
          if (callback) callback();
        }
      };
    }
  };

  initializeMysqlSchema(mysqlPool).then(() => {
    console.log('✅ MySQL Schema initialized successfully.');
    initializeAttendanceBooks();
  }).catch(e => {
    console.error('❌ Failed to initialize MySQL schema:', e.message || e);
    console.log('⚠️ Falling back to local SQLite database...');
    dbInitError = e.message || String(e);
    isMysql = false;
    initializeSqlite();
  });

} else {
  initializeSqlite();
}

function isValidInt32(val) {
  if (val === null || val === undefined) return false;
  const num = Number(val);
  return Number.isInteger(num) && num >= 1 && num <= 2147483647;
}

function dbInsertOrReplace(tableName, primaryKey, item, callback) {
  const cleanedItem = { ...item };
  const pkValue = cleanedItem[primaryKey];
  const hasValidPk = isValidInt32(pkValue);
  
  if (!hasValidPk) {
    delete cleanedItem[primaryKey];
  } else {
    cleanedItem[primaryKey] = parseInt(pkValue);
  }
  
  const columns = Object.keys(cleanedItem).map(c => `"${c}"`);
  const placeholders = Object.keys(cleanedItem).map(() => "?");
  const values = Object.values(cleanedItem);
  
  const sql = `INSERT OR REPLACE INTO "${tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
  
  db.run(sql, values, callback);
}

function dbInsertOrReplaceStringKey(tableName, primaryKey, item, callback) {
  const cleanedItem = { ...item };
  const columns = Object.keys(cleanedItem).map(c => `"${c}"`);
  const placeholders = Object.keys(cleanedItem).map(() => "?");
  const values = Object.values(cleanedItem);
  
  const sql = `INSERT OR REPLACE INTO "${tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
  
  db.run(sql, values, callback);
}

function getInsertOrReplaceSqlAndValues(tableName, primaryKey, item) {
  const cleanedItem = { ...item };
  const columns = Object.keys(cleanedItem).map(c => `"${c}"`);
  const placeholders = Object.keys(cleanedItem).map(() => "?");
  const values = Object.values(cleanedItem);
  
  const sql = `INSERT OR REPLACE INTO "${tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
  return { sql, values };
}

function dumpExamsToFile(callback) {
  const EXAMS_FILE = path.join(PUBLIC_DIR, 'assets', 'data', 'exams.json');
  
  const queryCallback = (err, rows) => {
    if (err) {
      console.error('[Backup Exams] Failed to select exams:', err.message);
      if (callback) callback(err);
      return;
    }
    const examsList = (rows || []).map(e => {
      let qs = [];
      try { qs = JSON.parse(e.questions_json || '[]'); } catch (ex) {}
      let details = {};
      try { details = JSON.parse(e.details_json || '{}'); } catch (ex) {}
      // Spread details FIRST, then override with structured fields so details_json
      // can never accidentally overwrite questions_json or other canonical columns
      return {
        ...details,
        id: e.id,
        title: e.exam_name,
        category: e.course_name,
        questionsCountToShow: e.questions_count,
        passingScore: e.passing_score,
        isOpen: e.status === 'open',
        questions: qs
      };
    });
    
    fs.writeFile(EXAMS_FILE, JSON.stringify(examsList, null, 2), 'utf8', (writeErr) => {
      if (writeErr) {
        console.error('[Backup Exams] Failed to write exams.json:', writeErr.message);
      } else {
        console.log('[Backup Exams] Successfully updated assets/data/exams.json on disk!');
        
        // تحديث النسخ الاحتياطية تلقائياً للحفاظ على الأسئلة
        try {
          // 1. تحديث النسخة الاحتياطية المحلية المباشرة (exams_backup.json)
          const BACKUP_EXAMS_FILE = path.join(PUBLIC_DIR, 'assets', 'data', 'exams_backup.json');
          fs.writeFileSync(BACKUP_EXAMS_FILE, JSON.stringify(examsList, null, 2), 'utf8');
          console.log('[Backup Exams] Successfully updated assets/data/exams_backup.json!');

          // 2. تحديث نسخة مجلد النشر الذكي (.deploy_backup/assets_data_exams.json)
          const DEPLOY_BACKUP_DIR = path.join(PUBLIC_DIR, '.deploy_backup');
          if (!fs.existsSync(DEPLOY_BACKUP_DIR)) {
            fs.mkdirSync(DEPLOY_BACKUP_DIR, { recursive: true });
          }
          const DEPLOY_BACKUP_FILE = path.join(DEPLOY_BACKUP_DIR, 'assets_data_exams.json');
          fs.writeFileSync(DEPLOY_BACKUP_FILE, JSON.stringify(examsList, null, 2), 'utf8');
          console.log('[Backup Exams] Successfully updated .deploy_backup/assets_data_exams.json!');
        } catch (backupErr) {
          console.error('[Backup Exams Error] Failed to update secondary backups:', backupErr.message);
        }
      }
      if (callback) callback(writeErr);
    });
  };

  db.all('SELECT * FROM exams', [], (err, rows) => {
    queryCallback(err, rows);
  });
}

function runSqliteBulkSync(tableName, primaryKey, itemsToSave, callback) {
  globalSqliteDb.serialize(() => {
    globalSqliteDb.run('BEGIN TRANSACTION', [], (beginErr) => {
      if (beginErr) return callback(beginErr);
      
      globalSqliteDb.run(`DELETE FROM "${tableName}"`, [], (deleteErr) => {
        if (deleteErr) {
          globalSqliteDb.run('ROLLBACK', [], () => {});
          return callback(deleteErr);
        }
        
        if (!itemsToSave || itemsToSave.length === 0) {
          globalSqliteDb.run('COMMIT', [], (commitErr) => {
            if (commitErr) return callback(commitErr);
            callback(null, 0);
          });
          return;
        }
        
        let insertIndex = 0;
        const insertNext = () => {
          if (insertIndex >= itemsToSave.length) {
            globalSqliteDb.run('COMMIT', [], (commitErr) => {
              if (commitErr) return callback(commitErr);
              callback(null, itemsToSave.length);
            });
            return;
          }
          
          const item = itemsToSave[insertIndex];
          const { sql, values } = getInsertOrReplaceSqlAndValues(tableName, primaryKey, item);
          globalSqliteDb.run(sql, values, (insertErr) => {
            if (insertErr) {
              console.error(`❌ SQLite bulk insert error for ${tableName}:`, insertErr);
              globalSqliteDb.run('ROLLBACK', [], () => {});
              return callback(insertErr);
            }
            insertIndex++;
            insertNext();
          });
        };
        
        insertNext();
      });
    });
  });
}

function executeBulkSync(tableName, primaryKey, itemsToSave, callback) {
  if (isPostgres && pgPool) {
    pgPool.connect((connectErr, client, release) => {
      if (connectErr) {
        console.error(`❌ pgPool connection error for bulk sync transaction on ${tableName}:`, connectErr);
        console.log('⚠️ Falling back to SQLite bulk sync...');
        fallbackToSqlite(() => {
          executeBulkSync(tableName, primaryKey, itemsToSave, callback);
        });
        return;
      }
      
      const rollback = (err) => {
        client.query('ROLLBACK', () => {
          release();
          console.error(`❌ PostgreSQL transaction error for bulk sync on ${tableName}:`, err.message);
          console.log('⚠️ Falling back to SQLite bulk sync...');
          fallbackToSqlite(() => {
            executeBulkSync(tableName, primaryKey, itemsToSave, callback);
          });
        });
      };
      
      client.query('BEGIN', (beginErr) => {
        if (beginErr) return rollback(beginErr);
        
        client.query(`DELETE FROM "${tableName}"`, (deleteErr) => {
          if (deleteErr) return rollback(deleteErr);
          
          if (!itemsToSave || itemsToSave.length === 0) {
            client.query('COMMIT', (commitErr) => {
              if (commitErr) return rollback(commitErr);
              release();
              callback(null, 0);
            });
            return;
          }
          
          let insertIndex = 0;
          const insertNext = () => {
            if (insertIndex >= itemsToSave.length) {
              client.query('COMMIT', (commitErr) => {
                if (commitErr) return rollback(commitErr);
                release();
                callback(null, itemsToSave.length);
              });
              return;
            }
            
            const item = itemsToSave[insertIndex];
            const { sql, values } = getInsertOrReplaceSqlAndValues(tableName, primaryKey, item);
            const pgSql = convertSqlToPostgres(sql);
            client.query(pgSql, values, (insertErr) => {
              if (insertErr) {
                console.error(`❌ Error bulk inserting item into ${tableName} on Postgres:`, insertErr);
                return rollback(insertErr);
              }
              insertIndex++;
              insertNext();
            });
          };
          
          insertNext();
        });
      });
    });
  } else if (isMysql && mysqlPool) {
    mysqlPool.getConnection((connectErr, connection) => {
      if (connectErr) {
        console.error(`❌ mysqlPool connection error for bulk sync transaction on ${tableName}:`, connectErr.message || connectErr);
        if (isConnectionError(connectErr)) {
          console.log('⚠️ MySQL connection lost during bulk sync. Temporarily using SQLite...');
          runSqliteBulkSync(tableName, primaryKey, itemsToSave, callback);
        } else {
          callback(connectErr);
        }
        return;
      }
      
      const rollback = (err) => {
        connection.rollback(() => {
          connection.release();
          console.error(`❌ MySQL transaction error for bulk sync on ${tableName}:`, err.message);
          if (isConnectionError(err)) {
            console.log('⚠️ MySQL connection lost during transaction. Temporarily using SQLite...');
            runSqliteBulkSync(tableName, primaryKey, itemsToSave, callback);
          } else {
            callback(err);
          }
        });
      };
      
      connection.beginTransaction((beginErr) => {
        if (beginErr) return rollback(beginErr);
        
        const deleteSql = convertSqlToMysql(`DELETE FROM "${tableName}"`);
        connection.query(deleteSql, (deleteErr) => {
          if (deleteErr) return rollback(deleteErr);
          
          if (!itemsToSave || itemsToSave.length === 0) {
            connection.commit((commitErr) => {
              if (commitErr) return rollback(commitErr);
              connection.release();
              callback(null, 0);
            });
            return;
          }
          
          let insertIndex = 0;
          const insertNext = () => {
            if (insertIndex >= itemsToSave.length) {
              connection.commit((commitErr) => {
                if (commitErr) return rollback(commitErr);
                connection.release();
                callback(null, itemsToSave.length);
              });
              return;
            }
            
            const item = itemsToSave[insertIndex];
            const { sql, values } = getInsertOrReplaceSqlAndValues(tableName, primaryKey, item);
            const mySql = convertSqlToMysql(sql);
            connection.query(mySql, values, (insertErr) => {
              if (insertErr) {
                console.error(`❌ Error bulk inserting item into ${tableName}:`, insertErr);
                return rollback(insertErr);
              }
              insertIndex++;
              insertNext();
            });
          };
          
          insertNext();
        });
      });
    });
  } else {
    runSqliteBulkSync(tableName, primaryKey, itemsToSave, callback);
  }
}




function mapClientResultToDb(item) {
  const scoreVal = item.score !== undefined ? item.score : 0;
  const passed = item.passed !== undefined ? item.passed : (scoreVal >= 50);
  return {
    id: item.id,
    user_id: item.user_id || '',
    trainee_name: item.studentName || item.trainee_name || '',
    rank: item.studentRank || item.rank || '',
    code: item.studentBadge || item.studentDiscord || item.code || '',
    discord_id: item.discord_id || '',
    badge_code: item.badge_code || item.studentBadge || '',
    attempt_count: item.attempt_count || 1,
    course_name: item.examTitle || item.course_name || '',
    exam_name: item.examTitle || item.exam_name || '',
    score: scoreVal,
    pass_status: passed ? 'نجاح' : 'رسوب',
    start_time: item.entryTime || item.start_time || '',
    end_time: item.endTime || item.end_time || '',
    duration: item.duration !== undefined ? item.duration : 0,
    status: item.status || 'pending',
    examiner: item.examiner || '',
    passing_score: item.passingScore !== undefined ? item.passingScore : (item.passing_score !== undefined ? item.passing_score : 80),
    questions_json: Array.isArray(item.questions) ? JSON.stringify(item.questions) : (typeof item.questions_json === 'string' ? item.questions_json : '[]'),
    user_answers_json: Array.isArray(item.userAnswers) ? JSON.stringify(item.userAnswers) : (typeof item.user_answers_json === 'string' ? item.user_answers_json : (Array.isArray(item.userAnswersJson) ? JSON.stringify(item.userAnswersJson) : '[]'))
  };
}

function syncSaveResultFromClient(item, callback) {
  const dbItem = mapClientResultToDb(item);
  const { id } = dbItem;
  const hasValidId = isValidInt32(id);
  
  if (hasValidId) {
    const pk = parseInt(id);
    // 1. exam_results
    const itemResults = {
      id: pk,
      user_id: dbItem.user_id,
      trainee_name: dbItem.trainee_name,
      rank: dbItem.rank,
      code: dbItem.code,
      discord_id: dbItem.discord_id || '',
      badge_code: dbItem.badge_code || '',
      attempt_count: dbItem.attempt_count || 1,
      course_name: dbItem.course_name,
      exam_name: dbItem.exam_name,
      score: dbItem.score,
      pass_status: dbItem.pass_status,
      start_time: dbItem.start_time,
      end_time: dbItem.end_time,
      duration: dbItem.duration,
      status: dbItem.status,
      examiner: dbItem.examiner,
      passing_score: dbItem.passing_score,
      questions_json: dbItem.questions_json,
      user_answers_json: dbItem.user_answers_json
    };
    dbInsertOrReplace('exam_results', 'id', itemResults, function(err) {
      if (err) {
        if (callback) callback(err);
        return;
      }
      
      // 2. exam_attempts
      const itemAttempts = {
        id: pk,
        trainee_name: dbItem.trainee_name,
        rank: dbItem.rank,
        code: dbItem.code,
        discord_id: dbItem.discord_id || '',
        badge_code: dbItem.badge_code || '',
        attempt_count: dbItem.attempt_count || 1,
        course_name: dbItem.course_name,
        exam_name: dbItem.exam_name,
        score: dbItem.score,
        pass_status: dbItem.pass_status,
        start_time: dbItem.start_time,
        end_time: dbItem.end_time,
        duration: dbItem.duration,
        status: dbItem.status,
        examiner: dbItem.examiner,
        passing_score: dbItem.passing_score,
        questions_json: dbItem.questions_json,
        user_answers_json: dbItem.user_answers_json
      };
      dbInsertOrReplace('exam_attempts', 'id', itemAttempts, function(attErr) {
        if (!attErr && (itemResults.pass_status === 'نجاح' || itemResults.pass_status === 'رسوب')) {
          sendExamNotificationToDiscord(itemResults);
        }
        if (callback) callback(attErr, this.changes);
      });
    });
  } else {
    // Insert new attempt - let's count attempts first
    const searchVal1 = dbItem.discord_id || dbItem.code || 'unknown_user';
    const searchVal2 = dbItem.trainee_name || 'unknown_user';
    const examName = dbItem.exam_name || 'unknown_exam';
    
    const sqlCount = `SELECT COUNT(*) as cnt FROM exam_results WHERE (discord_id = ? OR trainee_name = ?) AND exam_name = ?`;
      
    db.get(sqlCount, [searchVal1, searchVal2, examName], function(countErr, countRow) {
      const cntVal = countRow ? parseInt(countRow.cnt || countRow.count || 0) : 0;
      const attemptNum = dbItem.attempt_count || cntVal + 1;
      
      const itemAttempts = {
        trainee_name: dbItem.trainee_name,
        rank: dbItem.rank,
        code: dbItem.code,
        discord_id: dbItem.discord_id || '',
        badge_code: dbItem.badge_code || '',
        attempt_count: attemptNum,
        course_name: dbItem.course_name,
        exam_name: dbItem.exam_name,
        score: dbItem.score,
        pass_status: dbItem.pass_status,
        start_time: dbItem.start_time,
        end_time: dbItem.end_time,
        duration: dbItem.duration,
        status: dbItem.status,
        examiner: dbItem.examiner,
        passing_score: dbItem.passing_score,
        questions_json: dbItem.questions_json,
        user_answers_json: dbItem.user_answers_json
      };
      
      dbInsertOrReplace('exam_attempts', 'id', itemAttempts, function(err) {
        if (err) {
          if (callback) callback(err);
          return;
        }
        
        const newId = this.lastID;
        
        const itemResults = {
          id: newId,
          user_id: dbItem.user_id,
          trainee_name: dbItem.trainee_name,
          rank: dbItem.rank,
          code: dbItem.code,
          discord_id: dbItem.discord_id || '',
          badge_code: dbItem.badge_code || '',
          attempt_count: attemptNum,
          course_name: dbItem.course_name,
          exam_name: dbItem.exam_name,
          score: dbItem.score,
          pass_status: dbItem.pass_status,
          start_time: dbItem.start_time,
          end_time: dbItem.end_time,
          duration: dbItem.duration,
          status: dbItem.status,
          examiner: dbItem.examiner,
          passing_score: dbItem.passing_score,
          questions_json: dbItem.questions_json,
          user_answers_json: dbItem.user_answers_json
        };
        
        dbInsertOrReplace('exam_results', 'id', itemResults, function(resErr) {
          if (!resErr && (itemResults.pass_status === 'نجاح' || itemResults.pass_status === 'رسوب')) {
            sendExamNotificationToDiscord(itemResults);
          }
          if (callback) callback(resErr, newId);
        });
      });
    });
  }
}

function syncSaveAttempt(data, callback) {
  const { id } = data;
  
  if (id) {
    // Update existing attempt in both tables
    const pk = parseInt(id);
    
    // 1. Update exam_attempts
    const updatesAttempts = [];
    const paramsAttempts = [];
    const validAttemptsCols = ['trainee_name', 'rank', 'code', 'discord_id', 'badge_code', 'attempt_count', 'course_name', 'exam_name', 'score', 'pass_status', 'start_time', 'end_time', 'duration', 'status', 'examiner', 'questions_json', 'user_answers_json', 'passing_score', 'hand_raised', 'hand_approved', 'bypass_count'];
    
    Object.keys(data).forEach(key => {
      let fieldName = key;
      let val = data[key];
      if (key === 'questions') { fieldName = 'questions_json'; val = JSON.stringify(val); }
      else if (key === 'userAnswers') { fieldName = 'user_answers_json'; val = JSON.stringify(val); }
      else if (key === 'passingScore') { fieldName = 'passing_score'; }
      
      if (fieldName !== 'id' && validAttemptsCols.includes(fieldName)) {
        updatesAttempts.push(`"${fieldName}" = ?`);
        paramsAttempts.push(val);
      }
    });
    
    if (updatesAttempts.length > 0) {
      paramsAttempts.push(pk);
      const sqlAttempts = `UPDATE exam_attempts SET ${updatesAttempts.join(', ')} WHERE id = ?`;
      
      db.run(sqlAttempts, paramsAttempts, function(err) {
        if (err) {
          if (callback) callback(err);
          return;
        }
        
        // 2. Update exam_results
        const updatesResults = [];
        const paramsResults = [];
        const validResultsCols = ['user_id', 'trainee_name', 'rank', 'code', 'discord_id', 'badge_code', 'attempt_count', 'course_name', 'exam_name', 'score', 'pass_status', 'start_time', 'end_time', 'duration', 'status', 'examiner', 'questions_json', 'user_answers_json', 'passing_score', 'hand_raised', 'hand_approved', 'bypass_count'];
        
        Object.keys(data).forEach(key => {
          let fieldName = key;
          let val = data[key];
          if (key === 'studentName') { fieldName = 'trainee_name'; }
          else if (key === 'studentRank') { fieldName = 'rank'; }
          else if (key === 'studentBadge') { fieldName = 'code'; }
          else if (key === 'examTitle') { fieldName = 'exam_name'; }
          else if (key === 'passed') { fieldName = 'pass_status'; val = val ? 'نجاح' : 'رسوب'; }
          else if (key === 'entryTime') { fieldName = 'start_time'; }
          else if (key === 'endTime') { fieldName = 'end_time'; }
          else if (key === 'questions') { fieldName = 'questions_json'; val = JSON.stringify(val); }
          else if (key === 'userAnswers') { fieldName = 'user_answers_json'; val = JSON.stringify(val); }
          else if (key === 'passingScore') { fieldName = 'passing_score'; }
          
          if (fieldName !== 'id' && validResultsCols.includes(fieldName)) {
            updatesResults.push(`"${fieldName}" = ?`);
            paramsResults.push(val);
          }
        });
        
        if (updatesResults.length > 0) {
          paramsResults.push(pk);
          const sqlResults = `UPDATE exam_results SET ${updatesResults.join(', ')} WHERE id = ?`;
          db.run(sqlResults, paramsResults, function(resErr) {
            if (!resErr) {
              db.get('SELECT * FROM exam_results WHERE id = ?', [pk], (getErr, fullRow) => {
                if (!getErr && fullRow && (fullRow.pass_status === 'نجاح' || fullRow.pass_status === 'رسوب')) {
                  sendExamNotificationToDiscord(fullRow);
                }
              });
            }
            if (callback) callback(resErr, this.changes);
          });
        } else {
          if (callback) callback(null, this.changes);
        }
      });
    } else {
      if (callback) callback(null, 0);
    }
  } else {
    // Insert new attempt - let's count attempts first
    const searchVal1 = data.discord_id || data.code || 'unknown_user';
    const searchVal2 = data.trainee_name || 'unknown_user';
    const examName = data.exam_name || 'unknown_exam';
    
    const sqlCount = `SELECT COUNT(*) as cnt FROM exam_results WHERE (discord_id = ? OR trainee_name = ?) AND exam_name = ?`;
      
    db.get(sqlCount, [searchVal1, searchVal2, examName], function(countErr, countRow) {
      const cntVal = countRow ? parseInt(countRow.cnt || countRow.count || 0) : 0;
      const attemptNum = data.attempt_count || cntVal + 1;
      
      const itemAttempts = {
        trainee_name: data.trainee_name,
        rank: data.rank,
        code: data.code,
        discord_id: data.discord_id || '',
        badge_code: data.badge_code || '',
        attempt_count: attemptNum,
        course_name: data.course_name,
        exam_name: data.exam_name,
        score: data.score !== undefined ? data.score : 0,
        pass_status: data.pass_status || '—',
        start_time: data.start_time,
        end_time: data.end_time || '—',
        duration: data.duration !== undefined ? data.duration : 0,
        status: data.status || 'started',
        examiner: data.examiner || '—',
        passing_score: data.passingScore !== undefined ? data.passingScore : (data.passing_score !== undefined ? data.passing_score : 80),
        questions_json: Array.isArray(data.questions) ? JSON.stringify(data.questions) : (typeof data.questions_json === 'string' ? data.questions_json : '[]'),
        user_answers_json: Array.isArray(data.userAnswers) ? JSON.stringify(data.userAnswers) : (typeof data.user_answers_json === 'string' ? data.user_answers_json : '[]'),
        hand_raised: data.hand_raised !== undefined ? data.hand_raised : 0,
        hand_approved: data.hand_approved !== undefined ? data.hand_approved : 0,
        bypass_count: data.bypass_count !== undefined ? data.bypass_count : 0
      };
      
      dbInsertOrReplace('exam_attempts', 'id', itemAttempts, function(err) {
        if (err) {
          if (callback) callback(err);
          return;
        }
        
        const newId = this.lastID;
        
        const itemResults = {
          id: newId,
          user_id: data.user_id || '',
          trainee_name: data.trainee_name,
          rank: data.rank,
          code: data.code,
          discord_id: data.discord_id || '',
          badge_code: data.badge_code || '',
          attempt_count: attemptNum,
          course_name: data.course_name,
          exam_name: data.exam_name,
          score: data.score !== undefined ? data.score : 0,
          pass_status: data.pass_status || '—',
          start_time: data.start_time,
          end_time: data.end_time || '—',
          duration: data.duration !== undefined ? data.duration : 0,
          status: data.status || 'started',
          examiner: data.examiner || '—',
          passing_score: data.passingScore !== undefined ? data.passingScore : (data.passing_score !== undefined ? data.passing_score : 80),
          questions_json: Array.isArray(data.questions) ? JSON.stringify(data.questions) : (typeof data.questions_json === 'string' ? data.questions_json : '[]'),
          user_answers_json: Array.isArray(data.userAnswers) ? JSON.stringify(data.userAnswers) : (typeof data.user_answers_json === 'string' ? data.user_answers_json : '[]'),
          hand_raised: data.hand_raised !== undefined ? data.hand_raised : 0,
          hand_approved: data.hand_approved !== undefined ? data.hand_approved : 0,
          bypass_count: data.bypass_count !== undefined ? data.bypass_count : 0
        };
        
        dbInsertOrReplace('exam_results', 'id', itemResults, function(resErr) {
          if (!resErr && (itemResults.pass_status === 'نجاح' || itemResults.pass_status === 'رسوب')) {
            sendExamNotificationToDiscord(itemResults);
          }
          if (callback) callback(resErr, newId);
        });
      });
    });
  }
}

function fetchPublicSheetRows(spreadsheetId, tabName) {
  return new Promise((resolve, reject) => {
    const encodedTab = encodeURIComponent(tabName);
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=responseHandler:cb&sheet=${encodedTab}`;

    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch public sheet. Status code: ${res.statusCode}`));
      }

      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const prefix = 'cb(';
          const startIdx = data.indexOf(prefix);
          if (startIdx === -1) {
            return reject(new Error('Failed to parse Google Sheets response.'));
          }

          let jsonStr = data.substring(startIdx + prefix.length).trim();
          if (jsonStr.endsWith(');')) jsonStr = jsonStr.substring(0, jsonStr.length - 2);
          else if (jsonStr.endsWith(')')) jsonStr = jsonStr.substring(0, jsonStr.length - 1);

          const table = JSON.parse(jsonStr).table;
          if (!table || !table.cols) {
            return reject(new Error('Parsed table schema is invalid.'));
          }

          let headers = table.cols.map(col => col ? (col.label || '').trim() : '');
          let headerRowIndex = -1;
          const rawRows = [];
          
          if (table.rows) {
            table.rows.forEach(r => {
              if (!r || !r.c) return;
              const cells = r.c.map(cell => {
                if (!cell) return '';
                if (cell.f !== undefined) return String(cell.f).trim();
                if (cell.v !== undefined) return String(cell.v).trim();
                return '';
              });
              rawRows.push(cells);
            });
          }

          // Fallback to searching first few rows for header names if table.cols is empty or lacks "الاسم"
          const hasNameHeader = headers.some(h => h.includes("الاسم") || h.includes("اسم"));
          if (!hasNameHeader && rawRows.length > 0) {
            for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
              const row = rawRows[i];
              if (row.some(cell => cell.includes("الاسم") || cell.includes("id discord") || cell.includes("الكود"))) {
                headers = row;
                headerRowIndex = i;
                break;
              }
            }
          }

          const rows = [];
          for (let i = 0; i < rawRows.length; i++) {
            if (i <= headerRowIndex) continue;
            rows.push(rawRows[i]);
          }

          resolve({ headers, rows });
        } catch (e) {
          reject(new Error(`Parsing failed: ${e.message}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function isCellChecked(val) {
  if (!val) return false;
  const cleanVal = val.trim().toLowerCase();
  return (
    cleanVal.includes('✔') || 
    cleanVal === 'true' || 
    cleanVal === '1' || 
    cleanVal.includes('نعم') || 
    cleanVal.includes('مستحق') ||
    cleanVal === 'yes' ||
    cleanVal === 'active'
  );
}

function checkUserMatch(row, user) {
  if (!row || !user) return false;
  
  const cleanStr = (s) => String(s || '').trim().toLowerCase();
  
  // 1. Compare numeric IDs
  const getDigits = (s) => String(s || '').replace(/\D/g, '');
  const rowDigits = getDigits(row.discord);
  const userDigits = getDigits(user.id || user.discord_id || user.discord);
  if (rowDigits && userDigits && rowDigits === userDigits) return true;
  
  // 2. Match by discord username
  if (row.discord && (user.username || user.discord)) {
    const d1 = cleanStr(row.discord).replace('@', '').replace('<', '').replace('>', '');
    const d2 = cleanStr(user.username || user.discord).replace('@', '').replace('<', '').replace('>', '');
    if (d1 === d2) return true;
  }
  
  // 3. Match by name
  if (row.name) {
    const rName = cleanStr(row.name);
    if (user.username && cleanStr(user.username) === rName) return true;
    if (user.display_name && cleanStr(user.display_name) === rName) return true;
  }
  
  return false;
}

function resolveRoleFromRank(rank, currentRole = 'viewer') {
  if (!rank) return currentRole;
  const r = String(rank).trim();
  if (r.includes('المشرف العام') || r.includes('المالك') || r.includes('owner')) return 'owner';
  if (r.includes('قيادة الامن العام') || r.includes('assistant_owner')) return 'assistant_owner';
  if (r.includes('رئاسة تدريب الامن العام') || r.includes('academy_affairs')) return 'academy_affairs';
  if (r.includes('شؤون أكاديمية التدريب') || r.includes('admin')) return 'admin';
  if (r.includes('شؤون التجنيد') || r.includes('recruitment_affairs')) return 'recruitment_affairs';
  if (r.includes('مسؤول دورة') || r.includes('مسؤول الدورة') || r.includes('course_admin')) return 'course_admin';
  return currentRole;
}

function syncGoogleSheetsToDb(forceId = null, loginUser = null) {
  return new Promise(async (resolve, reject) => {
    console.log('[Sync] Starting background synchronization from Google Sheets to DB...');
    const config = loadConfig();
    if (!config.spreadsheetId) {
      console.warn('[Sync Warning] SPREADSHEET_ID not found in config. Skipping sync.');
      return resolve(null);
    }

    const MEMBER_TABS = [
      "جدول الادارة العامة لشؤون الادارية والمالية",
      "جدول الإدارة العامه لشؤون تدريب الامن العام",
      " جدول الادارة العامه لشؤون التجنيد",
      "الادارة العامة لشؤون العسكرية",
      "جدول الامن العام - المنتدبين",
      "جدول الامن العام - الادارة",
      "جدول الامن العام - الاساسي"
    ];

    let discordUsersData = {};
    const discordUsersFile = path.join(PUBLIC_DIR, 'assets', 'data', 'discord_users.json');
    if (fs.existsSync(discordUsersFile)) {
      try {
        discordUsersData = JSON.parse(fs.readFileSync(discordUsersFile, 'utf8'));
      } catch (e) {
        console.error('[Sync Error] Failed to read discord_users.json:', e.message);
      }
    }

    // Fetch existing users from database first to use for flexible matching
    const dbUsers = await new Promise((resUsers) => {
      db.all("SELECT * FROM users", [], (err, rows) => {
        resUsers(rows || []);
      });
    });

    const mergedMembers = {};

    for (const tabName of MEMBER_TABS) {
      try {
        const { headers, rows } = await fetchPublicSheetRows(config.spreadsheetId, tabName);
        const cleanHeaders = headers.map(h => (h || '').trim().toLowerCase());
        
        const idxDiscord = cleanHeaders.findIndex(h => 
          h.includes("id discord") || h.includes("ديسكورد") || h.includes("دسكورد") || h.includes("التعريف") || h.includes("id")
        );
        const idxNickname = cleanHeaders.findIndex(h => 
          h === "الاسم" || h.includes("الاسم") || h.includes("اسم العسكري")
        );
        const idxRank = cleanHeaders.findIndex(h => 
          h === "الرتبة" || h.includes("الرتبة") || h.includes("رتبة")
        );
        const idxCode = cleanHeaders.findIndex(h => 
          h.includes("الكود") || h.includes("كود") || h === "الكود"
        );
        const idxDegree = cleanHeaders.findIndex(h => 
          h.includes("درجة استحقاق الانواط") || h.includes("درجة استحقاق الأنواط") || h.includes("انواط") || h.includes("أنواط")
        );
        const idxLeadership = cleanHeaders.findIndex(h => 
          h.includes("المهام القياديه") || h.includes("المهام القيادية") || h.includes("المسؤوليات") || h.includes("المسؤولية") || h.includes("المســــــؤوليات")
        );

        for (const r of rows) {
          const nickname = idxNickname !== -1 && r[idxNickname] ? r[idxNickname].trim() : '';
          if (!nickname || nickname === "الاسم" || nickname.includes("الاسم")) continue;

          const rank = idxRank !== -1 && r[idxRank] ? r[idxRank].trim() : '';
          const code = idxCode !== -1 && r[idxCode] ? r[idxCode].replace(/[\[\]]/g, '').trim() : '';
          const degree = idxDegree !== -1 && r[idxDegree] ? r[idxDegree].trim() : '';
           let leadership = idxLeadership !== -1 && r[idxLeadership] ? r[idxLeadership].trim() : '';
          if (leadership.toLowerCase() === 'false' || leadership.toLowerCase() === 'true' || leadership === '—' || leadership === '-' || leadership === 'لايوجد' || leadership === 'لا يوجد') {
            leadership = '';
          }

          let rawDiscord = idxDiscord !== -1 && r[idxDiscord] ? r[idxDiscord].trim() : '';
          
          // Let's find a matching user
          const sheetRowUser = { discord: rawDiscord, name: nickname };
          
          let matchedDbUser = null;
          
          // Check if matches loginUser
          if (loginUser && checkUserMatch(sheetRowUser, loginUser)) {
            matchedDbUser = loginUser;
          } else {
            // Find in dbUsers
            matchedDbUser = dbUsers.find(dbU => checkUserMatch(sheetRowUser, dbU));
          }
          
          let resolvedId = '';
          if (matchedDbUser) {
            resolvedId = matchedDbUser.id;
          } else {
            // Fallback to numeric digits in the discord column
            const getDigits = (s) => String(s || '').replace(/\D/g, '');
            const rowDigits = getDigits(rawDiscord);
            if (rowDigits && /^\d{17,20}$/.test(rowDigits)) {
              resolvedId = rowDigits;
            }
          }
          
          if (!resolvedId) continue; // Skip if we can't map this row to a Discord ID

          const isMainTab = [
            "جدول الامن العام - الاساسي",
            "جدول الامن العام - المنتدبين",
            "جدول الامن العام - الادارة"
          ].includes(tabName);

          if (!mergedMembers[resolvedId]) {
            mergedMembers[resolvedId] = {
              discordId: resolvedId,
              nickname,
              rank: isMainTab ? rank : '',
              code,
              degree,
              leadership,
              tabName
            };
          } else {
            if (nickname) mergedMembers[resolvedId].nickname = nickname;
            if (isMainTab && rank) mergedMembers[resolvedId].rank = rank;
            if (code) mergedMembers[resolvedId].code = code;
            if (degree) mergedMembers[resolvedId].degree = degree;
            if (leadership) mergedMembers[resolvedId].leadership = leadership;
            mergedMembers[resolvedId].tabName = tabName;
          }
        }
      } catch (err) {
        console.warn(`[Sync Warning] Failed to parse sheet tab "${tabName}":`, err.message);
      }
    }

    const sheetDiscordIds = Object.keys(mergedMembers);
    if (sheetDiscordIds.length === 0) {
      console.warn('[Sync Warning] No members parsed from Google Sheets. Skipping DB updates.');
      return resolve(null);
    }

    const cleanForceId = forceId ? String(forceId).replace('discord_', '') : null;
    const idsToProcess = cleanForceId ? [cleanForceId] : sheetDiscordIds;

    // 1. Update/Add users to DB
    for (const discordId of idsToProcess) {
      const m = mergedMembers[discordId];
      if (!m) continue;

      await new Promise((resUser) => {
        db.get('SELECT * FROM users WHERE id = ? OR id = ? OR discord_id = ?', [discordId, 'discord_' + discordId, discordId], (err, dbUser) => {
          if (err) {
            resUser();
            return;
          }

          const dept = m.tabName;
          
          let targetDbId = discordId;
          if (dbUser) {
            targetDbId = dbUser.id;
          } else if (forceId && String(forceId).includes(discordId)) {
            targetDbId = forceId;
          }

          // Query discord_links to fetch profile details if available
          db.get('SELECT avatar, banner FROM discord_links WHERE user_id = ? OR discord_id = ?', [discordId, discordId], (linkErr, linkRow) => {
            let avatarUrl = '';
            let bannerUrl = '';
            
            if (!linkErr && linkRow && linkRow.avatar) {
              avatarUrl = linkRow.avatar;
              bannerUrl = linkRow.banner || '';
            } else {
              const cached = discordUsersData[discordId];
              if (cached && cached.avatar) {
                avatarUrl = cached.avatar;
                bannerUrl = cached.banner || '';
              }
            }

            if (!dbUser) {
              let finalRole = resolveRoleFromRank(m.rank, 'viewer');
              if (discordId === '750581378168389632' && finalRole === 'owner') {
                finalRole = 'viewer';
              }
              db.run(`INSERT INTO users (id, discord_id, username, display_name, avatar, banner, role, rank, department, code, status, real_name) 
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
                [targetDbId, discordId, m.nickname, m.nickname, avatarUrl, bannerUrl, finalRole, m.rank || 'مشاهد', dept, m.code, m.nickname],
                function(insErr) {
                  if (!insErr) {
                    const details = `مزامنة تلقائية: إضافة مستخدم جديد من Google Sheets: ${m.nickname} (الدور: ${finalRole}، الرتبة: ${m.rank || '—'}، الكود: ${m.code || '—'})`;
                    logSystemActivity('sync_add_user', 'النظام', details);
                    resUser();
                  } else {
                    resUser();
                  }
                }
              );
            } else {
              const isManual = dbUser.is_manual_role === 1 || dbUser.is_manual_role === true;
              let finalRole = isManual ? dbUser.role : resolveRoleFromRank(m.rank, dbUser.role);
              if ((targetDbId === '750581378168389632' || discordId === '750581378168389632') && finalRole === 'owner') {
                finalRole = 'viewer';
              }
              const finalRank = isManual ? dbUser.rank : (m.rank || 'مشاهد');
              const isRealNameDiff = dbUser.real_name !== m.nickname;
              const isRoleDiff = dbUser.role !== finalRole;
              const isRankDiff = dbUser.rank !== finalRank;
              const isCodeDiff = dbUser.code !== m.code;
              const isDeptDiff = dbUser.department !== dept;
              const isStatusDiff = dbUser.status !== 'active';
              const isAvatarDiff = avatarUrl && dbUser.avatar !== avatarUrl;
              const isBannerDiff = bannerUrl && dbUser.banner !== bannerUrl;
 
              if (isRoleDiff || isRankDiff || isCodeDiff || isDeptDiff || isStatusDiff || isAvatarDiff || isBannerDiff || isRealNameDiff) {
                const logs = [];
                if (isRealNameDiff) logs.push(`تحديث الاسم الحقيقي إلى "${m.nickname}"`);
                if (isRoleDiff) logs.push(`تغيير الدور من "${dbUser.role || '—'}" إلى "${finalRole}"`);
                if (isRankDiff) logs.push(`تغيير الرتبة من "${dbUser.rank || '—'}" إلى "${finalRank}"`);
                if (isCodeDiff) logs.push(`تغيير الكود من "${dbUser.code || '—'}" إلى "${m.code}"`);
                if (isDeptDiff) logs.push(`تغيير الإدارة من "${dbUser.department || '—'}" إلى "${dept}"`);
                if (isStatusDiff) logs.push(`تنشيط الحساب (تغيير الحالة من "${dbUser.status}" إلى "active")`);
                if (isAvatarDiff) logs.push(`تحديث الصورة الشخصية من الديسكورد`);
                if (isBannerDiff) logs.push(`تحديث غلاف الحساب من الديسكورد`);
 
                db.run(`UPDATE users SET role = ?, rank = ?, department = ?, code = ?, status = 'active', avatar = ?, banner = ?, real_name = ?, updated_at = datetime('now') WHERE id = ?`,
                  [finalRole, finalRank, dept, m.code, avatarUrl || dbUser.avatar, bannerUrl || dbUser.banner, m.nickname, targetDbId],
                  function(updErr) {
                    if (!updErr) {
                      const details = `مزامنة تلقائية: تحديث بيانات العضو "${dbUser.display_name || dbUser.username || m.nickname}": ${logs.join('، ')}`;
                      logSystemActivity('sync_update_user', 'النظام', details);
                      resUser();
                    } else {
                      resUser();
                    }
                  }
                );
              } else {
                resUser();
              }
            }
          });
        });
      });
    }

    // 2. Disable users NOT in Google Sheets (only if NOT in forceId mode)
    if (!forceId) {
      await new Promise((resDeactAll) => {
        db.all("SELECT id, username, display_name, status, role, discord_id, rank, is_manual_role FROM users WHERE status = 'active'", [], (err, activeUsers) => {
          if (err || !activeUsers) {
            resDeactAll();
            return;
          }

          const deactivatePromises = activeUsers.map(user => {
            // Protect Owner, Assistant Owner, Guest Viewers, and Manually assigned users from auto-deactivation
            const isOwnerOrAssistant = ['1334568342345748565', '821825761673478144'].includes(user.id) || 
                                       (user.username && ['3gjo', 'ifm711', 'onlyryan', 'onlyryan -', 'onlyryan-'].includes(user.username.toLowerCase())) ||
                                       (user.display_name && ['3gjo', 'ifm711', 'onlyryan', 'onlyryan -', 'onlyryan-'].includes(user.display_name.toLowerCase())) ||
                                       (user.role === 'owner' || user.role === 'assistant_owner');
            const isGuest = user.role === 'viewer' && (!user.rank || user.rank === 'مشاهد' || user.rank === 'غير معروف');
            const isStaff = ['owner', 'assistant_owner', 'academy_affairs', 'admin', 'recruitment_affairs', 'course_admin'].includes(user.role);
            const isManual = user.is_manual_role === 1 || user.is_manual_role === true || user.is_manual_role === '1';
            if (isOwnerOrAssistant || isStaff || isGuest || isManual) {
              return Promise.resolve();
            }

            const userDiscordId = user.discord_id || String(user.id).replace('discord_', '');
            
            // Check if user matches any row in mergedMembers
            let foundInSheets = false;
            if (mergedMembers[userDiscordId] !== undefined) {
              foundInSheets = true;
            } else {
              foundInSheets = Object.values(mergedMembers).some(m => {
                const sheetRowUser = { discord: m.discordId, name: m.nickname };
                return checkUserMatch(sheetRowUser, user);
              });
            }

            if (!foundInSheets) {
              return new Promise((resDeact) => {
                db.run("UPDATE users SET role = 'viewer', rank = 'مشاهد', department = '', status = 'active', updated_at = datetime('now') WHERE id = ?", [user.id], function(deactErr) {
                  if (!deactErr) {
                    const details = `مزامنة تلقائية: تعديل دور العضو "${user.display_name || user.username}" (معرف: ${user.id}) إلى مشاهد لعدم وجوده في ملفات Google Sheets`;
                    logSystemActivity('sync_disable_user', 'النظام', details);
                    resDeact();
                  } else {
                    resDeact();
                  }
                });
              });
            }
            return Promise.resolve();
          });

          Promise.all(deactivatePromises).then(() => resDeactAll());
        });
      });
    } else {
      // If forceId mode and user is not in sheets, do NOT deactivate them immediately if they are owner, assistant owner, or guest.
      // Even if they are a military officer, do NOT deactivate them synchronously on login to prevent locking out users on name mismatches.
      const cleanForceId = String(forceId).replace('discord_', '');
      const isPresent = mergedMembers[forceId] !== undefined || mergedMembers[cleanForceId] !== undefined;
      if (!isPresent) {
        await new Promise((resDeact) => {
          db.get('SELECT * FROM users WHERE id = ? OR id = ? OR discord_id = ?', [forceId, cleanForceId, cleanForceId], (err, dbUser) => {
            if (err) {
              resDeact();
              return;
            }

            // Double check if dbUser matches any member in mergedMembers
            let foundInSheets = false;
            if (dbUser) {
              const userDiscordId = dbUser.discord_id || String(dbUser.id).replace('discord_', '');
              if (mergedMembers[userDiscordId] !== undefined) {
                foundInSheets = true;
              } else {
                foundInSheets = Object.values(mergedMembers).some(m => {
                  const sheetRowUser = { discord: m.discordId, name: m.nickname };
                  return checkUserMatch(sheetRowUser, dbUser);
                });
              }
            }

            const targetDbId = dbUser ? dbUser.id : forceId;

            const isOwnerOrAssistant = ['1334568342345748565', '821825761673478144'].includes(targetDbId) || 
                                       ['1334568342345748565', '821825761673478144'].includes(cleanForceId) || 
                                       (dbUser && (dbUser.role === 'owner' || dbUser.role === 'assistant_owner'));

            const isGuest = dbUser && dbUser.role === 'viewer' && (!dbUser.rank || dbUser.rank === 'مشاهد' || dbUser.rank === 'غير معروف');

            if (foundInSheets) {
              // The user is present in Google Sheets under a different format/ID. Reactivate/keep active!
              if (dbUser && dbUser.status !== 'active') {
                db.run("UPDATE users SET status = 'active', updated_at = datetime('now') WHERE id = ?", [targetDbId], () => resDeact());
              } else {
                resDeact();
              }
              return;
            }

            if (isOwnerOrAssistant || isGuest || !dbUser) {
              if (dbUser && dbUser.status !== 'active') {
                db.run("UPDATE users SET status = 'active', updated_at = datetime('now') WHERE id = ?", [targetDbId], () => resDeact());
              } else if (!dbUser) {
                // Insert new guest user as ACTIVE
                db.run(`INSERT INTO users (id, discord_id, username, display_name, role, rank, department, code, status) 
                        VALUES (?, ?, ?, ?, 'viewer', 'مشاهد', 'غير معروف', '—', 'active')`,
                  [targetDbId, cleanForceId, 'غير معروف', 'غير معروف'], () => resDeact());
              } else {
                resDeact();
              }
              return;
            }

            // For existing military users who are not found in sheets during immediate sync,
            // we do NOT deactivate them synchronously on login to prevent lockout from spelling mismatches.
            // We let them log in, and the background sync will deal with it if they are truly removed.
            resDeact();
          });
        });
      }
    }

    console.log('[Sync] Background synchronization successfully completed.');
    // After syncing users to DB, also update the members_google_sheets_cache.json
    // so that amn13.html and amn15.html always show fresh data
    if (!forceId) {
      syncMembersCacheFile().catch(e => console.warn('[Sync] Cache file update failed:', e.message));
    }
    resolve({ success: true });
  });
}

// Fetches all sheet tabs and saves a full structured cache to members_google_sheets_cache.json
async function syncMembersCacheFile() {
  const config = loadConfig();
  if (!config.spreadsheetId) return;

  const ALL_TABS = [
    "جدول الامن العام - الاساسي",
    "جدول الامن العام - الادارة",
    "جدول الامن العام - المنتدبين",
    "نظام الترقيات ⭐️جديد",
    "الترقيات المسرعة ",
    "الإستقالات 🎯",
    " جدول الغرامات 💵",
    "جدول الادارة العامة لشؤون الادارية والمالية",
    "جدول الإدارة العامه لشؤون تدريب الامن العام",
    " جدول الادارة العامه لشؤون التجنيد",
    "الادارة العامة لشؤون العسكرية"
  ];

  const cache = {};
  let successCount = 0;

  for (const tabName of ALL_TABS) {
    try {
      const { headers, rows } = await fetchPublicSheetRows(config.spreadsheetId, tabName);
      const cleanHeaders = headers.map(h => (h || '').trim().toLowerCase());

      // Build a full-row object for each member
      const members = [];
      for (const r of rows) {
        const entry = {};
        headers.forEach((h, i) => {
          entry[h || `col_${i}`] = r[i] || '';
        });

        // Parse key fields using flexible header matching
        const getVal = (keywords) => {
          const idx = cleanHeaders.findIndex(h => keywords.some(k => h.includes(k)));
          return idx !== -1 ? (r[idx] || '') : '';
        };

        const name = getVal(['الاسم', 'اسم العسكري']);
        if (!name || name === 'الاسم' || name.includes('الاسم')) continue;

        const discord = getVal(['id discord', 'ديسكورد', 'دسكورد', 'التعريف']);
        const badge = getVal(['الكود', 'كود']).replace(/[\[\]]/g, '').trim();
        const rank = getVal(['الرتبة', 'رتبة']);
        const status = getVal(['الحالة', 'الوضع', 'حالة الموظف']);
        const position = getVal(['المنصب', 'المهام القياديه', 'المهام القيادية', 'المسؤولية']);
        const notes = getVal(['ملاحظات', 'الملاحظات']);

        const member = { name, discord, badge, rank, status: status || 'بالخدمة', position: position || '', notes: notes || '—', courses: [], regularCourses: [] };

        // Extra fields for training tab
        if (tabName === 'جدول الإدارة العامه لشؤون تدريب الامن العام') {
          member.salary = getVal(['الراتب الاجمالي', 'الراتب الإجمالي', 'راتب']) || '—';
          member.deduction = getVal(['الاستقطاع', 'استقطاع']) || '—';
          member.netSalary = getVal(['الصافي', 'راتب صافي', 'الراتب الصافي']) || '—';
          member.joinDate = '—';
          member.badgeDegree = '—';
        }

        // Extra fields for resignation tab
        if (tabName === 'الإستقالات 🎯') {
          member.joinDate = getVal(['تاريخ الاستقالة', 'تاريخ']) || '—';
          member.badgeDegree = '—';
        }

        // Extra fields for main tabs
        if (['جدول الامن العام - الاساسي', 'جدول الامن العام - الادارة', 'جدول الامن العام - المنتدبين'].includes(tabName)) {
          const courseStr = getVal(['الدورات', 'دورات']);
          member.courses = courseStr ? courseStr.split(/[\|,،]/).map(c => c.trim()).filter(Boolean) : [];
          member.joinDate = getVal(['تاريخ الانضمام', 'التاريخ', 'تاريخ']) || '—';
          member.badgeDegree = getVal(['درجة استحقاق', 'الانواط', 'الأنواط']) || 'لا يوجد انذارات';
        }

        members.push(member);
      }

      cache[tabName] = members;
      successCount++;
      console.log(`[CacheSync] ✓ ${tabName}: ${members.length} entries`);
    } catch (err) {
      console.warn(`[CacheSync] ✗ Failed to fetch tab "${tabName}": ${err.message}`);
    }
  }

  if (successCount > 0) {
    const cacheFilePath = path.join(PUBLIC_DIR, 'assets', 'data', 'members_google_sheets_cache.json');
    fs.writeFile(cacheFilePath, JSON.stringify(cache, null, 2), 'utf8', (err) => {
      if (err) {
        console.error('[CacheSync] Failed to write members_google_sheets_cache.json:', err);
      } else {
        console.log(`[CacheSync] ✓ members_google_sheets_cache.json updated successfully (${successCount}/${ALL_TABS.length} tabs).`);
      }
    });
  }
}



const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf'
};

function downloadDiscordMedia(userId, url, type) {
  return new Promise((resolve) => {
    if (!url || typeof url !== 'string' || !url.startsWith('https://cdn.discordapp.com/')) {
      return resolve(url);
    }

    let match;
    let folderName;
    if (type === 'avatar') {
      match = url.match(/\/avatars\/(\d+)\/([a-zA-Z0-9_]+)/);
      folderName = 'avatars';
    } else if (type === 'banner') {
      match = url.match(/\/banners\/(\d+)\/([a-zA-Z0-9_]+)/);
      folderName = 'banners';
    }

    if (!match) {
      return resolve(url);
    }

    const hash = match[2];
    const isAnimated = url.includes('.gif') || hash.startsWith('a_');
    const ext = isAnimated ? 'gif' : 'png';
    const fileName = `${userId}_${hash}.${ext}`;
    const dirPath = path.join(PUBLIC_DIR, 'assets', 'img', folderName);
    const localFilePath = path.join(dirPath, fileName);
    const relativePath = `assets/img/${folderName}/${fileName}`;

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    if (fs.existsSync(localFilePath)) {
      return resolve(relativePath);
    }

    // Clean up old files for this user in this folder
    try {
      const files = fs.readdirSync(dirPath);
      files.forEach(file => {
        if (file.startsWith(userId + '_')) {
          fs.unlinkSync(path.join(dirPath, file));
        }
      });
    } catch (e) {}

    const fileStream = fs.createWriteStream(localFilePath);

    https.get(url, (res) => {
      if (res.statusCode === 200) {
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve(relativePath);
        });
      } else {
        fileStream.close();
        if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
        resolve(url);
      }
    }).on('error', () => {
      fileStream.close();
      if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
      resolve(url);
    });
  });
}

function updateDiscordUsersCacheFile(userId, username, globalName, avatar, banner, bannerColor) {
  const discordUsersFile = path.join(PUBLIC_DIR, 'assets', 'data', 'discord_users.json');
  let discordUsersData = {};
  if (fs.existsSync(discordUsersFile)) {
    try {
      discordUsersData = JSON.parse(fs.readFileSync(discordUsersFile, 'utf8'));
    } catch (e) {
      console.error('[Cache Update Error] Failed to read discord_users.json:', e.message);
    }
  }

  const existing = discordUsersData[userId] || {};
  const newRecord = {
    id: userId,
    username: username || existing.username || '',
    globalName: globalName || existing.globalName || '',
    avatar: avatar !== undefined ? avatar : (existing.avatar !== undefined ? existing.avatar : null),
    banner: banner !== undefined ? banner : (existing.banner !== undefined ? existing.banner : null),
    bannerColor: bannerColor || existing.bannerColor || '#000000',
    lastFetched: Date.now()
  };

  const changed = !existing.id ||
                  existing.username !== newRecord.username ||
                  existing.globalName !== newRecord.globalName ||
                  existing.avatar !== newRecord.avatar ||
                  existing.banner !== newRecord.banner ||
                  existing.bannerColor !== newRecord.bannerColor;

  discordUsersData[userId] = newRecord;

  try {
    fs.writeFileSync(discordUsersFile, JSON.stringify(discordUsersData, null, 2), 'utf8');
    console.log(`[Cache Update Success] Synchronized profile for user ${userId} to assets/data/discord_users.json (changed: ${changed})`);
  } catch (e) {
    console.error('[Cache Update Error] Failed to write discord_users.json:', e.message);
  }

  return changed;
}

function fetchDiscordUserData(userId, botToken) {
  return new Promise((resolve, reject) => {
    if (!botToken) {
      return reject(new Error('Discord Bot Token is not configured.'));
    }
    const options = {
      hostname: 'discord.com',
      path: `/api/v10/users/${userId}`,
      method: 'GET',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.get(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch (e) {
            reject(new Error('Failed to parse Discord response: ' + e.message));
          }
        } else {
          reject(new Error(`Discord API returned status ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

function fetchDiscordGuildRoles(guildId, botToken) {
  return new Promise((resolve, reject) => {
    if (!botToken || !guildId) {
      return reject(new Error('Discord Bot Token or Guild ID is not configured.'));
    }
    const options = {
      hostname: 'discord.com',
      path: `/api/v10/guilds/${guildId}/roles`,
      method: 'GET',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.get(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch (e) {
            reject(new Error('Failed to parse Discord roles response: ' + e.message));
          }
        } else {
          reject(new Error(`Discord API returned status ${res.statusCode} for roles: ${body}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

function fetchDiscordGuildMember(userId, guildId, botToken) {
  return new Promise((resolve, reject) => {
    if (!botToken || !guildId) {
      return reject(new Error('Discord Bot Token or Guild ID is not configured.'));
    }
    const options = {
      hostname: 'discord.com',
      path: `/api/v10/guilds/${guildId}/members/${userId}`,
      method: 'GET',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.get(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch (e) {
            reject(new Error('Failed to parse Discord guild member response: ' + e.message));
          }
        } else {
          reject(new Error(`Discord API returned status ${res.statusCode} for member: ${body}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

function cleanArabicString(str) {
  if (!str) return "";
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ـ/g, ''); // إزالة الكشيدة (التطويل)
}

let isDiscordSyncing = false;

async function syncAllUsersFromDiscord() {
  if (isDiscordSyncing) {
    console.log('[Sync Engine] Sync already in progress. Skipping duplicate execution.');
    return { success: true, message: 'Sync already in progress.', updatedCount: 0, failedCount: 0 };
  }
  isDiscordSyncing = true;

  const botToken = config.discordToken;
  if (!botToken) {
    console.warn('[Sync Engine Warning] Discord Bot Token not configured. Synchronization skipped.');
    isDiscordSyncing = false;
    return { success: false, error: 'Discord Bot Token is not configured.' };
  }

  const guildId = config.guildId;
  let guildRoles = null;
  if (guildId) {
    try {
      console.log('[Sync Engine] Fetching server roles from Discord...');
      guildRoles = await fetchDiscordGuildRoles(guildId, botToken);
      console.log(`[Sync Engine] Successfully fetched ${guildRoles.length} roles from Discord.`);
    } catch (roleErr) {
      console.warn('[Sync Engine Warning] Failed to fetch server roles:', roleErr.message);
    }
  }

  console.log('[Sync Engine] Starting background synchronization of all users from Discord...');

  const getUsers = () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM users', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  };

  try {
    const users = await getUsers();
    let updatedCount = 0;
    let failedCount = 0;

    for (const u of users) {
      const discordId = u.discord_id || u.id;
      if (!discordId || !/^\d{17,20}$/.test(discordId)) {
        continue;
      }

      try {
        console.log(`[Sync Engine] Fetching Discord data for user: ${u.username} (${discordId})...`);
        const discordUser = await fetchDiscordUserData(discordId, botToken);
        
        let guildMember = null;
        if (guildId) {
          try {
            guildMember = await fetchDiscordGuildMember(discordId, guildId, botToken);
            console.log(`[Sync Engine] Successfully fetched guild member details for: ${u.username} (${discordId})`);
          } catch (memberErr) {
            console.log(`[Sync Engine Info] User ${u.username} (${discordId}) is not a member of the guild or failed to fetch member details:`, memberErr.message);
          }
        }

        let avatarUrl = '';
        if (discordUser.avatar) {
          const ext = discordUser.avatar.startsWith('a_') ? 'gif' : 'png';
          avatarUrl = `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.${ext}`;
        }
        
        let bannerUrl = '';
        if (discordUser.banner) {
          const ext = discordUser.banner.startsWith('a_') ? 'gif' : 'png';
          bannerUrl = `https://cdn.discordapp.com/banners/${discordId}/${discordUser.banner}.${ext}`;
        }

        let bannerColor = null;
        if (discordUser.banner_color) {
          bannerColor = discordUser.banner_color;
        } else if (discordUser.accent_color !== undefined && discordUser.accent_color !== null) {
          bannerColor = '#' + discordUser.accent_color.toString(16).padStart(6, '0');
        }

        let avatarLocalPath = avatarUrl;
        let bannerLocalPath = bannerUrl;

        if (avatarUrl) {
          avatarLocalPath = await downloadDiscordMedia(discordId, avatarUrl, 'avatar');
        }
        if (bannerUrl) {
          bannerLocalPath = await downloadDiscordMedia(discordId, bannerUrl, 'banner');
        }

        let displayName = (guildMember && guildMember.nick) ? guildMember.nick : (discordUser.global_name || discordUser.username || u.display_name || u.username);
        
        let matchedRank = '';
        let matchedRole = '';

        if (guildMember && guildMember.roles && guildRoles) {
          const memberRoles = guildRoles
            .filter(r => guildMember.roles.includes(r.id))
            .sort((a, b) => b.position - a.position);

          for (const r of memberRoles) {
            const name = r.name.toLowerCase().trim();
            if (name.includes('owner') || name.includes('المالك') || name.includes('المشرف العام')) {
              matchedRole = 'owner';
              break;
            } else if (name.includes('assistant owner') || name.includes('مساعد المالك') || name.includes('مساعد قائد القوة')) {
              matchedRole = 'assistant_owner';
              break;
            } else if (name.includes('academy affairs') || name.includes('شؤون اكاديمية التدريب') || name.includes('أكاديمية التدريب') || name.includes('اكاديمية التدريب')) {
              matchedRole = 'academy_affairs';
              break;
            } else if (name.includes('admin') || name.includes('ادمن') || name.includes('أدمن') || name.includes('إدارة')) {
              matchedRole = 'admin';
              break;
            }
          }

          const managedRanks = config.managedRoles && config.managedRoles.length > 0 ? config.managedRoles : [
            'منسوب ادارة تدريب الامن العام',
            'فريق ركن', 'لواء ركن', 'عميد ركن', 'عقيد', 'مقدم', 'رائد', 'نقيب',
            'ملازم اول', 'ملازم', 'رئيس رقباء', 'رقيب اول', 'رقيب', 'عريف', 'جندي اول', 'جندي'
          ];

          for (const r of memberRoles) {
            const name = r.name.trim();
            const cleanR = cleanArabicString(name);
            const foundRank = managedRanks.find(mr => cleanArabicString(mr) === cleanR);
            if (foundRank) {
              matchedRank = foundRank;
              break;
            }
          }
        }

        const isManual = u.is_manual_role === 1 || u.is_manual_role === true;
        let finalRole = isManual ? u.role : (matchedRole || u.role || 'viewer');
        let finalRank = isManual ? u.rank : (u.rank || matchedRank || 'مشاهد');

        if (['1334568342345748565'].includes(discordId)) {
          finalRole = 'owner';
          finalRank = 'المشرف العام';
        } else if (['821825761673478144'].includes(discordId)) {
          finalRole = 'assistant_owner';
          finalRank = 'مساعد المشرف العام';
        }

        const hasChanges = u.avatar !== avatarLocalPath ||
                           u.banner !== bannerLocalPath ||
                           u.avatar_url !== avatarUrl ||
                           u.banner_url !== bannerUrl ||
                           u.username !== discordUser.username ||
                           u.global_name !== discordUser.global_name ||
                           u.display_name !== displayName ||
                           u.role !== finalRole ||
                           u.rank !== finalRank;

        if (hasChanges) {
          await new Promise((resolveUpdate, rejectUpdate) => {
            db.run(
              `UPDATE users SET 
                avatar = ?, 
                banner = ?, 
                avatar_url = ?, 
                banner_url = ?, 
                username = ?,
                display_name = ?,
                global_name = ?,
                role = ?,
                rank = ?,
                last_sync = datetime('now'),
                updated_at = datetime('now')
               WHERE id = ?`,
              [avatarLocalPath || u.avatar, bannerLocalPath || u.banner, avatarUrl || u.avatar_url, bannerUrl || u.banner_url, discordUser.username, displayName, discordUser.global_name, finalRole, finalRank, u.id],
              (updErr) => {
                if (updErr) rejectUpdate(updErr);
                else resolveUpdate();
              }
            );
          });

          updateDiscordUsersCacheFile(discordId, discordUser.username, displayName, avatarLocalPath, bannerLocalPath, bannerColor);
          updatedCount++;
          console.log(`[Sync Engine] Successfully updated profile for user: ${u.username}`);
        } else {
          await new Promise((resolveUpdate) => {
            db.run(`UPDATE users SET last_sync = datetime('now') WHERE id = ?`, [u.id], () => resolveUpdate());
          });
        }

        await new Promise(r => setTimeout(r, 500));

      } catch (userErr) {
        failedCount++;
        console.error(`[Sync Engine Error] Failed to sync user ${u.username} (${discordId}):`, userErr.message);
      }
    }

    console.log(`[Sync Engine] Synchronization completed. Updated ${updatedCount} users. Failed: ${failedCount}`);

    if (updatedCount > 0) {
      const { exec } = require('child_process');
      console.log('[Sync Engine] Profile changes detected. Triggering deploy to Surge...');
      exec('node deploy_surge.js', { cwd: PUBLIC_DIR }, (deployErr) => {
        if (deployErr) console.error('[Sync Engine] Surge deploy failed:', deployErr);
        else console.log('[Sync Engine] Surge deploy successful!');
      });
    }

    isDiscordSyncing = false;
    return { success: true, updatedCount, failedCount };
  } catch (err) {
    isDiscordSyncing = false;
    console.error('[Sync Engine Critical Error] Failed to fetch users list:', err);
    return { success: false, error: err.message };
  }
}

function logSystemActivity(type, username, details) {
  const auditType = type || 'info';
  const op = username || 'النظام';
  const msg = details || '';
  
  // 1. Write to DB audit_logs
  db.run('INSERT INTO audit_logs (action_type, username, details) VALUES (?, ?, ?)',
    [auditType, op, msg], (err) => {
      if (err) console.error('[logSystemActivity DB Error]:', err);
    });

  // 2. Write to system_logs.json
  const LOGS_FILE = path.join(PUBLIC_DIR, 'assets', 'data', 'system_logs.json');
  const newLog = {
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    type: auditType,
    username: op,
    discord: '',
    details: msg
  };

  fs.readFile(LOGS_FILE, 'utf8', (err, data) => {
    let logs = [];
    if (!err) {
      try {
        logs = JSON.parse(data);
      } catch (e) {
        console.error('Error parsing system_logs.json, recreating:', e);
      }
    }
    if (!Array.isArray(logs)) logs = [];
    logs.unshift(newLog);
    if (logs.length > 1000) {
      logs = logs.slice(0, 1000);
    }
    fs.writeFile(LOGS_FILE, JSON.stringify(logs, null, 2), 'utf8', (writeErr) => {
      if (writeErr) {
        console.error('Error writing system_logs.json:', writeErr);
      }
    });
  });
}

// ─── Server-side cache for /api/db/collections ───
// Avoids 9 DB queries + full JSON serialization on every polling cycle (every 10s)
let _collectionsCache = null;       // { body: string, etag: string }
let _collectionsCacheTime = 0;
const COLLECTIONS_CACHE_TTL = 30000; // 30 seconds TTL (was 8s - increased to reduce DB load)
function invalidateCollectionsCache() {
  _collectionsCache = null;
  _collectionsCacheTime = 0;
}

const server = http.createServer((req, res) => {
  const reqUrl = url.parse(req.url, true);
  const pathname = reqUrl.pathname;

  console.log(`[${req.method}] ${pathname}`);

  // Proxy /api/gallery requests to the Discord Express server on port 3001
  if (pathname.startsWith('/api/gallery')) {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: req.url,
      method: req.method,
      headers: req.headers
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
      console.error('[Proxy Error] Failed to proxy to gallery server:', err);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Gallery service temporarily unavailable' }));
    });

    req.pipe(proxyReq, { end: true });
    return;
  }

  // CORS headers for local cross-origin/cross-port/file:// requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Bypass-Tunnel-Reminder, bypass-tunnel-reminder, Authorization');

  // Security Headers
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');

   // Dynamic Maintenance mode check from settings.json
   let isMaintenance = false;
   try {
     const settingsPath = path.join(PUBLIC_DIR, 'assets', 'data', 'settings.json');
     if (fs.existsSync(settingsPath)) {
       const settingsData = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
       isMaintenance = !!settingsData.maintenanceMode;
     }
   } catch (e) {
     console.error('[Maintenance Check Error] Failed to read settings.json:', e.message);
   }

   if (isMaintenance && !pathname.startsWith('/api') && !pathname.startsWith('/assets/')) {
     const maintFile = path.join(PUBLIC_DIR, 'maintenance.html');
     fs.readFile(maintFile, (err, data) => {
       if (err) {
         res.writeHead(500, { 'Content-Type': 'text/plain' });
         res.end('Site under maintenance');
         return;
       }
       res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
       res.end(data);
     });
     return;
   }
  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type, Bypass-Tunnel-Reminder, bypass-tunnel-reminder, Authorization',
      'Access-Control-Max-Age': '86400' // Cache preflight response for 24 hours
    });
    res.end();
    return;
  }

  // GET /api/healthz or /healthz - Simple keep-alive health check
  if ((pathname === '/api/healthz' || pathname === '/healthz') && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', message: 'Server is active and awake!', timestamp: new Date() }));
    return;
  }


  // 1. API: Settings GET
  if (pathname === '/api/settings' && req.method === 'GET') {
    fs.readFile(SETTINGS_FILE, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Could not read settings file' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    });
    return;
  }

  // 2. API: Settings POST
  if (pathname === '/api/settings' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });

    req.on('end', () => {
      try {
        const newSettings = JSON.parse(body);
        
        // Read current settings first to merge them
        let currentSettings = {};
        if (fs.existsSync(SETTINGS_FILE)) {
          try {
            currentSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
          } catch (e) {
            console.error('Error parsing current settings.json:', e);
          }
        }

        const mergedSettings = { ...currentSettings, ...newSettings };
        
        fs.writeFile(SETTINGS_FILE, JSON.stringify(mergedSettings, null, 2), 'utf8', (err) => {
          if (err) {
            console.error('Error writing settings.json:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Could not write settings file' }));
            return;
          }

          console.log('[API Settings] Successfully updated settings.json on disk!');
          logSystemActivity('settings_update', 'المشرف', 'تم تحديث إعدادات النظام');
          
          // Trigger automatic deployment to Surge in background
          const { exec } = require('child_process');
          exec('node deploy_surge.js', { cwd: PUBLIC_DIR }, (deployErr, stdout, stderr) => {
            if (deployErr) {
              console.error('[API Settings] Auto-deploy to Surge failed:', deployErr);
            } else {
              console.log('[API Settings] Auto-deploy to Surge successful!');
            }
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, settings: mergedSettings }));
        });
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  // 2b. API: Sheets Cache POST
  if (pathname === '/api/sheets_cache' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });

    req.on('end', () => {
      try {
        const cacheData = JSON.parse(body);
        const cacheFilePath = path.join(PUBLIC_DIR, 'assets', 'data', 'members_google_sheets_cache.json');
        
        fs.writeFile(cacheFilePath, JSON.stringify(cacheData, null, 2), 'utf8', (err) => {
          if (err) {
            console.error('Error writing members_google_sheets_cache.json:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Could not write sheets cache file' }));
            return;
          }

          console.log('[API Sheets Cache] Successfully updated members_google_sheets_cache.json on disk!');
          logSystemActivity('sheets_cache_update', 'النظام', 'تم تحديث ملف الكاش لـ Google Sheets');
          
          // Trigger automatic deployment to Surge in background
          const { exec } = require('child_process');
          exec('node deploy_surge.js', { cwd: PUBLIC_DIR }, (deployErr, stdout, stderr) => {
            if (deployErr) {
              console.error('[API Sheets Cache] Auto-deploy to Surge failed:', deployErr);
            } else {
              console.log('[API Sheets Cache] Auto-deploy to Surge successful!');
            }
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        });
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  // ----- Attendance Books System APIs -----
  // GET /api/attendance/books - Get status of all 7 books
  if (pathname === '/api/attendance/books' && req.method === 'GET') {
    db.all('SELECT * FROM attendance_books', [], (err, rows) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rows || []));
      }
    });
    return;
  }

  // POST /api/attendance/toggle - Open or close an attendance book
  if (pathname === '/api/attendance/toggle' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { book_id, status, operator_id, room_image, course_type } = data; // status: 'open', 'closed', or 'report_sent'

        if (!book_id || !status || !operator_id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing parameters: book_id, status, and operator_id are required' }));
          return;
        }

        const validBooks = ['ops', 'traffic', 'roads', 'aviation', 'district_officers', 'special_tasks', 'narcotics'];
        if (!validBooks.includes(book_id)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid book_id' }));
          return;
        }

        // Validate operator permission
        db.get('SELECT role, display_name, username FROM users WHERE id = ?', [operator_id], (err, user) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Database error fetching user' }));
            return;
          }

          const ROLE_LEVELS = {
            'owner': 6,
            'assistant_owner': 5,
            'academy_affairs': 4.5,
            'admin': 4,
            'recruitment_affairs': 3.8,
            'course_admin': 3.5,
            'viewer': 0
          };

          const isOwnerBackdoor = ['1334568342345748565', '821825761673478144'].includes(operator_id);
          const userRole = user ? user.role : 'viewer';
          const userLevel = ROLE_LEVELS[userRole] || 0;

          if (userLevel < 3.5 && !isOwnerBackdoor) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'عذراً، لا تملك صلاحية التحكم بدفاتر الحضور (مطلوب رتبة مسؤول دورة أو أعلى)' }));
            return;
          }

          const userName = user ? (user.display_name || user.username) : 'مشرف';
          const userRoleLabel = user ? (userRole === 'owner' ? 'المشرف العام' : userRole === 'assistant_owner' ? 'قيادة الامن العام' : userRole === 'academy_affairs' ? 'رئاسة تدريب الامن العام' : userRole === 'admin' ? 'شؤون أكاديمية التدريب' : 'مسؤول دورة') : 'مسؤول دورة';

          // Get book name and current status
          db.get('SELECT book_name, status, room_image, course_type FROM attendance_books WHERE book_id = ?', [book_id], (errBook, book) => {
            if (errBook || !book) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Book not found' }));
              return;
            }

            const bookName = book.book_name;
            const currentStatus = book.status || 'closed';
            const bookCourseType = course_type || book.course_type || 'أساسية';

            let savedRoomImageUrl = room_image || book.room_image || null;

            // Handle base64 image saving in backend if status is open
            if (status === 'open' && room_image && room_image.startsWith('data:image/')) {
              try {
                const matches = room_image.match(/^data:image\/([A-Za-z0-9]+);base64,/);
                let extension = 'jpg';
                if (matches && matches[1]) {
                  extension = matches[1] === 'jpeg' ? 'jpg' : matches[1];
                }
                const base64Data = room_image.replace(/^data:image\/[A-Za-z0-9]+;base64,/, "");
                const buffer = Buffer.from(base64Data, 'base64');
                const uploadsDir = path.join(PUBLIC_DIR, 'assets', 'img', 'uploads');
                if (!fs.existsSync(uploadsDir)) {
                  fs.mkdirSync(uploadsDir, { recursive: true });
                }
                const filename = `room_${book_id}_${Date.now()}.${extension}`;
                const filePath = path.join(uploadsDir, filename);
                fs.writeFileSync(filePath, buffer);

                const protocol = (req.headers['x-forwarded-proto'] || 'http') + '://';
                const host = req.headers.host || 'localhost:3000';
                savedRoomImageUrl = `${protocol}${host}/assets/img/uploads/${filename}`;
                console.log(`[Upload Success] Saved base64 image locally. URL: ${savedRoomImageUrl}`);
              } catch (uploadErr) {
                console.error('[Upload Error] Failed to save base64 image:', uploadErr);
              }
            }

            const bookRoomImage = savedRoomImageUrl;

            const actionLabel = status === 'open' ? 'فتح التحضير' : (status === 'report_sent' ? 'إرسال التقرير' : 'إغلاق التحضير');
            const operatorStr = `${userName} (${userRoleLabel})`;

            let query = `UPDATE attendance_books SET status = ?, updated_by = ?, updated_at = datetime('now') WHERE book_id = ?`;
            let params = [status, operatorStr, book_id];

            if (status === 'open') {
              query = `UPDATE attendance_books SET status = ?, updated_by = ?, room_image = ?, course_type = ?, updated_at = datetime('now') WHERE book_id = ?`;
              params = [status, operatorStr, savedRoomImageUrl, bookCourseType, book_id];
            }

            db.run(query, params, (updateErr) => {
              if (updateErr) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: updateErr.message }));
                return;
              }

              // Log the action
              db.run(`INSERT INTO attendance_book_logs (book_id, book_name, action, operator) VALUES (?, ?, ?, ?)`,
                [book_id, bookName, actionLabel, operatorStr],
                (logErr) => {
                  if (logErr) {
                    console.error('Failed to log attendance book change:', logErr);
                  }
                  
                  // Add system audit log
                  const auditMsg = `قام "${userName}" (${userRoleLabel}) بـ ${actionLabel} لـ "${bookName}"`;
                  logSystemActivity('attendance_toggle', operatorStr, auditMsg);

                  // If status is report_sent, fetch active attendees for current session and send report to Discord
                  if (status === 'report_sent') {
                    db.get(`SELECT timestamp FROM attendance_book_logs WHERE book_id = ? AND action = 'فتح التحضير' ORDER BY id DESC LIMIT 1`, [book_id], (errLog, lastOpenLog) => {
                      const openTime = lastOpenLog ? lastOpenLog.timestamp : '1970-01-01 00:00:00';
                      db.all(`SELECT user_id, display_name, rank, code, timestamp FROM attendance_records WHERE book_id = ? AND timestamp >= ? ORDER BY id ASC`, [book_id, openTime], (errRecs, records) => {
                        if (errRecs) {
                          console.error('Error fetching records for Discord report:', errRecs);
                        }
                        // Load training sheets from cache file or fallback to general_collections table
                        const cacheFilePath = path.join(PUBLIC_DIR, 'assets', 'data', 'members_google_sheets_cache.json');
                        fs.readFile(cacheFilePath, 'utf8', (fsErr, fileData) => {
                          let trainingMembers = [];
                          if (!fsErr && fileData) {
                            try {
                              const parsedData = JSON.parse(fileData);
                              trainingMembers = parsedData['جدول الإدارة العامه لشؤون تدريب الامن العام'] || [];
                            } catch (e) {
                              console.error('Error parsing sheets cache file:', e);
                            }
                          }

                          if (trainingMembers.length > 0) {
                            sendAttendanceReportToDiscord(bookName, operator_id, bookRoomImage, records || [], bookCourseType, trainingMembers);
                          } else {
                            db.get(`SELECT data_json FROM general_collections WHERE collection_key IN ('members_google_sheets_cache', 'ps_members_google_sheets_cache') LIMIT 1`, [], (errSheets, sheetRow) => {
                              if (!errSheets && sheetRow && sheetRow.data_json) {
                                try {
                                  const parsedData = JSON.parse(sheetRow.data_json);
                                  trainingMembers = parsedData['جدول الإدارة العامه لشؤون تدريب الامن العام'] || [];
                                } catch (e) {}
                              }
                              sendAttendanceReportToDiscord(bookName, operator_id, bookRoomImage, records || [], bookCourseType, trainingMembers);
                            });
                          }
                        });
                      });
                    });
                  }

                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, status }));
                }
              );
            });
          });
        });
      } catch (ex) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // POST /api/attendance/submit - Self-attendance check-in
  if (pathname === '/api/attendance/submit' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { book_id, user_id } = data;

        if (!book_id || !user_id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing parameters: book_id and user_id are required' }));
          return;
        }

        // 1. Get user details
        db.get('SELECT username, display_name, rank, code FROM users WHERE id = ?', [user_id], (errUser, user) => {
          if (errUser || !user) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'عذراً، لم يتم العثور على حسابك العسكري في قاعدة البيانات لتسجيل حضورك' }));
            return;
          }

          // 2. Check if the book is open
          db.get('SELECT book_name, status, room_image FROM attendance_books WHERE book_id = ?', [book_id], (errBook, book) => {
            if (errBook || !book) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'دفتر الحضور غير موجود' }));
              return;
            }

            if (book.status !== 'open') {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'التحضير مغلق حالياً لهذه الدورة. يرجى الانتظار حتى يفتحه مسؤول الدورة' }));
              return;
            }

            // 3. Find the last "فتح التحضير" log for this book
            db.get(`SELECT timestamp FROM attendance_book_logs WHERE book_id = ? AND action = 'فتح التحضير' ORDER BY id DESC LIMIT 1`, [book_id], (errLog, lastOpenLog) => {
              if (errLog) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Database error looking up book logs' }));
                return;
              }

              const openTime = lastOpenLog ? lastOpenLog.timestamp : '1970-01-01 00:00:00';

              // 4. Check if the user already submitted attendance since this open time
              db.get(`SELECT id FROM attendance_records WHERE book_id = ? AND user_id = ? AND timestamp >= ?`, [book_id, user_id, openTime], (errRec, record) => {
                if (errRec) {
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Database error checking duplicate attendance' }));
                  return;
                }

                if (record) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'لقد قمت بتحضير نفسك بالفعل لهذه الدورة في الفترة المفتوحة الحالية' }));
                  return;
                }

                // 5. Submit attendance
                const displayName = user.display_name || user.username;
                const roomImage = book.room_image || null;
                db.run(`INSERT INTO attendance_records (book_id, book_name, user_id, username, display_name, rank, code, status, room_image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [book_id, book.book_name, user_id, user.username, displayName, user.rank || '—', user.code || '—', 'present', roomImage],
                  function(insertErr) {
                    if (insertErr) {
                      res.writeHead(500, { 'Content-Type': 'application/json' });
                      res.end(JSON.stringify({ error: insertErr.message }));
                      return;
                    }

                    // Audit Log
                    const auditMsg = `قام المدرب "${displayName}" (الرتبة: ${user.rank || '—'}, الكود: ${user.code || '—'}) بتحضير نفسه في "${book.book_name}"`;
                    logSystemActivity('attendance_submit', displayName, auditMsg);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, recordId: this.lastID }));
                  }
                );
              });
            });
          });
        });
      } catch (ex) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // GET /api/attendance/reports - Fetch attendance records and history logs
  if (pathname === '/api/attendance/reports' && req.method === 'GET') {
    db.all('SELECT * FROM attendance_records ORDER BY id DESC', [], (errRec, records) => {
      if (errRec) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: errRec.message }));
        return;
      }

      db.all('SELECT * FROM attendance_book_logs ORDER BY id DESC', [], (errLogs, logs) => {
        if (errLogs) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: errLogs.message }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          records: records || [],
          logs: logs || []
        }));
      });
    });
    return;
  }

  // POST /api/attendance/clear_records - Clear all attendance records
  if (pathname === '/api/attendance/clear_records' && req.method === 'POST') {
    db.run('DELETE FROM attendance_records', [], function(err) {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, changes: this.changes || 0 }));
      }
    });
    return;
  }

  // POST /api/attendance/clear_logs - Clear all attendance logs
  if (pathname === '/api/attendance/clear_logs' && req.method === 'POST') {
    db.run('DELETE FROM attendance_book_logs', [], function(err) {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, changes: this.changes || 0 }));
      }
    });
    return;
  }

  // GET /api/test_proxy - Test proxy connection with browser headers
  if (pathname === '/api/test_proxy' && req.method === 'GET') {
    const testRequest = (hostname, pathUrl) => {
      return new Promise((resolve) => {
        const payload = JSON.stringify({
          content: 'Test message with browser headers'
        });
        const options = {
          hostname: hostname,
          path: pathUrl,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        };
        const req = https.request(options, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              bodySnippet: body.substring(0, 500)
            });
          });
        });
        req.on('error', (err) => {
          resolve({ error: err.message });
        });
        req.write(payload);
        req.end();
      });
    };

    Promise.all([
      testRequest('discord.com', '/api/webhooks/1519343011417559041/kZrlK9SJX5afM8G8u_uFxhnsTjHQpncdZ8BwyZ89Z_a1VX5QPeWKD_Rc5_Ee4Zj3Vo4h'),
      testRequest('webhook.lewisakura.moe', '/api/webhooks/1519343011417559041/kZrlK9SJX5afM8G8u_uFxhnsTjHQpncdZ8BwyZ89Z_a1VX5QPeWKD_Rc5_Ee4Zj3Vo4h')
    ]).then(([resDiscord, resLewis]) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ discord: resDiscord, lewisakura: resLewis }));
    });
    return;
  }

  // ----- Exam Archive API -----
  // POST /api/exams – create or update an exam attempt
  if (pathname === '/api/exams' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        syncSaveAttempt(data, function(err, resultId) {
          if (err) {
            console.error('❌ DB attempt sync error:', err);
            res.writeHead(500, {'Content-Type':'application/json'});
            res.end(JSON.stringify({error: err.message}));
          } else {
            // Audit Log
            const name = data.trainee_name || 'متدرب';
            const exam = data.exam_name || 'اختبار';
            const status = data.status;
            let auditMsg = `بدأ المتدرب "${name}" (الرتبة: ${data.rank || '—'}, الكود: ${data.code || '—'}) اختبار "${exam}" في دورة "${data.course_name}"`;
            let auditType = 'exam_start';
            
            if (data.id) {
              auditType = 'exam_update';
              if (data.score !== undefined) {
                auditMsg = `أكمل المتدرب "${name}" اختبار "${exam}" بدرجة ${data.score}% - النتيجة: ${data.pass_status || '—'}`;
              } else if (status === 'approved') {
                auditMsg = `تم اعتماد نتيجة اختبار المتدرب "${name}" في "${exam}"`;
              } else if (status === 'rejected') {
                auditMsg = `تم رفض نتيجة اختبار المتدرب "${name}" في "${exam}"`;
              } else {
                auditMsg = `تحديث محاولة اختبار لـ "${name}" في "${exam}" - الحالة: ${status}`;
              }
            }
            
            logSystemActivity(auditType, data.examiner || name || 'النظام', auditMsg);
            invalidateCollectionsCache(); // Fresh data for next polling cycle
              
            res.writeHead(data.id ? 200 : 201, {'Content-Type':'application/json'});
            res.end(JSON.stringify({success:true, id: data.id ? parseInt(data.id) : resultId}));
          }
        });
      } catch (e) {
        console.error('❌ Invalid exam JSON:', e);
        res.writeHead(400, {'Content-Type':'application/json'});
        res.end(JSON.stringify({error:'Invalid JSON'}));
      }
    });
    return;
  }

  // GET /api/exams – return all exam attempts or a specific attempt by id
  if (pathname === '/api/exams' && req.method === 'GET') {
    const examId = reqUrl.query.id;
    if (examId) {
      db.get('SELECT * FROM exam_attempts WHERE id = ?', [examId], (err, row) => {
        if (err) {
          console.error('❌ DB select error:', err);
          res.writeHead(500, {'Content-Type':'application/json'});
          res.end(JSON.stringify({error:'DB fetch failed'}));
        } else {
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({attempt: row}));
        }
      });
    } else {
      db.all('SELECT * FROM exam_attempts ORDER BY id DESC', [], (err, rows) => {
        if (err) {
          console.error('❌ DB select error:', err);
          res.writeHead(500, {'Content-Type':'application/json'});
          res.end(JSON.stringify({error:'DB fetch failed'}));
        } else {
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({exams: rows}));
        }
      });
    }
    return;
  }

  // DELETE /api/exams - delete a specific attempt or all
  if (pathname === '/api/exams' && req.method === 'DELETE') {
    const id = reqUrl.query.id;
    if (id === 'all') {
      db.run('DELETE FROM exam_attempts', [], function(err) {
        if (err) {
          res.writeHead(500, {'Content-Type':'application/json'});
          res.end(JSON.stringify({error:'DB clear failed'}));
        } else {
          db.run('DELETE FROM exam_results', [], () => {});
          logSystemActivity('exam_clear_all', 'المشرف العام', 'تم مسح جميع سجلات محاولات الاختبارات');
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({success:true}));
        }
      });
      return;
    }
    if (!id) {
      res.writeHead(400, {'Content-Type':'application/json'});
      res.end(JSON.stringify({error:'Missing id'}));
      return;
    }
    db.get('SELECT * FROM exam_attempts WHERE id = ?', [id], (err, row) => {
      const trainee = row ? row.trainee_name : '—';
      const exam = row ? row.exam_name : '—';
      
      db.run('DELETE FROM exam_attempts WHERE id = ?', [id], function(err) {
        if (err) {
          res.writeHead(500, {'Content-Type':'application/json'});
          res.end(JSON.stringify({error:'DB delete failed'}));
        } else {
          db.run('DELETE FROM exam_results WHERE id = ?', [id], () => {});
          const auditMsg = `تم حذف محاولة اختبار المتدرب "${trainee}" في "${exam}"`;
          logSystemActivity('exam_delete', 'المشرف العام', auditMsg);

          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({success:true}));
        }
      });
    });
    return;
  }

  // POST /api/retakes - create a retake request
  if (pathname === '/api/retakes' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { trainee_name, rank, code, course_name, request_time, reason, status, previous_score, exam_id } = data;
        
        const sql = `INSERT INTO retake_requests 
          (trainee_name, rank, code, course_name, request_time, reason, status, previous_score, exam_id) 
          VALUES (?,?,?,?,?,?,?,?,?)`;
        const params = [
          trainee_name,
          rank || 'مشاهد',
          code || '—',
          course_name,
          request_time,
          reason || 'تحسين الدرجة',
          status || 'pending',
          previous_score || 0,
          exam_id
        ];
        
        db.run(sql, params, function(err) {
          if (err) {
            console.error('❌ DB retake insert error:', err);
            res.writeHead(500, {'Content-Type':'application/json'});
            res.end(JSON.stringify({error:'DB insert failed'}));
          } else {
            const auditMsg = `قدم المتدرب "${trainee_name}" طلب إعادة اختبار لـ "${course_name}" (الدرجة السابقة: ${previous_score}%)`;
            logSystemActivity('retake_request', trainee_name, auditMsg);
            invalidateCollectionsCache();

            res.writeHead(201, {'Content-Type':'application/json'});
            res.end(JSON.stringify({success:true, id:this.lastID}));
          }
        });
      } catch (e) {
        res.writeHead(400, {'Content-Type':'application/json'});
        res.end(JSON.stringify({error:'Invalid JSON'}));
      }
    });
    return;
  }

  // GET /api/retakes - return all retake requests
  if (pathname === '/api/retakes' && req.method === 'GET') {
    db.all('SELECT r.*, u.real_name FROM retake_requests r LEFT JOIN users u ON r.user_id = u.id ORDER BY r.id DESC', [], (err, rows) => {
      if (err) {
        console.error('❌ DB retakes select error:', err);
        res.writeHead(500, {'Content-Type':'application/json'});
        res.end(JSON.stringify({error:'DB fetch failed'}));
      } else {
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({requests: rows}));
      }
    });
    return;
  }

  // POST /api/retakes/status - approve or reject a request
  if (pathname === '/api/retakes/status' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { id, status, approved_by } = data;
        
        db.get('SELECT * FROM retake_requests WHERE id = ?', [id], (err, row) => {
          if (err || !row) {
            res.writeHead(404, {'Content-Type':'application/json'});
            res.end(JSON.stringify({error:'Retake request not found'}));
            return;
          }
          
          db.run('UPDATE retake_requests SET status = ?, approved_by = ? WHERE id = ?', [status, approved_by, id], function(err) {
            if (err) {
              res.writeHead(500, {'Content-Type':'application/json'});
              res.end(JSON.stringify({error:'DB update failed'}));
            } else {
              const action = status === 'approved' ? 'موافقة' : 'رفض';
              const auditMsg = `تم ${action} طلب إعادة اختبار المتدرب "${row.trainee_name}" في "${row.course_name}" بواسطة "${approved_by}"`;
              logSystemActivity('retake_resolve', approved_by, auditMsg);
              invalidateCollectionsCache();

              if (status === 'approved') {
                // Delete previous attempts for this exam and student
                db.run('DELETE FROM exam_attempts WHERE exam_name = ? AND (trainee_name = ? OR code = ?)',
                  [row.course_name, row.trainee_name, row.code], (delErr) => {
                    if (delErr) console.error('Error clearing previous attempt on retake approval:', delErr);
                  });
              }

              res.writeHead(200, {'Content-Type':'application/json'});
              res.end(JSON.stringify({success:true}));
            }
          });
        });
      } catch (e) {
        res.writeHead(400, {'Content-Type':'application/json'});
        res.end(JSON.stringify({error:'Invalid JSON'}));
      }
    });
    return;
  }

  // POST /api/violations - record a violation
  if (pathname === '/api/violations' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { trainee_name, rank, code, course_name, violation_type, violation_time, details, exam_id } = data;
        
        const sql = `INSERT INTO exam_violations 
          (trainee_name, rank, code, course_name, violation_type, violation_time, details, exam_id) 
          VALUES (?,?,?,?,?,?,?,?)`;
        const params = [
          trainee_name,
          rank || '—',
          code || '—',
          course_name,
          violation_type,
          violation_time,
          details || '—',
          exam_id
        ];
        
        db.run(sql, params, function(err) {
          if (err) {
            console.error('❌ DB violation insert error:', err);
            res.writeHead(500, {'Content-Type':'application/json'});
            res.end(JSON.stringify({error:'DB insert failed'}));
          } else {
            const auditMsg = `<i class="fa-solid fa-triangle-exclamation"></i> مخالفة غش مرصودة للمتدرب "${trainee_name}" في اختبار "${course_name}": ${violation_type}`;
            logSystemActivity('exam_violation', trainee_name, auditMsg);
            invalidateCollectionsCache();

            res.writeHead(201, {'Content-Type':'application/json'});
            res.end(JSON.stringify({success:true, id:this.lastID}));
          }
        });
      } catch (e) {
        res.writeHead(400, {'Content-Type':'application/json'});
        res.end(JSON.stringify({error:'Invalid JSON'}));
      }
    });
    return;
  }

  // GET /api/violations - return all violations
  if (pathname === '/api/violations' && req.method === 'GET') {
    db.all('SELECT * FROM exam_violations ORDER BY id DESC', [], (err, rows) => {
      if (err) {
        console.error('❌ DB violations select error:', err);
        res.writeHead(500, {'Content-Type':'application/json'});
        res.end(JSON.stringify({error:'DB fetch failed'}));
      } else {
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({violations: rows}));
      }
    });
    return;
  }

  // DELETE /api/violations - delete a specific violation or all
  if (pathname === '/api/violations' && req.method === 'DELETE') {
    const id = reqUrl.query.id;
    if (id === 'all') {
      db.run('DELETE FROM exam_violations', [], function(err) {
        if (err) {
          res.writeHead(500, {'Content-Type':'application/json'});
          res.end(JSON.stringify({error:'DB clear failed'}));
        } else {
          logSystemActivity('violations_clear_all', 'المشرف العام', 'تم مسح جميع سجلات المخالفات');
          invalidateCollectionsCache();
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({success:true}));
        }
      });
      return;
    }
    if (!id) {
      res.writeHead(400, {'Content-Type':'application/json'});
      res.end(JSON.stringify({error:'Missing id'}));
      return;
    }
    
    db.get('SELECT * FROM exam_violations WHERE id = ?', [id], (err, row) => {
      const trainee = row ? row.trainee_name : '—';
      const type = row ? row.violation_type : '—';
      
      db.run('DELETE FROM exam_violations WHERE id = ?', [id], function(err) {
        if (err) {
          res.writeHead(500, {'Content-Type':'application/json'});
          res.end(JSON.stringify({error:'DB delete failed'}));
        } else {
          const auditMsg = `تم حذف مخالفة غش للمتدرب "${trainee}" (${type})`;
          logSystemActivity('violation_delete', 'المشرف العام', auditMsg);
          invalidateCollectionsCache();

          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({success:true}));
        }
      });
    });
    return;
  }

  const LOGS_FILE = path.join(PUBLIC_DIR, 'assets', 'data', 'system_logs.json');

  // POST /api/logs - append a system log
  if (pathname === '/api/logs' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const logItem = JSON.parse(body);
        logSystemActivity(logItem.type, logItem.username, logItem.details);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({success:true}));
      } catch (e) {
        res.writeHead(400, {'Content-Type':'application/json'});
        res.end(JSON.stringify({error:'Invalid JSON'}));
      }
    });
    return;
  }

  // POST /api/exam_errors - log client side Javascript errors
  if (pathname === '/api/exam_errors' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { trainee_name, exam_name, error_message, stack_trace } = data;
        db.run('INSERT INTO exam_errors (trainee_name, exam_name, error_message, stack_trace) VALUES (?, ?, ?, ?)',
          [trainee_name || '—', exam_name || '—', error_message || '', stack_trace || ''],
          function(err) {
            if (err) {
              console.error('❌ Failed to log exam error:', err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            }
          }
        );
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // POST /api/applications/notify_dm - Send Discord DM when applying
  if (pathname === '/api/applications/notify_dm' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { discordId, fullName, sector } = data;
        if (discordId) {
          await sendDiscordDM(discordId, fullName, sector);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // POST /api/applications/decision - Send Discord webhook when application status is approved or rejected
  if (pathname === '/api/applications/decision' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { application, newStatus, operatorName } = data;
        if (application && newStatus) {
          await sendRecruitmentDecisionWebhook(application, newStatus, operatorName);
          
          // Send Direct Message (DM) to applicant
          const targetId = application.discordId || application.userId || '';
          if (targetId) {
            await sendRecruitmentDecisionDM(
              targetId,
              application.fullName,
              application.sector,
              newStatus,
              application.examScore || 0,
              application.examTotal || 15
            );
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // GET /api/logs - fetch all system logs
  if (pathname === '/api/logs' && req.method === 'GET') {
    fs.readFile(LOGS_FILE, 'utf8', (err, data) => {
      if (err) {
        // Fallback: read from audit_logs table if json file is missing/unreadable
        db.all('SELECT * FROM audit_logs ORDER BY id DESC', [], (dbErr, rows) => {
          if (dbErr) {
            res.writeHead(500, {'Content-Type':'application/json'});
            res.end(JSON.stringify({error:'Could not read logs'}));
          } else {
            const mapped = rows.map(r => ({
              id: `db_${r.id}`,
              createdAt: r.timestamp,
              type: r.action_type,
              username: r.username,
              discord: '',
              details: r.details
            }));
            res.writeHead(200, {'Content-Type':'application/json'});
            res.end(JSON.stringify(mapped));
          }
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    });
    return;
  }

  // POST /api/logs/clear - clear system logs
  if (pathname === '/api/logs/clear' && req.method === 'POST') {
    fs.writeFile(LOGS_FILE, JSON.stringify([], null, 2), 'utf8', (err) => {
      if (err) {
        console.error('Error clearing system_logs.json:', err);
      }
      db.run('DELETE FROM audit_logs', [], (dbErr) => {
        if (dbErr) {
          console.error('Error clearing audit_logs table:', dbErr);
        }
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({success:true}));
      });
    });
    return;
  }



  // ----- Centralized Database Sync & Auth Logging APIs -----

  // GET /api/db/collections - Fetch all central data collections
  if (pathname === '/api/db/collections' && req.method === 'GET') {
    const now = Date.now();
    const clientEtag = req.headers['if-none-match'];

    // Serve from cache if still fresh and ETag matches
    if (_collectionsCache && (now - _collectionsCacheTime) < COLLECTIONS_CACHE_TTL) {
      if (clientEtag && clientEtag === _collectionsCache.etag) {
        res.writeHead(304, { 'ETag': _collectionsCache.etag, 'Cache-Control': 'no-cache' });
        res.end();
        return;
      }
      sendGzippedResponse(req, res, 200, { 'Content-Type': 'application/json', 'ETag': _collectionsCache.etag, 'Cache-Control': 'no-cache' }, _collectionsCache.body);
      return;
    }

    const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });

    Promise.all([
      dbAll('SELECT * FROM users'),
      dbAll('SELECT * FROM exams'),
      dbAll('SELECT * FROM exam_results'),
      dbAll('SELECT r.*, u.real_name FROM retake_requests r LEFT JOIN users u ON r.user_id = u.id'),
      dbAll('SELECT * FROM exam_violations'),
      dbAll('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 500'),
      dbAll('SELECT * FROM general_collections'),
      dbAll('SELECT * FROM login_logs ORDER BY id DESC LIMIT 500'),
      dbAll('SELECT * FROM discord_accounts ORDER BY id DESC LIMIT 500')
    ]).then(([users, exams, examResults, retakeRequests, examViolations, auditLogs, generalColls, loginLogs, discordLinks]) => {
      const collections = {};

      // Map structured tables to keys
      collections['ps_users'] = users.map(u => ({ ...u, isDiscord: u.discord_id ? true : false }));
      collections['ps_exams'] = exams.map(e => {
        let qs = [];
        try { qs = JSON.parse(e.questions_json || '[]'); } catch (ex) {}
        let details = {};
        try { details = JSON.parse(e.details_json || '{}'); } catch (ex) {}
        // Spread details FIRST, then override with structured fields so details_json
        // can never accidentally overwrite questions_json or other canonical columns
        return {
          ...details,
          id: e.id,
          title: e.exam_name,
          category: e.course_name,
          questionsCountToShow: e.questions_count,
          passingScore: e.passing_score,
          isOpen: e.status === 'open',
          questions: qs
        };
      });
      collections['ps_exam_results'] = examResults.map(r => ({
        id: r.id,
        examId: r.exam_name, // fallback or match
        examTitle: r.exam_name,
        studentName: r.trainee_name,
        studentDiscord: r.code, // code field stores discord or code
        studentRank: r.rank,
        studentBadge: r.code,
        score: r.score,
        passed: r.pass_status === 'نجاح',
        status: r.status,
        entryTime: r.start_time,
        endTime: r.end_time,
        date: r.created_at ? (r.created_at instanceof Date ? `${r.created_at.getFullYear()}/${String(r.created_at.getMonth() + 1).padStart(2, '0')}/${String(r.created_at.getDate()).padStart(2, '0')}` : String(r.created_at).split(/[ T]/)[0].replace(/-/g, '/')) : '—',
        duration: r.duration,
        passingScore: r.passing_score || 80,
        questions: (() => { try { return r.questions_json ? JSON.parse(r.questions_json) : []; } catch(e) { return []; } })(),
        userAnswers: (() => { try { return r.user_answers_json ? JSON.parse(r.user_answers_json) : []; } catch(e) { return []; } })(),
        hand_raised: r.hand_raised || 0,
        hand_approved: r.hand_approved || 0,
        bypass_count: r.bypass_count || 0
      }));
      collections['ps_retake_requests'] = retakeRequests.map(r => ({
        id: r.id,
        user_id: r.user_id,
        trainee_name: r.trainee_name,
        real_name: r.real_name,
        rank: r.rank,
        code: r.code,
        course_name: r.course_name,
        exam_name: r.exam_name,
        reason: r.reason,
        status: r.status,
        request_time: r.request_time,
        approved_by: r.approved_by,
        previous_score: r.previous_score,
        exam_id: r.exam_id
      }));
      collections['ps_exam_violations'] = examViolations.map(v => ({
        id: v.id,
        user_id: v.user_id,
        studentName: v.trainee_name,
        studentRank: v.rank,
        studentDiscord: v.code,
        type: v.violation_type,
        timestamp: v.violation_time,
        details: v.details,
        examId: v.exam_id,
        examTitle: v.course_name
      }));
      collections['ps_system_logs'] = auditLogs.map(l => ({
        id: l.id,
        createdAt: l.timestamp,
        type: l.action_type || l.action_name || 'info',
        username: l.username || l.operator || 'النظام',
        details: l.details || `عملية: ${l.action_name} بواسطة ${l.operator}`
      }));

      // Merge general collections
      generalColls.forEach(c => {
        const structuredKeys = [
          'ps_users',
          'ps_exams',
          'ps_exam_results',
          'ps_retake_requests',
          'ps_exam_violations',
          'ps_system_logs',
          'ps_login_logs',
          'ps_discord_links'
        ];
        if (structuredKeys.includes(c.collection_key)) {
          return;
        }
        try {
          let parsed = JSON.parse(c.data_json);
          const isArrayKey = c.collection_key.startsWith('ps_') && 
                             c.collection_key !== 'ps_settings' && 
                             c.collection_key !== 'ps_current_user' && 
                             c.collection_key !== 'ps_initialized';
          if (isArrayKey && !Array.isArray(parsed)) {
            parsed = parsed ? [parsed] : [];
          }
          if (c.collection_key === 'ps_pages' && Array.isArray(parsed)) {
            const oldIds = ['leadership', 'managers', 'centers', 'guide', 'inventory', 'vehicles', 'college', 'attendance-reports', 'exams', 'field-title', 'uniform', 'apply', 'database', 'wings', 'aviation-document', 'counter-terrorism-wing', 'pursuit-assault-wing', 'shooting-skills-wing', 'roads-document', 'traffic-document', 'rapid-intervention-document', 'special-tasks-document', 'officers-document', 'staff-document', 'ops-document', 'regulations-document', 'investigation-document', 'narcotics-document', 'thunderbolt-document', 'district-officers-document', 'amn90-r'];
            parsed = parsed.filter(p => p && !oldIds.includes(p.id));
          }
          collections[c.collection_key] = parsed;
        } catch (ex) {
          console.error(`Error parsing general collection ${c.collection_key}:`, ex);
          collections[c.collection_key] = [];
        }
      });

      // Failsafe for initialized state if database contains records
      if (users.length > 0 || exams.length > 0) {
        collections['ps_initialized'] = true;
      }

      // Special collections for admin logging tables
      collections['ps_login_logs'] = loginLogs;
      collections['ps_discord_links'] = discordLinks;

      const responseBody = JSON.stringify({ success: true, collections });
      // Simple ETag: timestamp of when this response was built
      const etag = `"${Date.now()}"`;
      _collectionsCache = { body: responseBody, etag };
      _collectionsCacheTime = Date.now();

      sendGzippedResponse(req, res, 200, { 'Content-Type': 'application/json', 'ETag': etag, 'Cache-Control': 'no-cache' }, responseBody);
    }).catch(err => {
      console.error('❌ Error fetching collections:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'DB fetch collections failed' }));
    });
    return;
  }

  // POST /api/db/sync - Write-through synchronization for collections
  if (pathname === '/api/db/sync' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { collection, action, id, item, data } = payload;

        if (!collection) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing collection key' }));
          return;
        }

        // Helper function for quick return
        const sendSuccess = (changes = 1) => {
          invalidateCollectionsCache(); // Invalidate after any write
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, changes }));
        };

        // 1. Structured collections mapping to dedicated SQL tables
        if (collection === 'ps_users') {
          if (action === 'delete') {
            db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
              if (err) {
                console.error('❌ Error deleting user:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message || 'Failed to delete user' }));
              } else {
                sendSuccess(this.changes);
              }
            });
          } else if (action === 'add' || action === 'update') {
            db.run(`INSERT OR REPLACE INTO users (id, discord_id, username, display_name, avatar, banner, role, rank, department, code, status, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
              [item.id || id, item.discord_id || item.discord, item.username, item.display_name || item.username, item.avatar, item.banner, item.role, item.rank, item.department, item.code || '', item.status || 'active'],
              function(err) {
                if (err) {
                  console.error('❌ Error saving user:', err);
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: err.message || 'Failed to save user' }));
                } else {
                  sendSuccess(this.changes);
                }
              }
            );
          } else {
            // Bulk set: clear and reload in transaction
            const itemsToSave = (data || []).map(x => ({
              id: x.id || `${Date.now()}_${Math.random()}`,
              discord_id: x.discord_id || x.discord || '',
              username: x.username || '',
              display_name: x.display_name || x.username || '',
              avatar: x.avatar || '',
              banner: x.banner || '',
              role: x.role || '',
              rank: x.rank || '',
              department: x.department || '',
              code: x.code || '',
              status: x.status || 'active'
            }));
            
            executeBulkSync('users', 'id', itemsToSave, (err, count) => {
              if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message || 'Failed to bulk sync users' }));
              } else {
                sendSuccess(count);
              }
            });
          }
        } 
        else if (collection === 'ps_exams') {
          if (action === 'delete') {
            db.run('DELETE FROM exams WHERE id = ?', [id], function(err) {
              if (err) {
                console.error('❌ Error deleting exam:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message || 'Failed to delete exam' }));
              } else {
                dumpExamsToFile(() => {
                  sendSuccess(this.changes);
                });
              }
            });
          } else if (action === 'add' || action === 'update') {
            const qJson = JSON.stringify(item.questions || []);
            const details = { ...item };
            delete details.questions;
            delete details.id;
            delete details.title;
            delete details.category;
            delete details.questionsCountToShow;
            delete details.passingScore;
            delete details.isOpen;
            const detJson = JSON.stringify(details);
 
            db.run(`INSERT OR REPLACE INTO exams (id, exam_name, course_name, questions_count, passing_score, status, questions_json, details_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [item.id || id, item.title, item.category, item.questionsCountToShow || 0, item.passingScore || 80, item.isOpen ? 'open' : 'closed', qJson, detJson],
              function(err) {
                if (err) {
                  console.error('❌ Error saving exam:', err);
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: err.message || 'Failed to save exam' }));
                } else {
                  dumpExamsToFile(() => {
                    sendSuccess(this.changes);
                  });
                }
              }
            );
          } else {
            // Bulk set: clear and reload in transaction
            const itemsToSave = (data || []).map(x => {
              const qJson = JSON.stringify(x.questions || []);
              const details = { ...x };
              delete details.questions;
              delete details.id;
              delete details.title;
              delete details.category;
              delete details.questionsCountToShow;
              delete details.passingScore;
              delete details.isOpen;
              const detJson = JSON.stringify(details);
 
              return {
                id: x.id,
                exam_name: x.title,
                course_name: x.category,
                questions_count: x.questionsCountToShow || 0,
                passing_score: x.passingScore || 80,
                status: x.isOpen ? 'open' : 'closed',
                questions_json: qJson,
                details_json: detJson
              };
            });
            
            executeBulkSync('exams', 'id', itemsToSave, (err, count) => {
              if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message || 'Failed to bulk sync exams' }));
              } else {
                dumpExamsToFile(() => {
                  sendSuccess(count);
                });
              }
            });
          }
        }
        else if (collection === 'ps_exam_results') {
          if (action === 'delete') {
            db.run('DELETE FROM exam_results WHERE id = ?', [id], function(err) {
              if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              } else {
                db.run('DELETE FROM exam_attempts WHERE id = ?', [id], () => {});
                sendSuccess(this.changes);
              }
            });
          } else if (action === 'add' || action === 'update') {
            syncSaveResultFromClient(item, (err, changes) => {
              if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              } else {
                sendSuccess(changes);
              }
            });
          } else {
            // bulk override
            db.serialize(() => {
              db.run('DELETE FROM exam_results', [], (err) => {
                if (err) {
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Failed to clear table' }));
                  return;
                }
                db.run('DELETE FROM exam_attempts', [], async (err) => {
                  if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to clear attempts table' }));
                    return;
                  }
                  
                  if (data && data.length > 0) {
                    let insertErr = null;
                    for (const x of data) {
                      await new Promise((resolve) => {
                        syncSaveResultFromClient(x, (err) => {
                          if (err) insertErr = err;
                          resolve();
                        });
                      });
                    }
                    if (insertErr) {
                      res.writeHead(500, { 'Content-Type': 'application/json' });
                      res.end(JSON.stringify({ error: insertErr.message }));
                    } else {
                      sendSuccess(data.length);
                    }
                  } else {
                    sendSuccess(0);
                  }
                });
              });
            });
          }
        }
        else if (collection === 'ps_retake_requests') {
          if (action === 'delete') {
            db.run('DELETE FROM retake_requests WHERE id = ?', [id], function(err) {
              if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              } else {
                sendSuccess(this.changes);
              }
            });
          } else if (action === 'add' || action === 'update') {
            const itemToSave = {
              id: item.id,
              user_id: item.user_id || '',
              trainee_name: item.trainee_name || '',
              rank: item.rank || '',
              code: item.code || '',
              course_name: item.course_name || '',
              exam_name: item.exam_name || '',
              reason: item.reason || '',
              status: item.status || 'pending',
              request_time: item.request_time || '',
              approved_by: item.approved_by || '',
              previous_score: item.previous_score !== undefined ? item.previous_score : 0,
              exam_id: item.exam_id || ''
            };
            dbInsertOrReplace('retake_requests', 'id', itemToSave, function(err) {
              if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              } else {
                sendSuccess(this.changes);
              }
            });
          } else {
            // Bulk set: clear and reload in transaction
            const itemsToSave = (data || []).map(x => ({
              id: x.id,
              user_id: x.user_id || '',
              trainee_name: x.trainee_name || '',
              rank: x.rank || '',
              code: x.code || '',
              course_name: x.course_name || '',
              exam_name: x.exam_name || '',
              reason: x.reason || '',
              status: x.status || 'pending',
              request_time: x.request_time || '',
              approved_by: x.approved_by || '',
              previous_score: x.previous_score !== undefined ? x.previous_score : 0,
              exam_id: x.exam_id || ''
            }));
            
            executeBulkSync('retake_requests', 'id', itemsToSave, (err, count) => {
              if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message || 'Failed to bulk sync retake requests' }));
              } else {
                sendSuccess(count);
              }
            });
          }
        }
        else if (collection === 'ps_exam_violations') {
          if (action === 'delete') {
            db.run('DELETE FROM exam_violations WHERE id = ?', [id], function(err) {
              if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              } else {
                sendSuccess(this.changes);
              }
            });
          } else if (action === 'add' || action === 'update') {
            const itemToSave = {
              id: item.id,
              user_id: item.user_id || '',
              trainee_name: item.studentName || item.trainee_name || '',
              rank: item.studentRank || item.rank || '',
              code: item.studentDiscord || item.code || '',
              course_name: item.examTitle || item.course_name || '',
              violation_type: item.type || item.violation_type || '',
              violation_time: item.timestamp || item.violation_time || '',
              details: item.details || '',
              exam_id: item.examId || item.exam_id || ''
            };
            dbInsertOrReplace('exam_violations', 'id', itemToSave, function(err) {
              if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              } else {
                sendSuccess(this.changes);
              }
            });
          } else {
            // Bulk set: clear and reload in transaction
            const itemsToSave = (data || []).map(x => ({
              id: x.id,
              user_id: x.user_id || '',
              trainee_name: x.studentName || x.trainee_name || '',
              rank: x.studentRank || x.rank || '',
              code: x.studentDiscord || x.code || '',
              course_name: x.examTitle || x.course_name || '',
              violation_type: x.type || x.violation_type || '',
              violation_time: x.timestamp || x.violation_time || '',
              details: x.details || '',
              exam_id: x.examId || x.exam_id || ''
            }));
            
            executeBulkSync('exam_violations', 'id', itemsToSave, (err, count) => {
              if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message || 'Failed to bulk sync exam violations' }));
              } else {
                sendSuccess(count);
              }
            });
          }
        }
        else if (collection === 'ps_login_logs') {
          if (action === 'delete') {
            db.run('DELETE FROM login_logs WHERE id = ?', [id], function(err) {
              if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              } else {
                sendSuccess(this.changes);
              }
            });
          } else if (action === 'add' || action === 'update') {
            const itemToSave = {
              id: item.id,
              user_id: item.user_id || '',
              discord_id: item.discord_id || '',
              ip_address: item.ip_address || '',
              device: item.device || '',
              browser: item.browser || '',
              status: item.status || '',
              timestamp: item.timestamp || ''
            };
            dbInsertOrReplace('login_logs', 'id', itemToSave, function(err) {
              if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              } else {
                sendSuccess(this.changes);
              }
            });
          } else {
            // Bulk set: clear and reload in transaction
            const itemsToSave = (data || []).map(x => ({
              id: x.id,
              user_id: x.user_id || '',
              discord_id: x.discord_id || '',
              ip_address: x.ip_address || '',
              device: x.device || '',
              browser: x.browser || '',
              status: x.status || '',
              timestamp: x.timestamp || ''
            }));
            
            executeBulkSync('login_logs', 'id', itemsToSave, (err, count) => {
              if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message || 'Failed to bulk sync login logs' }));
              } else {
                sendSuccess(count);
              }
            });
          }
        }
        else if (collection === 'ps_discord_links') {
          if (action === 'delete') {
            db.run('DELETE FROM discord_accounts WHERE id = ?', [id], function(err) {
              if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              } else {
                sendSuccess(this.changes);
              }
            });
          } else if (action === 'add' || action === 'update') {
            const badgesStr = JSON.stringify(item.badges || []);
            const itemToSave = {
              id: item.id,
              user_id: item.user_id || '',
              discord_id: item.discord_id || '',
              username: item.username || '',
              avatar: item.avatar || '',
              banner: item.banner || '',
              badges: badgesStr,
              linked_at: item.linked_at || '',
              updated_at: item.updated_at || ''
            };
            dbInsertOrReplace('discord_accounts', 'id', itemToSave, function(err) {
              if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              } else {
                sendSuccess(this.changes);
              }
            });
          } else {
            // Bulk set: clear and reload in transaction
            const itemsToSave = (data || []).map(x => ({
              id: x.id,
              user_id: x.user_id || '',
              discord_id: x.discord_id || '',
              username: x.username || '',
              avatar: x.avatar || '',
              banner: x.banner || '',
              badges: JSON.stringify(x.badges || []),
              linked_at: x.linked_at || '',
              updated_at: x.updated_at || ''
            }));
            
            executeBulkSync('discord_accounts', 'id', itemsToSave, (err, count) => {
              if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message || 'Failed to bulk sync discord links' }));
              } else {
                sendSuccess(count);
              }
            });
          }
        }
        else if (collection === 'ps_system_logs') {
          // System logs are stored in the structured audit_logs table via the /api/logs endpoint.
          // Do not write them to general_collections to prevent duplication and bloat.
          sendSuccess(0);
        }
        // 2. Default: Store unstructured collections in general_collections table
        else {
          const isArrayKey = collection.startsWith('ps_') && 
                             collection !== 'ps_settings' && 
                             collection !== 'ps_current_user' && 
                             collection !== 'ps_initialized';
          
          if (isArrayKey) {
            db.get(`SELECT data_json FROM general_collections WHERE collection_key = ?`, [collection], (dbErr, row) => {
              let currentArray = [];
              if (!dbErr && row && row.data_json) {
                try {
                  const parsed = JSON.parse(row.data_json);
                  currentArray = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
                } catch (ex) {}
              }

              if (action === 'delete') {
                currentArray = currentArray.filter(x => x.id !== id);
              } else if (action === 'add') {
                if (item && item.id) {
                  currentArray = currentArray.filter(x => x.id !== item.id);
                  currentArray.unshift(item);
                } else if (item) {
                  currentArray.unshift(item);
                }
              } else if (action === 'update') {
                if (item && item.id) {
                  const idx = currentArray.findIndex(x => x.id === item.id);
                  if (idx !== -1) {
                    currentArray[idx] = { ...currentArray[idx], ...item };
                  } else {
                    currentArray.unshift(item);
                  }
                }
              } else {
                // bulk override
                if (data) {
                  currentArray = Array.isArray(data) ? data : [data];
                } else if (item) {
                  currentArray = Array.isArray(item) ? item : [item];
                }
              }

              if (collection === 'ps_pages' && Array.isArray(currentArray)) {
                const oldIds = ['leadership', 'managers', 'centers', 'guide', 'inventory', 'vehicles', 'college', 'attendance-reports', 'exams', 'field-title', 'uniform', 'apply', 'database', 'wings', 'aviation-document', 'counter-terrorism-wing', 'pursuit-assault-wing', 'shooting-skills-wing', 'roads-document', 'traffic-document', 'rapid-intervention-document', 'special-tasks-document', 'officers-document', 'staff-document', 'ops-document', 'regulations-document', 'investigation-document', 'narcotics-document', 'thunderbolt-document', 'district-officers-document', 'amn90-r'];
                currentArray = currentArray.filter(x => x && !oldIds.includes(x.id));
              }

              const dataJson = JSON.stringify(currentArray);
              db.run(`INSERT OR REPLACE INTO general_collections (collection_key, data_json) VALUES (?, ?)`,
                [collection, dataJson],
                function(err) {
                  if (err) {
                    console.error(`❌ DB generic sync error for array ${collection}:`, err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'DB generic sync failed' }));
                  } else {
                    sendSuccess(this.changes);
                  }
                }
              );
            });
          } else {
            const dataJson = JSON.stringify(data || item || {});
            db.run(`INSERT OR REPLACE INTO general_collections (collection_key, data_json) VALUES (?, ?)`,
              [collection, dataJson],
              function(err) {
                if (err) {
                  console.error(`❌ DB generic sync error for ${collection}:`, err);
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'DB generic sync failed' }));
                } else {
                  sendSuccess(this.changes);
                }
              }
            );
          }
        }
      } catch (ex) {
        console.error('❌ DB Sync Payload Error:', ex);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  // POST /api/users/sync_all - Manually trigger background sync of all users from Discord
  if (pathname === '/api/users/sync_all' && req.method === 'POST') {
    syncAllUsersFromDiscord()
      .then(result => {
        if (result.success) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, updatedCount: result.updatedCount, failedCount: result.failedCount }));
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: result.error }));
        }
      })
      .catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      });
    return;
  }

  // POST /api/auth/logout - Logout endpoint
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'session=; Path=/; HttpOnly; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // POST /api/auth/log_login - Log login event details (IP, browser, device)
  if (pathname === '/api/auth/log_login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { user_id, discord_id, ip_address, device, browser, status, avatar_url } = data;
        const resolvedIp = ip_address || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

        db.run(`INSERT INTO login_logs (user_id, discord_id, ip_address, device, browser, status, avatar_url, last_sync) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [user_id, discord_id, resolvedIp, device, browser, status, avatar_url],
          function(err) {
            if (err) {
              console.error('❌ Failed to log login:', err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Failed to record login log' }));
            } else {
              // Add to audit_logs as well
              const details = `تسجيل دخول بحساب ديسكورد: ${discord_id} (${status}) - جهاز: ${device}, متصفح: ${browser}, IP: ${resolvedIp}`;
              logSystemActivity('login', discord_id, details);

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, logId: this.lastID }));
            }
          }
        );
      } catch (ex) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  // POST /api/auth/link_discord - Link Discord linkage history & badges
  if (pathname === '/api/auth/link_discord' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { user_id, discord_id, username, badges } = data;
        const bannerColor = data.banner_color || data.bannerColor || null;
        const badgesStr = JSON.stringify(badges || []);
        let avatar = data.avatar;
        let banner = data.banner;
        let dlHappened = false;

        try {
          const dlAvatar = await downloadDiscordMedia(discord_id, avatar, 'avatar');
          const dlBanner = await downloadDiscordMedia(discord_id, banner, 'banner');
          if (dlAvatar !== avatar || dlBanner !== banner) {
            dlHappened = true;
          }
          avatar = dlAvatar;
          banner = dlBanner;
        } catch (mediaErr) {
          console.error('[Link Discord Media Error]', mediaErr);
        }

        // 1. Enforce Uniqueness constraints on user_id and discord_id in discord_accounts
        db.get('SELECT * FROM discord_accounts WHERE user_id = ?', [user_id], (err, rowUser) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'حدث خطأ في قاعدة البيانات أثناء التحقق: ' + err.message }));
            return;
          }
          if (rowUser && rowUser.discord_id !== discord_id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'عذراً، هذا المستخدم مرتبط بالفعل بحساب ديسكورد آخر! لا يمكن ربط أكثر من حساب بنفس المستخدم.' }));
            return;
          }

          db.get('SELECT * FROM discord_accounts WHERE discord_id = ?', [discord_id], (err, rowDiscord) => {
            if (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'حدث خطأ في قاعدة البيانات أثناء التحقق: ' + err.message }));
              return;
            }
            if (rowDiscord && rowDiscord.user_id !== user_id) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'عذراً، حساب الديسكورد هذا مرتبط بالفعل بمستخدم آخر! لا يمكن ربط نفس حساب الديسكورد بأكثر من مستخدم.' }));
              return;
            }

            // Perform insert or update in discord_accounts
            db.get('SELECT * FROM discord_accounts WHERE user_id = ?', [user_id], (err, row) => {
              if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
                return;
              }

              let badgesChanged = false;
              if (row) {
                let oldBadges = [];
                try { oldBadges = JSON.parse(row.badges || '[]'); } catch (e) {}
                if (JSON.stringify((oldBadges || []).sort()) !== JSON.stringify((badges || []).sort())) {
                  badgesChanged = true;
                }
              }

              if (row) {
                // Update
                db.run(`UPDATE discord_accounts SET discord_id = ?, username = ?, avatar = ?, banner = ?, badges = ?, updated_at = datetime('now') WHERE id = ?`,
                  [discord_id, username, avatar, banner, badgesStr, row.id],
                  function(err) {
                    if (err) {
                      res.writeHead(500, { 'Content-Type': 'application/json' });
                      res.end(JSON.stringify({ error: err.message }));
                      return;
                    }
                    if (badgesChanged) {
                      const details = `تحديث شارات الديسكورد للعضو "${username}": الشارات الحالية [${(badges || []).join(', ')}]`;
                      logSystemActivity('discord_badges_update', username, details);
                    }
                    const logDetails = `تحديث ربط الديسكورد للعضو "${username}" (معرف ديسكورد: ${discord_id})`;
                    logSystemActivity('discord_link_update', username, logDetails);

                    const cacheUpdated = updateDiscordUsersCacheFile(discord_id, username, username, avatar, banner, bannerColor);
                    if (dlHappened || cacheUpdated) {
                      const { exec } = require('child_process');
                      exec('node deploy_surge.js', { cwd: PUBLIC_DIR });
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, updated: true }));
                  }
                );
              } else {
                // Insert
                db.run(`INSERT INTO discord_accounts (user_id, discord_id, username, avatar, banner, badges) VALUES (?, ?, ?, ?, ?, ?)`,
                  [user_id, discord_id, username, avatar, banner, badgesStr],
                  function(err) {
                    if (err) {
                      res.writeHead(500, { 'Content-Type': 'application/json' });
                      res.end(JSON.stringify({ error: err.message }));
                      return;
                    }
                    const details = `ربط حساب ديسكورد جديد: للعضو "${username}" (معرف: ${discord_id}) مع الشارات [${(badges || []).join(', ')}]`;
                    logSystemActivity('discord_link_create', username, details);

                    const cacheUpdated = updateDiscordUsersCacheFile(discord_id, username, username, avatar, banner, bannerColor);
                    if (dlHappened || cacheUpdated) {
                      const { exec } = require('child_process');
                      exec('node deploy_surge.js', { cwd: PUBLIC_DIR });
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, created: true }));
                  }
                );
              }
            });
          });
        });
      } catch (ex) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  // POST /api/auth/log_error - Log auth error to audit logs
  if (pathname === '/api/auth/log_error' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const log = JSON.parse(body);
        const details = `[فشل ربط الديسكورد] الخطوة: ${log.step || '—'} - الخطأ: ${log.message || '—'} - التفاصيل: ${log.details || '—'}`;
        logSystemActivity('discord_auth_error', 'النظام', details);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (ex) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  // POST /api/auth/exchange_code - Exchange authorization code for tokens safely on server-side
  if (pathname === '/api/auth/exchange_code' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { code, redirect_uri } = data;
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing authorization code' }));
          return;
        }

        const discordParams = new URLSearchParams();
        discordParams.append('client_id', '1510157546500001884');
        discordParams.append('client_secret', 'lCjbu0EP5npQ-i6hbO5ZIn3UCPat2YJ-');
        discordParams.append('grant_type', 'authorization_code');
        discordParams.append('code', code);
        discordParams.append('redirect_uri', redirect_uri);

        const postData = discordParams.toString();

        const https = require('https');
        const reqDiscord = https.request({
          hostname: 'discord.com',
          path: '/api/oauth2/token',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
          }
        }, (resDiscord) => {
          let responseBody = '';
          resDiscord.on('data', chunk => { responseBody += chunk; });
          resDiscord.on('end', () => {
            if (resDiscord.statusCode !== 200) {
              console.error(`[Discord Auth Token Exchange Error] Discord returned status ${resDiscord.statusCode}: ${responseBody}`);
              try {
                const parsed = JSON.parse(responseBody);
                logSystemActivity('discord_auth_error', 'النظام', `فشل تبادل الكود في السيرفر: ${parsed.error_description || parsed.error || responseBody}`);
              } catch(e) {
                logSystemActivity('discord_auth_error', 'النظام', `فشل تبادل الكود في السيرفر: ${responseBody}`);
              }
            }
            res.writeHead(resDiscord.statusCode, { 'Content-Type': 'application/json' });
            res.end(responseBody);
          });
        });

        reqDiscord.on('error', (e) => {
          console.error('[Discord Auth Exchange Error]', e);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Discord OAuth request failed: ' + e.message }));
        });

        reqDiscord.write(postData);
        reqDiscord.end();
      } catch (ex) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  // POST /api/auth/refresh_token - Refresh access token safely on server-side
  if (pathname === '/api/auth/refresh_token' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { refresh_token } = data;
        if (!refresh_token) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing refresh token' }));
          return;
        }

        const discordParams = new URLSearchParams();
        discordParams.append('client_id', '1510157546500001884');
        discordParams.append('client_secret', 'lCjbu0EP5npQ-i6hbO5ZIn3UCPat2YJ-');
        discordParams.append('grant_type', 'refresh_token');
        discordParams.append('refresh_token', refresh_token);

        const postData = discordParams.toString();

        const https = require('https');
        const reqDiscord = https.request({
          hostname: 'discord.com',
          path: '/api/oauth2/token',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
          }
        }, (resDiscord) => {
          let responseBody = '';
          resDiscord.on('data', chunk => { responseBody += chunk; });
          resDiscord.on('end', () => {
            res.writeHead(resDiscord.statusCode, { 'Content-Type': 'application/json' });
            res.end(responseBody);
          });
        });

        reqDiscord.on('error', (e) => {
          console.error('[Discord Auth Refresh Error]', e);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Discord OAuth request failed: ' + e.message }));
        });

        reqDiscord.write(postData);
        reqDiscord.end();
      } catch (ex) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  // GET /api/auth/get_user - Get user details by ID
  if (pathname === '/api/auth/get_user' && req.method === 'GET') {
    const userId = reqUrl.query.id;
    if (!userId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing user id' }));
      return;
    }

    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) {
        console.error('❌ Database error querying user by id:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'خطأ في قاعدة البيانات.' }));
        return;
      }

      if (!user) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'المستخدم غير موجود.' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, user }));
    });
    return;
  }

  // GET /api/auth/discord_users_cache - Serve live discord users cache JSON
  if (pathname === '/api/auth/discord_users_cache' && req.method === 'GET') {
    const discordUsersFile = path.join(PUBLIC_DIR, 'assets', 'data', 'discord_users.json');
    if (fs.existsSync(discordUsersFile)) {
      try {
        const data = fs.readFileSync(discordUsersFile, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(data);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to read cache file' }));
      }
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({}));
    }
    return;
  }

  // POST /api/csv-sync/run - Manually trigger CSV Discord synchronization
  if (pathname === '/api/csv-sync/run' && req.method === 'POST') {
    const force = reqUrl.query && reqUrl.query.force === 'true';
    runCsvDiscordSync(db, force)
      .then(result => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, result }));
      })
      .catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      });
    return;
  }

  // GET /api/diagnostic - Temporary endpoint to inspect Render environment variables
  if (pathname === '/api/diagnostic' && req.method === 'GET') {
    const token = process.env.DISCORD_TOKEN || 'not_set';
    const maskedToken = token !== 'not_set' ? token.substring(0, 10) + '...' + token.substring(token.length - 10) : 'not_set';
    const appId = token !== 'not_set' ? (() => {
      try {
        return Buffer.from(token.split('.')[0], 'base64').toString('utf8');
      } catch(e) { return 'error'; }
    })() : 'not_set';
    
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      RENDER: process.env.RENDER || 'false',
      NODE_ENV: process.env.NODE_ENV || 'not_set',
      GUILD_ID: process.env.GUILD_ID || 'not_set',
      appId: appId,
      maskedToken: maskedToken,
      isMysql: typeof isMysql !== 'undefined' ? isMysql : false,
      MYSQL_HOST: typeof MYSQL_HOST !== 'undefined' ? MYSQL_HOST : 'not_set',
      dbInitError: typeof dbInitError !== 'undefined' ? dbInitError : null,
      isPostgres: typeof isPostgres !== 'undefined' ? isPostgres : false,
      hasDatabaseUrl: !!(process.env.DATABASE_URL || config.databaseUrl),
      dbUrlType: (process.env.DATABASE_URL || config.databaseUrl || '').substring(0, 15)
    }));
    return;
  }


  // GET /api/csv-sync/logs - Get the CSV sync bot logs
  if (pathname === '/api/csv-sync/logs' && req.method === 'GET') {
    const logFile = path.join(__dirname, 'assets', 'data', 'csv_sync_log.json');
    if (fs.existsSync(logFile)) {
      try {
        const data = fs.readFileSync(logFile, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(data);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to read log file' }));
      }
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
    }
    return;
  }

  // POST /api/auth/upsert_user - Insert or update user details
  if (pathname === '/api/auth/upsert_user' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { id, discord_id, username, display_name, role, rank, department, code, status } = data;
        const bannerColor = data.banner_color || data.bannerColor || null;
        const avatarUrl = data.avatar || '';
        const bannerUrl = data.banner || '';
        // 1. Fetch the user's current data from the DB first to determine roles, ranks, etc.
        db.get('SELECT * FROM users WHERE id = ?', [id], (err, existingUser) => {
          if (err) {
            console.error('❌ Database error querying user:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'خطأ في قاعدة البيانات.' }));
            return;
          }

          const isOwner = ['1334568342345748565'].includes(id) || 
                          (username && ['3gjo', 'onlyryan', 'onlyryan -', 'onlyryan-'].includes(username.toLowerCase())) ||
                          (display_name && ['3gjo', 'onlyryan', 'onlyryan -', 'onlyryan-'].includes(display_name.toLowerCase()));

          const isAssistantOwner = ['821825761673478144'].includes(id) || 
                                   (username && ['ifm711'].includes(username.toLowerCase())) ||
                                   (display_name && ['ifm711'].includes(display_name.toLowerCase()));

          // If user exists but status is disabled or banned, reject
          if (existingUser && (existingUser.status === 'disabled' || existingUser.status === 'banned') && !isOwner) {
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'تم تعطيل هذا الحساب أو تعليقه من قبل الإدارة.' }));
            return;
          }

          // Use the provided CDN URLs immediately so that they are saved right away
          let avatar = avatarUrl;
          let banner = bannerUrl;

          let oldAvatar = existingUser ? existingUser.avatar : '';
          let oldBanner = existingUser ? existingUser.banner : '';
          let oldDisplayName = existingUser ? existingUser.display_name : '';
          
          let profileChanged = false;
          const changes = [];
          if (existingUser) {
            if (avatar && oldAvatar !== avatar) { profileChanged = true; changes.push('الصورة الشخصية'); }
            if (banner && oldBanner !== banner) { profileChanged = true; changes.push('البانر'); }
            if (display_name && oldDisplayName !== display_name) { profileChanged = true; changes.push('الاسم التعريفي'); }
          }

          // Determine roles, ranks, etc.
          let finalRank = (existingUser && existingUser.rank) ? existingUser.rank : (rank || 'مشاهد');
          let finalDept = (existingUser && existingUser.department) ? existingUser.department : (department || '');
          let finalCode = (existingUser && existingUser.code) ? existingUser.code : (code || '');
          let finalRole = (existingUser && existingUser.role) ? existingUser.role : (role || 'viewer');

          // Map rank to role automatically if role is viewer
          if (finalRole === 'viewer') {
            finalRole = resolveRoleFromRank(finalRank, 'viewer');
          }

          let finalStatus = (existingUser && existingUser.status) ? existingUser.status : (status || 'active');
          if (finalStatus === 'inactive') {
            finalStatus = 'active';
          }

          if (isOwner) {
            finalRole = 'owner';
            finalRank = 'المشرف العام';
            finalStatus = 'active';
          }

          if (isAssistantOwner) {
            finalRole = 'assistant_owner';
            finalRank = 'مساعد المشرف العام';
            finalStatus = 'active';
          }

          // Safety override for Mohammad Alnahdi (ii7zn)
          if ((id === '750581378168389632' || discord_id === '750581378168389632') && finalRole === 'owner') {
            finalRole = 'viewer';
          }

          const finalIsManual = existingUser ? (existingUser.is_manual_role === 1 || existingUser.is_manual_role === true ? 1 : 0) : 0;
          const finalRealName = existingUser ? existingUser.real_name : '';
          db.run(`INSERT OR REPLACE INTO users (id, discord_id, username, display_name, avatar, banner, avatar_url, banner_url, last_sync, role, rank, department, code, status, is_manual_role, real_name, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [id, discord_id || id, username, display_name || username, avatar, banner, avatarUrl, bannerUrl, finalRole, finalRank, finalDept, finalCode, finalStatus, finalIsManual, finalRealName],
            function(insErr) {
              if (insErr) {
                console.error('❌ Failed to upsert user:', insErr);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to record user' }));
              } else {
                // Instantly update the cache with the fresh URLs
                updateDiscordUsersCacheFile(id, username, display_name || username, avatarUrl, bannerUrl, bannerColor);

                if (profileChanged) {
                  const details = `تحديث تلقائي لبيانات الديسكورد للعضو "${display_name || username}" عند تسجيل الدخول: تم تعديل (${changes.join('، ')})`;
                  logSystemActivity('discord_profile_update', username, details);
                }

                // Schedule background media downloads and sheet synchronization
                setImmediate(async () => {
                  try {
                    console.log(`[API Login Background] Starting background media downloads for user ${id}...`);
                    const dlAvatar = await downloadDiscordMedia(id, avatarUrl, 'avatar');
                    const dlBanner = await downloadDiscordMedia(id, bannerUrl, 'banner');
                    
                    if (dlAvatar !== avatarUrl || dlBanner !== bannerUrl) {
                      db.run('UPDATE users SET avatar = ?, banner = ? WHERE id = ?', [dlAvatar, dlBanner, id], (updErr) => {
                        if (!updErr) {
                          console.log(`[API Login Background] User media downloaded and database record updated.`);
                          updateDiscordUsersCacheFile(id, username, display_name || username, dlAvatar, dlBanner, bannerColor);
                        }
                      });
                    }
                  } catch (mediaErr) {
                    console.error('[API Login Background Media Error]', mediaErr);
                  }
                });

                setImmediate(async () => {
                  try {
                    console.log(`[API Login Background] Syncing user ${id} with Google Sheets...`);
                    await syncGoogleSheetsToDb(id, {
                      id: id,
                      discord_id: discord_id || id,
                      username: username,
                      display_name: display_name,
                      discord: username
                    });
                    console.log(`[API Login Background] Google Sheets sync completed for user ${id}.`);
                  } catch (syncErr) {
                    console.error('[API Login Background Sync Error] Failed to sync user with Google Sheets:', syncErr);
                  }
                });

                // Return the full user record in the response JSON to let the client set the correct session roles.
                const userObj = {
                  id,
                  discord_id: discord_id || id,
                  username,
                  display_name: display_name || username,
                  avatar,
                  banner,
                  avatar_url: avatarUrl,
                  banner_url: bannerUrl,
                  role: finalRole,
                  rank: finalRank,
                  department: finalDept,
                  code: finalCode,
                  status: finalStatus
                };

                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true, user: userObj }));
              }
            }
          );
        });
      } catch (ex) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }
  
  // POST /api/auth/update_user_permission - Update user rank & role manually
  if (pathname === '/api/auth/update_user_permission' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { operator_id, target_id, target_discord, role, rank, action } = data;
        
        if (!operator_id || !target_id || !role || !rank) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'جميع الحقول (معرف المسؤول، معرف المستخدم، الدور، الرتبة) مطلوبة.' }));
          return;
        }

        // Validate operator permission: Must be Owner or Assistant Owner
        db.get('SELECT role, display_name, username FROM users WHERE id = ?', [operator_id], (err, opUser) => {
          if (err) {
            console.error('❌ Error verifying operator role:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'خطأ في التحقق من صلاحية المسؤول.' }));
            return;
          }
          
          const isOwner = (opUser && opUser.role === 'owner') || 
                            ['1334568342345748565'].includes(operator_id) ||
                            (opUser && opUser.username && ['3gjo', 'onlyryan', 'onlyryan -', 'onlyryan-'].includes(opUser.username.toLowerCase())) ||
                            (opUser && opUser.display_name && ['3gjo', 'onlyryan', 'onlyryan -', 'onlyryan-'].includes(opUser.display_name.toLowerCase()));
                            
          const isAssistantOwner = (opUser && opUser.role === 'assistant_owner') ||
                                   ['821825761673478144'].includes(operator_id) ||
                                   (opUser && opUser.username && ['ifm711'].includes(opUser.username.toLowerCase())) ||
                                   (opUser && opUser.display_name && ['ifm711'].includes(opUser.display_name.toLowerCase()));

          
          if (!isOwner && !isAssistantOwner) {
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'غير مصرح لك بإجراء هذه العملية. هذه الصلاحية للمشرف العام والقيادة فقط.' }));
            return;
          }

          const ROLE_LEVELS = {
            owner: 6,
            assistant_owner: 5,
            academy_affairs: 4.5,
            admin: 4,
            recruitment_affairs: 3.8,
            course_admin: 3.5,
            college_trainee: 1,
            viewer: 0
          };

          const opLevel = isOwner ? 6 : 5;
          const newRoleLevel = ROLE_LEVELS[role] || 0;

          if (!isOwner && newRoleLevel >= opLevel) {
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'غير مصرح لك بمنح رتبة مساوية أو أعلى من رتبتك.' }));
            return;
          }

          const opName = opUser ? (opUser.display_name || opUser.username) : 'مسؤول';

          // Query if the target user already exists
          db.get('SELECT * FROM users WHERE id = ?', [target_id], (err, targetUser) => {
            if (err) {
              console.error('❌ Error checking target user:', err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'خطأ في قاعدة البيانات.' }));
              return;
            }

            const targetName = target_discord || (targetUser ? (targetUser.display_name || targetUser.username) : target_id);
            const oldRank = targetUser ? (targetUser.rank || 'مشاهد') : 'مشاهد';
            const oldRole = targetUser ? (targetUser.role || 'viewer') : 'viewer';

            const oldRoleLevel = ROLE_LEVELS[oldRole] || 0;
            
            // Only Rayan Bin Mohammad (1334568342345748565) can grant, edit, or remove the owner (المشرف العام) role
            if ((role === 'owner' || oldRole === 'owner') && operator_id !== '1334568342345748565') {
              res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ error: 'غير مصرح لك بمنح أو تعديل أو إزالة رتبة المشرف العام. هذه الصلاحية لريان بن محمد فقط.' }));
              return;
            }

            if (!isOwner && oldRoleLevel >= opLevel) {
              res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ error: 'غير مصرح لك بتعديل أو إزالة رتبة مساوية أو أعلى من رتبتك.' }));
              return;
            }

            const logActionType = 'permission_change';

            if (action === 'remove') {
              // Resetting user's manual rank: is_manual_role = 0
              db.run('UPDATE users SET role = ?, rank = ?, is_manual_role = 0, updated_at = datetime(\'now\') WHERE id = ?',
                ['viewer', 'مشاهد', target_id],
                function(updErr) {
                  if (updErr) {
                    console.error('❌ Error resetting manual permission:', updErr);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'فشل في إزالة الصلاحية.' }));
                    return;
                  }

                  const detailsMsg = `قام المسؤول "${opName}" بإزالة الرتبة اليدوية من حساب الديسكورد "${targetName}" (معرف: ${target_id}). تم إرجاع الحساب لوضع المزامنة التلقائي (الرتبة السابقة: ${oldRank})`;
                  logSystemActivity(logActionType, opName, detailsMsg);

                  // Trigger background sheets sync to restore sheets-defined rank if exists
                  setImmediate(async () => {
                    try {
                      await syncGoogleSheetsToDb(target_id);
                    } catch (e) {
                      console.error('[Background Sync After Permission Remove Error]', e);
                    }
                  });

                  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                  res.end(JSON.stringify({ success: true, message: 'تم إزالة الرتبة اليدوية وإرجاع الحساب للمزامنة التلقائية بنجاح.' }));
                }
              );
            } else {
              // Granting or updating user rank: is_manual_role = 1
              if (targetUser) {
                // Update existing user
                db.run('UPDATE users SET role = ?, rank = ?, is_manual_role = 1, updated_at = datetime(\'now\') WHERE id = ?',
                  [role, rank, target_id],
                  function(updErr) {
                    if (updErr) {
                      console.error('❌ Error updating manual permission:', updErr);
                      res.writeHead(500, { 'Content-Type': 'application/json' });
                      res.end(JSON.stringify({ error: 'فشل في منح الصلاحية.' }));
                      return;
                    }

                    const detailsMsg = `قام المسؤول "${opName}" بمنح/تعديل رتبة حساب الديسكورد "${targetName}" (معرف: ${target_id}) من "${oldRank}" إلى "${rank}" (الدور: ${role})`;
                    logSystemActivity(logActionType, opName, detailsMsg);

                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: true, message: 'تم منح/تعديل الرتبة بنجاح.' }));
                  }
                );
              } else {
                // Insert new user row since they don't exist yet
                db.run('INSERT INTO users (id, discord_id, username, display_name, role, rank, is_manual_role, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, \'active\', datetime(\'now\'))',
                  [target_id, target_id, target_discord, target_discord, role, rank],
                  function(insErr) {
                    if (insErr) {
                      console.error('❌ Error inserting new user for manual permission:', insErr);
                      res.writeHead(500, { 'Content-Type': 'application/json' });
                      res.end(JSON.stringify({ error: 'فشل في منح الصلاحية للمستخدم الجديد.' }));
                      return;
                    }

                    const detailsMsg = `قام المسؤول "${opName}" بمنح رتبة حساب ديسكورد جديد "${targetName}" (معرف: ${target_id}) رتبة "${rank}" (الدور: ${role})`;
                    logSystemActivity(logActionType, opName, detailsMsg);

                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: true, message: 'تم منح الرتبة للمستخدم الجديد بنجاح.' }));
                  }
                );
              }
            }
          });
        });
      } catch (ex) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'بيانات غير صالحة.' }));
      }
    });
    return;
  }

  // POST /api/auth/refresh_discord_profile - Refresh a user's Discord profile details on demand
  if (pathname === '/api/auth/refresh_discord_profile' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { discord_id } = data;
        if (!discord_id || !/^\d{17,20}$/.test(discord_id)) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'معرف الديسكورد غير صالح.' }));
          return;
        }

        const config = loadConfig();
        const botToken = config.discordToken;
        if (!botToken) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'سيرفر الديسكورد غير مهيأ بالبوت.' }));
          return;
        }

        try {
          console.log(`[API Profile Refresh] Fetching user ${discord_id} from Discord API...`);
          const discordUser = await fetchDiscordUserData(discord_id, botToken);
          
          if (!discordUser || !discordUser.id) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'لم يتم العثور على المستخدم في ديسكورد.' }));
            return;
          }

          const username = discordUser.username;
          const display_name = discordUser.global_name || discordUser.username;
          const bannerColor = discordUser.banner_color || null;
          
          let avatarUrl = '';
          if (discordUser.avatar) {
            const format = discordUser.avatar.startsWith('a_') ? 'gif' : 'png';
            avatarUrl = `https://cdn.discordapp.com/avatars/${discord_id}/${discordUser.avatar}.${format}`;
          }
          
          let bannerUrl = '';
          if (discordUser.banner) {
            const format = discordUser.banner.startsWith('a_') ? 'gif' : 'png';
            bannerUrl = `https://cdn.discordapp.com/banners/${discord_id}/${discordUser.banner}.${format}`;
          }

          console.log(`[API Profile Refresh] Downloading media for user ${discord_id}...`);
          const dlAvatar = await downloadDiscordMedia(discord_id, avatarUrl, 'avatar');
          const dlBanner = await downloadDiscordMedia(discord_id, bannerUrl, 'banner');

          // Update cache file immediately
          updateDiscordUsersCacheFile(discord_id, username, display_name, dlAvatar, dlBanner, bannerColor);

          // Update DB if user exists in the DB
          db.get('SELECT id FROM users WHERE id = ?', [discord_id], (dbErr, existing) => {
            if (existing) {
              db.run(`UPDATE users SET 
                        username = ?, 
                        display_name = ?, 
                        avatar = ?, 
                        banner = ?, 
                        avatar_url = ?, 
                        banner_url = ?, 
                        banner_color = ?, 
                        last_sync = datetime('now'),
                        updated_at = datetime('now')
                      WHERE id = ?`,
                [username, display_name, dlAvatar, dlBanner, avatarUrl, bannerUrl, bannerColor, discord_id],
                (updErr) => {
                  if (updErr) {
                    console.error('❌ Database error updating refreshed user:', updErr);
                  }
                }
              );
            }
          });

          logSystemActivity('discord_profile_refresh', username, `قام المستخدم بتحديث بيانات ملفه الشخصي يدوياً من الديسكورد`);

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ 
            success: true, 
            message: 'تم تحديث بيانات الملف الشخصي بنجاح!',
            user: {
              avatar: dlAvatar,
              banner: dlBanner,
              bannerColor: bannerColor,
              username: username,
              globalName: display_name
            }
          }));

        } catch (discordErr) {
          console.error('[API Profile Refresh Error]', discordErr);
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: `فشل في جلب البيانات من ديسكورد: ${discordErr.message}` }));
        }
      } catch (ex) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'بيانات غير صالحة.' }));
      }
    });
    return;
  }

  // Safe path resolution: prevent directory traversal attacks
  let safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(PUBLIC_DIR, safePath);

  // Double check that the resolved path is inside PUBLIC_DIR to prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden - غير مسموح بالوصول لهذا المسار');
    return;
  }

  // If path is a directory, look for index.html
  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found - الملف غير موجود');
      return;
    }

    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('404 Not Found - الملف غير موجود');
        } else {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(`500 Internal Server Error: ${err.code}`);
        }
        return;
      }

      const isText = contentType.startsWith('text/') || 
                     contentType === 'application/javascript' || 
                     contentType === 'application/json' ||
                     contentType === 'image/svg+xml';
      
      if (isText) {
        sendGzippedResponse(req, res, 200, { 'Content-Type': contentType }, content);
      } else {
        res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': content.length });
        res.end(content);
      }
    });
  });
});

// ─── Automatic Cloudflare Quick Tunnel ───
let tunnelProcess = null;

function startCloudflareTunnel() {
  console.log('[Tunnel] Starting cloudflared tunnel...');
  const { spawn } = require('child_process');
  const cfExecutable = path.join(__dirname, 'cloudflared.exe');
  
  if (!fs.existsSync(cfExecutable)) {
    console.warn('[Tunnel Warning] cloudflared.exe not found in server directory. Automatic tunnel disabled.');
    return;
  }

  // Spawn cloudflared tunnel --url http://localhost:PORT
  tunnelProcess = spawn(cfExecutable, ['tunnel', '--url', `http://localhost:${PORT}`]);

  let tunnelUrlFound = false;

  const handleOutput = (data) => {
    const text = data.toString();
    // Search for trycloudflare.com URL
    const match = text.match(/https:\/\/[a-zA-Z0-9\-]+\.trycloudflare\.com/);
    if (match && !tunnelUrlFound) {
      const newUrl = match[0];
      tunnelUrlFound = true;
      console.log(`==================================================`);
      console.log(`   [Tunnel Success] Cloudflare Tunnel established!`);
      console.log(`   --> ${newUrl}`);
      console.log(`==================================================`);

      // Update settings.json
      updateSettingsJsonBackend(newUrl);
    }
  };

  tunnelProcess.stdout.on('data', handleOutput);
  tunnelProcess.stderr.on('data', handleOutput);

  tunnelProcess.on('close', (code) => {
    console.log(`[Tunnel] cloudflared tunnel process exited with code ${code}`);
    tunnelUrlFound = false;
    // Restart tunnel after 5 seconds if it exits unexpectedly
    setTimeout(startCloudflareTunnel, 5000);
  });
}

function updateSettingsJsonBackend(newUrl) {
  try {
    const { exec } = require('child_process');
    const settingsPath = path.join(__dirname, 'assets', 'data', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (data.backendUrl !== newUrl) {
        data.backendUrl = newUrl;
        fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`[Tunnel] Updated assets/data/settings.json with new backend URL: ${newUrl}`);

        // Trigger Surge deploy to sync the new URL to client-side!
        console.log('[Tunnel] Triggering automatic deploy to Surge...');
        exec('node deploy_surge.js', { cwd: __dirname }, (deployErr) => {
          if (deployErr) console.error('[Tunnel Deploy Error] Surge deploy failed:', deployErr);
          else console.log('[Tunnel Deploy Success] Surge deploy completed successfully!');
        });
      }
    }
  } catch (e) {
    console.error('[Tunnel Error] Failed to update settings.json or deploy to Surge:', e.message);
  }
}

function startZipWatcher() {
  const fs = require('fs');
  const path = require('path');
  const { exec } = require('child_process');

  const watchDirs = [
    path.join(__dirname, 'pages'),
    path.join(__dirname, 'assets'),
    path.join(__dirname, 'auth')
  ];
  
  const watchFiles = [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'amn.html'),
    path.join(__dirname, '200.html')
  ];

  let debounceTimer;

  function triggerZipBuild(filename) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`[Auto-Zip] Detected change in: ${filename}. Rebuilding updated_site.zip...`);
      exec('node scratch/zip_deploy.js', (err, stdout, stderr) => {
        if (err) {
          console.error('[Auto-Zip Error] Failed to rebuild zip:', err.message);
        } else {
          console.log('[Auto-Zip Success] updated_site.zip rebuilt successfully!');
        }
      });
    }, 1500);
  }

  // Watch directories
  watchDirs.forEach(dir => {
    if (!fs.existsSync(dir)) return;
    try {
      fs.watch(dir, { recursive: true }, (eventType, filename) => {
        if (filename && !filename.endsWith('.tmp') && !filename.includes('.git') && !filename.includes('node_modules')) {
          triggerZipBuild(path.join(path.basename(dir), filename));
        }
      });
    } catch (e) {
      console.error(`[Auto-Zip Warning] Failed to watch directory ${dir}:`, e.message);
    }
  });

  // Watch individual files
  watchFiles.forEach(file => {
    if (!fs.existsSync(file)) return;
    try {
      fs.watch(file, (eventType, filename) => {
        triggerZipBuild(path.basename(file));
      });
    } catch (e) {
      console.error(`[Auto-Zip Warning] Failed to watch file ${file}:`, e.message);
    }
  });

  console.log('[Auto-Zip] Started background file watcher to keep updated_site.zip updated automatically.');
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`==================================================`);
  console.log(`   Security Server running at:`);
  console.log(`   --> http://localhost:${PORT}`);
  console.log(`==================================================`);

  // Start auto zip file watcher
  startZipWatcher();

  // Start cloudflared tunnel automatically only if --tunnel flag or START_TUNNEL env is provided
  if (process.argv.includes('--tunnel') || process.env.START_TUNNEL === 'true') {
    startCloudflareTunnel();
  } else {
    console.log('[Tunnel] Cloudflare Tunnel disabled. Using production backend: https://amn-backend-euhi.onrender.com');
  }

  // ─── Keep-Alive: منع نوم الخادم على Render المجاني ───
  // Render المجاني ينام بعد 15 دقيقة من الخمول مما يسبب تأخير 50+ ثانية.
  // نضرب الخادم على نفسه كل 10 دقائق لإبقائه مستيقظاً.
  if (process.env.RENDER === 'true' || process.env.NODE_ENV === 'production') {
    const selfPingUrl = process.env.RENDER_EXTERNAL_URL
      ? `${process.env.RENDER_EXTERNAL_URL}/api/healthz`
      : 'https://amn-backend-euhi.onrender.com/api/healthz';

    setInterval(() => {
      https.get(selfPingUrl, (res) => {
        console.log(`[Keep-Alive] Self-ping OK. Status: ${res.statusCode}`);
        res.resume();
      }).on('error', (err) => {
        console.warn('[Keep-Alive] Self-ping failed:', err.message);
      });
    }, 10 * 60 * 1000); // كل 10 دقائق

    console.log('[Keep-Alive] Self-ping scheduled every 10 minutes to prevent Render cold starts.');
  }

  // Start background Google Sheets synchronization:
  // First sync after 10 seconds of startup, then every 5 minutes.
  setTimeout(() => {
    syncGoogleSheetsToDb().catch(err => {
      console.error('[Sync Error] Initial background sync failed:', err);
    });
  }, 10000);

  setInterval(() => {
    syncGoogleSheetsToDb().catch(err => {
      console.error('[Sync Error] Periodic background sync failed:', err);
    });
  }, 5 * 60 * 1000);

  // Also sync the full sheets cache file directly (independent of syncGoogleSheetsToDb)
  setTimeout(() => {
    syncMembersCacheFile().catch(err => {
      console.error('[CacheSync Error] Initial cache file sync failed:', err);
    });
  }, 15000); // 15 seconds after startup

  setInterval(() => {
    syncMembersCacheFile().catch(err => {
      console.error('[CacheSync Error] Periodic cache file sync failed:', err);
    });
  }, 5 * 60 * 1000); // Every 5 minutes

  // Start background Discord User Profile synchronization:
  // First sync after 20 seconds of startup, then every 6 hours.
  setTimeout(() => {
    syncAllUsersFromDiscord().catch(err => {
      console.error('[Sync Error] Initial background Discord sync failed:', err);
    });
  }, 20000);

  setInterval(() => {
    syncAllUsersFromDiscord().catch(err => {
      console.error('[Sync Error] Periodic background Discord sync failed:', err);
    });
  }, 6 * 60 * 60 * 1000);
  // ─── Discord Gateway: تشغيل الاتصال فوراً عند بدء السيرفر ───
  if (process.env.RENDER === 'true' || process.env.NODE_ENV === 'production') {
    const gatewayToken = process.env.DISCORD_TOKEN || config.discordToken;
    if (gatewayToken) {
      startGateway(gatewayToken, db);
    } else {
      console.warn('[Gateway] DISCORD_TOKEN is missing. Gateway connection skipped.');
    }
  }

  // ─── CSV Discord Sync: المزامنة التلقائية لجداول CSV مع الديسكورد ───
  // يتم تشغيل المزامنة تلقائياً كل 5 دقائق. 
  // تستخدم المزامنة البروكسي (discord_proxy.php) تلقائياً على خادم Render لتجنب حظر الـ IP.
  setTimeout(() => {
    runCsvDiscordSync(db).catch(err => {
      console.error('[Sync Error] Initial background CSV sync failed:', err);
    });
  }, 30000); // بدء التشغيل الأول بعد 30 ثانية من إقلاع السيرفر

  setInterval(() => {
    runCsvDiscordSync(db).catch(err => {
      console.error('[Sync Error] Periodic background CSV sync failed:', err);
    });
  }, 5 * 60 * 1000); // التكرار كل 5 دقائق

  // تشغيل مزامنة شاملة (Force Sync) كل 24 ساعة لتصحيح أي رتب تم تعديلها يدوياً أو أخطاء
  setInterval(() => {
    console.log('[CSV Sync] بدء المزامنة الشاملة اليومية (Force Sync)...');
    runCsvDiscordSync(db, true).catch(err => {
      console.error('[Sync Error] Daily force CSV sync failed:', err);
    });
  }, 24 * 60 * 60 * 1000); // كل 24 ساعة
  console.log('[CSV Sync] تم تفعيل المزامنة التلقائية كل 5 دقائق والمزامنة الشاملة اليومية بنجاح.');
});
