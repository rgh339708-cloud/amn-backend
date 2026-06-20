const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'assets', 'data', 'members_google_sheets_cache.json');
const cache = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// The cache has sheets/tabs, let's inspect the keys first
console.log('Cache keys:', Object.keys(cache));

const results = [];
for (const key in cache) {
  const rows = cache[key];
  if (Array.isArray(rows)) {
    rows.forEach((row, idx) => {
      const rowStr = JSON.stringify(row);
      if (rowStr.includes('750581378168389632')) {
        results.push({ sheet: key, rowIdx: idx, data: row });
      }
    });
  }
}

console.log('Matches in Sheets Cache:');
console.log(JSON.stringify(results, null, 2));
