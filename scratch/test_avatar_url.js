const fetch = require('node-fetch');

async function checkUrl() {
  const url = 'https://cdn.discordapp.com/avatars/1334568342345748565/e2dcb67601cdaefd19b887ad9c1105a9.png?size=512';
  try {
    const res = await fetch(url);
    console.log('Status Code:', res.status);
    console.log('Content-Type:', res.headers.get('content-type'));
  } catch (err) {
    console.error('Error fetching URL:', err.message);
  }
}

checkUrl();
