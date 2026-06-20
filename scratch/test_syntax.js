const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../pages/database.html');
const html = fs.readFileSync(filePath, 'utf8');

const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let scriptIndex = 1;

while ((match = scriptRegex.exec(html)) !== null) {
  const scriptContent = match[1];
  const offset = match.index;
  const linesBefore = html.substring(0, offset).split('\n').length;
  
  console.log(`Script block ${scriptIndex}: starts at line ${linesBefore}, length ${scriptContent.length}`);
  console.log(`Snippet: ${scriptContent.trim().substring(0, 150).replace(/\n/g, ' ')}...`);
  scriptIndex++;
}
