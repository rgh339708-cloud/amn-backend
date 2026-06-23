const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

console.log('🔍 Inspecting updated_site.zip contents...');
const zipPath = path.join(__dirname, '..', 'updated_site.zip');

if (!fs.existsSync(zipPath)) {
  console.log('❌ updated_site.zip does not exist');
  process.exit(1);
}

// Use powershell to list files inside zip
const cmd = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${path.join(__dirname, 'temp_zip_extract')}' -Force"`;
exec(cmd, (err, stdout, stderr) => {
  if (err) {
    console.error('❌ Failed to extract zip:', err.message);
  } else {
    console.log('✅ Extracted to temp_zip_extract successfully.');
    // Let's list files in temp_zip_extract/assets/data
    const dataDir = path.join(__dirname, 'temp_zip_extract', 'assets', 'data');
    if (fs.existsSync(dataDir)) {
      console.log('🎉 Files in zip assets/data:');
      console.log(fs.readdirSync(dataDir));
      
      const examsJsonPath = path.join(dataDir, 'exams.json');
      if (fs.existsSync(examsJsonPath)) {
        const content = fs.readFileSync(examsJsonPath, 'utf8');
        try {
          const list = JSON.parse(content);
          console.log(`🎉 Found ${list.length} exams in zip exams.json:`);
          list.forEach(e => console.log(`- ${e.title}`));
        } catch (e) {
          console.log('❌ Failed to parse exams.json in zip:', e.message);
        }
      } else {
        console.log('❌ No exams.json inside zip assets/data');
      }
    } else {
      console.log('❌ No assets/data folder inside zip');
    }
  }
});
