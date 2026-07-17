/**
 * components.js - Shared HTML components builder
 * Reusable navbar, sidebar, footer for all pages
 * v1.1.30 - Full system pages independence from localStorage
 */

// Dynamically inject FontAwesome CDN stylesheet
(function() {
  if (!document.getElementById('font-awesome-cdn')) {
    const link = document.createElement('link');
    link.id = 'font-awesome-cdn';
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }
})();

const Components = (() => {

  const BASE = window.location.pathname.includes('/pages/') ? '../' : './';

  // ─── MASTER SYSTEM PAGE DEFINITIONS ───────────────────────────────────────
  // These are ALWAYS authoritative. Never rely on localStorage for system pages.
  const SYSTEM_PAGES = [
    { id: 'home',                       title: 'الرئيسية',                        emoji: '<i class="fa-solid fa-house"></i>',               allowedRoles: ['*'] },
    { id: 'amn1',                       title: 'القيادة',                         emoji: '<i class="fa-solid fa-crown"></i>',               allowedRoles: ['*'] },
    { id: 'amn2',                       title: 'مدراء الأقسام',                   emoji: '<i class="fa-solid fa-medal"></i>',               allowedRoles: ['*'] },
    { id: 'amn3',                       title: 'المراكز',                         emoji: '<i class="fa-solid fa-building-shield"></i>',     allowedRoles: ['*'] },
    { id: 'amn4',                       title: 'الدليل الشامل',                   emoji: '<i class="fa-solid fa-book-open"></i>',           allowedRoles: ['*'] },
    { id: 'amn5',                       title: 'العهدة',                          emoji: '<i class="fa-solid fa-box-open"></i>',            allowedRoles: ['*'] },
    { id: 'amn6',                       title: 'المركبات',                        emoji: '<i class="fa-solid fa-car-on"></i>',              allowedRoles: ['*'] },
    { id: 'amn7',                       title: 'كلية التدريب',                    emoji: '<i class="fa-solid fa-graduation-cap"></i>',      allowedRoles: ['*'] },
    { id: 'amn8',                       title: 'تقارير الحضور',                   emoji: '<i class="fa-solid fa-clipboard-user"></i>',      allowedRoles: ['owner', 'assistant_owner', 'academy_affairs', 'admin', 'course_admin', 'college_trainee'] },
    { id: 'amn9',                       title: 'الاختبارات',                      emoji: '<i class="fa-solid fa-file-pen"></i>',            allowedRoles: ['*'] },
    { id: 'amn10',                      title: 'التوجيهات الميدانية',             emoji: '<i class="fa-solid fa-id-card"></i>',             allowedRoles: ['*'] },
    { id: 'amn11',                      title: 'الزي العسكري',                    emoji: '<i class="fa-solid fa-shirt"></i>',               allowedRoles: ['*'] },
    { id: 'amn12',                      title: 'التقديم',                         emoji: '<i class="fa-solid fa-envelope-open-text"></i>',  allowedRoles: ['*'] },
    { id: 'amn13',                      title: 'قاعدة البيانات',                  emoji: '<i class="fa-solid fa-database"></i>',             allowedRoles: ['*'] },
    { id: 'amn14',                      title: 'الونقات',                        emoji: '🦅',                                              allowedRoles: ['*'] },
    // Wings sub-pages
    { id: 'mstnd1',                     title: 'مستند الجناح الجوي',              emoji: '🚁',  parentId: 'amn14', allowedRoles: ['*'] },
    { id: 'mstnd2',                     title: 'مستند جناح مكافحة الإرهاب',      emoji: '⚔️', parentId: 'amn14', allowedRoles: ['*'] },
    { id: 'mstnd3',                     title: 'مستند جناح المداهمة والاقتحام',  emoji: '🛡️', parentId: 'amn14', allowedRoles: ['*'] },
    { id: 'mstnd4',                     title: 'جناح الرماية والتدريب الميداني', emoji: '🎯', parentId: 'amn14', allowedRoles: ['*'] },
    { id: 'mstnd5',                     title: 'مستند جناح أمن الطرق',           emoji: '🛣️', parentId: 'amn14', allowedRoles: ['*'] },
    { id: 'mstnd6',                     title: 'مستند جناح المرور',              emoji: '🚥', parentId: 'amn14', allowedRoles: ['*'] },
    { id: 'mstnd7',                     title: 'مستند جناح التدخل السريع',       emoji: '⚡', parentId: 'amn14', allowedRoles: ['*'] },
    { id: 'mstnd8',                     title: 'مستند جناح المهام الخاصة',       emoji: '🔥', parentId: 'amn14', allowedRoles: ['*'] },
    { id: 'mstnd9',                     title: 'مستند الضباط',                   emoji: '🎖️', parentId: 'amn14', allowedRoles: ['*'] },
    { id: 'mstnd10',                    title: 'مستند الأفراد',                  emoji: '🎖️', parentId: 'amn14', allowedRoles: ['*'] },
    { id: 'mstnd11',                    title: 'مستند العمليات',                 emoji: '📞', parentId: 'amn14', allowedRoles: ['*'] },
    { id: 'mstnd12',                    title: 'مستند الأنظمة واللوائح',         emoji: '📜', parentId: 'amn14', allowedRoles: ['*'] },
    { id: 'mstnd13',                    title: 'مستند المباحث',                  emoji: '🕵️', parentId: 'amn14', allowedRoles: ['*'] },
    { id: 'mstnd14',                    title: 'مستند مكافحة المخدرات',          emoji: '💊', parentId: 'amn14', allowedRoles: ['*'] },
    { id: 'mstnd15',                    title: 'مستند الصاعقة والمظليين',        emoji: '⚡', parentId: 'amn14', allowedRoles: ['*'] },
    { id: 'mstnd16',                    title: 'مستند قيادة أمن الطرق',          emoji: '🛣️', parentId: 'amn14', allowedRoles: ['*'] },
    { id: 'amn15',                      title: 'مدينة الـ 90 العسكرية',           emoji: '🏰', parentId: 'amn14', allowedRoles: ['*'] },
    { id: 'amn17',                      title: 'الأوسمة والأنواط العسكرية',        emoji: '<i class="fa-solid fa-medal"></i>', parentId: 'amn7', allowedRoles: ['*'] },
  ];

  const SYSTEM_IDS = new Set(SYSTEM_PAGES.map(p => p.id));

  // Helper: check if a page can be accessed by current user
  function canAccess(page) {
    const allowed = page.allowedRoles || ['*'];
    // Pages open to everyone (including unauthenticated visitors) show always
    if (allowed.includes('*')) return true;
    if (typeof Auth === 'undefined') return false;
    if (!Auth.isLoggedIn()) return false;
    // Owner, assistant_owner and academy_affairs always see everything (unless in preview mode)
    const user = Auth.getCurrentUser();
    if (user && Auth.hasAnyRole(user.role, ['owner', 'assistant_owner', 'academy_affairs']) && !Auth.getPreviewRole()) return true;
    const role = Auth.getRole();
    return Auth.hasAnyRole(role, allowed);
  }

  // Helper: get custom pages (non-system) from localStorage
  function getCustomPages() {
    if (typeof Storage === 'undefined') return [];
    const all = Storage.getCollection(Storage.keys.PAGES) || [];
    return all.filter(p => p && p.id && !SYSTEM_IDS.has(p.id));
  }

  // Helper: build icon HTML from emoji string
  function iconHtml(emoji) {
    if (!emoji) return '📄';
    if (emoji.includes('<i')) return emoji;
    return `<span>${emoji}</span>`;
  }

  // ─── NAVBAR ───────────────────────────────────────────────────────────────
  function navbar(activePage = '') {
    // Pages that only appear in sidebar, not in the top sub-bar
    const navbarExcludeIds = new Set(['amn14', 'amn12', 'announcements', 'promotions', 'archive', 'mstnd1', 'mstnd2', 'mstnd3', 'mstnd4', 'mstnd5', 'mstnd6', 'mstnd7', 'mstnd8', 'mstnd9', 'mstnd10', 'mstnd11', 'mstnd12', 'mstnd13', 'mstnd14', 'mstnd15', 'mstnd16', 'amn15', 'amn17']);

    // Order for navbar
    const navbarOrder = ['home', 'amn1', 'amn2', 'amn4', 'amn3', 'amn6', 'amn5', 'amn7', 'amn8', 'amn9', 'amn10', 'amn11', 'amn13'];

    // Build links: system pages first (in order), then custom parent pages
    const links = [];

    for (const id of navbarOrder) {
      if (navbarExcludeIds.has(id)) continue;
      const page = SYSTEM_PAGES.find(p => p.id === id);
      if (!page) continue;
      if (page.isHidden) continue;
      if (!canAccess(page)) continue;

      const href = id === 'home' ? 'amn.html' : `pages/${id}.html`;
      links.push({
        href,
        label: `${iconHtml(page.emoji)} ${page.title}`,
        page: id
      });
    }

    // Append allowed custom parent pages
    const customPages = getCustomPages();
    for (const p of customPages) {
      if (p.parentId) continue;
      if (p.isHidden) continue;
      if (!canAccess(p)) continue;
      links.push({
        href: `pages/custom.html?id=${p.id}`,
        label: `${iconHtml(p.emoji)} ${p.title}`,
        page: `custom_${p.id}`
      });
    }

    return `
    <nav class="navbar" id="navbar">
      <div class="navbar-inner">
        <a href="${BASE}amn.html" class="navbar-logo">
          <img src="${BASE}assets/img/emblem.png" alt="شعار الأمن العام" class="nav-logo-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
          <!-- SVG Fallback shown only if image fails -->
          <div style="display:none; width:44px; height:44px; background:linear-gradient(135deg,#c9a227,#8a6d0f); border-radius:10px; align-items:center; justify-content:center; font-size:1.4rem;"><i class="fa-solid fa-shield-halved"></i></div>
          <div class="navbar-logo-text" style="display: flex; flex-direction: column; line-height: 1.25; text-align: right;">
            <span style="font-size: 14px; font-weight: 900; color: #ffffff; letter-spacing: 0.5px;">إدارة الأمن العام</span>
            <span style="font-size: 11px; font-weight: 800; color: #c9a227; margin-top: 1px;">مدينة الـ 90</span>
          </div>
        </a>
        <div class="navbar-actions">
          <button class="menu-toggle" data-action="open-sidebar">
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>
      <div class="navbar-sub">
        <div class="navbar-sub-inner">
          ${links.map(l => `<a href="${BASE}${l.href}" class="sub-link${activePage === l.page ? ' active' : ''}">${l.label}</a>`).join('')}
        </div>
      </div>
    </nav>`;
  }

  // ─── SIDEBAR ──────────────────────────────────────────────────────────────
  function sidebar(activePage = '') {
    const currentUser = (typeof Auth !== 'undefined') ? Auth.getCurrentUser() : null;
    const customPages = getCustomPages();

    function item(page, overrideHref, overrideLabel, extra = {}) {
      if (!canAccess(page)) return null;
      if (page.isHidden) return null;
      return {
        href: overrideHref || `${BASE}pages/${page.id}.html`,
        icon: iconHtml(page.emoji),
        label: overrideLabel || page.title,
        page: page.id,
        ...extra
      };
    }

    function sysPage(id) {
      return SYSTEM_PAGES.find(p => p.id === id) || null;
    }

    const items = [];

    // 1. Core Section - القائمة الرئيسية
    const coreIds = ['home', 'amn1', 'amn2', 'amn4', 'amn3', 'amn6', 'amn5'];
    let hasCore = false;
    for (const id of coreIds) {
      const p = sysPage(id);
      if (!p) continue;
      const href = id === 'home' ? `${BASE}amn.html` : `${BASE}pages/${id}.html`;
      const it = item(p, href);
      if (it) { items.push(it); hasCore = true; }
    }

    // 2. Knowledge Section
    const knowledgeIds = ['amn7', 'amn8', 'amn9', 'amn10', 'amn11', 'amn13'];
    const knowledgeItems = [];
    for (const id of knowledgeIds) {
      const p = sysPage(id);
      if (!p) continue;
      const it = item(p);
      if (it) knowledgeItems.push(it);
    }
    if (knowledgeItems.length > 0) {
      items.push({ divider: true });
      items.push({ label: 'التدريب والمعرفة', section: true });
      items.push(...knowledgeItems);
    }

    // 3. Community Section (apply only)
    const commIds = ['amn12'];
    const commItems = [];
    for (const id of commIds) {
      const p = sysPage(id);
      if (!p) continue;
      const it = item(p);
      if (it) commItems.push(it);
    }
    if (commItems.length > 0) {
      items.push({ divider: true });
      items.push({ label: 'المجتمع', section: true });
      items.push(...commItems);
    }

    // 5. Wings Section
    const wingsPage = sysPage('amn14');
    if (wingsPage && canAccess(wingsPage)) {
      items.push({ divider: true });
      items.push({ label: wingsPage.title, section: true });
      items.push({
        href: `${BASE}pages/amn14.html`,
        icon: iconHtml(wingsPage.emoji),
        label: 'استعراض الونقات',
        page: 'amn14'
      });
      // Wing sub-pages
      const wingSubs = SYSTEM_PAGES.filter(p => p.parentId === 'amn14');
      for (const sub of wingSubs) {
        if (!canAccess(sub)) continue;
        items.push({
          href: `${BASE}pages/${sub.id}.html`,
          icon: '↳',
          label: sub.title,
          page: sub.id,
          isSubpage: true
        });
      }
    }

    // 6. Custom pages
    const customParents = customPages.filter(p => !p.parentId && !p.isHidden && canAccess(p));
    if (customParents.length > 0) {
      items.push({ divider: true });
      items.push({ label: 'صفحات إضافية', section: true });
      for (const p of customParents) {
        items.push({
          href: `${BASE}pages/custom.html?id=${p.id}`,
          icon: iconHtml(p.emoji),
          label: p.title,
          page: `custom_${p.id}`
        });
        // Child sub-pages
        const subs = customPages.filter(s => s.parentId === p.id && !s.isHidden && canAccess(s));
        for (const sub of subs) {
          items.push({
            href: `${BASE}pages/custom.html?id=${sub.id}`,
            icon: '↳',
            label: sub.title,
            page: `custom_${sub.id}`,
            isSubpage: true
          });
        }
      }
    }

    const itemsHTML = items.map(it => {
      if (it.divider) return `<div class="sidebar-divider"></div>`;
      if (it.section) return `<div class="sidebar-section-label">${it.label}</div>`;
      const subStyle = it.isSubpage ? 'style="padding-right: 32px; font-size: 0.85rem; opacity: 0.85; border-right: 1px dashed rgba(201, 162, 39, 0.2);"' : '';
      const iconStyle = it.isSubpage ? 'style="margin-left: 6px; font-size: 0.90rem; color: var(--color-gold-primary);"' : '';
      return `
        <a href="${it.href}" class="sidebar-nav-item${activePage === it.page ? ' active' : ''}" ${subStyle}>
          <div class="sidebar-nav-icon" ${iconStyle}>${it.icon}</div>
          ${it.label}
          ${it.badge ? `<span class="sidebar-nav-badge" data-badge="${it.page}">...</span>` : ''}
        </a>`;
    }).join('');

    // Profile widget
    let profileWidgetHTML = '';
    if (currentUser) {
      let dispName = currentUser.display_name || currentUser.username || '';
      if (typeof Auth !== 'undefined' && typeof Auth.resolveUserTableInfo === 'function') {
        const info = Auth.resolveUserTableInfo(currentUser);
        if (info && info.found && info.name) {
          dispName = info.name;
        }
      }

      profileWidgetHTML = `
      <div class="sidebar-profile-widget">
        <div class="profile-header-info">
          <div class="profile-avatar-wrap">
            <img src="${currentUser.avatar_url || (BASE + 'assets/img/avatar.png')}" class="profile-avatar" onerror="this.src='${BASE}assets/img/emblem.png'">
            <div class="profile-avatar-border"></div>
          </div>
          <div class="profile-text">
            <span class="profile-name">${dispName}</span>
            <span class="profile-rank"><i class="fa-solid fa-medal"></i> ${currentUser.rank || 'عسكري'}</span>
          </div>
        </div>
        <div class="profile-status-linked">
          <span class="badge-linked"><i class="fa-solid fa-circle-check"></i> حساب ديسكورد مرتبط</span>
        </div>
        <div class="profile-widget-actions">
          <button class="profile-logout-btn" onclick="Auth.logout()"><i class="fa-solid fa-right-from-bracket"></i> تسجيل الخروج</button>
        </div>
      </div>`;
    } else {
      const discordUrl = (typeof Auth !== 'undefined') ? Auth.getDiscordAuthUrl() : '#';
      profileWidgetHTML = `
      <div class="sidebar-profile-widget unlinked">
        <div class="profile-guest-text">
          <i class="fa-solid fa-user-shield"></i> لم يتم ربط حساب عسكري
        </div>
        <a href="${discordUrl}" class="sidebar-login-btn" onclick="localStorage.setItem('auth_redirect_back', window.location.href)">
          <svg class="discord-icon-svg" viewBox="0 0 127.14 96.36" style="width:16px; height:16px; fill:currentColor; vertical-align:middle; margin-left:8px;">
            <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.5-5c.78-.57,1.53-1.18,2.24-1.81a75.46,75.46,0,0,0,73.5,0c.71.63,1.46,1.24,2.24,1.81a68.43,68.43,0,0,1-10.5,5,77.7,77.7,0,0,0,6.63,10.85,105.73,105.73,0,0,0,31-18.83C129.82,49.25,123.63,26.47,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z"/>
          </svg>
          ربط الحساب وتسجيل الدخول
        </a>
      </div>`;
    }

    return `
    <div class="sidebar-overlay" id="sidebar-overlay"></div>
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-logo">
          <img src="${BASE}assets/img/emblem.png" alt="شعار الأمن العام" class="sidebar-logo-img" onerror="this.outerHTML='<div class=\\'sidebar-logo-icon emblem-mini\\'><i class=\\'fa-solid fa-shield-halved\\'></i></div>'">
          <div style="display: flex; flex-direction: column; line-height: 1.25; text-align: right; margin-right: 8px;">
            <span style="font-size: 13px; font-weight: 900; color: #ffffff; letter-spacing: 0.5px;">إدارة الأمن العام</span>
            <span style="font-size: 10px; font-weight: 800; color: #c9a227; margin-top: 1px;">مدينة الـ 90</span>
          </div>
        </div>
        <button class="sidebar-close" data-action="close-sidebar">✕</button>
      </div>
      <div class="sidebar-body">
        ${profileWidgetHTML}
        ${itemsHTML}
      </div>
      <div class="sidebar-footer">
        <div class="sidebar-status">
          <div class="status-dot"></div>
          <span class="sidebar-status-text">السيرفر يعمل بشكل طبيعي</span>
        </div>
        <div class="sidebar-footer-stats">
          <div class="sidebar-stat">
            <span class="sidebar-stat-value" id="sidebar-total">127</span>
            <span class="sidebar-stat-label">عضو</span>
          </div>
          <div class="sidebar-stat">
            <span class="sidebar-stat-value" id="sidebar-online">34</span>
            <span class="sidebar-stat-label">متصل</span>
          </div>
          <div class="sidebar-stat">
            <span class="sidebar-stat-value" id="sidebar-centers">${(typeof Storage !== 'undefined') ? (Storage.getCollection(Storage.keys.CENTERS) || []).length : 1}</span>
            <span class="sidebar-stat-label">مركز</span>
          </div>
        </div>
      </div>
    </aside>`;
  }

  function footer() {
    const settings = (typeof Storage !== 'undefined') ? Storage.get(Storage.keys.SETTINGS, {}) : {};
    const discordUrl = settings.discordLink || '#';
    const officialSiteUrl = settings.officialSiteLink || '#';
    const youtubeUrl = settings.youtubeLink || '#';

    return `
    <footer class="footer">
      <div class="footer-top">
        <div class="container">
          <div class="footer-grid">
            <div class="footer-brand">
              <div class="footer-logo">
                <img src="${BASE}assets/img/emblem.png" alt="شعار الأمن العام" class="footer-emblem" onerror="this.outerHTML='<div class=\\'footer-logo-icon emblem-mini\\'><i class=\\'fa-solid fa-shield-halved\\'></i></div>'">
                <div style="display: flex; flex-direction: column; line-height: 1.25; text-align: right; margin-right: 8px;">
                  <span style="font-size: 13px; font-weight: 900; color: #ffffff; letter-spacing: 0.5px;">إدارة الأمن العام</span>
                  <span style="font-size: 10px; font-weight: 800; color: #c9a227; margin-top: 1px;">مدينة الـ 90</span>
                </div>
              </div>
              <p class="footer-desc">البوابة الرسمية للتدريب والإدارة الميدانية في جهاز الأمن العام بمدينة الـ90. نسعى دوماً لبناء قوة أمنية عالية الكفاءة والتنظيم.</p>
            </div>
            <div>
              <div class="footer-col-title">الأقسام</div>
              <div class="footer-links">
                <a href="${BASE}pages/amn1.html" class="footer-link">القيادة</a>
                <a href="${BASE}pages/amn3.html"    class="footer-link">المراكز</a>
                <a href="${BASE}pages/amn5.html"  class="footer-link">العهدة</a>
              </div>
            </div>
            <div>
              <div class="footer-col-title">التدريب</div>
              <div class="footer-links">
                <a href="${BASE}pages/amn4.html"    class="footer-link">الدليل الشامل</a>
                <a href="${BASE}pages/amn7.html"  class="footer-link">كلية التدريب</a>
              </div>
            </div>
          </div>
        </div>
      </div>
      <hr class="footer-divider">
      <div class="footer-bottom">
        <div class="container">
          <div class="footer-bottom-inner">
            <div class="footer-copyright">
              <span>© 2026 إدارة الأمن العام - مدينة الـ90 · جميع الحقوق محفوظة إلى أصحابها ريان بن محمد - إبراهيم بن علي - عمر المالكي</span>
            </div>
            <div class="footer-bottom-links">
            </div>
          </div>
        </div>
      </div>
    </footer>`;
  }

  function pageShell({ title, activePage, css = [], scripts = [], body, head = '' }) {
    const cssLinks = css.map(href => `<link rel="stylesheet" href="${href}">`).join('\n  ');
    const scriptTags = scripts.map(src => `<script src="${src}"><\/script>`).join('\n');

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | الأمن العام</title>
  <link rel="stylesheet" href="${BASE}assets/css/main.css">
  <link rel="stylesheet" href="${BASE}assets/css/navbar.css">
  <link rel="stylesheet" href="${BASE}assets/css/sidebar.css">
  <link rel="stylesheet" href="${BASE}assets/css/footer.css">
  ${cssLinks}
  ${head}
</head>
<body>
<div id="toast-container"></div>
${navbar(activePage)}
${sidebar(activePage)}
<main class="page-content">
${body}
</main>
${footer()}
<script src="${BASE}assets/js/storage.js"><\/script>
<script src="${BASE}assets/js/data.js"><\/script>
<script src="${BASE}assets/js/auth.js"><\/script>
<script src="${BASE}assets/js/app.js"><\/script>
${scriptTags}
</body>
</html>`;
  }

  return { navbar, sidebar, footer, pageShell, SYSTEM_PAGES, SYSTEM_IDS };
})();

window.Components = Components;

// Automatically inject Preview Mode Widget and Banner for the Owner on all pages
(function() {
  function injectPreviewWidget() {
    if (typeof Auth !== 'undefined' && typeof Auth.isActualOwner === 'function' && Auth.isActualOwner()) {
      const currentPreview = Auth.getPreviewRole();
      if (currentPreview && currentPreview !== 'owner') {
        if (!document.getElementById('ps-preview-banner')) {
          const banner = document.createElement('div');
          banner.id = 'ps-preview-banner';
          banner.style.position = 'sticky';
          banner.style.top = '0';
          banner.style.width = '100%';
          banner.style.zIndex = '1000000';
          banner.style.background = 'linear-gradient(90deg, #c9a227, #e5c158)';
          banner.style.color = '#000';
          banner.style.textAlign = 'center';
          banner.style.padding = '8px 16px';
          banner.style.fontWeight = '800';
          banner.style.fontSize = '0.88rem';
          banner.style.display = 'flex';
          banner.style.justifyContent = 'center';
          banner.style.alignItems = 'center';
          banner.style.gap = '15px';
          banner.style.boxShadow = '0 3px 10px rgba(0,0,0,0.3)';
          banner.style.direction = 'rtl';
          banner.style.fontFamily = 'inherit';

          const roleLabels = {
            'assistant_owner': 'قيادة الامن العام',
            'academy_affairs': 'رئاسة تدريب الامن العام',
            'admin': 'شؤون أكاديمية التدريب',
            'recruitment_affairs': 'شؤون التجنيد',
            'course_admin': 'مسؤول دورة',
            'viewer': 'مشاهد'
          };
          const previewLabel = roleLabels[currentPreview] || 'مشاهد';

          const textSpan = document.createElement('span');
          textSpan.innerHTML = `⚠️ <strong>وضع المعاينة نشط:</strong> أنت تتصفح الموقع حالياً بصلاحيات رتبة <strong>[ ${previewLabel} ]</strong>`;

          const exitBtn = document.createElement('button');
          exitBtn.textContent = 'إنهاء المعاينة ✕';
          exitBtn.style.background = '#000';
          exitBtn.style.color = '#fff';
          exitBtn.style.border = 'none';
          exitBtn.style.borderRadius = '4px';
          exitBtn.style.padding = '4px 10px';
          exitBtn.style.fontSize = '0.78rem';
          exitBtn.style.fontWeight = '800';
          exitBtn.style.cursor = 'pointer';
          exitBtn.style.transition = 'opacity 0.2s';
          exitBtn.addEventListener('click', () => {
            Auth.setPreviewRole('owner');
          });

          banner.appendChild(textSpan);
          banner.appendChild(exitBtn);
          
          document.body.insertBefore(banner, document.body.firstChild);
        }
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectPreviewWidget);
  } else {
    injectPreviewWidget();
  }
})();
