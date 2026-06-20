const https = require('https');

function testSecret(secret) {
  return new Promise((resolve) => {
    const params = new URLSearchParams();
    params.append('client_id', '1510157546500001884');
    params.append('client_secret', secret);
    params.append('grant_type', 'authorization_code');
    params.append('code', 'fake_code_for_testing_purposes');
    params.append('redirect_uri', 'https://amn-3-90.surge.sh/index.html');

    const postData = params.toString();

    const req = https.request({
      hostname: 'discord.com',
      path: '/api/oauth2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`Secret: ${secret.substring(0, 5)}... -> HTTP ${res.statusCode}: ${body}`);
        resolve({ secret, status: res.statusCode, body });
      });
    });

    req.on('error', (err) => {
      console.error(`Error for ${secret.substring(0, 5)}...:`, err.message);
      resolve({ secret, error: err.message });
    });

    req.write(postData);
    req.end();
  });
}

async function run() {
  await testSecret('OKP7jA0MyAAUx66QejwmVjW-5ozxuUsW');
  await testSecret('bnCML0tExWigqalqq7dXys6ubicb5CFz');
}

run();
