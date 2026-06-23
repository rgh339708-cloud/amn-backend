const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const pagesDir = path.join(rootDir, 'pages');

function checkFile(filePath, isRoot = false) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  const hasNavbarCall = content.includes('Components.navbar') || content.includes('class="navbar"');
  const hasSidebarCall = content.includes('Components.sidebar') || content.includes('class="sidebar"');
  
  if (!hasNavbarCall || !hasSidebarCall) {
    console.log(`Page: ${path.relative(rootDir, filePath)}`);
    console.log(`  - Has Navbar: ${hasNavbarCall ? 'Yes' : 'NO'}`);
    console.log(`  - Has Sidebar: ${hasSidebarCall ? 'Yes' : 'NO'}`);
  }
}

// Check root HTML files
const rootFiles = fs.readdirSync(rootDir);
rootFiles.forEach(file => {
  if (file.endsWith('.html') && file !== 'maintenance.html') {
    checkFile(path.join(rootDir, file), true);
  }
});

// Check pages folder
if (fs.existsSync(pagesDir)) {
  const pageFiles = fs.readdirSync(pagesDir);
  pageFiles.forEach(file => {
    const fullPath = path.join(pagesDir, file);
    if (fs.statSync(fullPath).isFile() && file.endsWith('.html')) {
      checkFile(fullPath);
    }
  });
}
