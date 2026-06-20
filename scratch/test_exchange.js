const https = require('https');

const url = 'https://corsproxy.io/?' + encodeURIComponent('https://discord.com/api/oauth2/token');

console.log('Testing corsproxy.io request...');
const req = https.request(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  }
}, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('BODY:', data);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write('client_id=1510157546500001884&grant_type=authorization_code&code=test_code&redirect_uri=https://amn-3-90.surge.sh/');
req.end();
