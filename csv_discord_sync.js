// =====================================================================
// csv_discord_sync.js — بوت مزامنة CSV مع الديسكورد
// =====================================================================
// يعمل باستقلالية تامة عن الموقع وقاعدة البيانات الرئيسية.
// يسحب جداول CSV من Google Sheets، يكتشف التغييرات الجديدة فقط،
// ويطبقها على الديسكورد (رتبة + اسم + أنواط + ونقات + مهام قيادية).
// =====================================================================

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// ──────────────────────────────────────────────
// ⚙️  الإعدادات — عدّل هذه القيم حسب بيئتك
// ──────────────────────────────────────────────

// مسار ملف الـ snapshot (يحفظ آخر حالة معروفة لكل عضو)
const SNAPSHOT_FILE = path.join(__dirname, 'assets', 'data', 'csv_snapshot.json');

// مسار ملف السجل لمتابعة ما قام به البوت
const LOG_FILE = path.join(__dirname, 'assets', 'data', 'csv_sync_log.json');

// الروابط المباشرة لملفات الـ CSV من Google Sheets
const CSV_SOURCES = [
  {
    name: 'جدول الأمن العام - الأساسي',
    url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSnQUZOHOGPE9wSCk8FlHg5ww1OS7sPJweNsxFQod_Lg9H-iH8km1D-m0hDRdC3qsccW0RJGbcLpSrK/pub?gid=249309184&single=true&output=csv'
  },
  {
    name: 'جدول الأمن العام - المنتدبين',
    url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSnQUZOHOGPE9wSCk8FlHg5ww1OS7sPJweNsxFQod_Lg9H-iH8km1D-m0hDRdC3qsccW0RJGbcLpSrK/pub?gid=1769675628&single=true&output=csv'
  }
];

// ──────────────────────────────────────────────
// 🔑  جدول ربط الأنواط بمعرّفات الرولات
// ──────────────────────────────────────────────
const ANWAT_ROLE_MAP = {
  'الدرجة الأولى':  '1359127227479888143',
  'الدرجة الثانية': '1359127413623357444',
  'الدرجة الثالثة': '1359127416227762176',
  'الدرجة الرابعة': '1359127418274713621',
  'الدرجة الخامسة': '1359127420338307123',
  'الدرجة السادسة': '1359127438084542666',
};

// ──────────────────────────────────────────────
// 🎓  جدول ربط الونقات/الدورات بمعرّفات الرولات
// (يطابق اسم عمود الشيت بالضبط)
// ──────────────────────────────────────────────
const COURSE_COLUMN_ROLE_MAP = {
  'العمليات':                   '1359128118836592700',
  'المرور':                     '1359128134796050578',
  'أمن الطرق':                  '1359128140873728021',
  'ضابط منطقة':                 '1359128160951734402',
  'الجناح الجوي':               '1359128149769584761',
  'المهمات':                    '1359129890833698856',
  'مكافحة المخدرات':            '1359128167369150504',
  'التدخل السريع':              '1359128173186515044',
  'البحث والتحري':              '1359128184427380936',
  'ونق المطاردة والأقتحام':    '1346970053178036325',
  'ونق مكافحة الارهاب':        '1365109744783851543',
  'ونق مهارات الرماية':         '1395154303433445458',
  'ونق عمليات خاصة':            '1383170088991068273',
  'ونق الطيران':                '1505953159284002953',
};

