const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  
  db.all("SELECT * FROM general_collections", [], (err, rows) => {
    if (err) {
      console.error('Error querying general_collections:', err);
    } else {
      console.log('Collections in database:');
      rows.forEach(row => {
        console.log(`Key: ${row.collection_key}`);
        try {
          const data = JSON.parse(row.data_json);
          console.log(`Data count/preview: ${Array.isArray(data) ? data.length + ' items' : typeof data}`);
          if (row.collection_key === 'ps_pages') {
            console.log(JSON.stringify(data, null, 2));
          }
        } catch (e) {
          console.log(`Failed to parse data for ${row.collection_key}`);
        }
      });
    }
    db.close();
  });
});
