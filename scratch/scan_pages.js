const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, '..', 'pages');

function scanDirectory(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDirectory(fullPath);
    } else if (file.endsWith('.html')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (!content.includes('Components.navbar')) {
        console.log(`Missing Components.navbar: pages/${path.relative(pagesDir, fullPath).replace(/\\/g, '/')}`);
      }
      if (!content.includes('Components.sidebar')) {
        console.log(`Missing Components.sidebar: pages/${path.relative(pagesDir, fullPath).replace(/\\/g, '/')}`);
      }
    }
  });
}

scanDirectory(pagesDir);
