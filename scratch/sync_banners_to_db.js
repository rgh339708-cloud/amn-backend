const fs = require('fs');
const path = require('path');
const https = require('https');
const sqlite3 = require('sqlite3').verbose();

const fgDir = path.join(__dirname, '..');
const jsonPath = path.join(fgDir, 'assets', 'data', 'discord_users.json');
const dbPath = path.join(fgDir, 'assets', 'data', 'exam_archive.db');

if (!fs.existsSync(jsonPath)) {
  console.error('discord_users.json not found!');
  process.exit(1);
}

const discordUsers = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

function downloadAsset(userId, url, type) {
  return new Promise((resolve) => {
    if (!url || typeof url !== 'string' || !url.startsWith('https://cdn.discordapp.com/')) {
      return resolve(url);
    }

    let match;
    let folderName;
    if (type === 'avatar') {
      match = url.match(/\/avatars\/(\d+)\/([a-zA-Z0-9_]+)/);
      folderName = 'avatars';
    } else if (type === 'banner') {
      match = url.match(/\/banners\/(\d+)\/([a-zA-Z0-9_]+)/);
      folderName = 'banners';
    }

    if (!match) {
      return resolve(url);
    }

    const hash = match[2];
    const isAnimated = url.includes('.gif') || hash.startsWith('a_');
    const ext = isAnimated ? 'gif' : 'png';
    const fileName = `${userId}_${hash}.${ext}`;
    const dirPath = path.join(fgDir, 'assets', 'img', folderName);
    const localFilePath = path.join(dirPath, fileName);
    const relativePath = `assets/img/${folderName}/${fileName}`;

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    if (fs.existsSync(localFilePath)) {
      return resolve(relativePath);
    }

    // Clean old user files
    try {
      const files = fs.readdirSync(dirPath);
      files.forEach(file => {
        if (file.startsWith(userId + '_')) {
          fs.unlinkSync(path.join(dirPath, file));
        }
      });
    } catch (e) {}

    const cleanUrl = url.split('?')[0];
    const fileStream = fs.createWriteStream(localFilePath);

    https.get(cleanUrl, (res) => {
      if (res.statusCode === 200) {
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          console.log(`Downloaded ${type} for ${userId} -> ${fileName}`);
          resolve(relativePath);
        });
      } else {
        fileStream.close();
        if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
        resolve(url);
      }
    }).on('error', () => {
      fileStream.close();
      if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
      resolve(url);
    });
  });
}

async function run() {
  console.log('Starting migration and backfill...');
  let updatedCount = 0;

  const userIds = Object.keys(discordUsers);
  for (const userId of userIds) {
    const u = discordUsers[userId];
    let saveNeeded = false;

    if (u.avatar && u.avatar.startsWith('https://cdn.discordapp.com/')) {
      const localAvatar = await downloadAsset(userId, u.avatar, 'avatar');
      if (localAvatar !== u.avatar) {
        u.avatar = localAvatar;
        saveNeeded = true;
      }
    }

    if (u.banner && u.banner.startsWith('https://cdn.discordapp.com/')) {
      const localBanner = await downloadAsset(userId, u.banner, 'banner');
      if (localBanner !== u.banner) {
        u.banner = localBanner;
        saveNeeded = true;
      }
    }

    if (saveNeeded) {
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    fs.writeFileSync(jsonPath, JSON.stringify(discordUsers, null, 2), 'utf8');
    console.log(`Updated ${updatedCount} profiles in discord_users.json`);
  } else {
    console.log('No updates needed in discord_users.json');
  }

  // Connect to SQLite and sync
  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
      console.error('Error connecting to SQLite:', err.message);
      return;
    }
    console.log('Connected to SQLite database.');
  });

  db.all('SELECT id, discord_id, username, avatar, banner FROM users', [], async (err, rows) => {
    if (err) {
      console.error('Error reading SQLite users:', err.message);
      db.close();
      return;
    }

    let dbUpdates = 0;
    db.serialize(() => {
      rows.forEach(user => {
        const discordId = user.discord_id || user.id;
        const cached = discordUsers[discordId];

        if (cached) {
          const finalAvatar = cached.avatar || user.avatar;
          const finalBanner = cached.banner || user.banner;

          if (user.avatar !== finalAvatar || user.banner !== finalBanner) {
            db.run('UPDATE users SET avatar = ?, banner = ? WHERE id = ?', [finalAvatar, finalBanner, user.id], (updErr) => {
              if (updErr) {
                console.error(`Failed to update ${user.username} in SQLite:`, updErr.message);
              }
            });
            dbUpdates++;
            console.log(`SQLite: Updated profile for ${user.username} (${user.id})`);
          }
        }
      });
    });

    setTimeout(() => {
      console.log(`SQLite sync finished: ${dbUpdates} rows updated.`);
      db.close();
      console.log('Migration completed!');
    }, 3000);
  });
}

run();
