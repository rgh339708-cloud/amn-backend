const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const url = require('url');
const fs = require('fs');
const https = require('https');
const MAINTENANCE_MODE = false; // Enable maintenance mode

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
    managedRoles: []
  };
  const envPaths = [
    path.join(__dirname, '..', 'DISCORD', '.env'),
    path.join(__dirname, '.env'),
    path.join('c:', 'Users', 'rayan', 'OneDrive', 'Documents', 'DISCORD', '.env'),
    path.join(process.env.USERPROFILE || 'C:\\Users\\rayan', 'OneDrive', 'Documents', 'DISCORD', '.env')
  ];
  let envPath = '';
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      envPath = p;
      break;
    }
  }
  if (envPath) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
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
        }
      });
      console.log(`[Config] Successfully loaded environment variables from ${envPath}`);
    } catch (e) {
      console.error('[Config Error] Failed to read common env config:', e.message);
    }
  } else {
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

  return config;
}


const config = loadConfig();
const DATABASE_URL = process.env.DATABASE_URL || config.databaseUrl || 'postgresql://neondb_owner:npg_PQW0dJnf6yjm@ep-billowing-mountain-atlczlqj-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require';
let isPostgres = !!DATABASE_URL;

// Helper to convert sqlite SQL syntax to PostgreSQL syntax
function convertSqlToPostgres(sql) {
  let pgSql = sql;

  // 1. Replace INSERT OR REPLACE INTO with INSERT INTO ... ON CONFLICT
  const matchRegex = /insert\s+or\s+replace\s+into\s+(\w+)\s*\(([^)]+)\)\s*values\s*\((.*)\)/is;
  if (matchRegex.test(sql)) {
    pgSql = sql.replace(matchRegex, (match, tableName, columnsStr, valuesStr) => {
      const cols = columnsStr.split(',').map(c => c.trim().replace(/[\[\]"]/g, ''));
      let primaryKey = 'id';
      if (tableName.toLowerCase() === 'general_collections') {
        primaryKey = 'collection_key';
      } else if (tableName.toLowerCase() === 'attendance_books') {
        primaryKey = 'book_id';
      }
      
      const updateCols = cols.filter(c => c !== primaryKey);
      const updateClause = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
      
      return `INSERT INTO "${tableName}" (${columnsStr}) VALUES (${valuesStr}) ON CONFLICT ("${primaryKey}") DO UPDATE SET ${updateClause}`;
    });
  }

  // 2. Replace sqlite datatypes/functions
  pgSql = pgSql.replace(/datetime\('now'\)/gi, "CURRENT_TIMESTAMP");
  pgSql = pgSql.replace(/datetime\('now',\s*'localtime'\)/gi, "CURRENT_TIMESTAMP");
  pgSql = pgSql.replace(/datetime\('now',\s*'\+2 hours'\)/gi, "CURRENT_TIMESTAMP + interval '2 hours'");
  pgSql = pgSql.replace(/AUTOINCREMENT/gi, "SERIAL");

  // 3. Replace placeholders ? with $1, $2, $3...
  let index = 1;
  pgSql = pgSql.replace(/\?/g, () => `$${index++}`);

  // 4. Append RETURNING clause for INSERT statements on PostgreSQL so that lastID is returned
  if (/^\s*insert\s+/i.test(pgSql) && !/returning/i.test(pgSql)) {
    if (/into\s+"?general_collections"?/i.test(pgSql)) {
      pgSql += ' RETURNING "collection_key"';
    } else if (/into\s+"?attendance_books"?/i.test(pgSql)) {
      pgSql += ' RETURNING "book_id"';
    } else {
      pgSql += ' RETURNING "id"';
    }
  }

  return pgSql;
}

async function initializePostgresSchema(pool) {
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
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS global_name VARCHAR`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_manual_role INTEGER DEFAULT 0`);
  } catch(e) {
    console.warn('[DB Migrate] Postgres users global_name/is_manual_role column check warning:', e.message);
  }
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
  await pool.query(`CREATE TABLE IF NOT EXISTS discord_accounts (
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS exam_errors (
    id SERIAL PRIMARY KEY,
    trainee_name VARCHAR,
    exam_name VARCHAR,
    error_message TEXT,
    stack_trace TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // 12. Attendance tables
  await pool.query(`CREATE TABLE IF NOT EXISTS attendance_books (
    book_id VARCHAR PRIMARY KEY,
    book_name VARCHAR,
    status VARCHAR DEFAULT 'closed',
    updated_by VARCHAR,
    room_image VARCHAR,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`ALTER TABLE attendance_books ADD COLUMN IF NOT EXISTS room_image VARCHAR`).catch(() => {});
  
  await pool.query(`CREATE TABLE IF NOT EXISTS attendance_book_logs (
    id SERIAL PRIMARY KEY,
    book_id VARCHAR,
    book_name VARCHAR,
    action VARCHAR,
    operator VARCHAR,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS attendance_records (
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


  // Migrate/Update Postgres tables in case they existed prior to columns creation
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_url VARCHAR`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_sync TIMESTAMP`);
  } catch(e) {
    console.warn('[DB Migrate] Postgres users columns check warning:', e.message);
  }
  try {
    await pool.query(`ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS avatar_url VARCHAR`);
    await pool.query(`ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS last_sync TIMESTAMP`);
  } catch(e) {
    console.warn('[DB Migrate] Postgres login_logs columns check warning:', e.message);
  }
  try {
    await pool.query(`ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS discord_id VARCHAR`);
    await pool.query(`ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS badge_code VARCHAR`);
    await pool.query(`ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 1`);
  } catch(e) {
    console.warn('[DB Migrate] Postgres exam_results columns check warning:', e.message);
  }
  try {
    await pool.query(`ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS discord_id VARCHAR`);
    await pool.query(`ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS badge_code VARCHAR`);
    await pool.query(`ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 1`);
  } catch(e) {
    console.warn('[DB Migrate] Postgres exam_attempts columns check warning:', e.message);
  }
  try {
    await pool.query(`ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS room_image TEXT`);
  } catch(e) {
    console.warn('[DB Migrate] Postgres attendance_records room_image column check warning:', e.message);
  }
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
    created_at TEXT DEFAULT (datetime('now'))
  )`, () => {
    // Add columns if they do not exist
    sqliteDb.run("ALTER TABLE exam_results ADD COLUMN discord_id TEXT", () => {});
    sqliteDb.run("ALTER TABLE exam_results ADD COLUMN badge_code TEXT", () => {});
    sqliteDb.run("ALTER TABLE exam_results ADD COLUMN attempt_count INTEGER DEFAULT 1", () => {});

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
  )`);

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
    created_at TEXT DEFAULT (datetime('now'))
  )`, () => {
    sqliteDb.run("ALTER TABLE exam_attempts ADD COLUMN discord_id TEXT", () => {});
    sqliteDb.run("ALTER TABLE exam_attempts ADD COLUMN badge_code TEXT", () => {});
    sqliteDb.run("ALTER TABLE exam_attempts ADD COLUMN attempt_count INTEGER DEFAULT 1", () => {});
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
    updated_at TEXT DEFAULT (datetime('now'))
  )`, () => {
    sqliteDb.run("ALTER TABLE attendance_books ADD COLUMN room_image TEXT", () => {
      initializeAttendanceBooks();
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

function initializeAttendanceBooks() {
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
    db.get('SELECT book_id FROM attendance_books WHERE book_id = ?', [book.id], (err, row) => {
      if (err) {
        console.error(`Error checking attendance book ${book.id}:`, err);
        return;
      }
      if (!row) {
        db.run('INSERT INTO attendance_books (book_id, book_name, status, updated_by) VALUES (?, ?, ?, ?)',
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
  updateOpsExamDescription();
}

function updateOpsExamDescription() {
  const examId = 'exam_004';
  const newCategory = 'جندي فما فوق';
  const newDesc = `تنويه هام:

* في حال الخروج من الموقع أو إغلاق صفحة الاختبار أثناء تأدية الاختبار، سيتم اعتبار المتقدم راسباً.
* يجب الالتزام بالموعد المحدد للاختبار وإرساله قبل انتهاء الوقت المخصص.
* يتحمل المتقدم مسؤولية التأكد من استقرار الاتصال بالإنترنت وعدم مغادرة صفحة الاختبار حتى إتمام عملية الإرسال بنجاح.

مع تحيات
الإدارة العامة لشؤون تدريب الأمن العام`;

  db.get('SELECT details_json FROM exams WHERE id = ?', [examId], (err, row) => {
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

      db.run('UPDATE exams SET course_name = ?, details_json = ? WHERE id = ?',
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

function sendAttendanceReportToDiscord(bookName, operatorStr, roomImage, records) {
  const botToken = config.discordToken;
  if (!botToken) {
    console.warn('[Discord Report Warning] Discord Bot Token not configured. Cannot send message to Discord.');
    return;
  }

  const channelId = '1518159865455841340';
  
  let attendeesList = '';
  if (records && records.length > 0) {
    attendeesList = records.map((r, i) => `**${i + 1}.** ${r.rank} / ${r.display_name} - الكود: \`${r.code || '—'}\``).join('\n');
  } else {
    attendeesList = 'لا يوجد حضور مسجل في هذه الفترة.';
  }

  const embed = {
    title: '📋 تقرير حضور المدربين',
    color: 13214247, // Hex #c9a227 (Gold)
    fields: [
      { name: 'الدورة / الدفتر', value: bookName, inline: true },
      { name: 'المشرف المسؤول', value: operatorStr, inline: true },
      { name: 'عدد الحاضرين', value: String(records ? records.length : 0), inline: true },
      { name: 'أسماء الحاضرين', value: attendeesList }
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: 'شؤون تدريب الأمن العام • مدينة الـ 90'
    }
  };

  if (roomImage) {
    embed.image = { url: roomImage };
  }

  const payload = {
    embeds: [embed]
  };

  sendDiscordChannelMessage(channelId, payload, botToken)
    .then(response => {
      console.log('✅ Successfully sent attendance report to Discord channel 1518159865455841340');
    })
    .catch(err => {
      console.error('❌ Failed to send attendance report to Discord:', err.message);
    });
}

