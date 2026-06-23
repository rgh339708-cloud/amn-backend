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
      const rows = parsed.table.rows;
      let count18False = 0;
      let count19False = 0;
      rows.forEach(r => {
        if (!r || !r.c) return;
        const v18 = r.c[18] ? (r.c[18].f !== undefined ? r.c[18].f : r.c[18].v) : null;
        const v19 = r.c[19] ? (r.c[19].f !== undefined ? r.c[19].f : r.c[19].v) : null;
        if (v18 === false || v18 === 'FALSE') count18False++;
        if (v19 === false || v19 === 'FALSE') count19False++;
      });
      console.log('Total rows:', rows.length);
      console.log('Index 18 False count:', count18False);
      console.log('Index 19 False count:', count19False);
    } catch (e) {
      console.error('Error:', e);
    }
  });
}).on('error', (err) => {
  console.error('Error fetching:', err);
});
