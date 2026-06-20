const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const lines = content.split('\n');

console.log('Searching for "upsert_user" or "/api/auth" in server.js:');
lines.forEach((line, idx) => {
  if (line.includes('upsert_user') || line.includes('/api/auth')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
