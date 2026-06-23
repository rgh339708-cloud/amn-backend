const http = require('http');

function postJSON(path, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body ? JSON.parse(body) : null
        });
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('--- starting API tests ---');
  
  // 1. Test unauthorized request
  try {
    const res = await postJSON('/api/auth/update_user_permission', {
      operator_id: '999999999999999999', // dummy user
      target_id: '123456789012345678',
      target_discord: 'test_user',
      role: 'admin',
      rank: 'شؤون أكاديمية التدريب',
      action: 'grant'
    });
    console.log('Test 1 (Unauthorized operator) response status:', res.statusCode);
    console.log('Test 1 response body:', res.body);
    if (res.statusCode !== 403) {
      console.error('❌ Test 1 FAILED: Expected 403 status code.');
    } else {
      console.log('✅ Test 1 PASSED: Correctly blocked unauthorized access.');
    }
  } catch (err) {
    console.error('❌ Test 1 Error:', err);
  }

  // 2. Test authorized request to grant/update
  const targetId = '123456789012345678';
  try {
    const res = await postJSON('/api/auth/update_user_permission', {
      operator_id: '821825761673478144', // authorized owner (عمر المالكي)
      target_id: targetId,
      target_discord: 'test_user',
      role: 'admin',
      rank: 'شؤون أكاديمية التدريب',
      action: 'grant'
    });
    console.log('Test 2 (Authorized grant) response status:', res.statusCode);
    console.log('Test 2 response body:', res.body);
    if (res.statusCode !== 200 || !res.body.success) {
      console.error('❌ Test 2 FAILED: Expected 200 with success status.');
    } else {
      console.log('✅ Test 2 PASSED: Successfully granted manual role.');
    }
  } catch (err) {
    console.error('❌ Test 2 Error:', err);
  }

  // Verify in SQLite database
  const sqlite3 = require('sqlite3').verbose();
  const path = require('path');
  const dbPath = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');
  
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening DB to verify:', err);
      return;
    }
    
    // Check if user has is_manual_role = 1 and correct fields
    db.get('SELECT * FROM users WHERE id = ?', [targetId], (err, row) => {
      if (err) {
        console.error('❌ Database query error:', err);
      } else if (!row) {
        console.error('❌ Test 3 FAILED: User was not inserted/updated in database.');
      } else {
        console.log('Test 3 (DB User verify) row in DB:', row);
        if (row.role === 'admin' && row.rank === 'شؤون أكاديمية التدريب' && row.is_manual_role === 1) {
          console.log('✅ Test 3 PASSED: Database values verified successfully.');
        } else {
          console.error('❌ Test 3 FAILED: DB values did not match the expected settings.');
        }
      }

      // Check audit log
      db.get("SELECT * FROM audit_logs WHERE action_type = 'permission_change' ORDER BY id DESC LIMIT 1", [], (err, logRow) => {
        if (err) {
          console.error('❌ Database audit log query error:', err);
        } else if (!logRow) {
          console.error('❌ Test 4 FAILED: Audit log entry was not found.');
        } else {
          console.log('Test 4 (DB Audit Log verify) log row in DB:', logRow);
          console.log('✅ Test 4 PASSED: Audit log entry verified.');
        }

        // Now test removal of rank
        db.close();
        testRemove();
      });
    });
  });

  async function testRemove() {
    // 5. Test authorized request to remove
    try {
      const res = await postJSON('/api/auth/update_user_permission', {
        operator_id: '821825761673478144',
        target_id: targetId,
        target_discord: 'test_user',
        role: 'viewer',
        rank: 'مشاهد',
        action: 'remove'
      });
      console.log('Test 5 (Authorized remove) response status:', res.statusCode);
      console.log('Test 5 response body:', res.body);
      if (res.statusCode !== 200 || !res.body.success) {
        console.error('❌ Test 5 FAILED: Expected 200 status for removal.');
      } else {
        console.log('✅ Test 5 PASSED: Successfully requested role removal.');
      }
    } catch (err) {
      console.error('❌ Test 5 Error:', err);
    }

    // Verify in database
    const db2 = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening DB to verify removal:', err);
        return;
      }
      
      db2.get('SELECT * FROM users WHERE id = ?', [targetId], (err, row) => {
        if (err) {
          console.error('❌ Database query error:', err);
        } else if (!row) {
          console.error('❌ Test 6 FAILED: User row is missing.');
        } else {
          console.log('Test 6 (DB User remove verify) row in DB:', row);
          if (row.role === 'viewer' && row.rank === 'مشاهد' && row.is_manual_role === 0) {
            console.log('✅ Test 6 PASSED: User successfully reset in database.');
          } else {
            console.error('❌ Test 6 FAILED: Database columns were not reset correctly.');
          }
        }
        db2.close();
      });
    });
  }
}

runTests();
