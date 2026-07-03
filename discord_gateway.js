// =====================================================================
// discord_gateway.js — اتصال Discord Gateway للظهور أونلاين
// =====================================================================
// يُنشئ اتصال WebSocket دائم مع Discord Gateway ليُظهر البوت أونلاين.
// يُعاد الاتصال تلقائياً عند الانقطاع.
// =====================================================================

const WebSocket = require('ws');

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

function startGateway(botToken) {
  if (!botToken) {
    console.error('[Gateway] ❌ لا يوجد DISCORD_TOKEN!');
    return;
  }
  connectGateway(botToken);
}

module.exports = { startGateway };
