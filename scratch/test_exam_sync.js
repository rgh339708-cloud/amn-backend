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

const config = loadConfig();
const DATABASE_URL = process.env.DATABASE_URL || config.databaseUrl;
const pgPool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const isPostgres = true;

function convertSqlToPostgres(sql) {
  let pgSql = sql;
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
  let index = 1;
  pgSql = pgSql.replace(/\?/g, () => `$${index++}`);
  return pgSql;
}

const db = {
  run(sql, params = [], callback) {
    const pgSql = convertSqlToPostgres(sql);
    console.log('[pgSql]', pgSql);
    console.log('[params]', params);
    pgPool.query(pgSql, params, (err, res) => {
      if (err) {
        if (callback) callback(err);
      } else {
        const context = {
          lastID: res.rows && res.rows[0] ? (res.rows[0].id || Object.values(res.rows[0])[0]) : null,
          changes: res.rowCount
        };
        if (callback) callback.call(context, null);
      }
    });
  }
};

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

// Test inserting an exam
const examToInsert = {
  id: 'exam_test_123',
  exam_name: 'اختبار تجريبي',
  course_name: 'دورة تجريبية',
  questions_count: 5,
  passing_score: 80,
  status: 'open',
  questions_json: '[]',
  details_json: '{}'
};

dbInsertOrReplaceStringKey('exams', 'id', examToInsert, (err) => {
  if (err) {
    console.error('❌ Insert failed:', err);
  } else {
    console.log('✅ Insert successful!');
  }
  pgPool.end();
});