// ──────────────────────────────────────────────
// 👑  جدول ربط المهام القيادية بمعرّفات الرولات
// ──────────────────────────────────────────────
const LEADERSHIP_ROLE_MAP = {
  'هيئة المتابعة والاشراف':               '1469494425137975511',
  'الشعبة المسؤولة عن طلب الرولات':       '1424816410294620220',
  'شعبة تحديث الاكواد':                   '1358158311505268822',
  'شعبة تسجيل وسحب ورفع الاحكام':        '1272256976046260356',
  'شعبة الاستقالات':                      '1359465092256890990',
  'شعبة الإجازات':                        '1318971006769172542',
  'شعبة الإجـازات':                        '1318971006769172542',
  'شعبة الاجازات':                        '1318971006769172542',
  'شعبة الاجـازات':                        '1318971006769172542',
  'شعبة تسجيل الجدد':                    '1275102868747321445',
  'شعبة الإستقلات والمفصولين':           '1305359853119733781',
  'شعبة التقارير':                        '1377532858616250389',
  'شؤون ادارية':                          '1272232555646685277',
  'رئاسة هيئـة القضاء':                  '1438532194338607245',
  'هيئة القضاء':                          '1399932871199690822',
  'رئاسة هيئـة المحققـين':               '1424927168206737489',
  'رئيس قسم':                            '1447120298355855542',
  'قسم الرصد والمتابعة':                 '1335302777106206720',
  'مـسـؤول الغرامات':                     '1303621116321075220',
  'شـعـبـة تـسـجـيـل الغــرامـات':      '1425489502062772265',
  'قسم تغير الوظيفة':                    '1448036215868620994',
  'شعبة التكتات':                         '1319078285660913684',
  'شؤون عسكرية':                          '1318739383645507676',
  'مدرب كلية العلوم الأمنية لتدريب الضباط': '1272256987459096690',
  'اللجنة العليا لتدريب الونقات':         '1441609327046688839',
  'شؤون اكاديمية التدريب':               '1334946732165038120',
  'مدير دورة':                            '1359236628555501819',
  'شعبة تصحيح تقارير التدريب':           '1493312037303095437',
  'شعبة رصد جدول التدريب':               '1493312518465126560',
  'شعبة قبول الاعتذارات':                '1493312174162972843',
  'مدرب دورة العمليات الميدانية':         '1272256978575691807',
  'مدرب دورة المرور':                     '1272256979812745247',
  'مدرب دورة القوات الخاصة لأمن الطرق':  '1272256980660256903',
  'مدرب دورة طيران الامن':               '1272256981490470983',
  'مدرب دورة مكافحة المخدرات':           '1272256982044250132',
  'مدرب دورة البحث والتحري':             '1272256982866329691',
  'مدرب دورة ضباط المناطق':              '1272256983239757958',
  'مدرب دورة المهمات والواجبات الخاصة':  '1307247868054343710',
  'منسوبي ادارة التدريب':                '1272620389486301196',
  'شعبة التجنيد':                        '1272256986108399729',
  'قـيـادة قـطـاعـات اخـرى':             '1477770243534487552',
  'كبار ضباط الامن العام':                '1318692416877887598',
  'ضباط الامن العام':                     '1318692077349109864',
  'افراد الامن العام':                    '1318691995354398910',
};

// مجموعة كل معرّفات الرولات التي يتحكم بها البوت (لإزالة القديمة فقط)
const ALL_MANAGED_ROLE_IDS = new Set([
  ...Object.values(ANWAT_ROLE_MAP),
  ...Object.values(COURSE_COLUMN_ROLE_MAP),
  ...Object.values(LEADERSHIP_ROLE_MAP),
]);

// خريطة عكسية: Role ID → اسم الرول (للرسائل)
const ROLE_ID_TO_NAME = {};
for (const [name, id] of Object.entries(ANWAT_ROLE_MAP))        ROLE_ID_TO_NAME[id] = name;
for (const [name, id] of Object.entries(COURSE_COLUMN_ROLE_MAP)) ROLE_ID_TO_NAME[id] = name;
for (const [name, id] of Object.entries(LEADERSHIP_ROLE_MAP))    ROLE_ID_TO_NAME[id] = name;

// ───────────────────────────────
// 📢  قنوات اللوق في الديسكورد
// ───────────────────────────────
const LOG_CHANNELS = {
  nameChange:   '1510187826996580412',
  roleAdd:      '1510190567026593802',
  roleRemove:   '1510190811805913168',
};

// إرسال رسالة Embed لقناة لوق في الديسكورد
async function sendLogMessage(channelId, embed, botToken) {
  try {
    await discordRequest('POST', `/channels/${channelId}/messages`, { embeds: [embed] }, botToken);
  } catch (e) {
    console.warn(`[CSV Sync] ⚠️ فشل إرسال لوق للقناة ${channelId}: ${e.message}`);
  }
}

// ──────────────────────────────────────────────
// 🔧  دوال مساعدة - تحميل الإعدادات
// ──────────────────────────────────────────────

function loadConfig() {
  const envPaths = [
    path.join(process.env.HOME || process.env.USERPROFILE || '', 'OneDrive', 'Documents', 'DISCORD', '.env'),
    path.join(process.env.HOME || process.env.USERPROFILE || '', 'DISCORD', '.env'),
    path.join(__dirname, '..', 'DISCORD', '.env'),
    path.join(__dirname, '.env')
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const lines = fs.readFileSync(envPath, 'utf8').split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const [key, ...rest] = trimmed.split('=');
            const value = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
            process.env[key.trim()] = value;
          }
        }
      } catch (e) {}
    }
  }

  // Fallback: token مضمّن (نفس ما في server.js)
  const discordToken = process.env.DISCORD_TOKEN ||
    'MTUxMDE1NzU0NjUwMDAwMTg4NA' + '.' + 'GAUVcw' + '.' + 'EKZ5Zp-WsvwUmrtmxRzjQdaXJqEiFaI7mEatt0';
  const guildId     = process.env.GUILD_ID || '1272212444936404992';

  return { discordToken, guildId };
}

// ──────────────────────────────────────────────
// 📥  جلب ملف CSV عبر HTTPS
// ──────────────────────────────────────────────

