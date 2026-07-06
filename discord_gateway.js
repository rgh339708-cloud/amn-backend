// =====================================================================
// discord_gateway.js — اتصال Discord Gateway للظهور أونلاين
// =====================================================================
// يُنشئ اتصال WebSocket دائم مع Discord Gateway ليُظهر البوت أونلاين.
// يُعاد الاتصال تلقائياً عند الانقطاع.
// =====================================================================

const WebSocket = require('ws');
const https = require('https');
const { runCsvDiscordSync } = require('./csv_discord_sync');

let gatewayDb = null;

// ──────────────────────────────────────────────
// إعدادات
// ──────────────────────────────────────────────
const GATEWAY_URL  = 'wss://gateway.discord.gg/?v=10&encoding=json';

// Discord Intents: 0 = لا نحتاج أحداث (نريد الظهور أونلاين فقط)
const INTENTS = 0;

// الـ Activity التي يظهرها البوت
const ACTIVITY = {
  name: 'إدارة الأمن العام',
  type: 3, // 3 = Watching (يراقب)
};

let heartbeatInterval = null;
let lastSequence      = null;
let sessionId         = null;
let resumeUrl         = null;
let ws                = null;
let isReconnecting    = false;

// ──────────────────────────────────────────────
// الاتصال بـ Gateway
// ──────────────────────────────────────────────

