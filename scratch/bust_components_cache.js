const fs = require('fs');
const path = require('path');

const targetDirs = [
  path.join(__dirname, '..'),
  path.join(__dirname, '..', 'pages'),
  path.join(__dirname, '..', 'pages', 'admin')
];

function processDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isFile() && file.endsWith('.html')) {
      let content = fs.readFileSync(filePath, 'utf8');
      let changed = false;
      
      // Match src="...components.js" with or without existing version query
      const regex = /src=["']([^"']*components\.js)(?:\?v=[^"']*)?["']/g;
      
      if (regex.test(content)) {
        content = content.replace(regex, (match, p1) => {
          changed = true;
          return `src="${p1}?v=1.1.25"`;
        });
      }
      
      if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated cache-busting in: ${path.relative(path.join(__dirname, '..'), filePath)}`);
      }
    }
  });
}

targetDirs.forEach(processDir);
console.log('Cache-busting update completed.');