function fetchCsv(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      // متابعة إعادة التوجيه (301, 302, 307, 308)
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        return fetchCsv(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.setEncoding('utf8'); // منع تلف الحروف العربية عند تقسيم البيانات
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// ──────────────────────────────────────────────
// 🔍  تحليل CSV وإرجاع مصفوفة من الأعضاء
// ──────────────────────────────────────────────

function parseCsv(csvText) {
  const lines  = csvText.split('\n');
  if (lines.length < 2) return [];

  // العنوان في السطر الأول أو الثاني (نتجاهل سطور الفراغ)
  const headerLine = lines.find(l => l.trim().startsWith('id discord') || l.includes('الاسم,الكود'));
  if (!headerLine) return [];

  const headers = headerLine.split(',').map(h => h.trim().toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
  );

  const idxId         = headers.findIndex(h => h.includes('id discord') || h === 'id discord');
  const idxName       = headers.findIndex(h => h === 'الاسم' || h.includes('اسم'));
  const idxCode       = headers.findIndex(h => h === 'الكود' || h.includes('كود'));
  const idxRank       = headers.findIndex(h => h === 'الرتبه' || h === 'الرتبة' || h.includes('رتبه') || h.includes('رتبة'));
  const idxAnwat      = headers.findIndex(h => h.includes('درجه استحقاق') || h.includes('درجة استحقاق') || h.includes('انواط') || h.includes('أنواط'));
  const idxStatus     = headers.findIndex(h => h === 'الحاله' || h === 'الحالة');
  const idxLeadership = headers.findLastIndex(h => h.includes('المهام') || h.includes('المهمه') || h.includes('القياديه') || h.includes('القيادية'));

  // خريطة أسماء أعمدة الونقات إلى فهارسها
  const courseColumnIndices = {};
  for (const colName of Object.keys(COURSE_COLUMN_ROLE_MAP)) {
    const normalizedCol = normalizeArabic(colName);
    const idx = headers.findIndex(h => normalizeArabic(h) === normalizedCol || normalizeArabic(h).includes(normalizedCol));
    if (idx !== -1) courseColumnIndices[colName] = idx;
  }

  const members = [];
  for (const line of lines) {
    const row = splitCsvRow(line);
    if (!row || row.length < 4) continue;

    const rawId = row[idxId] ? row[idxId].trim() : '';
    // نستخرج الـ ID الرقمي من تنسيق <@123456> أو نأخذه كما هو
    const discordId = rawId.replace(/<@!?(\d+)>/, '$1').replace(/\s/g, '');
    if (!discordId || !/^\d{17,20}$/.test(discordId)) continue;

    const name       = idxName       !== -1 ? (row[idxName]       || '').trim() : '';
    const code       = idxCode       !== -1 ? (row[idxCode]       || '').trim().replace(/[\[\]]/g, '') : '';
    const rank       = idxRank       !== -1 ? (row[idxRank]       || '').trim() : '';
    const anwat      = idxAnwat      !== -1 ? (row[idxAnwat]      || '').trim() : '';
    const status     = idxStatus     !== -1 ? (row[idxStatus]     || '').trim() : '';
    const leadership = idxLeadership !== -1 ? (row[idxLeadership] || '').trim() : '';

    // قراءة حالة كل ونق (✔ = مفعّل، غير ذلك = معطّل)
    const courses = {};
    for (const [colName, idx] of Object.entries(courseColumnIndices)) {
      const val = (row[idx] || '').trim();
      courses[colName] = val === '✔' || val === '✓';
    }

    members.push({ discordId, name, code, rank, anwat, status, leadership, courses });
  }

  return members;
}

function normalizeArabic(str) {
  return (str || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ـ/g, ''); // إزالة الكشيدة (التطويل)
}

// تقسيم سطر CSV بشكل صحيح (يدعم الحقول التي تحتوي فواصل بين اقتباسات)
function splitCsvRow(line) {
  const result = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ──────────────────────────────────────────────
// 💾  تحميل وحفظ الـ snapshot
// ──────────────────────────────────────────────

async function loadSnapshot(db) {
  if (db) {
    try {
      const dbSnapshot = await new Promise((resolve, reject) => {
        db.get('SELECT data_json FROM general_collections WHERE collection_key = ?', ['csv_discord_snapshot'], (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.data_json : null);
        });
      });
      if (dbSnapshot) {
        return JSON.parse(dbSnapshot);
      }
    } catch (e) {
      console.warn('[CSV Sync] Failed to read snapshot from DB, falling back to local file:', e.message);
    }
  }

  if (!fs.existsSync(SNAPSHOT_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function saveSnapshot(db, snapshot) {
  if (db) {
    try {
      await new Promise((resolve, reject) => {
        db.run('INSERT OR REPLACE INTO general_collections (collection_key, data_json) VALUES (?, ?)', ['csv_discord_snapshot', JSON.stringify(snapshot)], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      console.log('[CSV Sync] Snapshot successfully saved to database.');
      return;
    } catch (e) {
      console.error('[CSV Sync] Failed to save snapshot to DB, saving to local file:', e.message);
    }
  }

  try {
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
  } catch (e) {
    console.error('[CSV Sync] فشل حفظ الـ snapshot محلياً:', e.message);
  }
}

// ──────────────────────────────────────────────
// 📝  تسجيل الأحداث في ملف السجل
// ──────────────────────────────────────────────

function appendLog(entry) {
  let logs = [];
  if (fs.existsSync(LOG_FILE)) {
    try { logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch {}
  }
  logs.unshift({ ...entry, timestamp: new Date().toISOString() });
  if (logs.length > 500) logs = logs.slice(0, 500); // نحتفظ بآخر 500 سجل
  try { fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2), 'utf8'); } catch {}
}

// ──────────────────────────────────────────────
// 🌐  Discord API — دوال التعديل
// ──────────────────────────────────────────────

function discordRequest(method, endpoint, body, botToken) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const options = {
      hostname: 'discord.com',
      path: `/api/v10${endpoint}`,
      method,
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body: data });
        } else {
          reject(new Error(`Discord API ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// تغيير الاسم المستعار (Nickname) لعضو
async function setNickname(guildId, userId, nickname, botToken) {
  await discordRequest('PATCH', `/guilds/${guildId}/members/${userId}`, { nick: nickname }, botToken);
}

// جلب معلومات العضو في السيرفر (رولاته الحالية)
async function getGuildMember(guildId, userId, botToken) {
  const result = await discordRequest('GET', `/guilds/${guildId}/members/${userId}`, null, botToken);
  return JSON.parse(result.body);
}

// إضافة رول لعضو
async function addRole(guildId, userId, roleId, botToken) {
  await discordRequest('PUT', `/guilds/${guildId}/members/${userId}/roles/${roleId}`, {}, botToken);
}

// إزالة رول من عضو
async function removeRole(guildId, userId, roleId, botToken) {
  await discordRequest('DELETE', `/guilds/${guildId}/members/${userId}/roles/${roleId}`, null, botToken);
}

// إضافة تأخير لتجنب Rate Limit
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ──────────────────────────────────────────────
// 🔄  استخراج رولات المطلوبة لعضو بناءً على بياناته
// ──────────────────────────────────────────────

function parseLeadershipRoles(leadershipText) {
  const roles = new Set();
  if (leadershipText && leadershipText !== 'لايوجد' && leadershipText !== 'لا يوجد' && leadershipText !== '-' && leadershipText !== '—') {
    const parts = leadershipText.split(/[،,\/\\|]/);
    for (const part of parts) {
      const trimmed = part.trim();
      const normalized = normalizeArabic(trimmed);
      if (!normalized) continue;

      // 1. مطابقة تامة أولاً (Exact Match) - وهي الأعلى أولوية
      let matched = false;
      for (const [mapKey, roleId] of Object.entries(LEADERSHIP_ROLE_MAP)) {
        if (normalizeArabic(mapKey) === normalized) {
          roles.add(roleId);
          matched = true;
          break;
        }
      }

      // 2. مطابقة جزئية إذا لم تنجح المطابقة التامة (مع حماية الرتب العامة)
      if (!matched) {
        for (const [mapKey, roleId] of Object.entries(LEADERSHIP_ROLE_MAP)) {
          const mapKeyNorm = normalizeArabic(mapKey);
          
          // إذا كان المفتاح هو أحد الرتب العامة الحساسة، فلا نقبل إلا مطابقة تامة
          const isGeneralRole = [
            'ضباط الامن العام',
            'كبار ضباط الامن العام',
            'افراد الامن العام',
            'قـيـادة قـطـاعـات اخـرى'
          ].map(normalizeArabic).includes(mapKeyNorm);

          if (isGeneralRole) {
            // الرتب العامة يجب أن تطابق النص المدخل تماماً
            if (mapKeyNorm === normalized) {
              roles.add(roleId);
              matched = true;
              break;
            }
          } else {
            // بقية المهام القيادية يمكن قبول المطابقة الجزئية لها
            if (mapKeyNorm.includes(normalized) || normalized.includes(mapKeyNorm)) {
              roles.add(roleId);
              matched = true;
              break;
            }
          }
        }
      }
    }
  }
  return roles;
}

function computeRequiredRoles(member) {
  const requiredRoleIds = new Set();

  // 1. الأنواط
  if (member.anwat && ANWAT_ROLE_MAP[member.anwat]) {
    requiredRoleIds.add(ANWAT_ROLE_MAP[member.anwat]);
  }

  // 2. الونقات
  for (const [colName, isActive] of Object.entries(member.courses || {})) {
    if (isActive && COURSE_COLUMN_ROLE_MAP[colName]) {
      requiredRoleIds.add(COURSE_COLUMN_ROLE_MAP[colName]);
    }
  }

  // 3. المهام القيادية
  const leadershipRoles = parseLeadershipRoles(member.leadership);
  for (const roleId of leadershipRoles) {
    requiredRoleIds.add(roleId);
  }

  return requiredRoleIds;
}

// ──────────────────────────────────────────────
// 🆚  مقارنة snapshot قديم بجديد للكشف عن التغييرات
// ──────────────────────────────────────────────

function detectChanges(oldSnapshot, newMember) {
  const old = oldSnapshot[newMember.discordId];

  if (!old) {
    // عضو جديد تماماً
    return { isNew: true, changes: ['عضو جديد'] };
  }

  const changes = [];

  if (normalizeArabic(old.name) !== normalizeArabic(newMember.name) && newMember.name) {
    changes.push(`تغيير الاسم: "${old.name}" → "${newMember.name}"`);
  }
  if (normalizeArabic(old.rank) !== normalizeArabic(newMember.rank) && newMember.rank) {
    changes.push(`تغيير الرتبة: "${old.rank}" → "${newMember.rank}"`);
  }
  if (normalizeArabic(old.anwat || '') !== normalizeArabic(newMember.anwat || '')) {
    changes.push(`تغيير الأنواط: "${old.anwat}" → "${newMember.anwat}"`);
  }
  if (normalizeArabic(old.leadership || '') !== normalizeArabic(newMember.leadership || '')) {
    changes.push(`تغيير المهام القيادية: "${old.leadership}" → "${newMember.leadership}"`);
  }

  // مقارنة الونقات
  const oldCourses = old.courses || {};
  const newCourses = newMember.courses || {};
  for (const col of Object.keys(COURSE_COLUMN_ROLE_MAP)) {
    if (!!oldCourses[col] !== !!newCourses[col]) {
      changes.push(`تغيير ونق "${col}": ${oldCourses[col] ? '✔' : '❌'} → ${newCourses[col] ? '✔' : '❌'}`);
    }
  }

  return { isNew: false, changes };
}

// دالة لدمج الأعضاء المكررين عبر الجداول المختلفة لمنع التضارب
function mergeMembers(members) {
  const merged = {};
  for (const m of members) {
    if (!merged[m.discordId]) {
      merged[m.discordId] = { ...m, courses: { ...m.courses } };
    } else {
      const existing = merged[m.discordId];
      if (!existing.name) existing.name = m.name;
      if (!existing.code) existing.code = m.code;
      if (!existing.rank) existing.rank = m.rank;
      if (!existing.status) existing.status = m.status;
      if (m.anwat) existing.anwat = m.anwat;
      if (m.leadership) {
        if (!existing.leadership) {
          existing.leadership = m.leadership;
        } else if (!existing.leadership.includes(m.leadership)) {
          existing.leadership += ' / ' + m.leadership;
        }
      }
      // دمج الدورات والونقات
      for (const [courseName, val] of Object.entries(m.courses || {})) {
        if (val) {
          existing.courses[courseName] = true;
        }
      }
    }
  }
  return Object.values(merged);
}

// ──────────────────────────────────────────────
// 🚀  الدالة الرئيسية: مزامنة CSV مع الديسكورد
// ──────────────────────────────────────────────

let isSyncing = false;

async function runCsvDiscordSync(db, force = false) {
  if (isSyncing) {
    console.log('[CSV Sync] مزامنة جارية بالفعل، تخطي...');
    return { skipped: true };
  }
  isSyncing = true;

  try {
    const { discordToken, guildId } = loadConfig();
    if (!discordToken || !guildId) {
      console.error('[CSV Sync] خطأ: DISCORD_TOKEN أو GUILD_ID غير محدد.');
      return { error: 'Missing config' };
    }

    console.log('[CSV Sync] ═══════════════════════════════════');
    console.log('[CSV Sync] بدء المزامنة...');

    const snapshot = await loadSnapshot(db);
    const allMembers = [];

  // 1. جلب وتحليل كل مصادر الـ CSV
  for (const source of CSV_SOURCES) {
    try {
      console.log(`[CSV Sync] جلب: ${source.name}`);
      const csvText = await fetchCsv(source.url);
      const members = parseCsv(csvText);
      console.log(`[CSV Sync] تم تحليل ${members.length} عضو من "${source.name}"`);
      allMembers.push(...members);
    } catch (err) {
      console.error(`[CSV Sync] فشل جلب "${source.name}": ${err.message}`);
    }
  }

  const mergedMembers = mergeMembers(allMembers);

  if (mergedMembers.length === 0) {
    console.warn('[CSV Sync] لا يوجد أعضاء بعد التحليل والدمج. إنهاء.');
    return { processed: 0 };
  }

  // 2. مقارنة والتصرف على التغييرات
  let processedCount = 0;
  let changedCount   = 0;
  let errorCount     = 0;
  const newSnapshot  = { ...snapshot };

  for (const member of mergedMembers) {
    const { isNew, changes } = detectChanges(snapshot, member);

    if (!force && !isNew && changes.length === 0) {
      // لا تغيير — نتجاهل هذا العضو تماماً
      continue;
    }

    processedCount++;
    console.log(`[CSV Sync] 🔄 معالجة: ${member.name} (${member.discordId}) | ${changes.join(', ')}`);

    try {
      // 3. جلب الرولات الحالية للعضو من الديسكورد
      let currentRoles = [];
      try {
        const guildMember = await getGuildMember(guildId, member.discordId, discordToken);
        currentRoles = guildMember.roles || [];
      } catch (fetchErr) {
        // إذا لم يكن العضو في السيرفر، نتجاوزه
        if (fetchErr.message.includes('404') || fetchErr.message.includes('10007')) {
          console.warn(`[CSV Sync] ⚠️ العضو ${member.name} (${member.discordId}) غير موجود في السيرفر.`);
          // لا نحفظه في الكاش لكي يحاول البوت مزامنته مجدداً في الدورات القادمة بمجرد دخوله السيرفر
          delete newSnapshot[member.discordId];
          continue;
        }
        throw fetchErr;
      }

      await delay(force ? 1000 : 300); // تجنب Rate Limit (أطول في المزامنة الشاملة لتفادي حظر الاستضافة)

      // 4. تغيير الاسم المستعار إذا تغيّر
      const nameChanged = isNew || changes.some(c => c.includes('تغيير الاسم'));
      if (nameChanged && member.name) {
        const oldNick = snapshot[member.discordId] ? snapshot[member.discordId].name : 'غير مسجل';
        const nickname = `${member.code ? '[' + member.code + '] ' : ''}${member.name}`;
        try {
          await setNickname(guildId, member.discordId, nickname, discordToken);
          console.log(`[CSV Sync] ✅ تم تحديث الاسم: ${nickname}`);
          // إرسال لوق تغيير الاسم
          await sendLogMessage(LOG_CHANNELS.nameChange, {
            title: '✏️ تغيير اسم',
            color: 0xf0a500,
            fields: [
              { name: 'العضو', value: `<@${member.discordId}>`, inline: true },
              { name: 'الاسم القديم', value: oldNick || 'غير مسجل', inline: true },
              { name: 'الاسم الجديد', value: nickname, inline: true },
            ],
            footer: { text: 'بوت مزامنة CSV' },
            timestamp: new Date().toISOString(),
          }, discordToken);
          await delay(500);
        } catch (nickErr) {
          console.warn(`[CSV Sync] ⚠️ فشل تحديث الاسم لـ ${member.name}: ${nickErr.message}`);
        }
      }

      // 5. حساب الرولات المطلوب إضافتها وإزالتها تفاضلياً (تجنب المساس بالرولات اليدوية في الديسكورد)
      const requiredRoleIds = computeRequiredRoles(member);
      const oldEntry = snapshot[member.discordId];

      const rolesToAdd = new Set();
      const rolesToRemove = new Set();

      // أ. إضافة الرولات المطلوبة حالياً في الجدول وغير موجودة لدى العضو في ديسكورد
      for (const roleId of requiredRoleIds) {
        if (!currentRoles.includes(roleId)) {
          rolesToAdd.add(roleId);
        }
      }

      // ب. إزالة الرولات التي ألغيت من الجدول وموجودة لدى العضو في ديسكورد
      for (const roleId of ALL_MANAGED_ROLE_IDS) {
        if (!requiredRoleIds.has(roleId) && currentRoles.includes(roleId)) {
          rolesToRemove.add(roleId);
        }
      }

      // إزالة الرولات التي تقرر إزالتها (إذا كانت لدى العضو فعلياً في ديسكورد)
      for (const roleId of rolesToRemove) {
        if (currentRoles.includes(roleId)) {
          try {
            await removeRole(guildId, member.discordId, roleId, discordToken);
            const roleName = ROLE_ID_TO_NAME[roleId] || roleId;
            console.log(`[CSV Sync]   ➖ إزالة رول: ${roleName}`);
            // إرسال لوق إزالة رول
            await sendLogMessage(LOG_CHANNELS.roleRemove, {
              title: '➖ إزالة رول',
              color: 0xe74c3c,
              fields: [
                { name: 'العضو', value: `<@${member.discordId}> — ${member.name}`, inline: false },
                { name: 'الرول المزال', value: `<@&${roleId}> (${roleName})`, inline: false },
              ],
              footer: { text: 'بوت مزامنة CSV' },
              timestamp: new Date().toISOString(),
            }, discordToken);
            await delay(300);
          } catch (e) {
            console.warn(`[CSV Sync]   ⚠️ فشل إزالة رول ${roleId}: ${e.message}`);
          }
        }
      }

      // إضافة الرولات التي تقرر إضافتها (إذا لم تكن لدى العضو فعلياً في ديسكورد)
      for (const roleId of rolesToAdd) {
        if (!currentRoles.includes(roleId)) {
          try {
            await addRole(guildId, member.discordId, roleId, discordToken);
            const roleName = ROLE_ID_TO_NAME[roleId] || roleId;
            console.log(`[CSV Sync]   ➕ إضافة رول: ${roleName}`);
            // إرسال لوق إضافة رول
            await sendLogMessage(LOG_CHANNELS.roleAdd, {
              title: '➕ إضافة رول',
              color: 0x2ecc71,
              fields: [
                { name: 'العضو', value: `<@${member.discordId}> — ${member.name}`, inline: false },
                { name: 'الرول المضاف', value: `<@&${roleId}> (${roleName})`, inline: false },
              ],
              footer: { text: 'بوت مزامنة CSV' },
              timestamp: new Date().toISOString(),
            }, discordToken);
            await delay(300);
          } catch (e) {
            console.warn(`[CSV Sync]   ⚠️ فشل إضافة رول ${roleId}: ${e.message}`);
          }
        }
      }

      // 6. تحديث الـ snapshot لهذا العضو
      newSnapshot[member.discordId] = buildSnapshotEntry(member);
      changedCount++;

      appendLog({
        discordId: member.discordId,
        name: member.name,
        action: isNew ? 'عضو جديد' : 'تحديث',
        changes,
        status: 'success'
      });

    } catch (err) {
      errorCount++;
      console.error(`[CSV Sync] ❌ خطأ في معالجة ${member.name} (${member.discordId}): ${err.message}`);
      appendLog({
        discordId: member.discordId,
        name: member.name,
        action: 'خطأ',
        changes,
        error: err.message,
        status: 'error'
      });
    }
  }

    // 6.5. الكشف عن الأعضاء الذين تم حذفهم من الجدول بالكامل وإزالة رولاتهم
    const activeDiscordIds = new Set(mergedMembers.map(m => m.discordId));
    for (const oldDiscordId of Object.keys(snapshot)) {
      if (!activeDiscordIds.has(oldDiscordId)) {
        console.log(`[CSV Sync] 🗑️ تم حذف العضو من الجدول: ${snapshot[oldDiscordId].name} (${oldDiscordId})`);
        
        try {
          const guildMember = await getGuildMember(guildId, oldDiscordId, discordToken);
          const currentRoles = guildMember.roles || [];
          const oldEntry = snapshot[oldDiscordId];
          
          for (const roleId of ALL_MANAGED_ROLE_IDS) {
            if (currentRoles.includes(roleId)) {
              try {
                await removeRole(guildId, oldDiscordId, roleId, discordToken);
                const roleName = ROLE_ID_TO_NAME[roleId] || roleId;
                console.log(`[CSV Sync]   ➖ إزالة رول (بسبب الحذف من الجدول): ${roleName}`);
                
                await sendLogMessage(LOG_CHANNELS.roleRemove, {
                  title: '➖ إزالة رول (حذف من الجدول)',
                  color: 0xe74c3c,
                  fields: [
                    { name: 'العضو', value: `<@${oldDiscordId}> — ${oldEntry.name}`, inline: false },
                    { name: 'الرول المزال', value: `<@&${roleId}> (${roleName})`, inline: false },
                  ],
                  footer: { text: 'بوت مزامنة CSV' },
                  timestamp: new Date().toISOString(),
                }, discordToken);
                await delay(300);
              } catch (e) {
                console.warn(`[CSV Sync]   ⚠️ فشل إزالة رول ${roleId} للعضو المحذوف ${oldDiscordId}: ${e.message}`);
              }
            }
          }
        } catch (fetchErr) {
          if (fetchErr.message.includes('404') || fetchErr.message.includes('10007')) {
            console.log(`[CSV Sync] العضو المحذوف ${oldDiscordId} غير موجود بالفعل في السيرفر.`);
          } else {
            console.warn(`[CSV Sync] فشل جلب بيانات العضو المحذوف ${oldDiscordId}: ${fetchErr.message}`);
          }
        }

        // حذف العضو من الـ snapshot الجديد لكي لا يعالج مجدداً
        delete newSnapshot[oldDiscordId];
        changedCount++;

        appendLog({
          discordId: oldDiscordId,
          name: snapshot[oldDiscordId].name,
          action: 'حذف من الجدول',
          changes: ['تم حذف العضو من جداول البيانات بالكامل وإزالة رولاته المدارة'],
          status: 'success'
        });
      }
    }

    // 7. حفظ الـ snapshot المحدّث
    await saveSnapshot(db, newSnapshot);

    console.log(`[CSV Sync] ═══════════════════════════════════`);
    console.log(`[CSV Sync] ✅ انتهت المزامنة: ${changedCount} تغيير، ${errorCount} خطأ.`);
    console.log(`[CSV Sync] ═══════════════════════════════════`);

    return { processed: processedCount, changed: changedCount, errors: errorCount };
  } catch (syncErr) {
    console.error('[CSV Sync] ❌ خطأ فادح في المزامنة:', syncErr);
    return { error: syncErr.message };
  } finally {
    isSyncing = false;
  }
}

function buildSnapshotEntry(member) {
  return {
    name: member.name,
    rank: member.rank,
    anwat: member.anwat,
    leadership: member.leadership,
    courses: member.courses,
    lastSeen: new Date().toISOString()
  };
}

// ──────────────────────────────────────────────
// 📤  تصدير الدوال ليستخدمها server.js
// ──────────────────────────────────────────────

module.exports = { runCsvDiscordSync };

// ──────────────────────────────────────────────
// ▶️  تشغيل مباشر (node csv_discord_sync.js)
// ──────────────────────────────────────────────

if (require.main === module) {
  console.log('[CSV Sync] تشغيل مباشر في وضع مستقل (دورة تلقائية كل 60 ثانية)...');
  
  // 1. تحميل الإعدادات من ملف .env
  const envPath = path.join(__dirname, '.env');
  let mysqlConfig = null;
  
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split('\n');
      mysqlConfig = {};
      lines.forEach(line => {
        const parts = line.trim().split('=');
        if (parts.length >= 2 && !parts[0].startsWith('#')) {
          const key = parts[0].trim();
          const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
          if (key === 'MYSQL_HOST') mysqlConfig.host = value;
          if (key === 'MYSQL_USER') mysqlConfig.user = value;
          if (key === 'MYSQL_PASSWORD') mysqlConfig.password = value;
          if (key === 'MYSQL_DATABASE') mysqlConfig.database = value;
          if (key === 'MYSQL_PORT') mysqlConfig.port = value;
          if (key === 'DISCORD_TOKEN') process.env.DISCORD_TOKEN = value;
          if (key === 'GUILD_ID') process.env.GUILD_ID = value;
        }
      });
      console.log('[CSV Sync] تم تحميل إعدادات البيئة من ملف .env نجاح.');
    } catch (e) {
      console.error('[CSV Sync Warning] فشل قراءة ملف .env:', e.message);
    }
  }

  // 2. إعداد الاتصال بقاعدة بيانات SQLite المحلية (منفصل عن هوستنجر)
  let db = null;
  try {
    const sqlite3 = require('sqlite3').verbose();
    const dbPath = path.join(__dirname, 'assets', 'data', 'exam_archive.db');
    
    // التأكد من وجود المجلد
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const sqliteDb = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('[CSV Sync DB Error] فشل الاتصال بقاعدة بيانات SQLite:', err.message);
      } else {
        console.log('[CSV Sync] تم الاتصال بقاعدة بيانات SQLite المحلية بنجاح:', dbPath);
        sqliteDb.run(`CREATE TABLE IF NOT EXISTS general_collections (
          collection_key TEXT PRIMARY KEY,
          data_json TEXT
        )`);
      }
    });

    db = {
      get(sql, params = [], callback) {
        if (typeof params === 'function') {
          callback = params;
          params = [];
        }
        sqliteDb.get(sql, params, callback);
      },
      run(sql, params = [], callback) {
        if (typeof params === 'function') {
          callback = params;
          params = [];
        }
        sqliteDb.run(sql, params, callback);
      }
    };
  } catch (dbErr) {
    console.error('[CSV Sync Warning] فشل تهيئة اتصال SQLite، سيتم استخدام الكاش المحلي للمزامنة:', dbErr.message);
  }

  // 3. تشغيل المزامنة في دورة مستمرة
  async function runLoop() {
    console.log(`\n[CSV Sync] [${new Date().toLocaleTimeString('ar')}] بدء دورة المزامنة التلقائية...`);
    try {
      const result = await runCsvDiscordSync(db);
      console.log('[CSV Sync] نتيجة الدورة:', result);
    } catch (e) {
      console.error('[CSV Sync Loop Error]:', e);
    }
    console.log('[CSV Sync] بانتظار الدورة القادمة خلال 60 ثانية...');
    setTimeout(runLoop, 60 * 1000);
  }

  runLoop();
}
