const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sourceDir = __dirname;
const rootDir = path.join(__dirname, '..');
const tempDir = path.join(process.env.TEMP || 'C:\\Users\\rayan\\AppData\\Local\\Temp', 'AMN-3-90-zip-' + Date.now());
const zipDest = path.join(rootDir, 'updated_site.zip');

const skipDirs = [
  '.git',
  '.vscode',
  'node_modules',
  'scratch',
  'test_surge',
  'updated_site',
  'assets/img/avatars',
  'assets/img/banners'
];

const skipFiles = [
  'cloudflared.exe',
  'exam_archive.db',
  'updated_site.zip',
  'server.js',
  'db.js',
  'migrate.js',
  'migrate_mysql.js',
  'package.json',
  'package-lock.json',
  'deploy.html',
  'deploy_surge.js',
  'deploy_smart.js',
  'Dockerfile',
  '.surgeignore',
  'test_api.js',
  'test_db.js',
  'test_debug_api.js',
  'test_insert.js',
  'test_api_update.js',
  'test_secrets.js'
];

function deleteFolderRecursive(directoryPath) {
  if (fs.existsSync(directoryPath)) {
    fs.readdirSync(directoryPath).forEach((file) => {
      const curPath = path.join(directoryPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(directoryPath);
  }
}

function copyFolderRecursive(src, dest) {
  const relPath = path.relative(rootDir, src).replace(/\\/g, '/');
  
  if (skipDirs.some(dir => relPath === dir || relPath.startsWith(dir + '/'))) {
    return;
  }

  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(child => {
      copyFolderRecursive(path.join(src, child), path.join(dest, child));
    });
  } else {
    const fileName = path.basename(src);
    const isRootFile = path.dirname(src) === rootDir;
    if (isRootFile && skipFiles.includes(fileName)) {
      return;
    }
    if (fileName.endsWith('.db') || fileName.endsWith('.log') || fileName.endsWith('.bak')) {
      return;
    }
    fs.copyFileSync(src, dest);
  }
}

try {
  console.log('[Zip Helper] Creating temp directory...');
  deleteFolderRecursive(tempDir);
  fs.mkdirSync(tempDir, { recursive: true });

  console.log('[Zip Helper] Copying files to temp folder...');
  copyFolderRecursive(rootDir, tempDir);

  // Copy CNAME file explicitly just in case
  const cnameSrc = path.join(rootDir, 'CNAME');
  const cnameDest = path.join(tempDir, 'CNAME');
  if (fs.existsSync(cnameSrc)) {
    fs.copyFileSync(cnameSrc, cnameDest);
  }

  console.log('[Zip Helper] Creating ZIP file via PowerShell...');
  if (fs.existsSync(zipDest)) {
    fs.unlinkSync(zipDest);
  }

  // Run Compress-Archive via PowerShell
  const cmd = `powershell -Command "Compress-Archive -Path '${tempDir}\\*' -DestinationPath '${zipDest}' -Force"`;
  execSync(cmd);

  console.log('[Zip Helper] Cleaning up temp folder...');
  deleteFolderRecursive(tempDir);

  console.log('✅ Success! updated_site.zip created successfully in the project root.');
} catch (e) {
  console.error('❌ Zip generation failed:', e);
  process.exit(1);
}
