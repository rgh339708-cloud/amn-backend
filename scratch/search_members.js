const fs = require('fs');
const path = require('path');

const cachePath = path.join(__dirname, '../assets/data/members_google_sheets_cache.json');
if (!fs.existsSync(cachePath)) {
  console.log('Cache file not found!');
  process.exit(1);
}

const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
let count = 0;
for (const tab in cache) {
  const rows = cache[tab] || [];
  rows.forEach((row, idx) => {
    const rowStr = JSON.stringify(row);
    if (rowStr.includes('ريان')) {
      console.log(`[Tab: ${tab}] Row ${idx}:`, row);
      count++;
    }
  });
}
console.log(`Found ${count} rows matching 'ريان'`);
