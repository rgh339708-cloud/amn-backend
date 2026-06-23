const fs = require('fs');
const path = require('path');

const TARGET_DIR = path.join(__dirname, '..');
const VERSION = '1.1.26'; // New cache-buster version

// Helper to recursively find all HTML files
function getHtmlFiles(dir, filesList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'scratch') {
        getHtmlFiles(filePath, filesList);
      }
    } else if (file.endsWith('.html')) {
      filesList.push(filePath);
    }
  }
  return filesList;
}

const htmlFiles = getHtmlFiles(TARGET_DIR);
console.log(`Found ${htmlFiles.length} HTML files to update.`);

let updatedCount = 0;

const jsFiles = ['storage.js', 'data.js', 'auth.js', 'components.js', 'app.js'];
const cssFiles = ['main.css', 'hero.css', 'navbar.css', 'sidebar.css', 'admin.css'];

htmlFiles.forEach(filePath => {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  jsFiles.forEach(jsFile => {
    // Regex matches e.g. src="path/to/auth.js" or src="path/to/auth.js?v=something"
    // Capture the path before the file name and the quote at the end
    const regex = new RegExp(`src="([^"]*\\b${jsFile})(?:\\?[^"]*)?"`, 'g');
    
    if (regex.test(content)) {
      content = content.replace(regex, `src="$1?v=${VERSION}"`);
      changed = true;
    }
  });

  cssFiles.forEach(cssFile => {
    // Regex matches e.g. href="path/to/hero.css" or href="path/to/hero.css?v=something"
    const regex = new RegExp(`href="([^"]*\\b${cssFile})(?:\\?[^"]*)?"`, 'g');
    
    if (regex.test(content)) {
      content = content.replace(regex, `href="$1?v=${VERSION}"`);
      changed = true;
    }
  });

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${path.relative(TARGET_DIR, filePath)}`);
    updatedCount++;
  }
});

console.log(`Successfully updated ${updatedCount} files with cache buster ?v=${VERSION}.`);
