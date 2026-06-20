const fs = require('fs');
const path = require('path');

const cachePath = path.join(__dirname, '..', 'assets', 'data', 'members_google_sheets_cache.json');
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

for (const tabName in cache) {
  const rows = cache[tabName] || [];
  rows.forEach((row, idx) => {
    // Check if name contains 'ريان'
    if (row.name && row.name.includes('ريان')) {
      console.log(`Tab: ${tabName}, Index: ${idx}`);
      console.log(JSON.stringify(row, null, 2));
    }
  });
}