let db;
let pgPool = null;

function initializeSqlite() {
  console.log('🔌 Local database mode: Connecting to SQLite...');
  const DB_PATH = path.join(__dirname, 'assets', 'data', 'exam_archive.db');
  const sqliteDb = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('❌ SQLite connection error:', err);
    } else {
      console.log('✅ SQLite DB connected at', DB_PATH);
      initializeSqliteSchema(sqliteDb);
    }
  });

  db = {
    run(sql, params, callback) { sqliteDb.run(sql, params, callback); },
    get(sql, params, callback) { sqliteDb.get(sql, params, callback); },
    all(sql, params, callback) { sqliteDb.all(sql, params, callback); },
    serialize(callback) { sqliteDb.serialize(callback); },
    prepare(sql) { return sqliteDb.prepare(sql); }
  };
}

function fallbackToSqlite(next) {
  if (isPostgres) {
    console.warn('⚠️ Postgres query failed or quota limits exceeded. Switching to local SQLite database mode (exam_archive.db)...');
    isPostgres = false;
    initializeSqlite();
  }
  if (next) {
    next();
  }
}

if (isPostgres) {
  console.log('🔌 Cloud database mode: Connecting to PostgreSQL...');
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1') ? false : { rejectUnauthorized: false }
  });
  pgPool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    fallbackToSqlite();
  });

  db = {
    run(sql, params = [], callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      if (!isPostgres) {
        db.run(sql, params, callback);
        return;
      }
      const pgSql = convertSqlToPostgres(sql);
      pgPool.query(pgSql, params, (err, res) => {
        if (err) {
          console.error(`Postgres error on run: ${err.message}. Retrying query on SQLite...`);
          fallbackToSqlite(() => {
            db.run(sql, params, callback);
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
        db.get(sql, params, callback);
        return;
      }
      const pgSql = convertSqlToPostgres(sql);
      pgPool.query(pgSql, params, (err, res) => {
        if (err) {
          console.error(`Postgres error on get: ${err.message}. Retrying query on SQLite...`);
          fallbackToSqlite(() => {
            db.get(sql, params, callback);
          });
        } else {
          if (callback) callback(null, res.rows ? res.rows[0] : null);
        }
      });
    },
    all(sql, params = [], callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      if (!isPostgres) {
        db.all(sql, params, callback);
        return;
      }
      const pgSql = convertSqlToPostgres(sql);
      pgPool.query(pgSql, params, (err, res) => {
        if (err) {
          console.error(`Postgres error on all: ${err.message}. Retrying query on SQLite...`);
          fallbackToSqlite(() => {
            db.all(sql, params, callback);
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
    initializeAttendanceBooks();
  }).catch(e => {
    console.error('❌ Failed to initialize PostgreSQL schema:', e.message || e);
    console.log('⚠️ Falling back to local SQLite database...');
    isPostgres = false;
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
  
  let sql = `INSERT INTO "${tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
  
  if (isPostgres) {
    const updateCols = Object.keys(cleanedItem).filter(c => c !== primaryKey);
    const updateClause = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
    sql = `INSERT INTO "${tableName}" (${columns.join(', ')}) VALUES (${placeholders.map((_, i) => `$${i+1}`).join(', ')}) ON CONFLICT ("${primaryKey}") DO UPDATE SET ${updateClause}`;
  } else {
    sql = `INSERT OR REPLACE INTO "${tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
  }
  
  db.run(sql, values, callback);
}

function dbInsertOrReplaceStringKey(tableName, primaryKey, item, callback) {
  const cleanedItem = { ...item };
  const columns = Object.keys(cleanedItem).map(c => `"${c}"`);
  const placeholders = Object.keys(cleanedItem).map(() => "?");
  const values = Object.values(cleanedItem);
  
  let sql = `INSERT INTO "${tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
  
  if (isPostgres) {
    const updateCols = Object.keys(cleanedItem).filter(c => c !== primaryKey);
    const updateClause = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
    sql = `INSERT INTO "${tableName}" (${columns.join(', ')}) VALUES (${placeholders.map((_, i) => `$${i+1}`).join(', ')}) ON CONFLICT ("${primaryKey}") DO UPDATE SET ${updateClause}`;
  } else {
    sql = `INSERT OR REPLACE INTO "${tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
  }
  
  db.run(sql, values, callback);
}

function getInsertOrReplaceSqlAndValues(tableName, primaryKey, item) {
  const cleanedItem = { ...item };
  const columns = Object.keys(cleanedItem).map(c => `"${c}"`);
  const placeholders = Object.keys(cleanedItem).map(() => "?");
  const values = Object.values(cleanedItem);
  
  let sql = `INSERT INTO "${tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
  
  if (isPostgres) {
    const updateCols = Object.keys(cleanedItem).filter(c => c !== primaryKey);
    const updateClause = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
    sql = `INSERT INTO "${tableName}" (${columns.join(', ')}) VALUES (${placeholders.map((_, i) => `$${i+1}`).join(', ')}) ON CONFLICT ("${primaryKey}") DO UPDATE SET ${updateClause}`;
  } else {
    sql = `INSERT OR REPLACE INTO "${tableName}" (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
  }
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
      return {
        id: e.id,
        title: e.exam_name,
        category: e.course_name,
        questionsCountToShow: e.questions_count,
        passingScore: e.passing_score,
        isOpen: e.status === 'open',
        questions: qs,
        ...details
      };
    });
    fs.writeFile(EXAMS_FILE, JSON.stringify(examsList, null, 2), 'utf8', (writeErr) => {
      if (writeErr) {
        console.error('[Backup Exams] Failed to write exams.json:', writeErr.message);
      } else {
        console.log('[Backup Exams] Successfully updated assets/data/exams.json on disk!');
      }
      if (callback) callback(writeErr);
    });
  };

  if (isPostgres && pgPool) {
    pgPool.query('SELECT * FROM exams', [], (err, res) => {
      if (err) {
        console.error(`Postgres error on dumpExamsToFile SELECT * FROM exams: ${err.message}. Switching to SQLite fallback.`);
        fallbackToSqlite(() => {
          db.all('SELECT * FROM exams', [], (sqliteErr, rows) => {
            queryCallback(sqliteErr, rows);
          });
        });
      } else {
        queryCallback(null, res ? res.rows : []);
      }
    });
  } else {
    // db.all is wrapped or directly available
    db.all('SELECT * FROM exams', [], (err, rows) => {
      queryCallback(err, rows);
    });
  }
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
        client.query('ROLLBACK', (rbErr) => {
          release();
          console.error(`❌ Postgres transaction error for bulk sync on ${tableName}:`, err.message);
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
              release();
              if (commitErr) return callback(commitErr);
              callback(null, 0);
            });
            return;
          }
          
          let insertIndex = 0;
          const insertNext = () => {
            if (insertIndex >= itemsToSave.length) {
              client.query('COMMIT', (commitErr) => {
                release();
                if (commitErr) return callback(commitErr);
                callback(null, itemsToSave.length);
              });
              return;
            }
            
            const item = itemsToSave[insertIndex];
            const { sql, values } = getInsertOrReplaceSqlAndValues(tableName, primaryKey, item);
            client.query(sql, values, (insertErr) => {
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
    // SQLite mode
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', [], (beginErr) => {
        if (beginErr) return callback(beginErr);
        
        db.run(`DELETE FROM "${tableName}"`, [], (deleteErr) => {
          if (deleteErr) {
            db.run('ROLLBACK', [], () => {});
            return callback(deleteErr);
          }
          
          if (!itemsToSave || itemsToSave.length === 0) {
            db.run('COMMIT', [], (commitErr) => {
              if (commitErr) return callback(commitErr);
              callback(null, 0);
            });
            return;
          }
          
          let insertIndex = 0;
          const insertNext = () => {
            if (insertIndex >= itemsToSave.length) {
              db.run('COMMIT', [], (commitErr) => {
                if (commitErr) return callback(commitErr);
                callback(null, itemsToSave.length);
              });
              return;
            }
            
            const item = itemsToSave[insertIndex];
            const { sql, values } = getInsertOrReplaceSqlAndValues(tableName, primaryKey, item);
            db.run(sql, values, (insertErr) => {
              if (insertErr) {
                console.error(`❌ SQLite bulk insert error for ${tableName}:`, insertErr);
                db.run('ROLLBACK', [], () => {});
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
    examiner: item.examiner || ''
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
      examiner: dbItem.examiner
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
        examiner: dbItem.examiner
      };
      dbInsertOrReplace('exam_attempts', 'id', itemAttempts, function(attErr) {
        if (callback) callback(attErr, this.changes);
      });
    });
  } else {
    // Insert new attempt - let's count attempts first
    const searchVal1 = dbItem.discord_id || dbItem.code || 'unknown_user';
    const searchVal2 = dbItem.trainee_name || 'unknown_user';
    const examName = dbItem.exam_name || 'unknown_exam';
    
    const sqlCount = isPostgres 
      ? `SELECT COUNT(*) as cnt FROM exam_results WHERE (discord_id = $1 OR trainee_name = $2) AND exam_name = $3`
      : `SELECT COUNT(*) as cnt FROM exam_results WHERE (discord_id = ? OR trainee_name = ?) AND exam_name = ?`;
      
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
        examiner: dbItem.examiner
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
          examiner: dbItem.examiner
        };
        
        dbInsertOrReplace('exam_results', 'id', itemResults, function(resErr) {
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
    const validAttemptsCols = ['trainee_name', 'rank', 'code', 'discord_id', 'badge_code', 'attempt_count', 'course_name', 'exam_name', 'score', 'pass_status', 'start_time', 'end_time', 'duration', 'status', 'examiner'];
    
    Object.keys(data).forEach(key => {
      if (key !== 'id' && validAttemptsCols.includes(key)) {
        updatesAttempts.push(`"${key}" = ?`);
        paramsAttempts.push(data[key]);
      }
    });
    
    if (updatesAttempts.length > 0) {
      paramsAttempts.push(pk);
      let sqlAttempts = `UPDATE exam_attempts SET ${updatesAttempts.join(', ')} WHERE id = ?`;
      if (isPostgres) {
        sqlAttempts = `UPDATE exam_attempts SET ${updatesAttempts.map((u, i) => u.replace('?', `$${i+1}`)).join(', ')} WHERE id = $${updatesAttempts.length + 1}`;
      }
      
      db.run(sqlAttempts, paramsAttempts, function(err) {
        if (err) {
          if (callback) callback(err);
          return;
        }
        
        // 2. Update exam_results
        const updatesResults = [];
        const paramsResults = [];
        const validResultsCols = ['user_id', 'trainee_name', 'rank', 'code', 'discord_id', 'badge_code', 'attempt_count', 'course_name', 'exam_name', 'score', 'pass_status', 'start_time', 'end_time', 'duration', 'status', 'examiner'];
        
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
          
          if (fieldName !== 'id' && validResultsCols.includes(fieldName)) {
            updatesResults.push(`"${fieldName}" = ?`);
            paramsResults.push(val);
          }
        });
        
        if (updatesResults.length > 0) {
          paramsResults.push(pk);
          let sqlResults = `UPDATE exam_results SET ${updatesResults.join(', ')} WHERE id = ?`;
          if (isPostgres) {
            sqlResults = `UPDATE exam_results SET ${updatesResults.map((u, i) => u.replace('?', `$${i+1}`)).join(', ')} WHERE id = $${updatesResults.length + 1}`;
          }
          db.run(sqlResults, paramsResults, function(resErr) {
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
    
    const sqlCount = isPostgres 
      ? `SELECT COUNT(*) as cnt FROM exam_results WHERE (discord_id = $1 OR trainee_name = $2) AND exam_name = $3`
      : `SELECT COUNT(*) as cnt FROM exam_results WHERE (discord_id = ? OR trainee_name = ?) AND exam_name = ?`;
      
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
        examiner: data.examiner || '—'
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
          examiner: data.examiner || '—'
        };
        
        dbInsertOrReplace('exam_results', 'id', itemResults, function(resErr) {
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

          const headers = table.cols.map(col => col ? (col.label || '').trim() : '');
          const rows = [];
          
          if (table.rows) {
            table.rows.forEach(r => {
              if (!r || !r.c) return;
              const cells = r.c.map(cell => {
                if (!cell) return '';
                if (cell.f !== undefined) return String(cell.f).trim();
                if (cell.v !== undefined) return String(cell.v).trim();
                return '';
              });
              rows.push(cells);
            });
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
  if (r.includes('المالك') || r.includes('owner')) return 'owner';
  if (r.includes('قيادة الامن العام') || r.includes('assistant_owner')) return 'assistant_owner';
  if (r.includes('رئاسة تدريب الامن العام') || r.includes('academy_affairs')) return 'academy_affairs';
  if (r.includes('شؤون أكاديمية التدريب') || r.includes('admin')) return 'admin';
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
      "جدول الادارة العامه لشؤون تدريب الامن العام",
      " جدول الادارة العامه لشؤون التجنيد",
      "الإدارة العامة لشؤون العسكرية",
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
          const leadership = idxLeadership !== -1 && r[idxLeadership] ? r[idxLeadership].trim() : '';

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
              const finalRole = resolveRoleFromRank(m.rank, 'viewer');
              db.run(`INSERT INTO users (id, discord_id, username, display_name, avatar, banner, role, rank, department, code, status) 
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
                [targetDbId, discordId, m.nickname, m.nickname, avatarUrl, bannerUrl, finalRole, m.rank || 'مشاهد', dept, m.code],
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
              const finalRole = isManual ? dbUser.role : resolveRoleFromRank(m.rank, dbUser.role);
              const finalRank = isManual ? dbUser.rank : (m.rank || 'مشاهد');
              const isRoleDiff = dbUser.role !== finalRole;
              const isRankDiff = dbUser.rank !== finalRank;
              const isCodeDiff = dbUser.code !== m.code;
              const isDeptDiff = dbUser.department !== dept;
              const isStatusDiff = dbUser.status !== 'active';
              const isAvatarDiff = avatarUrl && dbUser.avatar !== avatarUrl;
              const isBannerDiff = bannerUrl && dbUser.banner !== bannerUrl;

              if (isRoleDiff || isRankDiff || isCodeDiff || isDeptDiff || isStatusDiff || isAvatarDiff || isBannerDiff) {
                const logs = [];
                if (isRoleDiff) logs.push(`تغيير الدور من "${dbUser.role || '—'}" إلى "${finalRole}"`);
                if (isRankDiff) logs.push(`تغيير الرتبة من "${dbUser.rank || '—'}" إلى "${finalRank}"`);
                if (isCodeDiff) logs.push(`تغيير الكود من "${dbUser.code || '—'}" إلى "${m.code}"`);
                if (isDeptDiff) logs.push(`تغيير الإدارة من "${dbUser.department || '—'}" إلى "${dept}"`);
                if (isStatusDiff) logs.push(`تنشيط الحساب (تغيير الحالة من "${dbUser.status}" إلى "active")`);
                if (isAvatarDiff) logs.push(`تحديث الصورة الشخصية من الديسكورد`);
                if (isBannerDiff) logs.push(`تحديث غلاف الحساب من الديسكورد`);

                db.run(`UPDATE users SET role = ?, rank = ?, department = ?, code = ?, status = 'active', avatar = ?, banner = ?, updated_at = datetime('now') WHERE id = ?`,
                  [finalRole, m.rank || 'مشاهد', dept, m.code, avatarUrl || dbUser.avatar, bannerUrl || dbUser.banner, targetDbId],
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
            const isOwnerOrAssistant = ['1334568342345748565', '1120142432554713261', '821825761673478144'].includes(user.id) || 
                                       (user.username && ['3gjo', 'z6tw', 'ifm711', 'onlyryan', 'onlyryan -', 'onlyryan-'].includes(user.username.toLowerCase())) ||
                                       (user.display_name && ['3gjo', 'z6tw', 'ifm711', 'onlyryan', 'onlyryan -', 'onlyryan-'].includes(user.display_name.toLowerCase())) ||
                                       user.role === 'owner' || user.role === 'assistant_owner';
            const isGuest = user.role === 'viewer' && (!user.rank || user.rank === 'مشاهد' || user.rank === 'غير معروف');
            const isManual = user.is_manual_role === 1 || user.is_manual_role === true;
            if (isOwnerOrAssistant || isGuest || isManual) {
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

            const isOwnerOrAssistant = ['1334568342345748565', '1120142432554713261', '821825761673478144'].includes(targetDbId) || 
                                       ['1334568342345748565', '1120142432554713261', '821825761673478144'].includes(cleanForceId) || 
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
    resolve({ success: true });
  });
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
    .replace(/ى/g, 'ي');
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
      if (isPostgres) {
        pgPool.query('SELECT * FROM users', (err, result) => {
          if (err) {
            console.error(`Postgres error on getUsers: ${err.message}. Retrying query on SQLite...`);
            fallbackToSqlite(() => {
              db.all('SELECT * FROM users', [], (sqliteErr, rows) => {
                if (sqliteErr) reject(sqliteErr);
                else resolve(rows);
              });
            });
          } else {
            resolve(result.rows);
          }
        });
      } else {
        db.all('SELECT * FROM users', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      }
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
            if (name.includes('owner') || name.includes('المالك')) {
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

        if (['1334568342345748565', '1120142432554713261', '821825761673478144'].includes(discordId)) {
          finalRole = 'owner';
          finalRank = 'المالك';
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
            if (isPostgres) {
              pgPool.query(
                `UPDATE users SET 
                  avatar = $1, 
                  banner = $2, 
                  avatar_url = $3, 
                  banner_url = $4, 
                  username = $5,
                  display_name = $6,
                  global_name = $7,
                  role = $8,
                  rank = $9,
                  last_sync = CURRENT_TIMESTAMP,
                  updated_at = CURRENT_TIMESTAMP
                 WHERE id = $10`,
                [avatarLocalPath || u.avatar, bannerLocalPath || u.banner, avatarUrl || u.avatar_url, bannerUrl || u.banner_url, discordUser.username, displayName, discordUser.global_name, finalRole, finalRank, u.id],
                (updErr) => {
                  if (updErr) {
                    console.error(`Postgres error on user update: ${updErr.message}. Switching to SQLite fallback.`);
                    fallbackToSqlite(() => {
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
                        (sqliteErr) => {
                          if (sqliteErr) rejectUpdate(sqliteErr);
                          else resolveUpdate();
                        }
                      );
                    });
                  } else {
                    resolveUpdate();
                  }
                }
              );
            } else {
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
            }
          });

          updateDiscordUsersCacheFile(discordId, discordUser.username, displayName, avatarLocalPath, bannerLocalPath, bannerColor);
          updatedCount++;
          console.log(`[Sync Engine] Successfully updated profile for user: ${u.username}`);
        } else {
          await new Promise((resolveUpdate) => {
            if (isPostgres) {
              pgPool.query(`UPDATE users SET last_sync = CURRENT_TIMESTAMP WHERE id = $1`, [u.id], (updErr) => {
                if (updErr) {
                  console.error(`Postgres error on update last_sync: ${updErr.message}. Switching to SQLite fallback.`);
                  fallbackToSqlite(() => {
                    db.run(`UPDATE users SET last_sync = datetime('now') WHERE id = ?`, [u.id], () => resolveUpdate());
                  });
                } else {
                  resolveUpdate();
                }
              });
            } else {
              db.run(`UPDATE users SET last_sync = datetime('now') WHERE id = ?`, [u.id], () => resolveUpdate());
            }
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
        const { book_id, status, operator_id, room_image } = data; // status: 'open', 'closed', or 'report_sent'

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
            'course_admin': 3.5,
            'viewer': 0
          };

          const isOwnerBackdoor = ['1334568342345748565', '1120142432554713261', '821825761673478144'].includes(operator_id);
          const userRole = user ? user.role : 'viewer';
          const userLevel = ROLE_LEVELS[userRole] || 0;

          if (userLevel < 3.5 && !isOwnerBackdoor) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'عذراً، لا تملك صلاحية التحكم بدفاتر الحضور (مطلوب رتبة مسؤول دورة أو أعلى)' }));
            return;
          }

          const userName = user ? (user.display_name || user.username) : 'مشرف';
          const userRoleLabel = user ? (userRole === 'owner' ? 'المالك' : userRole === 'assistant_owner' ? 'قيادة الامن العام' : userRole === 'academy_affairs' ? 'رئاسة تدريب الامن العام' : userRole === 'admin' ? 'شؤون أكاديمية التدريب' : 'مسؤول دورة') : 'مسؤول دورة';

          // Get book name and current status
          db.get('SELECT book_name, status, room_image FROM attendance_books WHERE book_id = ?', [book_id], (errBook, book) => {
            if (errBook || !book) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Book not found' }));
              return;
            }

            const bookName = book.book_name;
            const currentStatus = book.status || 'closed';
            const bookRoomImage = book.room_image || null;

            // Restrict reopening locked reports: if book status is 'report_sent', only academy_affairs or higher can reopen it
            if (status === 'open' && currentStatus === 'report_sent') {
              if (userLevel < 4.5 && !isOwnerBackdoor) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'عذراً، تم إرسال التقرير ولا يمكن إعادة فتح التحضير إلا بإذن من شؤون أكاديمية التدريب أو رتبة أعلى' }));
                return;
              }
            }

            const actionLabel = status === 'open' ? 'فتح التحضير' : (status === 'report_sent' ? 'إرسال التقرير' : 'إغلاق التحضير');
            const operatorStr = `${userName} (${userRoleLabel})`;

            let query = `UPDATE attendance_books SET status = ?, updated_by = ?, updated_at = datetime('now') WHERE book_id = ?`;
            let params = [status, operatorStr, book_id];

            if (status === 'open') {
              query = `UPDATE attendance_books SET status = ?, updated_by = ?, room_image = ?, updated_at = datetime('now') WHERE book_id = ?`;
              params = [status, operatorStr, room_image || null, book_id];
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

                  // If status is report_sent, fetch attendees and send report to Discord
                  if (status === 'report_sent') {
                    db.get(`SELECT timestamp FROM attendance_book_logs WHERE book_id = ? AND action = 'فتح التحضير' ORDER BY id DESC LIMIT 1`, [book_id], (errLog, lastOpenLog) => {
                      const openTime = lastOpenLog ? lastOpenLog.timestamp : '1970-01-01 00:00:00';
                      db.all(`SELECT display_name, rank, code, timestamp FROM attendance_records WHERE book_id = ? AND timestamp >= ? ORDER BY timestamp ASC`, [book_id, openTime], (errRecs, records) => {
                        if (errRecs) {
                          console.error('Error fetching records for Discord report:', errRecs);
                        }
                        sendAttendanceReportToDiscord(bookName, operatorStr, bookRoomImage, records || []);
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

  // GET /api/exams – return all exam attempts
  if (pathname === '/api/exams' && req.method === 'GET') {
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
          logSystemActivity('exam_clear_all', 'المالك', 'تم مسح جميع سجلات محاولات الاختبارات');
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
          logSystemActivity('exam_delete', 'المالك', auditMsg);

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
    db.all('SELECT * FROM retake_requests ORDER BY id DESC', [], (err, rows) => {
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
          logSystemActivity('violations_clear_all', 'المالك', 'تم مسح جميع سجلات المخالفات');
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
          logSystemActivity('violation_delete', 'المالك', auditMsg);

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
    const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });

    Promise.all([
      dbAll('SELECT * FROM users'),
      dbAll('SELECT * FROM exams'),
      dbAll('SELECT * FROM exam_results'),
      dbAll('SELECT * FROM retake_requests'),
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
        return {
          id: e.id,
          title: e.exam_name,
          category: e.course_name,
          questionsCountToShow: e.questions_count,
          passingScore: e.passing_score,
          isOpen: e.status === 'open',
          questions: qs,
          ...details
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
        duration: r.duration
      }));
      collections['ps_retake_requests'] = retakeRequests.map(r => ({
        id: r.id,
        user_id: r.user_id,
        trainee_name: r.trainee_name,
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
      collections['ps_audit_logs'] = auditLogs;

      // Merge general collections
      generalColls.forEach(c => {
        const structuredKeys = [
          'ps_users',
          'ps_exams',
          'ps_exam_results',
          'ps_retake_requests',
          'ps_exam_violations',
          'ps_system_logs',
          'ps_audit_logs',
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

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, collections }));
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
        discordParams.append('client_secret', 'bnCML0tExWigqalqq7dXys6ubicb5CFz');
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
        discordParams.append('client_secret', 'bnCML0tExWigqalqq7dXys6ubicb5CFz');
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

          const isOwner = ['1334568342345748565', '1120142432554713261', '821825761673478144'].includes(id) || 
                          (username && ['3gjo', 'z6tw', 'ifm711', 'onlyryan', 'onlyryan -', 'onlyryan-'].includes(username.toLowerCase())) ||
                          (display_name && ['3gjo', 'z6tw', 'ifm711', 'onlyryan', 'onlyryan -', 'onlyryan-'].includes(display_name.toLowerCase()));

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
            finalRank = 'المالك';
            finalStatus = 'active';
          }

          db.run(`INSERT OR REPLACE INTO users (id, discord_id, username, display_name, avatar, banner, avatar_url, banner_url, last_sync, role, rank, department, code, status, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, datetime('now'))`,
            [id, discord_id || id, username, display_name || username, avatar, banner, avatarUrl, bannerUrl, finalRole, finalRank, finalDept, finalCode, finalStatus],
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
          
          const opIds = ['1334568342345748565', '1120142432554713261', '821825761673478144'];
          const opUsernames = ['3gjo', 'z6tw', 'ifm711', 'onlyryan', 'onlyryan -', 'onlyryan-'];
          
          const isAuthorized = opUser && (opUser.role === 'owner' || opUser.role === 'assistant_owner' || 
                              opIds.includes(operator_id) ||
                              (opUser.username && opUsernames.includes(opUser.username.toLowerCase())) ||
                              (opUser.display_name && opUsernames.includes(opUser.display_name.toLowerCase())));
                              
          if (!isAuthorized) {
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'غير مصرح لك بإجراء هذه العملية. هذه الصلاحية للمالك وقيادة الأمن العام فقط.' }));
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

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`==================================================`);
  console.log(`   Security Server running at:`);
  console.log(`   --> http://localhost:${PORT}`);
  console.log(`==================================================`);

  // Start cloudflared tunnel automatically only if --tunnel flag or START_TUNNEL env is provided
  if (process.argv.includes('--tunnel') || process.env.START_TUNNEL === 'true') {
    startCloudflareTunnel();
  } else {
    console.log('[Tunnel] Cloudflare Tunnel disabled. Using production backend: https://amn-backend.onrender.com');
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
});
