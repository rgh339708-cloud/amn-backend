const fs = require('fs');
const path = require('path');

function searchDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== '.gemini' && file !== 'scratch') {
        searchDir(fullPath);
      }
    } else if (file.endsWith('.html') || file.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('showDatabaseClosedMessage')) {
        console.log(`Found showDatabaseClosedMessage in: ${fullPath}`);
        // Find line numbers
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          if (line.includes('showDatabaseClosedMessage')) {
            console.log(`  Line ${i + 1}: ${line.trim()}`);
          }
        });
      }
      if (content.includes('db-closed')) {
        console.log(`Found db-closed in: ${fullPath}`);
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          if (line.includes('db-closed')) {
            console.log(`  Line ${i + 1}: ${line.trim()}`);
          }
        });
      }
    }
  });
}

searchDir('.');
