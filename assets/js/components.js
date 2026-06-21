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
    const customPages = (typeof Storage !== 'undefined') ? Storage.getCollection(Storage.keys.PAGES) : [];
    
    const currentUser = (typeof Auth !== 'undefined') ? Auth.getCurrentUser() : null;
    const userRole = currentUser ? currentUser.role : null;
    const userRank = currentUser ? currentUser.rank : null;
    const ROLE_LEVELS = {
      'owner': 6,
      'assistant_owner': 5,
      'academy_affairs': 4.5,
      'admin': 4,
      'course_admin': 3.5,
      'viewer': 0
    };
    const isAuthorizedForAttendance = currentUser && (
      ['1334568342345748565', '1120142432554713261', '821825761673478144'].includes(currentUser.id) ||
      (ROLE_LEVELS[userRole] >= 3.5) ||
      (userRank && (
        userRank.includes('ادارة تدريب') ||
        userRank.includes('إدارة تدريب') ||
        userRank.includes('ادارة التدريب') ||
        userRank.includes('إدارة التدريب')
      ))
    );

    const links = [
      { href: 'index.html', label: '<i class="fa-solid fa-house"></i> الرئيسية', page: 'home' },
      { href: 'pages/leadership.html', label: '<i class="fa-solid fa-crown"></i> القيادة', page: 'leadership' },
      { href: 'pages/managers.html', label: '<i class="fa-solid fa-medal"></i> مدراء الأقسام', page: 'managers' },
      { href: 'pages/centers.html', label: '<i class="fa-solid fa-building-shield"></i> المراكز', page: 'centers' },
      { href: 'pages/guide.html', label: '<i class="fa-solid fa-book-open"></i> الدليل الشامل', page: 'guide' },
      { href: 'pages/inventory.html', label: '<i class="fa-solid fa-box-open"></i> العهدة', page: 'inventory' },
      { href: 'pages/vehicles.html', label: '<i class="fa-solid fa-car-on"></i> المركبات', page: 'vehicles' },
      { href: 'pages/college.html', label: '<i class="fa-solid fa-graduation-cap"></i> كلية التدريب', page: 'college' }
    ];

    if (isAuthorizedForAttendance) {
      links.push({ href: 'pages/attendance-reports.html', label: '<i class="fa-solid fa-clipboard-user"></i> تقارير الحضور', page: 'attendance-reports' });
    }

    links.push(
      { href: 'pages/exams.html', label: '<i class="fa-solid fa-file-pen"></i> الاختبارات', page: 'exams' },
      { href: 'pages/field-title.html', label: '<i class="fa-solid fa-id-card"></i> التوجيهات الميدانية', page: 'field-title' },
      { href: 'pages/uniform.html', label: '<i class="fa-solid fa-shirt"></i> الزي العسكري', page: 'uniform' },
      { href: 'pages/database.html', label: '<i class="fa-solid fa-lock"></i> قاعدة البيانات', page: 'database' }
    );

    // Add custom dynamic pages to sub-bar
    const customLinks = customPages.filter(p => !p.parentId && !p.isHidden).map(p => ({
      href: `pages/custom.html?id=${p.id}`,
      label: `${p.emoji || '📄'} ${p.title}`,
      page: `custom_${p.id}`
    }));

    const allLinks = [...links, ...customLinks];

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
          ${allLinks.map(l => `<a href="${BASE}${l.href}" class="sub-link${activePage === l.page ? ' active' : ''}">${l.label}</a>`).join('')}
        </div>
      </div>
    </nav>`;
  }

  function sidebar(activePage = '') {
    const customPages = (typeof Storage !== 'undefined') ? Storage.getCollection(Storage.keys.PAGES) : [];

    const currentUser = (typeof Auth !== 'undefined') ? Auth.getCurrentUser() : null;
    const userRole = currentUser ? currentUser.role : null;
    const userRank = currentUser ? currentUser.rank : null;
    const ROLE_LEVELS = {
      'owner': 6,
      'assistant_owner': 5,
      'academy_affairs': 4.5,
      'admin': 4,
      'course_admin': 3.5,
      'viewer': 0
    };
    const isAuthorizedForAttendance = currentUser && (
      ['1334568342345748565', '1120142432554713261', '821825761673478144'].includes(currentUser.id) ||
      (ROLE_LEVELS[userRole] >= 3.5) ||
      (userRank && (
        userRank.includes('ادارة تدريب') ||
        userRank.includes('إدارة تدريب') ||
        userRank.includes('ادارة التدريب') ||
        userRank.includes('إدارة التدريب')
      ))
    );

    const items = [
      { href: `${BASE}index.html`,                    icon: '<i class="fa-solid fa-house"></i>', label: 'الرئيسية',         page: 'home' },
      { href: `${BASE}pages/leadership.html`,         icon: '<i class="fa-solid fa-crown"></i>', label: 'القيادة',           page: 'leadership' },
      { href: `${BASE}pages/managers.html`,           icon: '<i class="fa-solid fa-medal"></i>', label: 'مدراء الأقسام',     page: 'managers' },
      { href: `${BASE}pages/centers.html`,            icon: '<i class="fa-solid fa-building-shield"></i>', label: 'المراكز',           page: 'centers' },
      { divider: true },
      { label: 'المحتوى والمعرفة', section: true },
      { href: `${BASE}pages/guide.html`,              icon: '<i class="fa-solid fa-book-open"></i>', label: 'الدليل الشامل',     page: 'guide' },
      { href: `${BASE}pages/college.html`,            icon: '<i class="fa-solid fa-graduation-cap"></i>', label: 'كلية التدريب',      page: 'college' }
    ];

    if (isAuthorizedForAttendance) {
      items.push({ href: `${BASE}pages/attendance-reports.html`, icon: '<i class="fa-solid fa-clipboard-user"></i>', label: 'تقارير الحضور',   page: 'attendance-reports' });
    }

    items.push(
      { href: `${BASE}pages/exams.html`,              icon: '<i class="fa-solid fa-file-pen"></i>', label: 'الاختبارات',        page: 'exams' },
      { href: `${BASE}pages/uniform.html`,            icon: '<i class="fa-solid fa-shirt"></i>', label: 'الزي العسكري',      page: 'uniform' }
    );

  if (['owner','assistant_owner','admin'].includes(userRole)) {
    items.push({ href: `${BASE}pages/archive.html`, icon: '<i class="fa-solid fa-book-bookmark"></i>', label: 'أرشيف الاختبارات', page: 'archive' });
  }

    // Append custom pages in a separate section with hierarchical sub-pages if there are any
    const visibleParents = customPages.filter(p => !p.parentId && !p.isHidden);
    if (visibleParents.length > 0) {
      items.push({ divider: true });
      items.push({ label: 'صفحات إضافية', section: true });
      
      visibleParents.forEach(p => {
        items.push({
          href: `${BASE}pages/custom.html?id=${p.id}`,
          icon: p.emoji || '📄',
          label: p.title,
          page: `custom_${p.id}`
        });

        // Find child sub-pages
        const subs = customPages.filter(sub => sub.parentId === p.id && !sub.isHidden);
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

    items.push(
      { divider: true },
      { label: 'الإدارة والتوثيق', section: true },
      { href: `${BASE}pages/inventory.html`,          icon: '<i class="fa-solid fa-box-open"></i>', label: 'العهدة',            page: 'inventory' },
      { href: `${BASE}pages/promotions.html`,         icon: '⬆️', label: 'الترقيات',          page: 'promotions', badge: true },
      { href: `${BASE}pages/field-title.html`,        icon: '<i class="fa-solid fa-id-card"></i>', label: 'التوجيهات الميدانية',   page: 'field-title' },
      { divider: true },
      { label: 'المجتمع', section: true },
      { href: `${BASE}pages/announcements.html`,      icon: '<i class="fa-solid fa-bullhorn"></i>', label: 'الإعلانات',         page: 'announcements', badge: true },
      { href: `${BASE}pages/apply.html`,              icon: '<i class="fa-solid fa-envelope-open-text"></i>', label: 'التقديم',           page: 'apply' },
      { href: `${BASE}pages/database.html`,           icon: '<i class="fa-solid fa-folder-tree"></i>', label: 'قاعدة البيانات',   page: 'database' }
    );

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
      <div class="sidebar-body">${itemsHTML}</div>
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
                <a href="${BASE}pages/exams.html"    class="footer-link">الاختبارات</a>
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
              <span>© 2026 إدارة الأمن العام - مدينة الـ90</span>
              <span class="heart"><i class="fa-solid fa-heart" style="color: #e74c3c;"></i></span>
              <span>جميع الحقوق محفوظة إلى أصحابها ريان بن محمد - إبراهيم بن علي - عمر المالكي</span>
            </div>
            <div class="footer-bottom-links">
            </div>
            <div class="footer-server-id">🎮 FiveM | PS-City90</div>
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

