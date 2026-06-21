const https = require('https');

https.get('https://amn-3-90.com/index.html', (res) => {
  console.log('Status code for custom domain index.html:', res.statusCode);
  console.log('Headers:', res.headers);
}).on('error', (err) => {
  console.error('Error fetching custom domain index.html:', err.message);
});

https.get('https://amn-3-90.com/pages/attendance-reports.html', (res) => {
  console.log('Status code for custom domain attendance-reports.html:', res.statusCode);
  console.log('Headers:', res.headers);
}).on('error', (err) => {
  console.error('Error fetching custom domain attendance-reports.html:', err.message);
});
