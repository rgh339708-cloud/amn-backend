/**
 * components.js - Shared HTML components builder
 * Reusable navbar, sidebar, footer for all pages
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

  const BASE = '../';

  function navbar(activePage = '') {
    if (typeof Auth !== 'undefined' && typeof Auth.seedSystemPages === 'function') {
      Auth.seedSystemPages();
    }
    let rawPages = (typeof Storage !== 'undefined') ? (Storage.getCollection(Storage.keys.PAGES) || []) : [];
    const seenIds = new Set();
    const pages = [];
    
    function normalizeArabic(str) {
      if (!str) return '';
      return str.trim()
        .replace(/[أإآا]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/\s+/g, '');
    }

    const systemPageIds = ['home', 'leadership', 'managers', 'centers', 'guide', 'inventory', 'vehicles', 'college', 'attendance-reports', 'exams', 'archive', 'field-title', 'uniform', 'promotions', 'announcements', 'apply', 'database', 'wings'];
    const systemNormalizedTitles = ['الرئيسية', 'القيادة', 'مدراء الأقسام', 'المراكز', 'الدليل الشامل', 'العهدة', 'المركبات', 'كلية التدريب', 'تقارير الحضور', 'الاختبارات', 'أرشيف الاختبارات', 'التوجيهات الميدانية', 'الزي العسكري', 'الترقيات', 'الإعلانات', 'التقديم', 'قاعدة البيانات', 'أجنحة مدينة الـ 90'].map(normalizeArabic);

    rawPages.forEach(p => {
      if (!p || !p.id) return;
      
      const normTitle = normalizeArabic(p.title);
      const isSystemId = systemPageIds.includes(p.id);
      const isSystemTitle = systemNormalizedTitles.includes(normTitle);
      
      if (isSystemId) {
        p.isSystem = true;
      }
      
      if (!isSystemId && isSystemTitle) return;
      
      if (!seenIds.has(p.id)) {
        seenIds.add(p.id);
        pages.push(p);
      }
    });
    
    // Filter and build links based on checkPageAccess
    const visiblePages = pages.filter(p => {
      // Must be a parent page (no parentId)
      if (p.parentId) return false;
      // Must not be hidden
      if (p.isHidden) return false;
      // User must have access
      if (typeof Auth !== 'undefined' && !Auth.checkPageAccess(p.id)) return false;
      return true;
    });

    // Sort system pages in correct order, then custom pages
    const systemOrder = ['home', 'leadership', 'managers', 'centers', 'guide', 'inventory', 'vehicles', 'college', 'attendance-reports', 'exams', 'field-title', 'uniform', 'database', 'wings'];
    visiblePages.sort((a, b) => {
      const idxA = systemOrder.indexOf(a.id);
      const idxB = systemOrder.indexOf(b.id);
      
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return pages.indexOf(a) - pages.indexOf(b);
    });

    const links = visiblePages.map(p => {
      const isCustom = !p.isSystem;
      const href = isCustom ? `pages/custom.html?id=${p.id}` : (p.id === 'home' ? 'index.html' : `pages/${p.id}.html`);
      const iconHTML = p.emoji ? (p.emoji.includes('<i') ? p.emoji : `<span>${p.emoji}</span>`) : '📄';
      return {
        href,
        label: `${iconHTML} ${p.title}`,
        page: isCustom ? `custom_${p.id}` : p.id
      };
    });

    return `
    <nav class="navbar" id="navbar">
      <div class="navbar-inner">
        <a href="${BASE}index.html" class="navbar-logo">
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

  function sidebar(activePage = '') {
    if (typeof Auth !== 'undefined' && typeof Auth.seedSystemPages === 'function') {
      Auth.seedSystemPages();
    }
    let rawPages = (typeof Storage !== 'undefined') ? (Storage.getCollection(Storage.keys.PAGES) || []) : [];
    const seenIds = new Set();
    const pages = [];
    
    function normalizeArabic(str) {
      if (!str) return '';
      return str.trim()
        .replace(/[أإآا]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/\s+/g, '');
    }

    const systemPageIds = ['home', 'leadership', 'managers', 'centers', 'guide', 'inventory', 'vehicles', 'college', 'attendance-reports', 'exams', 'archive', 'field-title', 'uniform', 'promotions', 'announcements', 'apply', 'database', 'wings'];
    const systemNormalizedTitles = ['الرئيسية', 'القيادة', 'مدراء الأقسام', 'المراكز', 'الدليل الشامل', 'العهدة', 'المركبات', 'كلية التدريب', 'تقارير الحضور', 'الاختبارات', 'أرشيف الاختبارات', 'التوجيهات الميدانية', 'الزي العسكري', 'الترقيات', 'الإعلانات', 'التقديم', 'قاعدة البيانات', 'أجنحة مدينة الـ 90'].map(normalizeArabic);

    rawPages.forEach(p => {
      if (!p || !p.id) return;
      
      const normTitle = normalizeArabic(p.title);
      const isSystemId = systemPageIds.includes(p.id);
      const isSystemTitle = systemNormalizedTitles.includes(normTitle);
      
      if (isSystemId) {
        p.isSystem = true;
      }
      
      if (!isSystemId && isSystemTitle) return;
      
      if (!seenIds.has(p.id)) {
        seenIds.add(p.id);
        pages.push(p);
      }
    });
    const currentUser = (typeof Auth !== 'undefined') ? Auth.getCurrentUser() : null;

    // Helper to check if page is authorized
    const isAuthorized = (pageId) => {
      return (typeof Auth !== 'undefined') ? Auth.checkPageAccess(pageId) : true;
    };

    // Filter out unauthorized pages and hidden pages
    const allowedPages = pages.filter(p => !p.isHidden && isAuthorized(p.id));

    // Build items array
    const items = [];

    // 1. Core Section
    const coreIds = ['home', 'leadership', 'managers', 'centers'];
    const corePages = allowedPages.filter(p => coreIds.includes(p.id));
    corePages.sort((a, b) => coreIds.indexOf(a.id) - coreIds.indexOf(b.id));
    corePages.forEach(p => {
      items.push({
        href: `${BASE}${p.id === 'home' ? 'index.html' : 'pages/' + p.id + '.html'}`,
        icon: p.emoji ? (p.emoji.includes('<i') ? p.emoji : `<span>${p.emoji}</span>`) : '📄',
        label: p.title,
        page: p.id
      });
    });

    // 2. Knowledge Section
    const knowledgeIds = ['guide', 'college', 'attendance-reports', 'exams', 'uniform', 'archive'];
    const knowledgePages = allowedPages.filter(p => knowledgeIds.includes(p.id));
    knowledgePages.sort((a, b) => knowledgeIds.indexOf(a.id) - knowledgeIds.indexOf(b.id));
    
    if (knowledgePages.length > 0) {
      items.push({ divider: true });
      items.push({ label: 'المحتوى والمعرفة', section: true });
      knowledgePages.forEach(p => {
        items.push({
          href: `${BASE}pages/${p.id}.html`,
          icon: p.emoji ? (p.emoji.includes('<i') ? p.emoji : `<span>${p.emoji}</span>`) : '📄',
          label: p.title,
          page: p.id
        });
      });
    }

    // 3. Wings Section (if wings is allowed)
    const wingsPage = allowedPages.find(p => p.id === 'wings');
    if (wingsPage) {
      items.push({ divider: true });
      items.push({ label: wingsPage.title, section: true });
      items.push({
        href: `${BASE}pages/wings.html`,
        icon: wingsPage.emoji ? (wingsPage.emoji.includes('<i') ? wingsPage.emoji : `<span>${wingsPage.emoji}</span>`) : '🦅',
        label: 'استعراض الأجنحة',
        page: 'wings'
      });
      // Add subpages under wings
      const wingSubs = allowedPages.filter(p => p.parentId === 'wings');
      wingSubs.forEach(sub => {
        items.push({
          href: `${BASE}pages/${sub.id}.html`,
          icon: '↳',
          label: sub.title,
          page: sub.id,
          isSubpage: true
        });
      });
    }

    // 4. Admin & Documentation Section
    const adminDocsIds = ['inventory', 'promotions', 'field-title'];
    const adminDocsPages = allowedPages.filter(p => adminDocsIds.includes(p.id));
    adminDocsPages.sort((a, b) => adminDocsIds.indexOf(a.id) - adminDocsIds.indexOf(b.id));
    
    if (adminDocsPages.length > 0) {
      items.push({ divider: true });
      items.push({ label: 'الإدارة والتوثيق', section: true });
      adminDocsPages.forEach(p => {
        const isBadge = (p.id === 'promotions');
        items.push({
          href: `${BASE}pages/${p.id}.html`,
          icon: p.emoji ? (p.emoji.includes('<i') ? p.emoji : `<span>${p.emoji}</span>`) : '📄',
          label: p.title,
          page: p.id,
          badge: isBadge
        });
      });
    }

    // 5. Community Section
    const commIds = ['announcements', 'apply', 'database'];
    const commPages = allowedPages.filter(p => commIds.includes(p.id));
    commPages.sort((a, b) => commIds.indexOf(a.id) - commIds.indexOf(b.id));
    
    if (commPages.length > 0) {
      items.push({ divider: true });
      items.push({ label: 'المجتمع', section: true });
      commPages.forEach(p => {
        const isBadge = (p.id === 'announcements');
        items.push({
          href: `${BASE}pages/${p.id}.html`,
          icon: p.emoji ? (p.emoji.includes('<i') ? p.emoji : `<span>${p.emoji}</span>`) : '📄',
          label: p.title,
          page: p.id,
          badge: isBadge
        });
      });
    }

    // 6. Custom pages (dynamic pages)
    const customParents = allowedPages.filter(p => !p.parentId && !p.isSystem);
    if (customParents.length > 0) {
      items.push({ divider: true });
      items.push({ label: 'صفحات إضافية', section: true });
      customParents.forEach(p => {
        items.push({
          href: `${BASE}pages/custom.html?id=${p.id}`,
          icon: p.emoji ? (p.emoji.includes('<i') ? p.emoji : `<span>${p.emoji}</span>`) : '📄',
          label: p.title,
          page: `custom_${p.id}`
        });

        // Find child sub-pages
        const subs = allowedPages.filter(sub => sub.parentId === p.id);
        subs.forEach(sub => {
          items.push({
            href: `${BASE}pages/custom.html?id=${sub.id}`,
            icon: '↳',
            label: sub.title,
            page: `custom_${sub.id}`,
            isSubpage: true
          });
        });
      });
    }

    const itemsHTML = items.map(item => {
      if (item.divider) return `<div class="sidebar-divider"></div>`;
      if (item.section) return `<div class="sidebar-section-label">${item.label}</div>`;
      
      const subStyle = item.isSubpage ? 'style="padding-right: 32px; font-size: 0.85rem; opacity: 0.85; border-right: 1px dashed rgba(201, 162, 39, 0.2);"' : '';
      const iconStyle = item.isSubpage ? 'style="margin-left: 6px; font-size: 0.90rem; color: var(--color-gold-primary);"' : '';
      
      return `
        <a href="${item.href}" class="sidebar-nav-item${activePage === item.page ? ' active' : ''}" ${subStyle}>
          <div class="sidebar-nav-icon" ${iconStyle}>${item.icon}</div>
          ${item.label}
          ${item.badge ? `<span class="sidebar-nav-badge" data-badge="${item.page}">...</span>` : ''}
        </a>`;
    }).join('');

    // Construct profile widget
    let profileWidgetHTML = '';
    if (currentUser) {
      profileWidgetHTML = `
      <div class="sidebar-profile-widget">
        <div class="profile-header-info">
          <div class="profile-avatar-wrap">
            <img src="${currentUser.avatar_url || (BASE + 'assets/img/avatar.png')}" class="profile-avatar" onerror="this.src='${BASE}assets/img/emblem.png'">
            <div class="profile-avatar-border"></div>
          </div>
          <div class="profile-text">
            <span class="profile-name">${currentUser.display_name || currentUser.username}</span>
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
          <img src="${BASE}assets/img/emblem.png" alt="شعار الأمن العام" class="sidebar-logo-img" onerror="this.outerHTML='<div class=\'sidebar-logo-icon emblem-mini\'><i class=\'fa-solid fa-shield-halved\'></i></div>'">
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
            <span class="sidebar-stat-value" id="sb-total">127</span>
            <span class="sidebar-stat-label">عضو</span>
          </div>
          <div class="sidebar-stat">
            <span class="sidebar-stat-value" id="sb-online">34</span>
            <span class="sidebar-stat-label">متصل</span>
          </div>
          <div class="sidebar-stat">
            <span class="sidebar-stat-value" id="sb-centers">${(typeof Storage !== 'undefined') ? (Storage.getCollection(Storage.keys.CENTERS) || []).length : 1}</span>
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
                <img src="${BASE}assets/img/emblem.png" alt="شعار الأمن العام" class="footer-emblem" onerror="this.outerHTML='<div class=\'footer-logo-icon emblem-mini\'><i class=\'fa-solid fa-shield-halved\'></i></div>'">
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
                <a href="${BASE}pages/leadership.html" class="footer-link">القيادة</a>
                <a href="${BASE}pages/centers.html"    class="footer-link">المراكز</a>
                <a href="${BASE}pages/promotions.html" class="footer-link">الترقيات</a>
                <a href="${BASE}pages/inventory.html"  class="footer-link">العهدة</a>
              </div>
            </div>
            <div>
              <div class="footer-col-title">التدريب</div>
              <div class="footer-links">
                <a href="${BASE}pages/guide.html"    class="footer-link">الدليل الشامل</a>
                <a href="${BASE}pages/college.html"  class="footer-link">كلية التدريب</a>
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

  return { navbar, sidebar, footer, pageShell };
})();

window.Components = Components;

// Automatically inject Preview Mode Widget and Banner for the Owner on all pages
(function() {
  function injectPreviewWidget() {
    if (typeof Auth !== 'undefined' && typeof Auth.isActualOwner === 'function' && Auth.isActualOwner()) {
      // Inject a sticky top warning banner if preview mode is active (preview role is not 'owner')
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

