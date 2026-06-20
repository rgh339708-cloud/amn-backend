const fs = require('fs');
const content = fs.readFileSync('pages/database.html', 'utf8');

// Find all occurrences of "info-modal-tab-content" in the style tags
const styleStart = content.indexOf('<style>');
const styleEnd = content.indexOf('</style>');
const styleCSS = content.substring(styleStart, styleEnd);

console.log('CSS lines matching info-modal-tab-content or tab-content:');
const lines = styleCSS.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('info-modal-tab-content') || line.includes('active') || line.includes('tab-content')) {
    console.log(`${idx + 39}: ${line}`);
  }
});
