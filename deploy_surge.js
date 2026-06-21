const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const sourceDir = __dirname;
const tempDir = path.join(process.env.TEMP || 'C:\\Users\\rayan\\AppData\\Local\\Temp', 'AMN-3-90-deploy-' + Date.now());

const skipDirs = [
  '.git',
  '.vscode',
  'node_modules',
  'scratch',
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
  'package.json',
  'package-lock.json',
  'deploy.html',
  'deploy_surge.js',
  'Dockerfile'
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
  const relPath = path.relative(sourceDir, src).replace(/\\/g, '/');
  
  // Skip ignored directories
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
    // Skip ignored files in the root directory
    const fileName = path.basename(src);
    const isRootFile = path.dirname(src) === sourceDir;
    if (isRootFile && skipFiles.includes(fileName)) {
      return;
    }
    // Also skip log files or db files
    if (fileName.endsWith('.db') || fileName.endsWith('.log') || fileName.endsWith('.bak')) {
      return;
    }
    fs.copyFileSync(src, dest);
  }
}

try {
  console.log('[Deploy Helper] Recreating temp directory...');
  deleteFolderRecursive(tempDir);
  fs.mkdirSync(tempDir, { recursive: true });

  console.log('[Deploy Helper] Copying files to temp deployment folder...');
  copyFolderRecursive(sourceDir, tempDir);

  // Copy CNAME file explicitly just in case
  const cnameSrc = path.join(sourceDir, 'CNAME');
  const cnameDest = path.join(tempDir, 'CNAME');
  if (fs.existsSync(cnameSrc)) {
    fs.copyFileSync(cnameSrc, cnameDest);
  }

  console.log('[Deploy Helper] Running surge deploy in temp folder...');
  exec('npx.cmd surge . amn-3-90.surge.sh', { cwd: tempDir }, (error, stdout, stderr) => {
    console.log('[Deploy Helper] Cleaning up temp folder...');
    deleteFolderRecursive(tempDir);

    if (error) {
      console.error('[Deploy Helper] Surge deploy failed:', error);
      console.error(stderr);
      process.exit(1);
    } else {
      console.log('[Deploy Helper] Surge deploy successful!');
      console.log(stdout);
      process.exit(0);
    }
  });
} catch (e) {
  console.error('[Deploy Helper] Error during deployment setup:', e);
  deleteFolderRecursive(tempDir);
  process.exit(1);
}