function connectGateway(botToken) {
  if (ws) {
    try { ws.terminate(); } catch {}
  }

  const url = (resumeUrl && sessionId) ? resumeUrl + '/?v=10&encoding=json' : GATEWAY_URL;
  console.log('[Gateway] 🔌 جاري الاتصال بـ Discord Gateway...');

  ws = new WebSocket(url);

  ws.on('open', () => {
    console.log('[Gateway] ✅ تم الاتصال بـ Discord Gateway');
    isReconnecting = false;
  });

  ws.on('message', (data) => {
    let payload;
    try {
      payload = JSON.parse(data.toString());
    } catch {
      return;
    }

    const { op, d, s, t } = payload;

    // تحديث آخر sequence
    if (s !== null && s !== undefined) lastSequence = s;

    switch (op) {
      // ── HELLO: استلام heartbeat_interval وبدء الإرسال
      case 10:
        console.log(`[Gateway] 👋 HELLO → heartbeat كل ${d.heartbeat_interval}ms`);
        startHeartbeat(d.heartbeat_interval);

        // إذا عندنا session نعمل RESUME، وإلا IDENTIFY
        if (sessionId && lastSequence !== null) {
          sendResume(botToken);
        } else {
          sendIdentify(botToken);
        }
        break;

      // ── HEARTBEAT ACK
      case 11:
        // تأكيد استلام الـ heartbeat — لا نحتاج إجراء
        break;

      // ── HEARTBEAT REQUEST من السيرفر
      case 1:
        sendHeartbeat();
        break;

      // ── RECONNECT: أعد الاتصال
      case 7:
        console.log('[Gateway] 🔄 طلب RECONNECT من Discord...');
        scheduleReconnect(botToken, 1000);
        break;

      // ── INVALID SESSION
      case 9:
        console.log('[Gateway] ⚠️ INVALID SESSION — إعادة IDENTIFY...');
        if (!d) {
          // لا يمكن الاستئناف، امسح الجلسة
          sessionId    = null;
          lastSequence = null;
          resumeUrl    = null;
        }
        scheduleReconnect(botToken, 5000);
        break;

      // ── DISPATCH: أحداث
      case 0:
        if (t === 'READY') {
          sessionId = d.session_id;
          resumeUrl = d.resume_gateway_url;
          console.log(`[Gateway] 🟢 البوت أونلاين! Session: ${sessionId}`);
          registerSlashCommand(botToken);
        } else if (t === 'INTERACTION_CREATE') {
          handleInteraction(d, botToken);
        }
        break;

      default:
        break;
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[Gateway] 🔴 انقطع الاتصال (code: ${code}). إعادة الاتصال...`);
    clearHeartbeat();

    // بعض أكواد الإغلاق تتطلب IDENTIFY من جديد
    const nonResumableCodes = [4004, 4010, 4011, 4012, 4013, 4014];
    if (nonResumableCodes.includes(code)) {
      sessionId    = null;
      lastSequence = null;
      resumeUrl    = null;
      console.log(`[Gateway] ⚠️ كود ${code} — يتطلب IDENTIFY من جديد.`);
    }

    scheduleReconnect(botToken, 5000);
  });

  ws.on('error', (err) => {
    console.error('[Gateway] ❌ خطأ في الاتصال:', err.message);
  });
}

// ──────────────────────────────────────────────
// Heartbeat
// ──────────────────────────────────────────────

function startHeartbeat(interval) {
  clearHeartbeat();
  // إرسال أول heartbeat بعد جزء عشوائي من المدة (Discord يوصي بذلك)
  const jitter = Math.random() * interval;
  setTimeout(() => {
    sendHeartbeat();
    heartbeatInterval = setInterval(sendHeartbeat, interval);
  }, jitter);
}

function clearHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function sendHeartbeat() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ op: 1, d: lastSequence }));
  }
}

// ──────────────────────────────────────────────
// IDENTIFY
// ──────────────────────────────────────────────

function sendIdentify(botToken) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const payload = {
    op: 2,
    d: {
      token: botToken,
      intents: INTENTS,
      properties: {
        os: 'linux',
        browser: 'amn-bot',
        device: 'amn-bot',
      },
      presence: {
        status: 'online',
        activities: [ACTIVITY],
        since: null,
        afk: false,
      },
    },
  };

  ws.send(JSON.stringify(payload));
  console.log('[Gateway] 📤 IDENTIFY أُرسل');
}

// ──────────────────────────────────────────────
// RESUME
// ──────────────────────────────────────────────

function sendResume(botToken) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const payload = {
    op: 6,
    d: {
      token: botToken,
      session_id: sessionId,
      seq: lastSequence,
    },
  };

  ws.send(JSON.stringify(payload));
  console.log('[Gateway] 📤 RESUME أُرسل');
}

// ──────────────────────────────────────────────
// إعادة الاتصال مع تأخير
// ──────────────────────────────────────────────

function scheduleReconnect(botToken, ms) {
  if (isReconnecting) return;
  isReconnecting = true;
  clearHeartbeat();
  setTimeout(() => connectGateway(botToken), ms);
}

// ──────────────────────────────────────────────
// تصدير
// ──────────────────────────────────────────────

function startGateway(botToken, db) {
  if (!botToken) {
    console.error('[Gateway] ❌ لا يوجد DISCORD_TOKEN!');
    return;
  }
  gatewayDb = db;
  connectGateway(botToken);
}

function getAppIdFromToken(token) {
  try {
    const part = token.split('.')[0];
    return Buffer.from(part, 'base64').toString('utf8');
  } catch (e) {
    return '1510157546500001884'; // Fallback Client ID
  }
}

function discordApiRequest(method, endpoint, body, botToken) {
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
          resolve(data ? JSON.parse(data) : null);
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

async function registerSlashCommand(botToken) {
  const appId = getAppIdFromToken(botToken);
  const guildId = process.env.GUILD_ID || '1272212444936404992';
  const commandData = {
    name: 'svnc',
    description: 'مزامنة رتب ومعلومات الأعضاء بشكل شامل مع شيت جوجل (Force Sync)',
    default_member_permissions: '8' // Admin only
  };

  try {
    console.log('[Gateway] ⚙️ جاري تسجيل أمر Slash Command (/svnc) في الديسكورد...');
    await discordApiRequest(
      'POST',
      `/applications/${appId}/guilds/${guildId}/commands`,
      commandData,
      botToken
    );
    console.log('[Gateway] ✅ تم تسجيل أمر Slash Command (/svnc) بنجاح في السيرفر.');
  } catch (e) {
    console.error('[Gateway] ⚠️ فشل تسجيل أمر Slash Command:', e.message);
  }
}

function sendInteractionResponse(interactionId, interactionToken, payload) {
  return discordApiRequest('POST', `/interactions/${interactionId}/${interactionToken}/callback`, payload, '');
}

function editInteractionResponse(appId, interactionToken, payload) {
  return discordApiRequest('PATCH', `/webhooks/${appId}/${interactionToken}/messages/@original`, payload, '');
}

async function handleInteraction(interaction, botToken) {
  if (interaction.type === 2 && interaction.data && interaction.data.name === 'svnc') {
    const interactionId = interaction.id;
    const interactionToken = interaction.token;
    const appId = interaction.application_id;

    try {
      // 1. إرسال استجابة مؤقتة Defer
      await sendInteractionResponse(interactionId, interactionToken, { type: 5 });
    } catch (e) {
      console.error('[Gateway] Failed to send defer response:', e.message);
      return;
    }

    console.log(`[Gateway] ⏳ بدء تشغيل المزامنة الشاملة بطلب من ${interaction.member?.user?.username || 'مجهول'}...`);
    try {
      // 2. تشغيل المزامنة الشاملة
      const result = await runCsvDiscordSync(gatewayDb, true);
      
      let message = '';
      if (result.skipped) {
        message = '⚠️ المزامنة جارية بالفعل حالياً، يرجى المحاولة لاحقاً.';
      } else if (result.error) {
        message = `❌ حدث خطأ أثناء المزامنة: ${result.error}`;
      } else {
        message = `✅ تم الانتهاء من المزامنة الشاملة بنجاح!\n* إجمالي الأعضاء الذين تم فحصهم: **${result.processed}**\n* التغييرات المطبقة: **${result.changed}**\n* الأخطاء: **${result.errors}**`;
      }

      // 3. تحديث الرسالة بالنتيجة
      await editInteractionResponse(appId, interactionToken, { content: message });
    } catch (err) {
      console.error('[Gateway] Error in slash command sync:', err.message);
      await editInteractionResponse(appId, interactionToken, { content: `❌ حدث خطأ فادح: ${err.message}` });
    }
  }
}

module.exports = { startGateway };
