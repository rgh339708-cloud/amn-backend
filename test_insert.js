const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

function loadConfig() {
  const config = { databaseUrl: '' };
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
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const parts = line.trim().split('=');
      if (parts.length >= 2 && !parts[0].startsWith('#')) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        if (key === 'DATABASE_URL') config.databaseUrl = value;
      }
    });
  }
  return config;
}

function convertSqlToPostgres(sql) {
  let pgSql = sql;
  if (/insert\s+or\s+replace\s+into\s+(\w+)\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)/i.test(sql)) {
    pgSql = sql.replace(/insert\s+or\s+replace\s+into\s+(\w+)\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)/i, (match, tableName, columnsStr, valuesStr) => {
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
  pgSql = pgSql.replace(/datetime\('now'\)/gi, "CURRENT_TIMESTAMP");
  pgSql = pgSql.replace(/datetime\('now',\s*'localtime'\)/gi, "CURRENT_TIMESTAMP");
  pgSql = pgSql.replace(/datetime\('now',\s*'\+2 hours'\)/gi, "CURRENT_TIMESTAMP + interval '2 hours'");
  pgSql = pgSql.replace(/AUTOINCREMENT/gi, "SERIAL");
  let index = 1;
  pgSql = pgSql.replace(/\?/g, () => `$${index++}`);
  return pgSql;
}

const config = loadConfig();
const dbUrl = process.env.DATABASE_URL || config.databaseUrl;

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

const sql = `INSERT OR REPLACE INTO users (id, discord_id, username, display_name, avatar, banner, avatar_url, banner_url, last_sync, role, rank, department, code, status, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, datetime('now'))`;

const pgSql = convertSqlToPostgres(sql);
console.log('Converted SQL:\n', pgSql);

const params = [
  '1334568342345748565',
  '1334568342345748565',
  '3gjo',
  '[CC | P-19] ريان بن محمد',
  'https://cdn.discordapp.com/avatars/1334568342345748565/e2dcb67601cdaefd19b887ad9c1105a9.png?size=512',
  'https://cdn.discordapp.com/banners/1334568342345748565/79efd028b6c2d3f2455973e82a2b9169.png?size=1024',
  'https://cdn.discordapp.com/avatars/1334568342345748565/e2dcb67601cdaefd19b887ad9c1105a9.png',
  'https://cdn.discordapp.com/banners/1334568342345748565/79efd028b6c2d3f2455973e82a2b9169.png',
  'owner',
  'عميد ركن',
  'جدول الامن العام - الاساسي',
  'CC | P-19',
  'active'
];

pool.query(pgSql, params, (err, res) => {
  if (err) {
    console.error('❌ Query execution failed:', err);
  } else {
    console.log('✅ Query execution succeeded! Rows affected:', res.rowCount);
  }
  pool.end();
});
