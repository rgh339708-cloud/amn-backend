const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../pages/database.html');
const html = fs.readFileSync(filePath, 'utf8');

const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let mainScript = '';

while ((match = scriptRegex.exec(html)) !== null) {
  const content = match[1];
  if (content.length > 5000) {
    mainScript = content;
    break;
  }
}

if (!mainScript) {
  console.error("Could not find the main script block.");
  process.exit(1);
}

fs.writeFileSync(path.join(__dirname, 'clean_script.js'), mainScript);
console.log("Extracted main JavaScript to scratch/clean_script.js");
