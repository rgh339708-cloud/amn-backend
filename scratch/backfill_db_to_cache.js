const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const PUBLIC_DIR = path.join(__dirname, '..');
const dbPath = path.join(PUBLIC_DIR, 'assets', 'data', 'exam_archive.db');
const cachePath = path.join(PUBLIC_DIR, 'assets', 'data', 'discord_users.json');

let cacheData = {};
if (fs.existsSync(cachePath)) {
  try {
    cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    console.log(`Loaded ${Object.keys(cacheData).length} cached users from json.`);
  } catch (e) {
    console.error('Failed to parse discord_users.json:', e.message);
  }
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open database:', err.message);
    process.exit(1);
  }
  console.log('Opened SQLite database successfully.');
  
  db.all('SELECT * FROM users', [], (err, rows) => {
    if (err) {
      console.error('Failed to query users:', err.message);
      process.exit(1);
    }
    
    console.log(`Found ${rows.length} users in database table.`);
    let updateCount = 0;
    
    rows.forEach(user => {
      // Normalize values
      const avatar = user.avatar || '🎮';
      const banner = user.banner || null;
      
      // Merge or insert into cache
      cacheData[user.id] = {
        id: user.id,
        username: user.username,
        globalName: user.display_name || user.username,
        avatar: avatar,
        banner: banner,
        bannerColor: user.bannerColor || null,
        lastFetched: Date.now()
      };
      updateCount++;
    });
    
    try {
      fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf8');
      console.log(`Successfully updated ${updateCount} user profiles in discord_users.json!`);
    } catch (writeErr) {
      console.error('Failed to write updated cache to disk:', writeErr.message);
    }
    
    db.close();
  });
});
