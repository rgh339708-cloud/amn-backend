const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, '../server.js');
const content = fs.readFileSync(serverFile, 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('sheets_cache')) {
    console.log(`\nMatch at line ${idx + 1}:`);
    for (let i = Math.max(0, idx - 2); i <= Math.min(lines.length - 1, idx + 8); i++) {
      console.log(`${i + 1}: ${lines[i]}`);
    }
  }
});
