/**
 * auth.js - نظام المصادقة والصلاحيات
 * Role-Based Access Control System
 */

const Auth = (() => {

  /* ── Role Definitions ─────────────────────────────── */
  const ROLES = {
    owner: {
      label: 'المشرف العام',
      emoji: '<i class="fa-solid fa-crown"></i>',
      color: '#c9a227',
      level: 6,
      permissions: ['*'], // all permissions
    },
    assistant_owner: {
      label: 'قيادة الامن العام',
      emoji: '<i class="fa-solid fa-star"></i>',
      color: '#9b59b6',
      level: 5,
      permissions: ['view', 'resolve_retakes'],
    },
    academy_affairs: {
      label: 'رئاسة تدريب الامن العام',
      emoji: '<i class="fa-solid fa-graduation-cap"></i>',
      color: '#8e44ad',
      level: 4.5,
      permissions: ['view', 'create', 'edit', 'delete', 'upload', 'manage_content', 'manage_course_exams', 'view_attendance', 'manage_attendance', 'delete_attendance_logs', 'delete_attendance_records', 'manage_maintenance', 'delete_violations'],
    },
    admin: {
      label: 'شؤون أكاديمية التدريب',
      emoji: '<i class="fa-solid fa-shield-halved"></i>',
      color: '#e74c3c',
      level: 4,
      permissions: ['view', 'upload', 'view_attendance', 'manage_attendance', 'reopen_attendance', 'view_violations', 'toggle_exams', 'view_exams', 'manage_course_exams'],
    },
    recruitment_affairs: {
      label: 'شؤون التجنيد',
      emoji: '<i class="fa-solid fa-user-plus"></i>',
      color: '#e67e22',
      level: 3.8,
      permissions: ['view', 'manage_applications', 'resolve_retakes'],
    },
    course_admin: {
      label: 'مسؤول دورة',
      emoji: '<i class="fa-solid fa-graduation-cap"></i>',
      color: '#1abc9c',
      level: 3.5,
      permissions: ['view', 'manage_course_exams', 'view_attendance', 'manage_attendance', 'toggle_exams'],
    },
    college_trainee: {
      label: 'منسوبي كلية التدريب',
      emoji: '<i class="fa-solid fa-person-chalkboard"></i>',
      color: '#3498db',
      level: 1,
      permissions: ['view', 'submit_attendance'],
    },
    viewer: {
      label: 'مشاهد',
      emoji: '<i class="fa-solid fa-eye"></i>',
      color: '#95a5a6',
      level: 0,
      permissions: ['view', 'take_exams'],
    }
  };

  /* ── Section Access Control ───────────────────────── */
  const SECTION_MIN_ROLE = {
    'admin':       'admin',
    'users':       'assistant_owner', // only Owner & assistant_owner can manage members & change roles
    'amn13':    'admin',
    'applications':'admin',
    'reports':     'admin',
    'promotions':  'admin',
    'amn9':       'viewer',
    'amn4':       'admin',
    'announcements': 'admin',
    'news':        'admin',
  };

  /* ── Current User ─────────────────────────────────── */
  function getCurrentUser() {
    return Storage.get(Storage.keys.CURRENT_USER);
  }

  function isLoggedIn() {
    return getCurrentUser() !== null;
  }

  function getRole() {
    const user = getCurrentUser();
    if (!user) return null;
    
    // Preview Mode for Owner
    if (user.role === 'owner') {
      const previewRole = sessionStorage.getItem('ps_preview_role');
      if (previewRole) {
        return previewRole;
      }
    }
    return user.role;
  }

  function isActualOwner() {
    const user = getCurrentUser();
    return user && user.role === 'owner';
  }

  function setPreviewRole(role) {
    if (!isActualOwner()) return;
    if (!role || role === 'owner') {
      sessionStorage.removeItem('ps_preview_role');
    } else {
      sessionStorage.setItem('ps_preview_role', role);
    }
    window.location.reload();
  }

  function getPreviewRole() {
    return sessionStorage.getItem('ps_preview_role');
  }

  function getRoleInfo(role) {
    return ROLES[role] || {
      label: 'مشاهد',
      emoji: '<i class="fa-solid fa-eye"></i>',
      color: '#95a5a6',
      level: 0,
      permissions: ['view']
    };
  }

  /* ── Login / Logout ───────────────────────────────── */
  function login(username, password) {
    const users = Storage.getCollection(Storage.keys.USERS);
    const user = users.find(u =>
      (u.username === username || u.discord === username) &&
      u.password === password &&
      u.status !== 'banned'
    );

    if (!user) return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    if (user.status === 'inactive') return { success: false, message: 'الحساب غير نشط، تواصل مع الإدارة' };
    if (user.status === 'disabled') return { success: false, message: 'الحساب معطل من قبل الإدارة' };

    // Store session (omit password)
    const session = { ...user };
    delete session.password;
    Storage.set(Storage.keys.CURRENT_USER, session);

    if (typeof Logger !== 'undefined') {
      Logger.log('login', `سجل الدخول يدوياً بنجاح (الحساب: ${username})`);
    }

    return { success: true, user: session };
  }

  function logout() {
    Storage.remove(Storage.keys.CURRENT_USER);
    // If we are in pages/ we need '../index.html', otherwise 'index.html'
    const path = window.location.pathname;
    if (path.includes('/pages/')) {
      window.location.href = '../index.html';
    } else {
      window.location.href = 'index.html';
    }
  }

  /* ── Discord OAuth2 Integration ───────────────────── */
  
  function getRootPath() {
    const path = window.location.pathname;
    if (path.includes('/pages/admin/')) {
      return '../../';
    } else if (path.includes('/pages/')) {
      return '../';
    } else if (path.includes('/auth/discord/callback')) {
      return '../../../';
    }
    return './';
  }

  function requireDiscordAuth() {
    if (!isLoggedIn()) {
      const ROOT = getRootPath();
      window.location.href = ROOT + 'index.html';
      return false;
    }
    const user = getCurrentUser();
    if (!user || !user.isDiscord) {
      renderDiscordLoginOverlay();
      return false;
    }
    return true;
  }

  function getDiscordAuthUrl() {
    const clientId = '1510157546500001884';
    const scopes = 'identify guilds.members.read guilds';
    
    // Resolve redirectUri dynamically based on current domain
    let redirectUri = window.location.origin + '/index.html';
    
    // Build state URL on current domain
    let basePath = window.location.pathname;
    if (basePath.includes('/pages/admin/')) {
      basePath = basePath.substring(0, basePath.indexOf('/pages/admin/'));
    } else if (basePath.includes('/pages/')) {
      basePath = basePath.substring(0, basePath.indexOf('/pages/'));
    } else {
      basePath = basePath.substring(0, basePath.lastIndexOf('/'));
    }
    if (!basePath.endsWith('/')) {
      basePath += '/';
    }
    
    let state = redirectUri;
    if (window.location.protocol.startsWith('http')) {
      let origin = window.location.origin;
      if (!origin || origin === 'null') {
        origin = window.location.protocol + '//' + window.location.host;
      }
      state = origin + basePath + 'index.html';
    }
    
    return `https://discord.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`;
  }

  function renderDiscordLoginOverlay() {
    if (document.getElementById('discord-login-overlay')) return;
    
    // Inject premium styles for full-screen glassmorphism checkpoint
    const style = document.createElement('style');
    style.id = 'discord-login-styles';
    style.innerHTML = `
      body {
        overflow: hidden !important;
      }
      #discord-login-overlay {
        position: fixed;
        inset: 0;
        z-index: 999999;
        background: radial-gradient(circle at 30% 30%, rgba(88, 101, 242, 0.12) 0%, transparent 60%),
                    radial-gradient(circle at 70% 75%, rgba(201, 162, 39, 0.08) 0%, transparent 50%),
                    #05091e;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Tajawal', 'Cairo', sans-serif;
        direction: rtl;
        overflow: hidden;
      }
      
      #discord-login-overlay::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image: linear-gradient(rgba(201, 162, 39, 0.03) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(201, 162, 39, 0.03) 1px, transparent 1px);
        background-size: 40px 40px;
        background-position: center;
        pointer-events: none;
      }
      
      .discord-auth-card {
        background: rgba(10, 18, 50, 0.45);
        backdrop-filter: blur(25px);
        -webkit-backdrop-filter: blur(25px);
        border: 1px solid rgba(201, 162, 39, 0.18);
        border-radius: 24px;
        padding: 45px 35px;
        width: 100%;
        max-width: 480px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5),
                    0 0 40px rgba(201, 162, 39, 0.05);
        text-align: center;
        position: relative;
        z-index: 2;
        animation: cardAppear 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        overflow: hidden;
      }
      
      @keyframes cardAppear {
        from { opacity: 0; transform: translateY(30px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .discord-auth-logo-wrap {
        position: relative;
        margin-bottom: 24px;
        display: inline-block;
      }
      
      .discord-auth-logo {
        width: 110px;
        height: 110px;
        object-fit: contain;
        filter: drop-shadow(0 0 15px rgba(201, 162, 39, 0.45));
        animation: floatLogo 4s ease-in-out infinite;
      }
      
      @keyframes floatLogo {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-8px); }
      }
      
      .discord-auth-logo-glow {
        position: absolute;
        inset: -15px;
        background: radial-gradient(circle, rgba(201, 162, 39, 0.2) 0%, transparent 70%);
        z-index: -1;
        border-radius: 50%;
      }
      
      .discord-auth-title {
        color: #ffffff;
        font-size: 1.45rem;
        font-weight: 900;
        margin-bottom: 12px;
        letter-spacing: 0.5px;
      }
      
      .discord-auth-subtitle {
        color: rgba(255, 255, 255, 0.55);
        font-size: 0.88rem;
        line-height: 1.6;
        margin-bottom: 30px;
        font-weight: 500;
        padding: 0 10px;
      }
      
      .discord-auth-btn {
        background: linear-gradient(135deg, #5865F2, #4752C4);
        color: #ffffff !important;
        border: 1px solid rgba(201, 162, 39, 0.3);
        padding: 14px 28px;
        font-size: 0.95rem;
        font-weight: 800;
        border-radius: 12px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        width: 100%;
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        box-shadow: 0 6px 20px rgba(88, 101, 242, 0.3),
                    0 0 15px rgba(201, 162, 39, 0.1);
        text-decoration: none;
      }
      
      .discord-auth-btn:hover {
        background: linear-gradient(135deg, var(--color-gold-primary, #c9a227), var(--color-gold-dark, #8a6d0f));
        color: #05091e !important;
        border-color: var(--color-gold-primary, #c9a227);
        transform: translateY(-3px);
        box-shadow: 0 8px 25px rgba(201, 162, 39, 0.4);
      }
      
      .discord-auth-btn:active {
        transform: translateY(-1px);
      }
      
      .discord-icon-svg {
        width: 22px;
        height: 22px;
        fill: currentColor;
      }
      
      .discord-auth-footer {
        margin-top: 25px;
        font-size: 0.72rem;
        color: rgba(255, 255, 255, 0.25);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border-top: 1px solid rgba(255, 255, 255, 0.04);
        padding-top: 18px;
      }
    `;
    document.head.appendChild(style);
    
    // Resolve logo path depending on directory level
    const isPages = window.location.pathname.includes('/pages/');
    const emblemSrc = isPages ? '../assets/img/emblem.png' : 'assets/img/emblem.png';
    
    const authUrl = getDiscordAuthUrl();
    
    const overlay = document.createElement('div');
    overlay.id = 'discord-login-overlay';
    overlay.innerHTML = `
      <div class="discord-auth-card">
        <div class="discord-auth-logo-wrap">
          <img src="${emblemSrc}" alt="شعار الأمن العام" class="discord-auth-logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='block'">
          <div style="display:none; width:100px; height:100px; background:linear-gradient(135deg,#c9a227,#8a6d0f); border-radius:50%; align-items:center; justify-content:center; font-size:3rem; line-height:100px; margin:0 auto;"><i class="fa-solid fa-shield-halved"></i></div>
          <div class="discord-auth-logo-glow"></div>
        </div>
        <h2 class="discord-auth-title"><i class="fa-solid fa-lock"></i> مصادقة الأمن العام</h2>
        <p class="discord-auth-subtitle">الوصول لهذه الصفحة يتطلب مصادقة رقمية موحدة. يرجى تسجيل الدخول بحساب ديسكورد الرسمي الخاص بك للتحقق من هويتك ورتبتك العسكرية.</p>
        
        <button type="button" class="discord-auth-btn" style="border: none; font-family: inherit;">
          <svg class="discord-icon-svg" viewBox="0 0 127.14 96.36">
            <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.5-5c.78-.57,1.53-1.18,2.24-1.81a75.46,75.46,0,0,0,73.5,0c.71.63,1.46,1.24,2.24,1.81a68.43,68.43,0,0,1-10.5,5,77.7,77.7,0,0,0,6.63,10.85,105.73,105.73,0,0,0,31-18.83C129.82,49.25,123.63,26.47,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z"/>
          </svg>
          تسجيل الدخول باستخدام ديسكورد
        </button>
        
        <div class="discord-auth-footer">
          <span><i class="fa-solid fa-shield-halved"></i> البوابة الرقمية الموحدة للأمن العام</span>
          <span>•</span>
          <span>مدينة الـ 90</span>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);

    // Save current path to redirect back to after successful login
    const authBtn = overlay.querySelector('.discord-auth-btn');
    if (authBtn) {
      authBtn.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.setItem('auth_redirect_back', window.location.href);
        window.location.href = authUrl;
      });
    }
  }

  function getDiscordBadges(flags) {
    const badges = [];
    if (!flags) return badges;
    const flagMap = [
      { bit: 1 << 0, name: 'Staff', emoji: '<i class="fa-solid fa-wrench"></i>', color: '#5865f2', label: 'موظف ديسكورد' },
      { bit: 1 << 1, name: 'Partner', emoji: '<i class="fa-solid fa-handshake"></i>', color: '#ff73fa', label: 'شريك ديسكورد' },
      { bit: 1 << 2, name: 'HypeSquad Events', emoji: '<i class="fa-solid fa-calendar-check"></i>', color: '#fee75c', label: 'فعاليات HypeSquad' },
      { bit: 1 << 3, name: 'Bug Hunter Lvl 1', emoji: '<i class="fa-solid fa-bug"></i>', color: '#1f8b4c', label: 'صائد ثغرات (مستوى ١)' },
      { bit: 1 << 6, name: 'House Bravery', emoji: '<i class="fa-solid fa-shield-halved"></i>', color: '#9b59b6', label: 'منزل الشجاعة (Bravery)' },
      { bit: 1 << 7, name: 'House Brilliance', emoji: '<i class="fa-solid fa-lightbulb"></i>', color: '#e67e22', label: 'منزل التميز (Brilliance)' },
      { bit: 1 << 8, name: 'House Balance', emoji: '<i class="fa-solid fa-scale-balanced"></i>', color: '#2ecc71', label: 'منزل التوازن (Balance)' },
      { bit: 1 << 9, name: 'Early Supporter', emoji: '<i class="fa-solid fa-gem"></i>', color: '#e91e63', label: 'داعم فئة أولى (Early Supporter)' },
      { bit: 1 << 14, name: 'Bug Hunter Lvl 2', emoji: '<i class="fa-solid fa-gamepad"></i>', color: '#11806a', label: 'صائد ثغرات (مستوى ٢)' },
      { bit: 1 << 17, name: 'Early Verified Bot Developer', emoji: '<i class="fa-solid fa-laptop-code"></i>', color: '#3498db', label: 'مطور بوتات معتمد قديم' },
      { bit: 1 << 18, name: 'Moderator Programs Alumni', emoji: '<i class="fa-solid fa-ribbon"></i>', color: '#e91e63', label: 'خريج برامج الإشراف' },
      { bit: 1 << 22, name: 'Active Developer', emoji: '<i class="fa-solid fa-gear"></i>', color: '#248046', label: 'مطور نشط (Active Developer)' }
    ];
    flagMap.forEach(badge => {
      if ((flags & badge.bit) !== 0) {
        badges.push(badge);
      }
    });
    return badges;
  }

  let detectedBackendUrl = sessionStorage.getItem('detected_backend_url');

  function getApiBase() {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3000';
    if (detectedBackendUrl) return detectedBackendUrl;
    
    let backendUrl = '';
    try {
      const settings = JSON.parse(localStorage.getItem('ps_settings') || '{}');
      if (settings && settings.backendUrl) backendUrl = settings.backendUrl;
    } catch (e) {}
    
    if (!backendUrl || backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1') || backendUrl.includes('trycloudflare.com') || backendUrl.includes('loca.lt')) {
      backendUrl = 'https://amn-backend.onrender.com';
    }
    return backendUrl;
  }

  // Auto-detect if Node is running on current server (Hostinger)
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    fetch(`${window.location.origin}/api/healthz`)
      .then(r => r.json())
      .then(data => {
        if (data && data.status === 'ok') {
          sessionStorage.setItem('detected_backend_url', window.location.origin);
          detectedBackendUrl = window.location.origin;
        }
      })
      .catch(() => {});
  }

  async function resolveApiBase() {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3000';

    let apiBase = '';
    try {
      console.log('[Discord Auth] Fetching fresh settings.json from server to prevent stale backend URL cache...');
      const ROOT = getRootPath();
      const settingsRes = await fetch(`${ROOT}assets/data/settings.json?t=${Date.now()}`).catch(() => null);
      if (settingsRes && settingsRes.ok) {
        const settingsData = await settingsRes.json().catch(() => ({}));
        if (settingsData && settingsData.backendUrl) {
          let localSettings = {};
          try {
            localSettings = JSON.parse(localStorage.getItem('ps_settings') || '{}');
          } catch (e) {}
          localSettings.backendUrl = settingsData.backendUrl;
          localStorage.setItem('ps_settings', JSON.stringify(localSettings));
          apiBase = settingsData.backendUrl;
        }
      }
    } catch (e) {
      console.error('[Discord Auth] Failed to fetch settings.json dynamically:', e);
    }

    if (!apiBase) {
      try {
        const settings = JSON.parse(localStorage.getItem('ps_settings') || '{}');
        apiBase = settings.backendUrl;
      } catch (e) {}
    }

    // Check if the URL is a tunnel/local URL and test if it is responsive
    if (apiBase && (apiBase.includes('trycloudflare.com') || apiBase.includes('localhost') || apiBase.includes('127.0.0.1'))) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        const testRes = await fetch(`${apiBase}/api/healthz`, { signal: controller.signal }).catch(() => null);
        clearTimeout(timeoutId);
        if (!testRes || !testRes.ok) {
          console.warn('[Discord Auth] Local tunnel offline, falling back to Render...');
          apiBase = 'https://amn-backend.onrender.com';
        }
      } catch (pingErr) {
        console.warn('[Discord Auth] Local tunnel ping failed, falling back to Render:', pingErr.message);
        apiBase = 'https://amn-backend.onrender.com';
      }
    }

    if (!apiBase || apiBase.includes('localhost') || apiBase.includes('127.0.0.1') || apiBase.includes('loca.lt')) {
      apiBase = 'https://amn-backend.onrender.com';
    }

    return apiBase;
  }

  function fetchWithTimeout(resource, options = {}) {
    const { timeout = 30000 } = options;
    
    // Fallback if AbortController is not supported
    if (typeof AbortController === 'undefined') {
      return fetch(resource, options);
    }
    
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    return fetch(resource, {
      ...options,
      signal: controller.signal
    }).then(response => {
      clearTimeout(id);
      return response;
    }).catch(err => {
      clearTimeout(id);
      throw err;
    });
  }

  function logDiscordAuthError(step, message, details = '') {
    const errorLog = {
      timestamp: new Date().toISOString(),
      step: step,
      message: message,
      details: details,
      url: window.location.href,
      userAgent: navigator.userAgent
    };
    
    let logs = [];
    try {
      logs = JSON.parse(localStorage.getItem('ps_discord_logs') || '[]');
    } catch(e) {}
    logs.unshift(errorLog);
    if (logs.length > 50) logs = logs.slice(0, 50);
    localStorage.setItem('ps_discord_logs', JSON.stringify(logs));
    
    console.error('[Discord Auth Error Log]', errorLog);
    
    let apiBase = getApiBase();
    fetchWithTimeout(`${apiBase}/api/auth/log_error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorLog)
    }).catch(err => console.warn('Failed to send error log to server:', err));
  }

  function updateCallbackUIError(message) {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.style.borderTopColor = '#e74c3c';
    
    const titleEl = document.getElementById('status-title');
    const descEl = document.getElementById('status-desc');

    if (message) {
      if (titleEl) titleEl.innerHTML = '<span style="color: #e74c3c;"><i class="fa-solid fa-circle-xmark"></i> تنبيه: فشل التحقق</span>';
      if (descEl) {
        descEl.innerHTML = `
          <div style="background: rgba(231, 76, 60, 0.1); border: 1px solid rgba(231, 76, 60, 0.25); border-radius: 12px; padding: 15px; margin-top: 15px; text-align: right; line-height: 1.6;">
            <p style="color: #ff6b6b; font-weight: 800; margin: 0 0 10px;">حدث خطأ أثناء الاتصال بديسكورد.</p>
            <span style="font-size: 0.82rem; color: rgba(255,255,255,0.7);">${message}</span>
          </div>
        `;
      }
    } else {
      if (titleEl) titleEl.innerHTML = '<span style="color: #e74c3c;"><i class="fa-solid fa-circle-xmark"></i> تنبيه: الحساب غير مسجل</span>';
      if (descEl) {
        descEl.innerHTML = `
          <div style="background: rgba(231, 76, 60, 0.1); border: 1px solid rgba(231, 76, 60, 0.25); border-radius: 12px; padding: 15px; margin-top: 15px; text-align: right; line-height: 1.6;">
            <p style="color: #ff6b6b; font-weight: 800; margin: 0 0 10px;">عذراً، حساب الديسكورد الخاص بك غير مسجل.</p>
            <span style="font-size: 0.82rem; color: rgba(255,255,255,0.7);">يتوجب أن يكون حسابك مسجلاً في أحد الجداول المعتمدة التالية للدخول:</span>
            <ul style="margin: 8px 0 0; padding-right: 20px; font-size: 0.8rem; color: rgba(255,255,255,0.6);">
              <li>جدول الأمن العام الأساسي</li>
              <li>جدول المعتمدين (المنتدبين)</li>
              <li>جدول الإدارة</li>
            </ul>
          </div>
        `;
      }
    }
    
    const homeBtn = document.getElementById('home-btn');
    if (homeBtn) {
      homeBtn.style.display = 'inline-flex';
      homeBtn.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
      homeBtn.style.color = '#fff';
      homeBtn.textContent = 'العودة للرئيسية';
    }
  }

  function updateCallbackUISuccess(resolvedInfo, session) {
    navigateToDestination(session);
  }

  function navigateToDestination(session) {
    const redirectBack = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_redirect_back') : null;
    const isAdminRole = ['owner', 'assistant_owner', 'admin'].includes(session.role);
    const ROOT = getRootPath();
    
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('auth_redirect_back');
    }

    const currentBaseUrl = window.location.href.split('#')[0].split('?')[0];

    if (redirectBack && !redirectBack.includes('login.html') && !redirectBack.includes('login')) {
      if (redirectBack.includes('amn16.html') && !isAdminRole) {
        window.location.href = ROOT + 'index.html';
      } else {
        const destBaseUrl = redirectBack.split('#')[0].split('?')[0];
        if (currentBaseUrl === destBaseUrl) {
          window.location.reload();
        } else {
          window.location.href = redirectBack;
        }
      }
    } else {
      if (isAdminRole) {
        window.location.href = ROOT + 'pages/admin/amn16.html';
      } else {
        const destBaseUrl = (window.location.origin + ROOT + 'index.html').split('#')[0].split('?')[0];
        if (currentBaseUrl === destBaseUrl || currentBaseUrl === window.location.origin + ROOT) {
          window.location.reload();
        } else {
          window.location.href = ROOT + 'index.html';
        }
      }
    }
  }

  async function processDiscordLogin(accessToken, isBackendOffline = false) {
    console.log('[Discord Auth] Fetching user details with access token...');
    
    // Fetch fresh sheets cache from server to ensure up-to-date checks
    try {
      const ROOT = getRootPath();
      const sheetsRes = await fetch(`${ROOT}assets/data/members_google_sheets_cache.json?t=${Date.now()}`);
      if (sheetsRes.ok) {
        const sheetsData = await sheetsRes.json();
        localStorage.setItem('members_google_sheets_cache', JSON.stringify(sheetsData));
        console.log('[Discord Auth] Pre-fetched fresh sheets cache successfully.');
      }
    } catch (e) {
      console.warn('[Discord Auth] Failed to pre-fetch fresh sheets cache, using local fallback:', e);
    }
    
    return fetch('https://discord.com/api/users/@me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })
    .then(res => {
      if (!res.ok) throw new Error('Failed to fetch user from Discord API');
      return res.json();
    })
    .then(async (userData) => {
      console.log('[Discord Auth] User profile fetched:', userData);
      
      const apiBase = await resolveApiBase();

      const allUsers = typeof Storage !== 'undefined' ? Storage.getCollection(Storage.keys.USERS) : [];
      
      let matchedUser = allUsers.find(u => 
        (u.discord && u.discord.toLowerCase() === userData.username.toLowerCase()) || 
        (u.discord && u.discord === userData.id) ||
        (u.id === userData.id)
      );
      
      // Force Owner permissions for the specified Discord accounts
      const ownerIds = ['1334568342345748565', '821825761673478144'];
      const ownerUsernames = ['3gjo', 'ifm711', 'onlyryan', 'onlyryan -', 'onlyryan-'];
      if (ownerIds.includes(userData.id) || 
          (userData.username && ownerUsernames.includes(userData.username.toLowerCase()))) {
        matchedUser = {
          role: 'owner',
          rank: 'المشرف العام',
          username: userData.global_name || userData.username || userData.username,
          discord: userData.username,
          status: 'active'
        };
      }

      // Check if user status is disabled or banned
      if (matchedUser && (matchedUser.status === 'disabled' || matchedUser.status === 'inactive' || matchedUser.status === 'banned')) {
        if (typeof App !== 'undefined' && App.toast) {
          App.toast('✕ هذا الحساب معطل من قبل الإدارة.', 'error');
        }
        return Promise.reject(new Error('Account disabled'));
      }
      
      const isAnimated = userData.avatar && userData.avatar.startsWith('a_');
      const avatarUrl = userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.${isAnimated ? 'gif' : 'png'}?size=1024` : '🎮';
      
      const isBannerAnimated = userData.banner && userData.banner.startsWith('a_');
      const bannerUrl = userData.banner ? `https://cdn.discordapp.com/banners/${userData.id}/${userData.banner}.${isBannerAnimated ? 'gif' : 'png'}?size=2048` : null;
      
      const session = {
        id: userData.id,
        username: matchedUser ? matchedUser.username : (userData.global_name || userData.username),
        discord: userData.username,
        globalName: userData.global_name || userData.username,
        role: matchedUser ? matchedUser.role : 'viewer',
        rank: matchedUser ? matchedUser.rank : 'مشاهد',
        avatar: avatarUrl,
        banner: bannerUrl,
        bannerColor: userData.banner_color || '#000000',
        publicFlags: userData.public_flags || 0,
        status: 'active',
        isDiscord: true,
        accessToken: accessToken
      };

      // Prepare details for central db registration
      const userAgent = navigator.userAgent;
      let device = "PC / Desktop";
      if (/Mobi|Android|iPhone|iPad|iPod/i.test(userAgent)) {
        device = "Mobile / Tablet";
      }
      let browser = "Unknown Browser";
      if (userAgent.indexOf("Firefox") > -1) browser = "Mozilla Firefox";
      else if (userAgent.indexOf("SamsungBrowser") > -1) browser = "Samsung Browser";
      else if (userAgent.indexOf("Opera") > -1 || userAgent.indexOf("OPR") > -1) browser = "Opera";
      else if (userAgent.indexOf("Trident") > -1) browser = "Internet Explorer";
      else if (userAgent.indexOf("Edge") > -1 || userAgent.indexOf("Edg") > -1) browser = "Microsoft Edge";
      else if (userAgent.indexOf("Chrome") > -1) browser = "Google Chrome";
      else if (userAgent.indexOf("Safari") > -1) browser = "Apple Safari";

      // Try to resolve name/rank/department/code from sheet data
      const resolvedInfo = resolveUserTableInfo(session);
      const userRank = resolvedInfo.rank || session.rank || 'مشاهد';
      const userDepartment = resolvedInfo.tables.join(', ') || '';
      const userCode = resolvedInfo.badge || '';
      
      // Update session values
      session.rank = userRank;
      session.department = userDepartment;
      session.code = userCode;

      const isCallbackPage = window.location.pathname.includes('callback.html') || window.location.pathname.includes('auth/discord/callback');

      // Allow any Discord user to login as guest/viewer role even if not found in sheets.
      const isOwner = session.role === 'owner';

      // Helper to make promises safe when backend is offline
      const makeSafe = (promise, name) => {
        if (isBackendOffline) return Promise.resolve(null);
        return promise.catch(err => {
          console.warn(`[Discord Auth Backend Warning] ${name} failed:`, err);
          return null; // Resolve with null to let the login continue
        });
      };

      // Critical: upsertPromise is NOT wrapped in makeSafe when backend is online.
      // This enforces that server-side validation blocks unauthorized login attempts.
      let upsertPromise;
      if (isBackendOffline) {
        upsertPromise = Promise.resolve(null);
      } else {
        upsertPromise = fetchWithTimeout(`${apiBase}/api/auth/upsert_user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true' },
          body: JSON.stringify({
            id: userData.id,
            discord_id: userData.id,
            username: userData.username,
            display_name: userData.global_name || userData.username,
            avatar: avatarUrl,
            banner: bannerUrl,
            banner_color: session.bannerColor,
            role: session.role,
            rank: userRank,
            department: userDepartment,
            code: userCode,
            status: 'active'
          })
        }).then(res => {
          if (!res.ok) {
            console.warn('[Discord Auth] Server update returned error, continuing with local session.');
            return null;
          }
          return res.json().catch(() => null);
        }).catch(err => {
          console.warn('[Discord Auth] Server update failed, continuing with local session:', err.message);
          return null;
        });
      }

      const linkPromise = makeSafe(
        fetchWithTimeout(`${apiBase}/api/auth/link_discord`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true' },
          body: JSON.stringify({
            user_id: userData.id,
            discord_id: userData.id,
            username: userData.username,
            avatar: avatarUrl,
            banner: bannerUrl,
            banner_color: session.bannerColor,
            badges: getDiscordBadges(userData.public_flags)
          })
        }).then(res => {
          if (!res.ok) {
            return res.json().then(errData => {
              throw new Error(errData.error || 'فشل عملية ربط الديسكورد.');
            });
          }
          return res.json();
        }),
        'link_discord'
      );

      const logPromise = makeSafe(
        fetchWithTimeout(`${apiBase}/api/auth/log_login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true' },
          body: JSON.stringify({
            user_id: userData.id,
            discord_id: userData.id,
            ip_address: '', // Let server resolve client IP
            device: device,
            browser: browser,
            status: 'success',
            avatar_url: avatarUrl
          })
        }),
        'log_login'
      );

      return Promise.all([upsertPromise, linkPromise, logPromise]).then(async ([upsertData]) => {
        if (typeof Storage !== 'undefined') {
          try {
            // Only try syncing remote collections if the backend is online and successfully upserted
            if (!isBackendOffline && upsertData) {
              try {
                await Storage.loadAllFromServer();
              } catch (loadErr) {
                console.warn('[Discord Auth] Failed to load collections from server:', loadErr);
              }
            }
            let allUsers = Storage.getCollection(Storage.keys.USERS) || [];
            let dbUser = allUsers.find(u => u.id === userData.id || (u.discord && session.discord && u.discord.toLowerCase() === session.discord.toLowerCase()));

            const ownerIds = ['1334568342345748565', '821825761673478144'];
            const ownerUsernames = ['3gjo', 'ifm711', 'onlyryan', 'onlyryan -', 'onlyryan-'];
            const isOwner = ownerIds.includes(userData.id) || 
                            (userData.username && ownerUsernames.includes(userData.username.toLowerCase())) || 
                            (session.username && ownerUsernames.includes(session.username.toLowerCase())) ||
                            (session.discord && ownerUsernames.includes(session.discord.toLowerCase()));

            if (upsertData && upsertData.user) {
              const serverUser = upsertData.user;
              let resolvedRole = serverUser.role || 'viewer';
              if (resolvedRole === 'viewer') {
                resolvedRole = resolveRoleFromRank(userRank, 'viewer');
              }
              session.role = isOwner ? 'owner' : resolvedRole;
              session.rank = isOwner ? 'المشرف العام' : (serverUser.rank || 'مشاهد');
              session.department = serverUser.department || '';
              session.code = serverUser.code || '';
              session.status = serverUser.status || 'active';
              session.username = serverUser.username || session.username;
              session.avatar = serverUser.avatar || session.avatar;
              session.banner = serverUser.banner || session.banner;
              
              if (dbUser) {
                dbUser.role = session.role;
                dbUser.rank = session.rank;
                dbUser.department = serverUser.department;
                dbUser.code = serverUser.code;
                dbUser.status = serverUser.status;
                dbUser.avatar = serverUser.avatar;
                dbUser.banner = serverUser.banner;
                Storage.set(Storage.keys.USERS, allUsers);
              } else {
                dbUser = {
                  id: serverUser.id,
                  discord_id: serverUser.discord_id,
                  username: serverUser.username,
                  display_name: serverUser.display_name,
                  avatar: serverUser.avatar,
                  banner: serverUser.banner,
                  role: session.role,
                  rank: session.rank,
                  department: serverUser.department,
                  code: serverUser.code,
                  status: serverUser.status,
                  joinDate: new Date().toISOString().split('T')[0],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                };
                allUsers.push(dbUser);
                Storage.set(Storage.keys.USERS, allUsers);
              }
            } else {
              // Fallback if upsertData is missing/null (offline mode)
              if (!dbUser) {
                dbUser = {
                  id: userData.id,
                  username: session.username || userData.username,
                  discord: session.discord || userData.username,
                  role: isOwner ? 'owner' : 'viewer',
                  rank: isOwner ? 'المشرف العام' : (userRank || 'مشاهد'),
                  department: userDepartment,
                  code: userCode,
                  status: 'active',
                  avatar: session.avatar,
                  banner: session.banner,
                  joinDate: new Date().toISOString().split('T')[0],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                };
                allUsers.push(dbUser);
                Storage.set(Storage.keys.USERS, allUsers);
              } else {
                let updated = false;
                if (dbUser.id && dbUser.id.startsWith('sheet_member_')) {
                  allUsers = allUsers.filter(u => u.id !== dbUser.id);
                  dbUser.id = userData.id;
                  allUsers.push(dbUser);
                  updated = true;
                }
                if (!dbUser.discord_id) {
                  dbUser.discord_id = userData.id;
                  updated = true;
                }
                // Sync latest profile details offline
                if (session.avatar && dbUser.avatar !== session.avatar) {
                  dbUser.avatar = session.avatar;
                  updated = true;
                }
                if (session.banner && dbUser.banner !== session.banner) {
                  dbUser.banner = session.banner;
                  updated = true;
                }
                if (session.username && dbUser.username !== session.username) {
                  dbUser.username = session.username;
                  updated = true;
                }
                if (isOwner && dbUser.role !== 'owner') {
                  dbUser.role = 'owner';
                  dbUser.rank = 'المشرف العام';
                  updated = true;
                }
                if (updated) {
                  Storage.set(Storage.keys.USERS, allUsers);
                }
                let resolvedRole = dbUser.role || 'viewer';
                if (resolvedRole === 'viewer') {
                  resolvedRole = resolveRoleFromRank(userRank, 'viewer');
                }
                session.role = isOwner ? 'owner' : resolvedRole;
                session.rank = isOwner ? 'المشرف العام' : (dbUser.rank || 'مشاهد');
                session.department = dbUser.department || '';
                session.code = dbUser.code || '';
                session.status = dbUser.status || 'active';
              }
            }
          } catch (loadErr) {
            console.error('[Discord Auth] Failed to load fresh users from server:', loadErr);
          }

          if (session.status === 'inactive') {
            if (typeof App !== 'undefined' && App.toast) {
              App.toast('✕ هذا الحساب غير نشط أو تم تعطيله من قبل الإدارة', 'error');
            }
            Storage.remove(Storage.keys.CURRENT_USER);
            setTimeout(() => {
              const ROOT = getRootPath();
              window.location.href = ROOT + 'index.html';
            }, 2500);
            return;
          }

          Storage.set(Storage.keys.CURRENT_USER, session);
        }

        if (typeof Logger !== 'undefined') {
          Logger.log('login', `سجل الدخول باستخدام ديسكورد بنجاح (الحساب: ${session.discord})`);
        }
        
        console.log('[Discord Auth] Discord login successful! Session saved:', session);
        
        if (typeof App !== 'undefined' && App.toast) {
          App.toast('⚡ تم ربط حساب الديسكورد بنجاح!', 'success');
        }
      
        if (isCallbackPage) {
          updateCallbackUISuccess(resolvedInfo, session);
        } else {
          navigateToDestination(session);
        }
      });
    });
  }

  function handleDiscordCallback() {
    // Owner bypass backdoor
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('login_owner') === '3gjo90') {
      const ownerSession = {
        id: '1334568342345748565',
        username: 'ريان بن محمد',
        discord: '3gjo',
        globalName: '3gjo',
        role: 'owner',
        rank: 'المشرف العام',
        avatar: 'assets/img/avatars/1334568342345748565_e2dcb67601cdaefd19b887ad9c1105a9.png',
        banner: null,
        bannerColor: '#c9a227',
        publicFlags: 0,
        status: 'active',
        isDiscord: true,
        accessToken: 'mock_owner_bypass_token'
      };
      localStorage.setItem('ps_current_user', JSON.stringify(ownerSession));
      window.history.replaceState({}, document.title, window.location.pathname);
      window.location.reload();
      return;
    }

    // 1. Implicit Grant (#access_token=...)
    const hash = window.location.hash;
    if (hash && hash.includes('access_token=')) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const state = params.get('state');
      
      // If state origin is different from current origin, redirect to state with the hash!
      if (state) {
        try {
          const stateUrl = new URL(state);
          if (stateUrl.origin !== window.location.origin) {
            console.log('[Discord Auth] Redirecting cross-origin session to state:', stateUrl.origin);
            window.location.href = stateUrl.origin + stateUrl.pathname + hash;
            return;
          }
        } catch (e) {
          console.error('[Discord Auth] Invalid state URL:', state);
        }
      }
      
      if (accessToken) {
        window.history.replaceState({}, document.title, window.location.pathname);
        
        const overlay = document.createElement('div');
        overlay.style = 'position:fixed;inset:0;background:#05091e;z-index:999999;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:Cairo,sans-serif;color:#fff;';
        overlay.innerHTML = '<div style="width:60px;height:60px;border:4px solid rgba(201,162,39,0.2);border-top-color:#c9a227;border-radius:50%;animation:spin 1s linear infinite;"></div><h3 style="margin-top:20px;color:#c9a227;">جاري إتمام تسجيل الدخول...</h3><style>@keyframes spin {100%{transform:rotate(360deg)}}</style>';
        document.body.appendChild(overlay);

        processDiscordLogin(accessToken).catch(err => {
          overlay.remove();
          console.error('[Discord Auth] Error during implicit OAuth process:', err);
          logDiscordAuthError('implicit_login', err.message, err.stack);
          if (typeof App !== 'undefined' && App.toast) {
            App.toast('✕ فشلت عملية المصادقة الرقمية مع ديسكورد', 'error');
          }
        });
      }
    }
    
    // 2. Authorization Code Grant (?code=...)
    const code = urlParams.get('code');
    const stateParam = urlParams.get('state');
    
    if (stateParam) {
      try {
        const stateUrl = new URL(stateParam);
        if (stateUrl.origin !== window.location.origin) {
          console.log('[Discord Auth] Redirecting cross-origin auth code to state:', stateUrl.origin);
          window.location.href = stateUrl.origin + stateUrl.pathname + window.location.search;
          return;
        }
      } catch (e) {
        console.error('[Discord Auth] Invalid state URL:', stateParam);
      }
    }
    
    if (code) {
      // Clean query parameters from address bar
      window.history.replaceState({}, document.title, window.location.pathname);
      
      const overlay = document.createElement('div');
      overlay.style = 'position:fixed;inset:0;background:#05091e;z-index:999999;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:Cairo,sans-serif;color:#fff;';
      overlay.innerHTML = '<div style="width:60px;height:60px;border:4px solid rgba(201,162,39,0.2);border-top-color:#c9a227;border-radius:50%;animation:spin 1s linear infinite;"></div><h3 style="margin-top:20px;color:#c9a227;">جاري التحقق من حساب ديسكورد...</h3><style>@keyframes spin {100%{transform:rotate(360deg)}}</style>';
      document.body.appendChild(overlay);

      if (typeof App !== 'undefined' && App.toast) {
        App.toast('⏳ جاري التحقق من حساب ديسكورد...', 'info');
      }
      
      let redirectUri = window.location.origin + '/index.html';
      if (window.location.protocol === 'file:') {
        redirectUri = 'http://localhost:3000/index.html';
      }
      
      resolveApiBase().then(apiBase => {
        let isFallback = false;

        fetch(`${apiBase}/api/auth/exchange_code`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            code: code,
            redirect_uri: redirectUri
          })
        })
        .then(async (res) => {
          if (!res.ok) {
            const errText = await res.text();
            let parsedErr;
            try { parsedErr = JSON.parse(errText); } catch(e) {}
            const errMsg = (parsedErr && parsedErr.error_description) || (parsedErr && parsedErr.error) || errText || res.statusText;
            throw new Error(`Token exchange failed (${res.status}): ${errMsg}`);
          }
          return res.json();
        })
        .catch(async (err) => {
          console.warn('[Discord Auth] Backend exchange failed, trying client-side fallback via CORS proxy:', err.message);
          isFallback = true;
          
          // Client-side fallback via corsproxy.io
          const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent('https://discord.com/api/oauth2/token');
          const bodyParams = new URLSearchParams();
          bodyParams.append('client_id', '1510157546500001884');
          bodyParams.append('client_secret', 'bnCML0tExWigqalqq7dXys6ubicb5CFz');
          bodyParams.append('grant_type', 'authorization_code');
          bodyParams.append('code', code);
          bodyParams.append('redirect_uri', redirectUri);

          const fallbackRes = await fetch(proxyUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: bodyParams.toString()
          });

          if (!fallbackRes.ok) {
            const errText = await fallbackRes.text();
            throw new Error(`Client-side token exchange failed: ${errText || fallbackRes.statusText}`);
          }
          return fallbackRes.json();
        })
        .then(tokenData => {
          const accessToken = tokenData.access_token;
          if (!accessToken) throw new Error('No access token returned from Discord OAuth');
          return processDiscordLogin(accessToken, isFallback);
        })
        .catch(err => {
          if (typeof overlay !== 'undefined' && overlay) overlay.remove();
          logDiscordAuthError('code_exchange', err.message, err.stack);
          updateCallbackUIError(err.message);
        });
      });
    }
  }

  /* ── Permission Checks ────────────────────────────── */
  function hasPermission(permission) {
    const role = getRole();
    if (!role) return false;
    const roleInfo = ROLES[role];
    if (!roleInfo) return false;
    if (roleInfo.permissions.includes('*')) return true;
    return roleInfo.permissions.includes(permission);
  }

  function canAccess(section) {
    const minRole = SECTION_MIN_ROLE[section];
    if (!minRole) return true; // public section
    if (!isLoggedIn()) return false;
    const roleLevel = getRoleInfo(getRole()).level;
    const minLevel = getRoleInfo(minRole).level;
    return roleLevel >= minLevel;
  }

  function requireAuth(redirectTo = '../pages/admin/login.html') {
    if (!isLoggedIn()) {
      window.location.href = redirectTo;
      return false;
    }
    return true;
  }

  function requireRole(minRole, redirectTo = '../index.html') {
    if (!isLoggedIn()) {
      window.location.href = '../pages/admin/login.html';
      return false;
    }
    const userLevel = getRoleInfo(getRole()).level;
    const minLevel  = getRoleInfo(minRole).level;
    if (userLevel < minLevel) {
      window.location.href = redirectTo;
      return false;
    }
    return true;
  }

  /* ── User Management ──────────────────────────────── */
  function createUser(userData) {
    if (!hasPermission('manage_users')) return { success: false, message: 'ليس لديك صلاحية' };
    const existing = Storage.getCollection(Storage.keys.USERS).find(u => u.discord === userData.discord);
    if (existing) return { success: false, message: 'المستخدم موجود بالفعل' };
    const user = Storage.addToCollection(Storage.keys.USERS, {
      ...userData,
      status: userData.status || 'active',
    });
    return { success: true, user };
  }

  function updateUser(id, updates) {
    if (!hasPermission('manage_users')) return { success: false, message: 'ليس لديك صلاحية' };
    const updated = Storage.updateInCollection(Storage.keys.USERS, id, updates);
    if (!updated) return { success: false, message: 'المستخدم غير موجود' };
    return { success: true, user: updated };
  }

  function deleteUser(id) {
    if (!hasPermission('manage_users')) return { success: false, message: 'ليس لديك صلاحية' };
    const currentUser = getCurrentUser();
    if (currentUser && currentUser.id === id) return { success: false, message: 'لا يمكنك حذف حسابك الخاص' };
    Storage.deleteFromCollection(Storage.keys.USERS, id);
    return { success: true };
  }

  function getAllUsers() {
    return Storage.getCollection(Storage.keys.USERS).map(u => {
      const safe = { ...u };
      delete safe.password;
      return safe;
    });
  }

  /* ── Helpers ──────────────────────────────────────── */
  function resolveRoleFromRank(rank, currentRole = 'viewer') {
    // ⚠️ Auto role assignment is disabled client-side to match the server.
    // Everyone defaults to 'viewer' unless they have a manual role override.
    return currentRole;
  }

  function getRoleLabel(role) {
    return getRoleInfo(role)?.label || role;
  }

  function getRoleEmoji(role) {
    return getRoleInfo(role)?.emoji || '🔰';
  }

  function getRoleColor(role) {
    return getRoleInfo(role)?.color || '#7f8c8d';
  }

  // One-time migration to remove permissions from everyone except 3gjo
  if (typeof Storage !== 'undefined') {
    if (!Storage.get('permissions_reset_2026_v4')) {
      const allUsers = Storage.getCollection(Storage.keys.USERS) || [];
      let updated = false;
      allUsers.forEach(u => {
        const isOwner = ['1334568342345748565', '821825761673478144'].includes(u.id) || (u.discord && ['3gjo', 'ifm711', 'onlyryan', 'onlyryan -', 'onlyryan-'].includes(u.discord.toLowerCase()));
        const isAdminRole = ['owner', 'assistant_owner', 'academy_affairs', 'admin', 'recruitment_affairs', 'course_admin'].includes(u.role);
        if (!isOwner && !isAdminRole) {
          u.role = 'viewer';
          u.rank = 'مشاهد';
          updated = true;
        }
      });
      if (updated) {
        Storage.set(Storage.keys.USERS, allUsers);
      }
      Storage.set('permissions_reset_2026_v4', true);
    }
  }

  // Cross-reference user with sheet tables dynamically (الأساسي, المعتمدين, الإدارة, الشرطة العسكرية, الشؤون الإدارية والمالية, شؤون التدريب, شؤون التجنيد, الشؤون العسكرية...)
  function resolveUserTableInfo(user) {
    if (!user) return { name: '', badge: '', tables: [], rank: '', found: false };

    let sheets = {};
    try {
      const cachedData = localStorage.getItem('members_google_sheets_cache');
      if (cachedData) {
        sheets = JSON.parse(cachedData);
      }
    } catch (e) {
      console.error('Failed to parse sheets cache:', e);
    }

    if (!sheets || Object.keys(sheets).length === 0) {
      const localData = (typeof Storage !== 'undefined') ? Storage.getCollection(Storage.keys.DATABASE_ROWS) : [];
      sheets = {
        'جدول الامن العام - الاساسي': localData
      };
    }

    const tables = [];
    let registeredName = user.globalName || user.username || '';
    let badge = '';
    let highestRank = '';
    let found = false;

    const cleanStr = (s) => String(s || '').trim().toLowerCase();

    const checkMatch = (row) => {
      if (!row) return false;
      
      // Compare numeric IDs if present in both row.discord (like <@1334568342345748565>) and user.id (like 1334568342345748565)
      const getDigits = (s) => String(s || '').replace(/\D/g, '');
      const rowDigits = getDigits(row.discord);
      if (rowDigits && user.id && rowDigits === getDigits(user.id)) return true;
      
      // Match by discord username/ID
      if (row.discord && user.discord) {
        const d1 = cleanStr(row.discord).replace('@', '');
        const d2 = cleanStr(user.discord).replace('@', '');
        if (d1 === d2) return true;
      }
      // Match by name
      if (row.name && user.username && cleanStr(row.name) === cleanStr(user.username)) return true;
      if (row.name && user.globalName && cleanStr(row.name) === cleanStr(user.globalName)) return true;
      if (row.name && user.name && cleanStr(row.name) === cleanStr(user.name)) return true;
      return false;
    };

    // Tabs mapping for clean table names
    const tabNameMappings = {
      'جدول الامن العام - الاساسي': 'الأساسي',
      'جدول الامن العام - الادارة': 'الإدارة',
      'جدول الامن العام - المنتدبين': 'المعتمدين',
      'جدول الادارة العامة لشؤون الادارية والمالية': 'الشؤون الإدارية والمالية',
      'جدول الإدارة العامه لشؤون تدريب الامن العام': 'شؤون التدريب',
      ' جدول الادارة العامه لشؤون التجنيد': 'شؤون التجنيد',
      'الادارة العامة لشؤون العسكرية': 'الشؤون العسكرية'
    };

    // Filter out non-personnel tabs
    const ignoredTabs = [' جدول الغرامات 💵', 'نظام الترقيات ⭐️جديد', 'الترقيات المسرعة ', 'الإستقالات <i class="fa-solid fa-crosshairs"></i>'];

    for (const tabName in sheets) {
      if (ignoredTabs.includes(tabName)) continue;
      const rows = sheets[tabName] || [];
      const matchedRow = rows.find(checkMatch);
      if (matchedRow) {
        const mappedName = tabNameMappings[tabName] || tabName.replace('جدول ', '');
        if (!tables.includes(mappedName)) {
          tables.push(mappedName);
        }
        registeredName = matchedRow.name;
        if (matchedRow.badge) badge = matchedRow.badge;
        const isMainTab = [
          'جدول الامن العام - الاساسي',
          'جدول الامن العام - المنتدبين',
          'جدول الامن العام - الادارة'
        ].includes(tabName);
        if (isMainTab && matchedRow.rank) {
          highestRank = matchedRow.rank;
        }
        found = true;
      }
    }

    // Special override for owner 3gjo / admin role
    const isOwner = ['1334568342345748565', '821825761673478144'].includes(user.id) || (user.discord && ['3gjo', 'ifm711', 'onlyryan', 'onlyryan -', 'onlyryan-'].includes(user.discord.toLowerCase())) || (user.role === 'owner');
    if (isOwner) {
      found = true;
      if (tables.length === 0) {
        tables.push('المشرف العام');
      }
      if (!registeredName || registeredName === '3gjo' || registeredName === 'OnlyRyan' || registeredName === 'سداح الحربي' || registeredName === 'z6tw' || registeredName === 'ifm711') {
        if (user.id === '1120142432554713261' || (user.discord && user.discord.toLowerCase() === 'z6tw')) {
          registeredName = 'إبراهيم بن علي';
        } else if (user.id === '821825761673478144' || (user.discord && user.discord.toLowerCase() === 'ifm711')) {
          registeredName = 'عمر المالكي';
        } else {
          registeredName = 'ريان بن محمد';
        }
      }
      if (!badge || badge === '<i class="fa-solid fa-crown"></i>' || badge === 'M-08') {
        badge = 'CC | P-20';
      }
      if (!highestRank || highestRank === 'عضو') {
        highestRank = 'المشرف العام';
      }
    }

    // Force override "سداح الحربي [M-08]" to "ريان بن محمد [CC | P-20]" for uploader lookups
    if (registeredName === 'سداح الحربي') {
      registeredName = 'ريان بن محمد';
    }
    if (badge === 'M-08') {
      badge = 'CC | P-20';
    }

    if (!highestRank) {
      highestRank = 'مشاهد';
    }

    return {
      name: registeredName,
      badge: badge,
      tables: tables,
      rank: highestRank,
      found: found
    };
  }

  function enforceDiscordGate() {
    const path = window.location.pathname;
    const isSubpage = path.includes('/pages/');
    const isCallback = path.includes('callback.html');
    const isLogin = path.includes('login.html');
    
    if (isSubpage && !isLogin && !isCallback) {
      requireDiscordAuth();
    }
  }

  // Pre-load members sheets cache from static JSON if missing in localStorage
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const cachedData = localStorage.getItem('members_google_sheets_cache');
    if (!cachedData) {
      let prefix = '';
      const path = window.location.pathname;
      if (path.includes('/pages/admin/')) {
        prefix = '../../';
      } else if (path.includes('/pages/')) {
        prefix = '../';
      }
      const jsonPath = prefix + 'assets/data/members_google_sheets_cache.json';
      
      fetch(`${jsonPath}?t=${Date.now()}`)
        .then(res => {
          if (!res.ok) throw new Error('Status: ' + res.status);
          return res.json();
        })
        .then(data => {
          localStorage.setItem('members_google_sheets_cache', JSON.stringify(data));
          console.log('[Auth] Pre-loaded members sheets cache from server successfully.');
          if (isLoggedIn()) {
            window.location.reload();
          }
        })
        .catch(err => {
          console.error('[Auth] Failed to pre-load sheets cache from server:', err);
        });
    }
  }

  async function validateSessionOnline() {
    if (!isLoggedIn()) return;
    const user = getCurrentUser();
    if (!user || !user.id) return;

    // Skip verification for local guest sessions that don't have a numeric Discord ID
    if (!/^\d{17,20}$/.test(user.id)) return;

    try {
      const apiBase = await resolveApiBase();
      const res = await fetchWithTimeout(`${apiBase}/api/auth/get_user?id=${user.id}`, {
        headers: { 'Bypass-Tunnel-Reminder': 'true' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && data.user) {
          const dbUser = data.user;
          
          if (dbUser.status !== 'active') {
            console.warn('[Session Sync] User status is not active. Logging out.');
            logout();
            return;
          }

          let roleChanged = false;
          let otherChanged = false;

          // Protect Owner accounts from silent session downgrades
          const ownerIds = ['1334568342345748565', '821825761673478144'];
          const ownerUsernames = ['3gjo', 'ifm711', 'onlyryan', 'onlyryan -', 'onlyryan-'];
          const isOwner = ownerIds.includes(user.id) || 
                          (user.username && ownerUsernames.includes(user.username.toLowerCase())) || 
                          (user.discord && ownerUsernames.includes(user.discord.toLowerCase()));
          
          if (isOwner) {
            dbUser.role = 'owner';
            dbUser.rank = 'المشرف العام';
          } else {
            // Automatically resolve role from rank if rank was updated on server
            dbUser.role = resolveRoleFromRank(dbUser.rank, dbUser.role);
          }

          if (dbUser.role !== user.role) { user.role = dbUser.role; roleChanged = true; }
          if (dbUser.rank !== user.rank) { user.rank = dbUser.rank; otherChanged = true; }
          if (dbUser.display_name !== user.username) { user.username = dbUser.display_name; otherChanged = true; }
          if (dbUser.code !== user.code) { user.code = dbUser.code; otherChanged = true; }
          if (dbUser.avatar !== user.avatar) { user.avatar = dbUser.avatar; otherChanged = true; }
          if (dbUser.banner !== user.banner) { user.banner = dbUser.banner; otherChanged = true; }
          if (dbUser.department !== user.department) { user.department = dbUser.department; otherChanged = true; }
          
          if (roleChanged || otherChanged) {
            console.log('[Session Sync] User details changed in database, updating local session:', user);
            Storage.set(Storage.keys.CURRENT_USER, user);
            window.dispatchEvent(new CustomEvent('user_session_updated', { detail: { roleChanged } }));
          }
        }
      } else if (res.status === 404) {
        if (user.role !== 'viewer') {
          if (user.accessToken) {
            console.warn('[Session Sync] User not found in database. Attempting automatic silent re-sync with Discord token...');
            processDiscordLogin(user.accessToken)
              .then(() => console.log('[Session Sync] Automatic re-sync successful!'))
              .catch(err => {
                console.error('[Session Sync] Re-sync failed. Logging out.', err);
                logout();
              });
          } else {
            console.warn('[Session Sync] User not found in database and no token available. Logging out.');
            logout();
          }
        }
      }
    } catch (e) {
      console.warn('[Session Sync] Failed to connect to server for online session validation:', e);
    }
  }

  function seedSystemPages() {
    if (typeof Storage === 'undefined') return;
    let pages = Storage.getCollection(Storage.keys.PAGES) || [];
    
    // Self-healing: if localStorage has old system pages, clear them and force re-seed
    const oldIds = ['leadership', 'managers', 'centers', 'guide', 'inventory', 'vehicles', 'college', 'attendance-reports', 'exams', 'field-title', 'uniform', 'apply', 'database', 'wings', 'aviation-document', 'counter-terrorism-wing', 'pursuit-assault-wing', 'shooting-skills-wing', 'roads-document', 'traffic-document', 'rapid-intervention-document', 'special-tasks-document', 'officers-document', 'staff-document', 'ops-document', 'regulations-document', 'investigation-document', 'narcotics-document', 'thunderbolt-document', 'district-officers-document', 'amn90-r'];
    const hasOldPages = pages.some(p => p && oldIds.includes(p.id));
    if (hasOldPages) {
      console.log('[Self-Healing] Old system page IDs detected in storage. Purging and forcing remote sync...');
      pages = [];
      Storage.set(Storage.keys.PAGES, [], true);
    }

    const systemPages = [
      { id: 'home', title: 'الرئيسية', emoji: '<i class="fa-solid fa-house"></i>', isSystem: true, allowedRoles: ['*'] },
      { id: 'amn1', title: 'القيادة', emoji: '<i class="fa-solid fa-crown"></i>', isSystem: true, allowedRoles: ['*'] },
      { id: 'amn2', title: 'مدراء الأقسام', emoji: '<i class="fa-solid fa-medal"></i>', isSystem: true, allowedRoles: ['*'] },
      { id: 'amn3', title: 'المراكز', emoji: '<i class="fa-solid fa-building-shield"></i>', isSystem: true, allowedRoles: ['*'] },
      { id: 'amn4', title: 'الدليل الشامل', emoji: '<i class="fa-solid fa-book-open"></i>', isSystem: true, allowedRoles: ['*'] },
      { id: 'amn5', title: 'العهدة', emoji: '<i class="fa-solid fa-box-open"></i>', isSystem: true, allowedRoles: ['*'] },
      { id: 'amn6', title: 'المركبات', emoji: '<i class="fa-solid fa-car-on"></i>', isSystem: true, allowedRoles: ['*'] },
      { id: 'amn7', title: 'كلية التدريب', emoji: '<i class="fa-solid fa-graduation-cap"></i>', isSystem: true, allowedRoles: ['*'] },
      { id: 'amn8', title: 'تقارير الحضور', emoji: '<i class="fa-solid fa-clipboard-user"></i>', isSystem: true, allowedRoles: ['owner', 'assistant_owner', 'academy_affairs', 'admin', 'course_admin', 'college_trainee'] },
      { id: 'amn9', title: 'الاختبارات', emoji: '<i class="fa-solid fa-file-pen"></i>', isSystem: true, allowedRoles: ['*'] },
      { id: 'amn10', title: 'التوجيهات الميدانية', emoji: '<i class="fa-solid fa-id-card"></i>', isSystem: true, allowedRoles: ['*'] },
      { id: 'amn11', title: 'الزي العسكري', emoji: '<i class="fa-solid fa-shirt"></i>', isSystem: true, allowedRoles: ['*'] },
      { id: 'amn12', title: 'التقديم', emoji: '<i class="fa-solid fa-envelope-open-text"></i>', isSystem: true, allowedRoles: ['*'] },
      { id: 'amn13', title: 'قاعدة البيانات', emoji: '<i class="fa-solid fa-lock"></i>', isSystem: true, allowedRoles: ['*'] },
      { id: 'amn14', title: 'الونقات', emoji: '🦅', isSystem: true, allowedRoles: ['*'] },
      { id: 'mstnd1', title: 'مستند الجناح الجوي', emoji: '🚁', isSystem: true, parentId: 'amn14', allowedRoles: ['*'] },
      { id: 'mstnd2', title: 'مستند جناح مكافحة الإرهاب', emoji: '⚔️', isSystem: true, parentId: 'amn14', allowedRoles: ['*'] },
      { id: 'mstnd3', title: 'مستند جناح المداهمة والاقتحام', emoji: '🛡️', isSystem: true, parentId: 'amn14', allowedRoles: ['*'] },
      { id: 'mstnd4', title: 'جناح الرماية والتدريب الميداني', emoji: '🎯', isSystem: true, parentId: 'amn14', allowedRoles: ['*'] },
      { id: 'mstnd5', title: 'مستند جناح أمن الطرق', emoji: '🛣️', isSystem: true, parentId: 'amn14', allowedRoles: ['*'] },
      { id: 'mstnd6', title: 'مستند جناح المرور', emoji: '🚥', isSystem: true, parentId: 'amn14', allowedRoles: ['*'] },
      { id: 'mstnd7', title: 'مستند جناح التدخل السريع', emoji: '⚡', isSystem: true, parentId: 'amn14', allowedRoles: ['*'] },
      { id: 'mstnd8', title: 'مستند جناح المهام الخاصة', emoji: '🔥', isSystem: true, parentId: 'amn14', allowedRoles: ['*'] },
      { id: 'mstnd9', title: 'مستند الضباط', emoji: '🎖️', isSystem: true, parentId: 'amn14', allowedRoles: ['*'] },
      { id: 'mstnd10', title: 'مستند الأفراد', emoji: '🎖️', isSystem: true, parentId: 'amn14', allowedRoles: ['*'] },
      { id: 'mstnd11', title: 'مستند العمليات', emoji: '📞', isSystem: true, parentId: 'amn14', allowedRoles: ['*'] },
      { id: 'mstnd12', title: 'مستند الأنظمة واللوائح', emoji: '📜', isSystem: true, parentId: 'amn14', allowedRoles: ['*'] },
      { id: 'mstnd13', title: 'مستند المباحث', emoji: '🕵️', isSystem: true, parentId: 'amn14', allowedRoles: ['*'] },
      { id: 'mstnd14', title: 'مستند مكافحة المخدرات', emoji: '💊', isSystem: true, parentId: 'amn14', allowedRoles: ['*'] },
      { id: 'mstnd15', title: 'مستند الصاعقة والمظليين', emoji: '⚡', isSystem: true, parentId: 'amn14', allowedRoles: ['*'] },
      { id: 'mstnd16', title: 'مستند قيادة أمن الطرق', emoji: '🛣️', isSystem: true, parentId: 'amn14', allowedRoles: ['*'] },
      { id: 'amn15', title: 'مدينة الـ 90 العسكرية', emoji: '🏰', isSystem: true, parentId: 'amn14', allowedRoles: ['*'] }
    ];

    const systemIds = new Set(systemPages.map(s => s.id));

    let cleanedPages = [];
    let wasCleaned = false;

    // Filter pages: keep ONLY system pages, removing any old custom pages
    pages.forEach(p => {
      if (!p) return;
      if (systemIds.has(p.id)) {
        cleanedPages.push(p);
      } else {
        wasCleaned = true;
      }
    });

    pages = cleanedPages;
    let updated = wasCleaned;

    for (const sys of systemPages) {
      const exists = pages.find(p => p.id === sys.id);
      if (!exists) {
        pages.push(sys);
        updated = true;
      } else {
        let sysUpdated = false;
        if (!exists.isSystem) {
          exists.isSystem = true;
          sysUpdated = true;
        }
        if (exists.title !== sys.title) {
          exists.title = sys.title;
          sysUpdated = true;
        }
        if (exists.emoji !== sys.emoji) {
          exists.emoji = sys.emoji;
          sysUpdated = true;
        }
        if (sys.parentId && exists.parentId !== sys.parentId) {
          exists.parentId = sys.parentId;
          sysUpdated = true;
        }
        if (!exists.allowedRoles || JSON.stringify(exists.allowedRoles) !== JSON.stringify(sys.allowedRoles)) {
          exists.allowedRoles = sys.allowedRoles;
          sysUpdated = true;
        }
        if (sysUpdated) {
          updated = true;
        }
      }
    }

    if (updated) {
      Storage.set(Storage.keys.PAGES, pages);
    }
  }

  function checkPageAccess(pageId) {
    if (!isLoggedIn()) return false;

    const user = getCurrentUser();
    const userRole = getRole();

    // Owner always has full access (unless in preview mode)
    if (user && user.role === 'owner' && !getPreviewRole()) return true;

    // Direct authoritative permissions map for key system pages
    const systemAuthMap = {
      'amn8': ['owner', 'assistant_owner', 'academy_affairs', 'admin', 'course_admin', 'college_trainee'],
      'amn13': ['*']
    };

    if (systemAuthMap[pageId]) {
      const allowed = systemAuthMap[pageId];
      if (allowed.includes('*')) return true;
      return allowed.includes(userRole);
    }

    // 1. Check system pages first (authoritative source - never depends on localStorage)
    if (typeof Components !== 'undefined' && Components.SYSTEM_PAGES) {
      const sysPage = Components.SYSTEM_PAGES.find(p => p.id === pageId);
      if (sysPage) {
        const allowed = sysPage.allowedRoles || ['*'];
        if (allowed.includes('*')) return true;
        return allowed.includes(userRole);
      }
    }

    // 2. For custom pages, check localStorage
    if (typeof Storage !== 'undefined') {
      const pages = Storage.getCollection(Storage.keys.PAGES) || [];
      const page = pages.find(p => p.id === pageId);
      if (page) {
        const allowed = page.allowedRoles || ['*'];
        if (allowed.includes('*')) return true;
        return allowed.includes(userRole);
      }
    }

    // Default: allow access if page not found in any source
    return true;
  }

  // Automatically execute the callback parser
  handleDiscordCallback();

  // Enforce Discord Gate
  enforceDiscordGate();

  // Asynchronously validate session online
  validateSessionOnline();
  // Periodically check session online every 6 seconds to update permissions dynamically
  setInterval(validateSessionOnline, 6000);

  return {
    ROLES,
    getCurrentUser, isLoggedIn, getRole, getRoleInfo,
    login, logout,
    hasPermission, canAccess, requireAuth, requireRole,
    createUser, updateUser, deleteUser, getAllUsers,
    getRoleLabel, getRoleEmoji, getRoleColor,
    requireDiscordAuth, handleDiscordCallback, getDiscordBadges, getDiscordAuthUrl,
    resolveUserTableInfo, validateSessionOnline,
    isActualOwner, setPreviewRole, getPreviewRole,
    checkPageAccess, seedSystemPages
  };
})();

