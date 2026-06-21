const fs = require('fs');
const glob = require('glob');

glob('**/*.{js,html}', { ignore: 'node_modules/**' }, (err, files) => {
  if (err) {
    console.error(err);
    return;
  }
  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('checkMaintenanceSync')) {
      console.log(`Found checkMaintenanceSync in: ${file}`);
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (line.includes('checkMaintenanceSync')) {
          console.log(`  Line ${idx + 1}: ${line.trim()}`);
        }
      });
    }
  });
});
