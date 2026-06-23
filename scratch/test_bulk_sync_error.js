const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Replicate configuration and database helpers from server.js
const DB_PATH = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');
let sqliteDb = new sqlite3.Database(DB_PATH);

function loadConfig() {
  const config = { databaseUrl: '' };
  const envPaths = [
    path.join('c:', 'Users', 'rayan', 'OneDrive', 'Documents', 'DISCORD', '.env'),
    path.join(process.env.USERPROFILE || 'C:\\Users\\rayan', 'OneDrive', 'Documents', 'DISCORD', '.env')
  ];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const parts = line.trim().split('=');
        if (parts.length >= 2 && !parts[0].startsWith('#')) {
          const key = parts[0].trim();
          const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
          if (key === 'DATABASE_URL') config.databaseUrl = value;
        }
      });
      break;
    }
  }
  return config;
}

const config = loadConfig();
const DATABASE_URL = process.env.DATABASE_URL || config.databaseUrl;
let isPostgres = !!DATABASE_URL;
let pgPool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

let db = {
  run(sql, params, callback) { sqliteDb.run(sql, params, callback); },
  get(sql, params, callback) { sqliteDb.get(sql, params, callback); },
  all(sql, params, callback) { sqliteDb.all(sql, params, callback); },
  serialize(callback) { sqliteDb.serialize(callback); },
  prepare(sql) { return sqliteDb.prepare(sql); }
};

function fallbackToSqlite(next) {
  if (isPostgres) {
    console.warn('⚠️ Postgres query failed or quota limits exceeded. Switching to local SQLite database mode...');
    isPostgres = false;
  }
  if (next) {
    next();
  }
}

function convertSqlToPostgres(sql) {
  let pgSql = sql;
  const matchRegex = /insert\s+or\s+replace\s+into\s+(\w+)\s*\(([^)]+)\)\s*values\s*\((.*)\)/is;
  if (matchRegex.test(sql)) {
    pgSql = sql.replace(matchRegex, (match, tableName, columnsStr, valuesStr) => {
      const cols = columnsStr.split(',').map(c => c.trim().replace(/[\[\]"]/g, ''));
      let primaryKey = 'id';
      const updateCols = cols.filter(c => c !== primaryKey);
      const updateClause = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
      return `INSERT INTO "${tableName}" (${columnsStr}) VALUES (${valuesStr}) ON CONFLICT ("${primaryKey}") DO UPDATE SET ${updateClause}`;
    });
  }
  let index = 1;
  pgSql = pgSql.replace(/\?/g, () => `$${index++}`);
  return pgSql;
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

function executeBulkSync(tableName, primaryKey, itemsToSave, callback) {
  if (isPostgres && pgPool) {
    pgPool.connect((connectErr, client, release) => {
      if (connectErr) {
        console.error(`❌ pgPool connection error:`, connectErr.message);
        fallbackToSqlite(() => {
          executeBulkSync(tableName, primaryKey, itemsToSave, callback);
        });
        return;
      }
      
      const rollback = (err) => {
        client.query('ROLLBACK', (rbErr) => {
          release();
          console.error(`❌ Postgres transaction error:`, err.message);
          fallbackToSqlite(() => {
            executeBulkSync(tableName, primaryKey, itemsToSave, callback);
          });
        });
      };
      
      client.query('BEGIN', (beginErr) => {
        if (beginErr) return rollback(beginErr);
        
        client.query(`DELETE FROM "${tableName}"`, (deleteErr) => {
          if (deleteErr) return rollback(deleteErr);
          
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
              if (insertErr) return rollback(insertErr);
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
    sqliteDb.serialize(() => {
      sqliteDb.run('BEGIN TRANSACTION', [], (beginErr) => {
        if (beginErr) return callback(beginErr);
        
        sqliteDb.run(`DELETE FROM "${tableName}"`, [], (deleteErr) => {
          if (deleteErr) {
            sqliteDb.run('ROLLBACK', [], () => {});
            return callback(deleteErr);
          }
          
          let insertIndex = 0;
          const insertNext = () => {
            if (insertIndex >= itemsToSave.length) {
              sqliteDb.run('COMMIT', [], (commitErr) => {
                if (commitErr) return callback(commitErr);
                callback(null, itemsToSave.length);
              });
              return;
            }
            
            const item = itemsToSave[insertIndex];
            const { sql, values } = getInsertOrReplaceSqlAndValues(tableName, primaryKey, item);
            sqliteDb.run(sql, values, (insertErr) => {
              if (insertErr) {
                console.error(`❌ SQLite bulk insert error:`, insertErr.message);
                sqliteDb.run('ROLLBACK', [], () => {});
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

// Run test bulk sync
const items = [
  {
    id: 'exam_004',
    exam_name: 'اختبار دورة العمليات الميدانية معدل عبر التراسل',
    course_name: 'العمليات والتحكم',
    questions_count: 47,
    passing_score: 80,
    status: 'open',
    questions_json: '[]',
    details_json: '{}'
  }
];

executeBulkSync('exams', 'id', items, (err, count) => {
  if (err) {
    console.error('❌ Bulk Sync completely failed:', err.message);
  } else {
    console.log(`✅ Bulk Sync completed! count = ${count}`);
    // Check SQLite db to see if it was written
    sqliteDb.all('SELECT id, exam_name FROM exams', [], (sqlErr, rows) => {
      console.log('Exams in SQLite after bulk sync test:', rows);
      sqliteDb.close();
      pgPool.end();
    });
  }
});
