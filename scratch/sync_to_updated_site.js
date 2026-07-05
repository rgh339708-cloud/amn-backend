const fs = require('fs');
const path = require('path');

const files = [
  'assets/js/auth.js',
  'assets/js/app.js',
  'pages/admin/amn16.html',
  'pages/amn8.html',
  'pages/amn15.html',
  'pages/amn12.html'
];

files.forEach(f => {
  const src = path.join(__dirname, '..', f);
  const dest = path.join(__dirname, '../updated_site', f);
  
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`Copied ${f} to updated_site/${f}`);
  } else {
    console.warn(`Source not found: ${f}`);
  }
});
