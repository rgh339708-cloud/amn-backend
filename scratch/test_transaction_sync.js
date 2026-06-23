const http = require('http');

function makeRequest(urlPath, method = 'GET', postData = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: urlPath,
      method: method,
      headers: {
        'Bypass-Tunnel-Reminder': 'true'
      }
    };

    if (postData) {
      options.headers['Content-Type'] = 'application/json';
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (e) => { reject(e); });

    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTest() {
  console.log('🔄 Fetching initial collections...');
  const initial = await makeRequest('/api/db/collections');
  if (!initial.body || !initial.body.collections) {
    console.error('❌ Failed to fetch initial collections:', initial.body);
    process.exit(1);
  }

  const initialExams = initial.body.collections.ps_exams || [];
  console.log(`ℹ️ Initial exams count: ${initialExams.length}`);

  // Create a new mock exam list with a test exam added
  const testExamId = 'exam_test_transaction_' + Date.now();
  const updatedExams = [
    ...initialExams,
    {
      id: testExamId,
      title: 'اختبار معاملة ذريّة',
      category: 'التدريب التقني',
      emoji: '⚡',
      duration: 10,
      passingScore: 70,
      isOpen: true,
      questionsCountToShow: 1,
      questions: [{ q: 'هل هذا الاختبار يعمل؟', options: ['نعم', 'لا'], correct: 0 }]
    }
  ];

  console.log('🔄 Initiating bulk sync POST request in background...');
  const syncPromise = makeRequest('/api/db/sync', 'POST', {
    collection: 'ps_exams',
    action: 'set',
    id: null,
    item: null,
    data: updatedExams
  });

  // Run multiple concurrent GET /api/db/collections requests in parallel while sync is executing
  console.log('🔄 Running 20 parallel GET requests to check for empty collections...');
  const readPromises = [];
  for (let i = 0; i < 20; i++) {
    readPromises.push(makeRequest('/api/db/collections'));
  }

  const [syncResult, ...readResults] = await Promise.all([syncPromise, ...readPromises]);

  console.log('✅ Sync response:', syncResult.body);

  let emptyReads = 0;
  let partialReads = 0;
  readResults.forEach((res, idx) => {
    const exams = res.body?.collections?.ps_exams || [];
    if (exams.length === 0) {
      emptyReads++;
    } else if (exams.length < initialExams.length) {
      partialReads++;
    }
  });

  console.log('--------------------------------------------------');
  console.log(`📊 Parallel Read Results:`);
  console.log(`   - Total checks: ${readResults.length}`);
  console.log(`   - Empty exam lists detected: ${emptyReads}`);
  console.log(`   - Partial exam lists detected: ${partialReads}`);
  console.log('--------------------------------------------------');

  if (emptyReads > 0 || partialReads > 0) {
    console.error('❌ FAILURE: Concurrent reads detected empty or partial exam tables during sync!');
    process.exit(1);
  } else {
    console.log('✅ SUCCESS: All concurrent reads returned a complete set of exams without race conditions!');
  }

  // Cleanup: Delete the test exam
  console.log('🧹 Cleaning up test exam...');
  await makeRequest('/api/db/sync', 'POST', {
    collection: 'ps_exams',
    action: 'delete',
    id: testExamId
  });
  console.log('✅ Cleanup complete.');
}

runTest().catch(console.error);
