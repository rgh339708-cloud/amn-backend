const path = require('path');
const fs = require('fs');

function loadConfig() {
  const config = {
    spreadsheetId: '',
    spreadsheetGid: '',
    discordToken: '',
    databaseUrl: ''
  };
  const envPaths = [
    path.join(__dirname, '..', 'DISCORD', '.env'),
    path.join(__dirname, '.env'),
    path.join('c:', 'Users', 'rayan', 'OneDrive', 'Documents', 'DISCORD', '.env'),
    path.join(process.env.USERPROFILE || 'C:\\Users\\rayan', 'OneDrive', 'Documents', 'DISCORD', '.env')
  ];
  let envPath = '';
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      envPath = p;
      break;
    }
  }
  if (envPath) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const parts = line.trim().split('=');
        if (parts.length >= 2 && !parts[0].startsWith('#')) {
          const key = parts[0].trim();
          const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
          if (key === 'SPREADSHEET_ID') config.spreadsheetId = value;
          if (key === 'SPREADSHEET_GID') config.spreadsheetGid = value;
          if (key === 'DISCORD_TOKEN') config.discordToken = value;
          if (key === 'DATABASE_URL') config.databaseUrl = value;
        }
      });
      console.log(`[Config] Env loaded from: ${envPath}`);
    } catch (e) {
      console.error('[Config Error] Failed:', e.message);
    }
  }
  return config;
}

console.log(loadConfig());