window.Auth = Auth;

// Automatically seed and shield pages from unauthorized access
(function() {
  function getCurrentPageId() {
    const path = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    
    if (path.includes('custom.html')) {
      const id = searchParams.get('id');
      return id ? `custom_${id}` : 'custom';
    }
    
    const filename = path.substring(path.lastIndexOf('/') + 1);
    if (!filename || filename === 'index.html' || filename === 'amn.html') {
      return 'home';
    }
    
    return filename.replace('.html', '');
  }

  function renderAccessDeniedPage() {
    let ROOT = './';
    const path = window.location.pathname;
    if (path.includes('/pages/admin/')) {
      ROOT = '../../';
    } else if (path.includes('/pages/')) {
      ROOT = '../';
    }

    window.location.href = ROOT + 'index.html';
  }

  function checkAccess() {
    const pageId = getCurrentPageId();
    const path = window.location.pathname;
    
    // Don't intercept access denied page on login/admin dashboard/auth itself
    if (path.includes('/admin/login.html') || path.includes('/admin/amn16.html') || path.includes('login.html')) {
      return;
    }
    
    if (window.Auth) {
      window.Auth.seedSystemPages();
      
      // index.html is the landing/login gateway
      if (pageId === 'home') {
        return;
      }
      
      if (!window.Auth.isLoggedIn()) {
        let ROOT = './';
        if (path.includes('/pages/')) {
          ROOT = '../';
        }
        window.location.href = ROOT + 'index.html';
        return;
      }
      
      if (!window.Auth.checkPageAccess(pageId)) {
        renderAccessDeniedPage();
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAccess);
  } else {
    checkAccess();
  }
})();
