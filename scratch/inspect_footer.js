const fs = require('fs');
const path = require('path');

const indexHtmlPath = path.join(__dirname, '../index.html');
if (fs.existsSync(indexHtmlPath)) {
  const content = fs.readFileSync(indexHtmlPath, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('PS-City90')) {
      console.log(`Line ${idx + 1}: ${JSON.stringify(line)}`);
      // Print 5 lines before and after
      for (let i = Math.max(0, idx - 5); i <= Math.min(lines.length - 1, idx + 5); i++) {
        console.log(`  [${i + 1}] ${lines[i]}`);
      }
    }
  });
} else {
  console.log('index.html does not exist at ' + indexHtmlPath);
}
