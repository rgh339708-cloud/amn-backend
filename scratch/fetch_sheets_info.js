const https = require('https');

const SPREADSHEET_ID = "1deRenpRLjJYNqp2zBbzBm3iegqGjqXoPuJAM4iI01y0";
const sheetName = " جدول الغرامات 💵";
const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    try {
      const match = data.match(/google\.visualization\.Query\.setResponse\(([\s\S]*?)\);/);
      let jsonStr = data;
      if (match) {
        jsonStr = match[1];
      } else {
        if (jsonStr.startsWith('/*O_o*/\n')) {
          jsonStr = jsonStr.substring('/*O_o*/\n'.length);
        }
      }
      const parsed = JSON.parse(jsonStr);
      console.log('Columns count:', parsed.table.cols.length);
      const rows = parsed.table.rows;
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        console.log(`\nRow ${i}:`);
        const cells = rows[i].c.map((cell, idx) => {
          if (!cell) return `${idx}: null`;
          const val = cell.f !== undefined ? cell.f : cell.v;
          return `${idx}: ${JSON.stringify(val)}`;
        });
        console.log(cells.join(', '));
      }
    } catch (e) {
      console.error('Error parsing:', e);
      console.log('Raw data preview (first 500 chars):', data.substring(0, 500));
    }
  });
}).on('error', (err) => {
  console.error('Error fetching:', err);
});
