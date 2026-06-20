const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'assets', 'data', 'discord_users.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

console.log('Total users in discord_users.json:', Object.keys(data).length);

// Search for 'ريان' in usernames or display names/globalNames
const results = [];
for (const id in data) {
  const user = data[id];
  const username = user.username || '';
  const globalName = user.globalName || '';
  const displayName = user.displayName || '';
  
  if (username.includes('اللهيبي') || globalName.includes('اللهيبي') || displayName.includes('اللهيبي') || username.includes('لهيبي') || globalName.includes('لهيبي') || displayName.includes('لهيبي')) {
    results.push({ id, ...user });
  }
}

console.log('Matches:');
console.log(JSON.stringify(results, null, 2));
