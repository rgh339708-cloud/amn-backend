const fs = require('fs');
const lines = fs.readFileSync('server.js', 'utf8').split('\n');
lines.forEach((l, i) => {
    if (l.includes('/api/exams') || l.includes('exam_attempts') || l.includes('/api/violations')) {
        console.log(`Line ${i+1}: ${l.trim()}`);
    }
});
