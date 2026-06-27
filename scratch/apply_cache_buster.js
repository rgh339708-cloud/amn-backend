const fs = require('fs');
const path = require('path');

const PAGES_DIR = path.join(__dirname, '..', 'pages');
const ROOT_DIR = path.join(__dirname, '..');

// 1. Process files in pages/
if (fs.existsSync(PAGES_DIR)) {
  const files = fs.readdirSync(PAGES_DIR).filter(f => f.endsWith('.html'));
  files.forEach(file => {
    const filePath = path.join(PAGES_DIR, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace components.js version
    let updated = content.replace(/components\.js\?v=[\d\.]+/g, 'components.js?v=1.1.31');
    updated = updated.replace(/components\.js/g, 'components.js?v=1.1.31'); // safety check for unversioned
    updated = updated.replace(/components\.js\?v=1\.1\.31\?v=1\.1\.31/g, 'components.js?v=1.1.31'); // remove double versioning if any
    
    if (updated !== content) {
      fs.writeFileSync(filePath, updated, 'utf8');
      console.log(`✅ Bumped components.js version in pages/${file}`);
    }
  });
}

// 2. Process index.html in root
const indexHtmlPath = path.join(ROOT_DIR, 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  let content = fs.readFileSync(indexHtmlPath, 'utf8');
  let updated = content.replace(/components\.js\?v=[\d\.]+/g, 'components.js?v=1.1.31');
  updated = updated.replace(/components\.js/g, 'components.js?v=1.1.31');
  updated = updated.replace(/components\.js\?v=1\.1\.31\?v=1\.1\.31/g, 'components.js?v=1.1.31');
  if (updated !== content) {
    fs.writeFileSync(indexHtmlPath, updated, 'utf8');
    console.log(`✅ Bumped components.js version in root index.html`);
  }
}

console.log('🎉 Cache-busting complete!');
