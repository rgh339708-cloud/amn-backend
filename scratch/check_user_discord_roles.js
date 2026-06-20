const https = require('https');

const botToken = 'MTUxMDE1NzU0NjUwMDAwMTg4NA.G2vHtB.jWHVzM7gd2EvV0Er8NOgIcX9neH2bhA3JiLipg';
const guildId = '1272212444936404992';
const userId = '750581378168389632';

function apiRequest(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  const headers = {
    'Authorization': `Bot ${botToken}`,
    'Content-Type': 'application/json'
  };

  try {
    console.log('Fetching roles of the server...');
    const roles = await apiRequest(`https://discord.com/api/v10/guilds/${guildId}/roles`, headers);
    if (roles.message) {
      console.error('Error fetching roles:', roles);
      return;
    }

    console.log(`Fetching member details for ID: ${userId}...`);
    const member = await apiRequest(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, headers);
    if (member.message) {
      console.error('Error fetching member:', member);
      return;
    }

    console.log('\n=== MEMBER DETAILS ===');
    console.log('Username:', member.user.username);
    console.log('Nickname:', member.nick);
    console.log('Roles IDs:', member.roles);

    console.log('\n=== MEMBER ROLES ON DISCORD ===');
    member.roles.forEach(roleId => {
      const role = roles.find(r => r.id === roleId);
      if (role) {
        console.log(`- ${role.name} (ID: ${role.id})`);
      } else {
        console.log(`- Unknown Role (ID: ${roleId})`);
      }
    });

  } catch (err) {
    console.error('API Error:', err);
  }
}

main();
