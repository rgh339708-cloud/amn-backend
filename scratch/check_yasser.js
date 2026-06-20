const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'assets', 'data', 'discord_users.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const userId = '956940655169515520';
console.log('User ID in cache:', data[userId]);

const matches = [];
for (const id in data) {
  const u = data[id];
  if (u.username && (u.username.includes('p._93') || u.globalName.includes('p._93'))) {
    matches.push({ id, ...u });
  }
}
console.log('Username matches:', matches);
