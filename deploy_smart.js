/**
 * 🚀 سكريبت النشر الذكي - يحمي البيانات الديناميكية أثناء التحديث
 * 
 * الاستخدام:
 *   node deploy_smart.js
 * 
 * ما يفعله:
 * 1. يحفظ نسخة احتياطية من البيانات الديناميكية
 * 2. يرفع الملفات الثابتة فقط
 * 3. يُعيد البيانات الديناميكية
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

// ملفات البيانات الديناميكية - لا تُرفع أبداً
const DYNAMIC_FILES = [
  'assets/data/exams.json',
  'assets/data/exams_backup.json',
  'assets/data/system_logs.json',
  'assets/data/discord_users.json',
  'assets/data/members_google_sheets_cache.json',
  'exam_archive.db',
  'assets/data/exam_archive.db',
];

const BACKUP_DIR = path.join(ROOT, '.deploy_backup');

function backupDynamicFiles() {
  console.log('📦 حفظ نسخة احتياطية من البيانات الديناميكية...');
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  for (const relPath of DYNAMIC_FILES) {
    const src = path.join(ROOT, relPath);
    if (fs.existsSync(src)) {
      const dest = path.join(BACKUP_DIR, relPath.replace(/\//g, '_'));
      fs.copyFileSync(src, dest);
      console.log(`  ✅ ${relPath}`);
    }
  }
  console.log('');
}

function restoreDynamicFiles() {
  console.log('♻️  استعادة البيانات الديناميكية...');
  for (const relPath of DYNAMIC_FILES) {
    const backup = path.join(BACKUP_DIR, relPath.replace(/\//g, '_'));
    const dest = path.join(ROOT, relPath);
    if (fs.existsSync(backup)) {
      // Ensure directory exists
      const dir = path.dirname(dest);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(backup, dest);
      console.log(`  ✅ ${relPath}`);
    }
  }
  console.log('');
}

function checkStatus() {
  console.log('\n📊 حالة الملفات الديناميكية:');
  console.log('═'.repeat(50));
  for (const relPath of DYNAMIC_FILES) {
    const file = path.join(ROOT, relPath);
    if (fs.existsSync(file)) {
      const stat = fs.statSync(file);
      const size = (stat.size / 1024).toFixed(1);
      const modified = stat.mtime.toLocaleString('ar-SA');
      console.log(`  ✅ ${relPath} (${size} KB) - ${modified}`);
    } else {
      console.log(`  ❌ ${relPath} - غير موجود`);
    }
  }
  console.log('═'.repeat(50));
}

const command = process.argv[2];

if (command === 'backup') {
  backupDynamicFiles();
  console.log('✅ تم الحفظ في: .deploy_backup/');
} else if (command === 'restore') {
  restoreDynamicFiles();
  console.log('✅ تم استعادة البيانات بنجاح!');
} else if (command === 'status') {
  checkStatus();
} else {
  console.log(`
🚀 سكريبت النشر الذكي
═══════════════════════

الأوامر المتاحة:
  node deploy_smart.js backup   ← احفظ البيانات قبل الرفع
  node deploy_smart.js restore  ← أعد البيانات بعد الرفع
  node deploy_smart.js status   ← اعرض حالة الملفات

خطوات النشر الآمن:
  1. node deploy_smart.js backup
  2. ارفع ملفات الموقع على Hostinger/Surge
  3. node deploy_smart.js restore
`);
}
