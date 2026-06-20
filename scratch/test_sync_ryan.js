require('dotenv').config({ path: 'C:/Users/rayan/OneDrive/Documents/DISCORD/.env' });
const client = require('C:/Users/rayan/OneDrive/Documents/DISCORD/discordClient');
const config = require('C:/Users/rayan/OneDrive/Documents/DISCORD/config');

async function test() {
  console.log('Logging in...');
  await client.login(config.discordToken);
  console.log('Logged in!');
  
  const targetId = '1176730812746571907';
  try {
    const user = await client.users.fetch(targetId, { force: true });
    console.log('Fetched user:', {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      globalName: user.globalName
    });
  } catch (err) {
    console.error('Failed to fetch user:', err.message);
  }
  process.exit(0);
}

test();
