const https = require('https');

const req = https.get('https://amn-backend.onrender.com/api/debug_db', (res) => {
  console.log('Status Code:', res.statusCode);
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Response Body:', data);
  });
});

req.on('error', (err) => {
  console.error('Error fetching API:', err.message);
});

req.setTimeout(10000, () => {
  console.log('Request Timed Out!');
  req.destroy();
});
