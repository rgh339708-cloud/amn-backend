const fs = require('fs');
const content = fs.readFileSync('pages/exams.html', 'utf8');

const regex = /preview|sessionStorage/gi;
let match;
while ((match = regex.exec(content)) !== null) {
  console.log(`Found match at index ${match.index}:`);
  console.log(content.substring(match.index - 50, match.index + 200));
  console.log('------------------------------------');
}
