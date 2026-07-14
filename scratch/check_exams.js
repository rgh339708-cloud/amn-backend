const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'assets', 'data', 'exams.json');
if (!fs.existsSync(filePath)) {
  console.log('exams.json does not exist!');
  process.exit(0);
}

const exams = JSON.parse(fs.readFileSync(filePath, 'utf8'));
console.log(`exams.json contains ${exams.length} exams`);
exams.forEach(e => {
  console.log(`ID: ${e.id}, Name: ${e.title}, Questions: ${e.questions ? e.questions.length : 0}`);
});
