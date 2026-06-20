const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../pages/database.html');
const html = fs.readFileSync(filePath, 'utf8');

const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let mainScript = '';
let startLine = 0;

while ((match = scriptRegex.exec(html)) !== null) {
  const content = match[1];
  const offset = match.index;
  const linesBefore = html.substring(0, offset).split('\n').length;
  if (content.length > 5000) {
    mainScript = content;
    startLine = linesBefore;
    break;
  }
}

const startIndex = mainScript.indexOf('function showPersonModal');
if (startIndex === -1) {
  console.error("Could not find showPersonModal");
  process.exit(1);
}

const showPersonModalText = mainScript.substring(startIndex);
let depth = 0;
let inString = false;
let quoteChar = '';
let templateDepth = [];

console.log("Tracing braces in showPersonModal:");
const lines = showPersonModalText.split('\n');

for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
  const line = lines[lineIdx];
  const absLineNum = startLine + mainScript.substring(0, startIndex).split('\n').length + lineIdx;
  
  for (let colIdx = 0; colIdx < line.length; colIdx++) {
    const char = line[colIdx];
    
    // Ignore comments
    if (!inString && char === '/' && line[colIdx + 1] === '/') {
      break; // Skip rest of line
    }
    
    if (inString) {
      if (char === '\\') {
        colIdx++;
      } else if (char === quoteChar) {
        if (quoteChar === '`') {
          // Check if template literal is actually ending, or if we are at end of a template expression
          inString = false;
        } else {
          inString = false;
        }
      } else if (quoteChar === '`' && char === '$' && line[colIdx + 1] === '{') {
        // Template expression starts inside backtick
        templateDepth.push(depth);
        inString = false; // We are temporarily back in JS code
        colIdx++;
        depth++;
        console.log(`Line ${absLineNum}, col ${colIdx}: Open template expression \${ (depth: ${depth})`);
      }
    } else {
      if (char === '"' || char === "'") {
        inString = true;
        quoteChar = char;
      } else if (char === '`') {
        inString = true;
        quoteChar = char;
      } else if (char === '{') {
        depth++;
        console.log(`Line ${absLineNum}, col ${colIdx}: Open { (depth: ${depth}) -> line snippet: ${line.trim()}`);
      } else if (char === '}') {
        depth--;
        console.log(`Line ${absLineNum}, col ${colIdx}: Close } (depth: ${depth}) -> line snippet: ${line.trim()}`);
      }
    }
  }
}

console.log(`\nFinal depth: ${depth}`);
