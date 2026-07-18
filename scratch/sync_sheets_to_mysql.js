/**
 * 🔄 مزامنة شيت جوجل مباشرة إلى MySQL على Hostinger (قاعدة بيانات الإنتاج)
 */

const https  = require('https');
const path   = require('path');
const fs     = require('fs');
const mysql  = require('mysql2/promise');

// ─── تحميل الإعدادات من .env ───
const envPath = path.join(__dirname, '..', '.env');
const config = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const t = line.trim();
    if (t && !t.startsWith('#') && t.includes('=')) {
      const [k, ...v] = t.split('=');
      config[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
    }
  });
}

console.log('MySQL Host:', config.MYSQL_HOST || 'غير محدد');
console.log('MySQL DB:  ', config.MYSQL_DATABASE || 'غير محدد');

// ─── دالة تحديد الأدوار (تدعم أدوار متعددة مفصولة بفاصلة) ───
function resolveRoleFromRank(rank, leadership) {
  const r = String(rank || '').trim();
  // تنظيف حرف التطويل (ـ) لتصحيح نصوص مثل رئـاسـة المـجلـس
  const l = String(leadership || '').trim().replace(/ـ/g, '');
  const roles = new Set();

  // ─── القائمة الحصرية لعمود AF ───
  // القائد → قيادة الامن العام (assistant_owner) + المشرف العام (owner)
  if (l.includes('القائد') && !l.includes('نائب') && !l.includes('مساعد')) {
    roles.add('owner');
    roles.add('assistant_owner');
  }
  // نائب القائد / مساعد القائد → قيادة الامن العام فقط
  if (l.includes('نائب القائد') || l.includes('مساعد القائد') || l.includes('نائب قائد') || l.includes('مساعد قائد')) roles.add('assistant_owner');
  // رئاسة تدريب الأمن العام
  if (l.includes('رئاسة تدريب')) roles.add('academy_affairs');
  // شؤون اكاديمية التدريب
  if (l.includes('شؤون اكاديمية التدريب') || l.includes('شؤون أكاديمية التدريب')) roles.add('admin');
  // مدير دورة → مسؤول دورة
  if (l.includes('مدير دورة') || l.includes('مدير الدورة')) roles.add('course_admin');
  // منسوبي ادارة التدريب → منسوبي كلية التدريب
  if (l.includes('منسوبي ادارة التدريب') || l.includes('منسوبي إدارة التدريب')) roles.add('college_trainee');
  // شعبة التجنيد → شؤون التجنيد
  if (l.includes('شعبة التجنيد')) roles.add('recruitment_affairs');

  // غير الموجودين في القائمة → مشاهد بالموقع
  if (roles.size === 0) return 'viewer';
  return Array.from(roles).join(',');
}

// ─── جلب CSV مع إعادة توجيه ───
function fetchCsv(url, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 5) return reject(new Error('Too many redirects'));
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.headers.location) {
        return fetchCsv(res.headers.location, depth + 1).then(resolve).catch(reject);
      }
      res.setEncoding('utf8');
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

