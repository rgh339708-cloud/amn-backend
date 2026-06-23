const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, '../server.js');
const content = fs.readFileSync(serverFile, 'utf8');
const lines = content.split('\n');

for (let i = 3575; i < 3650; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
