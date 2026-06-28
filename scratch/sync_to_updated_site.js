const fs = require('fs');
const path = require('path');

const files = [
  'assets/js/auth.js',
  'assets/js/app.js',
  'pages/admin/dashboard.html',
  'pages/attendance-reports.html',
  'pages/amn90-r.html',
  'pages/apply.html'
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
