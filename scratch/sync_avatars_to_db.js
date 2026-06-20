const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'assets', 'data', 'exam_archive.db');
const jsonPath = path.join(__dirname, '..', 'assets', 'data', 'discord_users.json');

if (!fs.existsSync(jsonPath)) {
  console.error('discord_users.json not found!');
  process.exit(1);
}

const discordUsers = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('Error connecting to DB:', err.message);
    return;
  }
  console.log('Connected to SQLite database.');
});

db.all('SELECT id, username, display_name, discord_id, avatar FROM users', [], (err, rows) => {
  if (err) {
    console.error('Error reading users:', err.message);
    db.close();
    return;
  }

  let updatedCount = 0;
  let checkedCount = 0;

  db.serialize(() => {
    rows.forEach(user => {
      checkedCount++;
      const discordId = user.discord_id || user.id;
      const cached = discordUsers[discordId];
      
      if (cached && cached.avatar) {
        if (user.avatar !== cached.avatar) {
          db.run('UPDATE users SET avatar = ?, banner = ? WHERE id = ?', [cached.avatar, cached.banner || null, user.id], (updErr) => {
            if (updErr) {
              console.error(`Failed to update user ${user.username}:`, updErr.message);
            }
          });
          updatedCount++;
          console.log(`Updated avatar for: ${user.username} (${user.display_name}) -> ${cached.avatar}`);
        }
      }
    });
  });

  // Wait a bit for the updates to complete before closing
  setTimeout(() => {
    console.log(`Done! Checked ${checkedCount} users, updated ${updatedCount} users.`);
    db.close();
  }, 3000);
});
