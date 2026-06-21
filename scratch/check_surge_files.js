const fs = require('fs');
const path = require('path');

const ignorePatterns = [
  'scratch',
  '.vscode',
  '.git',
  'node_modules',
  'create_ssh_key.js',
  'cloudflared.exe',
  'updated_site.zip',
  'db.js',
  'server.js',
  'migrate.js',
  'package.json',
  'package-lock.json',
  'deploy.html',
  'Dockerfile',
  'exam_archive.db'
];

// Helper to check if a file path matches ignore patterns or is inside ignored dirs
function isIgnored(filePath) {
  const relative = path.relative(__dirname, filePath).replace(/\\/g, '/');
  
  // Specific checks for avatars and banners
  if (relative.startsWith('assets/img/avatars') || relative.startsWith('assets/img/banners')) {
    return true;
  }
  
  for (const pattern of ignorePatterns) {
    if (relative === pattern || relative.startsWith(pattern + '/')) {
      return true;
    }
    if (pattern.startsWith('*.') && relative.endsWith(pattern.substring(1))) {
      return true;
    }
  }
  return false;
}

function getFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getFiles(filePath, fileList);
    } else {
      if (!isIgnored(filePath)) {
        fileList.push({ path: filePath, size: stat.size });
      }
    }
  }
  return fileList;
}

const files = getFiles(__dirname);
files.sort((a, b) => b.size - a.size);

console.log('Total files to deploy:', files.length);
console.log('Total size:', (files.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(2), 'MB');
console.log('\nTop 20 largest files:');
files.slice(0, 20).forEach(f => {
  console.log(`${path.relative(__dirname, f.path)} - ${(f.size / (1024 * 1024)).toFixed(2)} MB`);
});
