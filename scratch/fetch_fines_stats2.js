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
      console.log('Total raw rows:', rows.length);
      
      let countWithValidName = 0;
      let countPaidTrue = 0;
      let countPaidFalse = 0;
      let countPaidNullOrEmpty = 0;

      rows.forEach((r, idx) => {
        if (!r || !r.c) return;
        const valOf = (i) => {
          if (i === -1 || i >= r.c.length || !r.c[i]) return "";
          if (r.c[i].f !== undefined) return String(r.c[i].f).trim();
          if (r.c[i].v !== undefined) return String(r.c[i].v).trim();
          return "";
        };

        const name = valOf(2); // Using hardcoded index 2 for name
        if (!name || name === "الاسم" || name.includes("الاسم")) return;

        countWithValidName++;
        const paidVal = valOf(18); // Let's check index 18
        if (paidVal === "true" || paidVal === "TRUE" || paidVal === true) {
          countPaidTrue++;
        } else if (paidVal === "false" || paidVal === "FALSE" || paidVal === false) {
          countPaidFalse++;
        } else {
          countPaidNullOrEmpty++;
        }
      });

      console.log('Rows with valid name (idx 2):', countWithValidName);
      console.log('  - Paid = TRUE:', countPaidTrue);
      console.log('  - Paid = FALSE:', countPaidFalse);
      console.log('  - Paid = Null/Empty:', countPaidNullOrEmpty);
    } catch (e) {
      console.error('Error:', e);
    }
  });
}).on('error', (err) => {
  console.error('Error fetching:', err);
});
