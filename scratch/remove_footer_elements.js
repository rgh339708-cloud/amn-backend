const fs = require('fs');
const path = require('path');

const indexHtmlPath = path.join(__dirname, '../index.html');
const html200Path = path.join(__dirname, '../200.html');

function cleanFooterSimple(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`${filePath} does not exist.`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Normalize line endings to LF to avoid CRLF matching issues
  content = content.replace(/\r\n/g, '\n');

  // Target block
  const target = `    <div style="display:flex; gap:20px; align-items:center;">\n      <span>🎮 FiveM · PS-City90</span>\n    </div>`;
  
  if (content.includes(target)) {
    content = content.replace(target, '');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Successfully updated ${path.basename(filePath)} (simple replacement)`);
  } else {
    // try to just find and replace the span + div loosly
    const regex = /<div style="display:flex; gap:20px; align-items:center;">\s*<span>🎮 FiveM · PS-City90<\/span>\s*<\/div>/g;
    if (regex.test(content)) {
      content = content.replace(regex, '');
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Successfully updated ${path.basename(filePath)} (loose regex replacement)`);
    } else {
      console.log(`Could not find target in ${path.basename(filePath)}`);
    }
  }
}

cleanFooterSimple(indexHtmlPath);
cleanFooterSimple(html200Path);
