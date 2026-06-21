const fs = require('fs');
const path = require('path');
const vm = require('vm');

const filePath = path.join(__dirname, '../pages/exams.html');
const html = fs.readFileSync(filePath, 'utf8');

const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let count = 0;

while ((match = scriptRegex.exec(html)) !== null) {
  count++;
  const content = match[1];
  const tag = match[0].substring(0, 100);
  console.log(`Match ${count}: ${tag}... (length: ${content.length})`);
  
  if (content.trim()) {
    try {
      new vm.Script(content);
      console.log(`  Parsed successfully`);
    } catch (err) {
      console.log(`  Syntax Error in block ${count}: ${err.message}`);
      console.log(err.stack);
    }
  }
}
