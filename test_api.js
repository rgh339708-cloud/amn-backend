const https = require('https');

https.get('https://amn-backend.onrender.com/api/auth/get_user?id=1334568342345748565', (res) => {
  console.log('Status Code:', res.statusCode);
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Response Body:', data);
  });
}).on('error', (err) => {
  console.error('Error fetching API:', err);
});
