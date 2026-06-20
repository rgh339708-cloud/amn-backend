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

if (!mainScript) {
  console.error("Could not find the main script block.");
  process.exit(1);
}

console.log(`Analyzing script block starting at line ${startLine}...`);

// Pre-process mainScript to replace known regex literals
let processedScript = mainScript;
const regexPatterns = [
  /\/^\d{17,20}$\//g,
  /\/^\d+$\//g,
  /\/\s+\/g/g,
  /\/\s+/g,
  /\/\//g, // division/regex clashes
  /\/\^\d\{4,6\}\$\//g,
  /\/\^\d\{1,2\}\\\/\d\{1,2\}\\\/\d\{4\}\$\//g,
  /\/\^\d\{4\}\[\\\/\\-\]\d\{1,2\}\[\\\/\\-\]\d\{1,2\}\$\//g,
  /\/\^\d\{1,2\}-\d\{1,2\}-\d\{4\}\$\//g,
  /\/\s\*ركن\s\*\/g/g
];

// Let's do a more generic regex literal strip:
// A generic JS regex literal regex: /([^/\\\[]|\\.|\[([^\]\\]|\\.)*\])*\/[gimuy]*
// To avoid matching comments or divisions, we only match slashes that are preceded by '=', '(', ',', ':', '[', '!', '&', '|', '?', '{', ';', 'return', 'typeof' etc.
// But we can also just strip comments first, then it is easier.
// Let's strip single line comments first, then multi-line comments.
processedScript = processedScript.replace(/\/\/[^\n]*/g, '');
processedScript = processedScript.replace(/\/\*[\s\S]*?\*\//g, '');

// Now we can replace regexes:
processedScript = processedScript.replace(/\/[^\/\n]+\/[gimy]*/g, '"__REGEX__"');

const stack = [];
let i = 0;
const len = processedScript.length;

function getLineCol(index) {
  const codeBefore = processedScript.substring(0, index);
  const lines = codeBefore.split('\n');
  return {
    line: startLine + lines.length - 1,
    col: lines[lines.length - 1].length + 1
  };
}

while (i < len) {
  const char = processedScript[i];
  
  // Handle string double quote
  if (char === '"') {
    const startPos = getLineCol(i);
    i++;
    while (i < len && processedScript[i] !== '"') {
      if (processedScript[i] === '\\') i += 2;
      else i++;
    }
    if (i >= len) {
      console.warn(`Unclosed double quote starting at line ${startPos.line}, col ${startPos.col}`);
    }
    i++;
    continue;
  }
  
  // Handle string single quote
  if (char === "'") {
    const startPos = getLineCol(i);
    i++;
    while (i < len && processedScript[i] !== "'") {
      if (processedScript[i] === '\\') i += 2;
      else i++;
    }
    if (i >= len) {
      console.warn(`Unclosed single quote starting at line ${startPos.line}, col ${startPos.col}`);
    }
    i++;
    continue;
  }
  
  // Handle template literal backtick (with ${} support)
  if (char === '`') {
    const startPos = getLineCol(i);
    i++;
    while (i < len && processedScript[i] !== '`') {
      if (processedScript[i] === '\\') {
        i += 2;
      } else if (processedScript[i] === '$' && processedScript[i + 1] === '{') {
        stack.push({ type: 'template-expr', pos: getLineCol(i) });
        i += 2;
        // Parse nested JS inside template expression
        let depth = 1;
        while (i < len && depth > 0) {
          const innerChar = processedScript[i];
          if (innerChar === '"') {
            i++;
            while (i < len && processedScript[i] !== '"') {
              if (processedScript[i] === '\\') i += 2;
              else i++;
            }
            i++;
          } else if (innerChar === "'") {
            i++;
            while (i < len && processedScript[i] !== "'") {
              if (processedScript[i] === '\\') i += 2;
              else i++;
            }
            i++;
          } else if (innerChar === '`') {
            // Nested template literal
            i++;
            while (i < len && processedScript[i] !== '`') {
              if (processedScript[i] === '\\') i += 2;
              else i++;
            }
            i++;
          } else if (innerChar === '{') {
            depth++;
            stack.push({ type: 'brace', pos: getLineCol(i) });
            i++;
          } else if (innerChar === '}') {
            depth--;
            const popped = stack.pop();
            if (!popped || popped.type !== 'brace') {
              // This is the closing brace of the template expression
            }
            i++;
          } else {
            i++;
          }
        }
      } else {
        i++;
      }
    }
    if (i >= len) {
      console.warn(`Unclosed backtick starting at line ${startPos.line}, col ${startPos.col}`);
    }
    i++;
    continue;
  }
  
  if (char === '{') {
    stack.push({ type: 'brace', pos: getLineCol(i) });
  } else if (char === '}') {
    const popped = stack.pop();
    if (!popped) {
      console.error(`❌ Extra closing brace '}' at line ${getLineCol(i).line}, col ${getLineCol(i).col}`);
    } else if (popped.type !== 'brace') {
      console.error(`❌ Mismatched closing brace '}' for open ${popped.type} from line ${popped.pos.line}, col ${popped.pos.col}`);
    }
  } else if (char === '[') {
    stack.push({ type: 'bracket', pos: getLineCol(i) });
  } else if (char === ']') {
    const popped = stack.pop();
    if (!popped) {
      console.error(`❌ Extra closing bracket ']' at line ${getLineCol(i).line}, col ${getLineCol(i).col}`);
    } else if (popped.type !== 'bracket') {
      console.error(`❌ Mismatched closing bracket ']' for open ${popped.type} from line ${popped.pos.line}, col ${popped.pos.col}`);
    }
  } else if (char === '(') {
    stack.push({ type: 'paren', pos: getLineCol(i) });
  } else if (char === ')') {
    const popped = stack.pop();
    if (!popped) {
      console.error(`❌ Extra closing parenthesis ')' at line ${getLineCol(i).line}, col ${getLineCol(i).col}`);
    } else if (popped.type !== 'paren') {
      console.error(`❌ Mismatched closing parenthesis ')' for open ${popped.type} from line ${popped.pos.line}, col ${popped.pos.col}`);
    }
  }
  
  i++;
}

console.log("\n--- Remaining Open Tokens ---");
if (stack.length === 0) {
  console.log("No unclosed tokens! File should be clean.");
} else {
  stack.forEach(token => {
    console.error(`❌ Unclosed ${token.type} from line ${token.pos.line}, col ${token.pos.col}`);
  });
}
