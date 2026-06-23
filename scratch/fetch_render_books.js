const https = require('https');

https.get('https://amn-backend.onrender.com/api/attendance/books', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Render API Status:', res.statusCode);
    console.log('Render API Headers:', res.headers);
    console.log('Render API Response:', data);
  });
}).on('error', (err) => {
  console.error('Fetch Error:', err.message);
});
