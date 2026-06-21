const https = require('https');

function testUrl(url) {
  return new Promise((resolve) => {
    console.log(`Testing ${url}...`);
    const req = https.get(url, { headers: { 'Bypass-Tunnel-Reminder': 'true' } }, (res) => {
      console.log(`[${url}] Status Code:`, res.statusCode);
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log(`[${url}] Response snippet:`, data.substring(0, 100));
        resolve(res.statusCode);
      });
    });
    req.on('error', (err) => {
      console.error(`[${url}] Error:`, err.message);
      resolve(null);
    });
    // Set 5s timeout
    req.setTimeout(5000, () => {
      console.error(`[${url}] Timeout!`);
      req.destroy();
      resolve(null);
    });
  });
}

async function main() {
  await testUrl('https://limited-tony-banner-intimate.trycloudflare.com/api/attendance/books');
  await testUrl('https://amn-backend.onrender.com/api/attendance/books');
  await testUrl('https://amn-backend.onrender.com/api/attendance/reports');
}

main();