// ─── تقسيم سطر CSV ───
function splitRow(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

// ─── تحليل CSV ───
function parseCsv(text) {
  const lines = text.split('\n');
  const headerLine = lines.find(l => l.trim().toLowerCase().startsWith('id discord'));
  if (!headerLine) { console.warn('  ⚠️ لا يوجد سطر رؤوس'); return []; }
  
  const headers = splitRow(headerLine).map(h => h.trim().toLowerCase()
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  );
  
  const idxId         = headers.findIndex(h => h.includes('id discord'));
  const idxName       = headers.findIndex(h => h === 'الاسم' || h.includes('اسم'));
  const idxCode       = headers.findIndex(h => h === 'الكود' || h.includes('كود'));
  const idxRank       = headers.findIndex(h => h.includes('رتبه') || h.includes('رتبة'));
  const idxStatus     = headers.findIndex(h => h.includes('الحاله') || h.includes('الحالة'));
  // عمود المهام القيادية — يبحث عنه بالاسم ديناميكياً أو يستخدم الفهرس 31 كاحتياط
  let idxLeadership = headers.findIndex(h => h.includes('قيادي') || h.includes('مهام'));
  if (idxLeadership < 0 && headers.length > 31) idxLeadership = 31;

  const members = [];
  for (const line of lines) {
    const row = splitRow(line);
    if (!row || row.length < 4) continue;
    const rawId = (row[idxId] || '').trim();
    const discordId = rawId.replace(/<@!?(\d+)>/, '$1').replace(/\s/g, '');
    if (!discordId || !/^\d{17,20}$/.test(discordId)) continue;
    const name       = idxName   >= 0 ? (row[idxName]       || '').trim() : '';
    const code       = idxCode   >= 0 ? (row[idxCode]       || '').trim().replace(/[\[\]]/g, '') : '';
    const rank       = idxRank   >= 0 ? (row[idxRank]       || '').trim() : '';
    const status     = idxStatus >= 0 ? (row[idxStatus]     || '').trim() : 'في الخدمة';
    const leadership = row.length > idxLeadership ? (row[idxLeadership] || '').trim() : '';
    if (name) members.push({ discordId, name, code, rank, status, leadership });
  }
  return members;
}

const SOURCES = [
  { name: 'الأساسي',   url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSnQUZOHOGPE9wSCk8FlHg5ww1OS7sPJweNsxFQod_Lg9H-iH8km1D-m0hDRdC3qsccW0RJGbcLpSrK/pub?gid=249309184&single=true&output=csv' },
  { name: 'المنتدبين', url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSnQUZOHOGPE9wSCk8FlHg5ww1OS7sPJweNsxFQod_Lg9H-iH8km1D-m0hDRdC3qsccW0RJGbcLpSrK/pub?gid=1769675628&single=true&output=csv' },
];

async function run() {
  const conn = await mysql.createConnection({
    host:     config.MYSQL_HOST,
    user:     config.MYSQL_USER,
    password: config.MYSQL_PASSWORD,
    database: config.MYSQL_DATABASE,
    port:     parseInt(config.MYSQL_PORT) || 3306,
    ssl:      { rejectUnauthorized: false }
  });

  console.log('\n✅ تم الاتصال بـ MySQL\n');

  let inserted = 0, updated = 0, skipped = 0;

  try {
    // جلب الأعضاء من الشيت
    const allMembers = {};
    for (const src of SOURCES) {
      console.log(`📥 جلب: ${src.name}`);
      const csv = await fetchCsv(src.url);
      const members = parseCsv(csv);
      console.log(`   ✅ تم تحليل ${members.length} عضو`);
      for (const m of members) {
        if (!allMembers[m.discordId]) allMembers[m.discordId] = m;
        else if (m.rank && !allMembers[m.discordId].rank) allMembers[m.discordId].rank = m.rank;
      }
    }

    const memberList = Object.values(allMembers);
    console.log(`\n📊 إجمالي الأعضاء: ${memberList.length}`);
    console.log('🔄 بدء التحديث...\n');

    for (const m of memberList) {
      const role = resolveRoleFromRank(m.rank, m.leadership);
      const id = 'discord_' + m.discordId;

      const [rows] = await conn.query(
        'SELECT id, rank, role FROM users WHERE id = ? OR discord_id = ? LIMIT 1',
        [id, m.discordId]
      );

      if (rows.length > 0) {
        const dbUser = rows[0];
        if (dbUser.rank !== m.rank || dbUser.role !== role) {
          await conn.query(
            'UPDATE users SET rank=?, role=?, department=?, code=?, display_name=?, real_name=? WHERE id=?',
            [m.rank || 'مشاهد', role, 'جدول الأمن العام', m.code, m.name, m.name, dbUser.id]
          );
          updated++;
          if (updated <= 10) console.log(`  📝 ${m.name} | ${m.rank} | ${role}`);
        } else {
          skipped++;
        }
      } else {
        await conn.query(
          `INSERT INTO users (id, discord_id, username, display_name, real_name, role, rank, department, code, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
          [id, m.discordId, m.name, m.name, m.name, role, m.rank || 'مشاهد', 'جدول الأمن العام', m.code]
        );
        inserted++;
        if (inserted <= 10) console.log(`  ➕ ${m.name} | ${m.rank} | ${role}`);
      }
    }

    console.log('\n═══════════════════════════════════');
    console.log(`✅ انتهت المزامنة:`);
    console.log(`   إضافة:    ${inserted}`);
    console.log(`   تحديث:    ${updated}`);
    console.log(`   بدون تغيير: ${skipped}`);

    const [[{ c }]] = await conn.query('SELECT COUNT(*) as c FROM users');
    console.log(`\n📊 إجمالي المستخدمين في قاعدة البيانات الآن: ${c}`);
    console.log('═══════════════════════════════════');

  } finally {
    await conn.end();
  }
}

run().catch(console.error);
