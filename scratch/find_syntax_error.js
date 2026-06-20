const fs = require('fs');
const vm = require('vm');
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

// Simple regex to extract functions
// Matches: function name(...) { ... }
const functions = {};
const funcRegex = /function\s+(\w+)\s*\([^)]*\)\s*\{/g;
let fMatch;
const funcMatches = [];

while ((fMatch = funcRegex.exec(mainScript)) !== null) {
  funcMatches.push({
    name: fMatch[1],
    index: fMatch.index
  });
}

for (let j = 0; j < funcMatches.length; j++) {
  const current = funcMatches[j];
  const nextIndex = j + 1 < funcMatches.length ? funcMatches[j + 1].index : mainScript.length;
  const funcBody = mainScript.substring(current.index, nextIndex);
  
  // Try to find matching closing brace for this function
  let braceCount = 0;
  let closedIndex = -1;
  let inString = false;
  let quoteChar = '';
  
  for (let k = 0; k < funcBody.length; k++) {
    const char = funcBody[k];
    if (inString) {
      if (char === '\\') {
        k++;
      } else if (char === quoteChar) {
        inString = false;
      }
    } else {
      if (char === '"' || char === "'" || char === '`') {
        inString = true;
        quoteChar = char;
      } else if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          closedIndex = k;
          break;
        }
      }
    }
  }
  
  if (closedIndex !== -1) {
    const fullFunc = funcBody.substring(0, closedIndex + 1);
    try {
      new vm.Script(fullFunc);
      console.log(`✅ Function ${current.name} compiles successfully.`);
    } catch (err) {
      console.error(`❌ Function ${current.name} has syntax error:`, err.message);
      console.error(err.stack);
    }
  } else {
    console.error(`⚠️ Could not find matching closing brace for function ${current.name}`);
  }
}
