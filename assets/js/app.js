/**
 * app.js - التهيئة الرئيسية للموقع
 * Main Application Bootstrap & Utilities
 */

// Dynamically inject Public Security logo favicon
(function() {
  let link = document.querySelector("link[rel~='icon']");
  const pathname = window.location.pathname;
  let prefix = '/';
  if (window.location.protocol === 'file:') {
    const isPagesAdmin = pathname.includes('/pages/admin/');
    const isPages = pathname.includes('/pages/') || pathname.includes('/auth/');
    prefix = isPagesAdmin ? '../../' : (isPages ? '../' : '');
  }
  const href = prefix + 'assets/img/emblem.png';

  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.href = href;
    document.head.appendChild(link);
  } else {
    link.href = href;
  }
})();

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

// Prevent copying, cutting, pasting, context menu, dragging, and key shortcuts globally
(function() {
  const isEditable = (el) => {
    if (!el) return false;
    const tagName = el.tagName ? el.tagName.toLowerCase() : '';
    return el.isContentEditable || 
           tagName === 'input' || 
           tagName === 'textarea' || 
           el.closest('[contenteditable="true"]') !== null ||
           el.closest('[contenteditable]') !== null;
  };

  const preventDefaultActions = (e) => {
    if (!isEditable(e.target)) {
      e.preventDefault();
      if (e.type === 'copy' || e.type === 'cut') {
        if (typeof App !== 'undefined' && App.toast) {
          App.toast('⚠️ نسخ محتوى الموقع غير مسموح به لحماية الحقوق', 'warning');
        }
      }
    }
  };

  document.addEventListener('copy', preventDefaultActions, true);
  document.addEventListener('cut', preventDefaultActions, true);
  document.addEventListener('paste', preventDefaultActions, true);
  document.addEventListener('contextmenu', preventDefaultActions, true);
  document.addEventListener('dragstart', preventDefaultActions, true);

  // Prevent keyboard shortcuts for copying, selecting, view source, developer tools
  document.addEventListener('keydown', (e) => {
    if (isEditable(e.target)) return;

    // Ctrl+C, Ctrl+X, Ctrl+A (Select All)
    if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'a', 'C', 'X', 'A'].includes(e.key)) {
      e.preventDefault();
    }
    // Ctrl+U (View Source), Ctrl+S (Save), Ctrl+P (Print)
    if ((e.ctrlKey || e.metaKey) && ['u', 's', 'p', 'U', 'S', 'P'].includes(e.key)) {
      e.preventDefault();
    }
    // F12 or Ctrl+Shift+I / J / C (DevTools)
    if (e.key === 'F12' || 
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c', 'I', 'J', 'C'].includes(e.key))) {
      e.preventDefault();
    }
  }, true);

  // Anti-debugging disabled for testing and debugging
  // (Console overrides and infinite debugger loop removed)
})();

// Global fetch interceptor removed in favor of storage.js interceptor

const App = (() => {

  let discordUsersCache = {};

  async function loadDiscordUsersInApp() {
    try {
      const ROOT = getRootPath();
      const res = await fetch(ROOT + 'assets/data/discord_users.json?t=' + Date.now());
      if (res.ok) {
        discordUsersCache = await res.json();
        if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
          initUserBadge();
        }
      }
    } catch (e) {
      console.warn('Failed to load discord users in app.js:', e);
    }
  }

  /* ── Helper to resolve paths relative to root ────── */
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

  function getSettingsApiUrl() {
    const host = window.location.hostname;
    const protocol = window.location.protocol;
    
    // Read backendUrl from settings.json cache in localStorage
    let backendUrl = '';
    try {
      const settings = Storage.get(Storage.keys.SETTINGS, {});
      if (settings && settings.backendUrl) {
        backendUrl = settings.backendUrl;
      }
    } catch (e) {}

    // If logged-in user is the owner, route writes to local dev server to trigger auto-deploy
    let isOwner = false;
    if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
      const user = Auth.getCurrentUser();
      if (user && Auth.hasRole(user.role, 'owner')) {
        isOwner = true;
      }
    }

    if (backendUrl) {
      return `${backendUrl}/api/settings`;
    }

    if (host === 'localhost' || host === '127.0.0.1' || protocol === 'file:' || isOwner) {
      return 'http://localhost:3000/api/settings';
    }
    const ROOT = getRootPath();
    return ROOT + 'api/settings';
  }

  let detectedBackendUrl = sessionStorage.getItem('detected_backend_url');

  function getApiBase() {
    const host = window.location.hostname;
    const protocol = window.location.protocol;
    if (host === 'localhost' || host === '127.0.0.1' || protocol === 'file:') {
      return 'http://localhost:3000';
    }
    if (detectedBackendUrl) return detectedBackendUrl;
    
    let backendUrl = '';
    try {
      const settings = Storage.get(Storage.keys.SETTINGS, {});
      if (settings && settings.backendUrl) {
        backendUrl = settings.backendUrl;
      }
    } catch (e) {}

    if (backendUrl) {
      return backendUrl;
    }
    return 'https://amn-backend-euhi.onrender.com';
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

  /* ── Toast Notifications ──────────────────────────── */

  function toast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.style.setProperty('--toast-duration', `${duration}ms`);
    t.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span><div class="toast-progress"></div>`;
    container.appendChild(t);

    setTimeout(() => {
      t.classList.add('removing');
      setTimeout(() => t.remove(), 300);
    }, duration);
  }

  /* ── Dark Mode ────────────────────────────────────── */
  function initTheme() {
    // Locked to Dark Mode by default as requested
    document.documentElement.setAttribute('data-theme', 'dark');
    _updateThemeIcon('dark');
  }

  function toggleTheme() {
    // Lock to dark, theme toggling is disabled
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  function _updateThemeIcon(theme) {
    const icons = document.querySelectorAll('.theme-icon');
    icons.forEach(icon => {
      icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    });
  }

  /* ── Navbar Scroll ────────────────────────────────── */
  function initNavbarScroll() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });
  }

  /* ── Sidebar ──────────────────────────────────────── */
  function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const openBtns = document.querySelectorAll('[data-action="open-sidebar"]');
    const closeBtns = document.querySelectorAll('[data-action="close-sidebar"]');
    const menuToggle = document.querySelector('.menu-toggle');

    if (!sidebar || !overlay) return;

    function openSidebar() {
      sidebar.classList.add('open');
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
      if (menuToggle) menuToggle.classList.add('open');
    }

    function closeSidebar() {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
      document.body.style.overflow = '';
      if (menuToggle) menuToggle.classList.remove('open');
    }

    openBtns.forEach(btn => btn.addEventListener('click', openSidebar));
    closeBtns.forEach(btn => btn.addEventListener('click', closeSidebar));
    overlay.addEventListener('click', closeSidebar);
    if (menuToggle) menuToggle.addEventListener('click', openSidebar);

    // Escape key
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeSidebar();
    });

    // Handle Owner Preview Select in Sidebar
    if (typeof Auth !== 'undefined' && typeof Auth.isActualOwner === 'function' && Auth.isActualOwner()) {
      const sidebarBody = sidebar.querySelector('.sidebar-body');
      if (sidebarBody && !sidebarBody.querySelector('#sidebar-preview-role-select')) {
        const currentPreview = Auth.getPreviewRole() || 'owner';
        
        const divider = document.createElement('div');
        divider.className = 'sidebar-divider';
        
        const sectionLabel = document.createElement('div');
        sectionLabel.className = 'sidebar-section-label';
        sectionLabel.innerHTML = `<i class="fa-solid fa-eye" style="color: var(--color-gold-primary); margin-left: 6px;"></i>معاينة رتب الموقع`;
        
        const selectContainer = document.createElement('div');
        selectContainer.style.cssText = `
          padding: 8px 24px;
          direction: rtl;
        `;
        
        const select = document.createElement('select');
        select.id = 'sidebar-preview-role-select';
        select.style.cssText = `
          width: 100%;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(201, 162, 39, 0.3);
          border-radius: 6px;
          color: #fff;
          padding: 8px 12px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          outline: none;
          font-family: inherit;
          direction: rtl;
          transition: border-color 0.2s;
        `;
        
        const roles = [
          { value: 'owner', label: 'المشرف العام (الأساسي)' },
          { value: 'assistant_owner', label: 'قيادة الامن العام' },
          { value: 'academy_affairs', label: 'رئاسة تدريب الامن العام' },
          { value: 'admin', label: 'شؤون أكاديمية التدريب' },
          { value: 'recruitment_affairs', label: 'شؤون التجنيد' },
          { value: 'course_admin', label: 'مسؤول دورة' },
          { value: 'viewer', label: 'مشاهد' }
        ];
        
        roles.forEach(role => {
          const opt = document.createElement('option');
          opt.value = role.value;
          opt.textContent = role.label;
          opt.style.background = '#0d122b';
          opt.style.color = '#fff';
          if (role.value === currentPreview) {
            opt.selected = true;
          }
          select.appendChild(opt);
        });
        
        select.addEventListener('change', (e) => {
          Auth.setPreviewRole(e.target.value);
        });
        
        selectContainer.appendChild(select);
        sidebarBody.appendChild(divider);
        sidebarBody.appendChild(sectionLabel);
        sidebarBody.appendChild(selectContainer);
      }
    }
  }

  /* ── Active Nav Link ──────────────────────────────── */
  function setActiveNav() {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-link, .sidebar-nav-item');
    navLinks.forEach(link => {
      const href = link.getAttribute('href') || '';
      if (href && currentPath.endsWith(href.replace('../', '').replace('./', ''))) {
        link.classList.add('active');
      }
    });
  }

  /* ── User Navbar Badge ────────────────────────────── */
  function initUserBadge() {
    const actions = document.querySelector('.navbar-actions');
    if (!actions) return;

    const legacyBadge = actions.querySelector('.navbar-user');
    if (legacyBadge) legacyBadge.remove();

    let userBadge = actions.querySelector('.navbar-user-group');

    if (Auth.isLoggedIn()) {
      const user = Auth.getCurrentUser();
      const ROOT = getRootPath();

      if (!userBadge) {
        userBadge = document.createElement('div');
        userBadge.className = 'navbar-user-group';
        userBadge.style.cssText = `
          display: flex;
          align-items: center;
          gap: 12px;
        `;

        const toggle = actions.querySelector('.menu-toggle');
        if (toggle) {
          actions.insertBefore(userBadge, toggle);
        } else {
          actions.appendChild(userBadge);
        }
      } else {
        userBadge.style.display = 'flex';
      }

      let displayName = user.globalName || user.discord || 'عضو';
      if (typeof Auth !== 'undefined' && typeof Auth.resolveUserTableInfo === 'function') {
        const info = Auth.resolveUserTableInfo(user);
        const inMainTables = info && info.tables && info.tables.some(t => ['الأساسي', 'المعتمدين', 'الإدارة', 'الادارة'].includes(t));
        if (inMainTables && info && info.name) {
          displayName = info.name;
        }
      }

      let avatarUrl = user.avatar;
      // Try resolving actual Discord avatar from our local json cache if current avatar is fallback
      const isFallback = !avatarUrl || 
                         avatarUrl === '🎮' || 
                         avatarUrl.includes('emblem.png') || 
                         avatarUrl.includes('<') || 
                         avatarUrl.includes('fa-') || 
                         !avatarUrl.includes('/');
      if (isFallback) {
        const discordId = user.discord_id || user.id;
        if (discordId && discordUsersCache[discordId] && discordUsersCache[discordId].avatar) {
          avatarUrl = discordUsersCache[discordId].avatar;
        } else if (user.discord && typeof user.discord === 'string') {
          const cleanU = user.discord.trim().toLowerCase().replace('@', '');
          const foundEntry = Object.values(discordUsersCache).find(u => 
            (u.username && u.username.toLowerCase() === cleanU) ||
            (u.globalName && u.globalName.toLowerCase() === cleanU)
          );
          if (foundEntry && foundEntry.avatar) {
            avatarUrl = foundEntry.avatar;
          }
        }
      }

      // Resolve path through window.resolveDiscordAsset helper to support production CDN fallback
      avatarUrl = window.resolveDiscordAsset(avatarUrl, 'avatar');

      if (!avatarUrl || avatarUrl === '🎮') {
        avatarUrl = ROOT + 'assets/img/emblem.png';
      }

      let adminBtnHtml = '';
      const isAuthorizedAdmin = Auth.hasAnyRole(user.role, ['owner', 'assistant_owner', 'academy_affairs', 'admin']);
      if (isAuthorizedAdmin) {
        adminBtnHtml = `
          <a href="${ROOT}pages/admin/amn16.html" class="dropdown-item admin-link" id="nav-admin-dashboard-btn">
            <i class="fa-solid fa-gear"></i>
            <span>لوحة التحكم</span>
          </a>
        `;
      }

      let ownerStatusToggleHtml = '';
      const isOwner = Auth.hasRole(user.role, 'owner');
      const canToggleMaintenance = Auth.hasAnyRole(user.role, ['owner', 'academy_affairs']);
      if (canToggleMaintenance) {
        const settings = Storage.get(Storage.keys.SETTINGS, {});
        const isMaintenance = settings.maintenanceMode === true;
        ownerStatusToggleHtml = `
          <div class="dropdown-status-toggle">
            <div class="status-toggle-header">تحديث حالة الموقع</div>
            <div class="status-toggle-options">
              <button type="button" class="status-toggle-opt ${!isMaintenance ? 'active' : ''}" data-status="publish">
                <span class="status-dot green"></span>
                <span>نشر</span>
              </button>
              <button type="button" class="status-toggle-opt ${isMaintenance ? 'active' : ''}" data-status="maintenance">
                <span class="status-dot red"></span>
                <span>صيانة</span>
              </button>
            </div>
          </div>
        `;
      }

      let ownerPreviewToggleHtml = '';
      if (typeof Auth !== 'undefined' && typeof Auth.isActualOwner === 'function' && Auth.isActualOwner()) {
        const currentPreview = Auth.getPreviewRole() || 'owner';
        ownerPreviewToggleHtml = `
          <div class="dropdown-status-toggle">
            <div class="status-toggle-header" style="display: flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-eye" style="color: #c9a227; font-size: 11px;"></i>
              <span>معاينة رتب الموقع</span>
            </div>
            <div style="width: 100%;">
              <select id="dropdown-preview-role-select" style="width: 100%; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(201, 162, 39, 0.3); border-radius: 6px; color: #fff; padding: 6px 10px; font-size: 11.5px; font-weight: 700; cursor: pointer; outline: none; font-family: var(--font-arabic); direction: rtl;">
                <option value="owner" ${currentPreview === 'owner' ? 'selected' : ''} style="background: #0d122b; color: #fff;">المشرف العام (الأساسي)</option>
                <option value="assistant_owner" ${currentPreview === 'assistant_owner' ? 'selected' : ''} style="background: #0d122b; color: #fff;">قيادة الامن العام</option>
                <option value="academy_affairs" ${currentPreview === 'academy_affairs' ? 'selected' : ''} style="background: #0d122b; color: #fff;">رئاسة تدريب الامن العام</option>
                <option value="admin" ${currentPreview === 'admin' ? 'selected' : ''} style="background: #0d122b; color: #fff;">شؤون أكاديمية التدريب</option>
                <option value="recruitment_affairs" ${currentPreview === 'recruitment_affairs' ? 'selected' : ''} style="background: #0d122b; color: #fff;">شؤون التجنيد</option>
                <option value="course_admin" ${currentPreview === 'course_admin' ? 'selected' : ''} style="background: #0d122b; color: #fff;">مسؤول دورة</option>
                <option value="viewer" ${currentPreview === 'viewer' ? 'selected' : ''} style="background: #0d122b; color: #fff;">مشاهد</option>
              </select>
            </div>
          </div>
        `;
      }

      userBadge.innerHTML = `
        <div class="navbar-status-badge logged-in" title="الحالة: متصل بالديسكورد">
          <span class="status-dot green animate-pulse-glow"></span>
          <span class="status-text">متصل</span>
        </div>
        <div class="navbar-user-dropdown-wrapper">
          <div class="navbar-user-pill" id="navbar-user-pill-btn" title="الملف الشخصي">
            <i class="fa-solid fa-chevron-down dropdown-arrow"></i>
            <span class="navbar-user-name">${displayName}</span>
            <img src="${avatarUrl}" class="navbar-user-avatar" alt="Avatar" onerror="this.src='${ROOT}assets/img/emblem.png'">
          </div>
          <div class="navbar-user-dropdown-menu" id="navbar-user-dropdown-menu-list">
            <a href="${ROOT}pages/amn15.html" class="dropdown-item">
              <i class="fa-solid fa-user"></i>
              <span>الملف الشخصي</span>
            </a>
            ${adminBtnHtml}
            ${ownerStatusToggleHtml}
            ${ownerPreviewToggleHtml}
            <hr class="dropdown-divider">
            <button type="button" class="dropdown-item logout-btn" id="nav-dropdown-logout-btn">
              <i class="fa-solid fa-right-from-bracket"></i>
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </div>
      `;

      const pillBtn = userBadge.querySelector('#navbar-user-pill-btn');
      const dropdownMenu = userBadge.querySelector('#navbar-user-dropdown-menu-list');
      const arrowIcon = userBadge.querySelector('.dropdown-arrow');

      if (pillBtn && dropdownMenu) {
        pillBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = dropdownMenu.classList.toggle('active');
          if (arrowIcon) {
            arrowIcon.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
          }
        });

        document.addEventListener('click', (e) => {
          if (!dropdownMenu.contains(e.target) && !pillBtn.contains(e.target)) {
            dropdownMenu.classList.remove('active');
            if (arrowIcon) {
              arrowIcon.style.transform = 'rotate(0deg)';
            }
          }
        });
      }

      const adminBtn = userBadge.querySelector('#nav-admin-dashboard-btn');
      if (adminBtn) {
        adminBtn.addEventListener('click', () => {
          sessionStorage.setItem('admin_referrer', window.location.href);
        });
      }

      const logoutBtn = userBadge.querySelector('#nav-dropdown-logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          Auth.logout();
        });
      }

      if (canToggleMaintenance) {
        const toggleOptions = userBadge.querySelectorAll('.status-toggle-opt');
        toggleOptions.forEach(opt => {
          opt.addEventListener('click', async (e) => {
            e.stopPropagation();
            const targetStatus = opt.getAttribute('data-status');
            const newMode = targetStatus === 'maintenance';
            const settings = Storage.get(Storage.keys.SETTINGS, {});
            const isMaintenance = settings.maintenanceMode === true;
            
            if (newMode === isMaintenance) return;
            
            const confirmMsg = newMode 
              ? 'هل أنت متأكد من رغبتك في إغلاق الموقع وتفعيل وضع الصيانة؟'
              : 'هل أنت متأكد من رغبتك في فتح الموقع للعامة وإلغاء وضع الصيانة؟';
            const confirmTitle = newMode ? 'تفعيل وضع الصيانة' : 'تفعيل وضع النشر';
            
            const confirmed = await App.confirm(confirmMsg, confirmTitle);
            if (confirmed) {
              const S = Storage.get(Storage.keys.SETTINGS, {});
              S.maintenanceMode = newMode;
              if (newMode && !S.maintenanceMessage) {
                S.maintenanceMessage = 'البوابة الإلكترونية مغلقة مؤقتاً لأعمال الصيانة والتحديث الفني الميداني.';
              }
              Storage.set(Storage.keys.SETTINGS, S);
              
              try {
                const res = await fetchWithTimeout(App.getSettingsApiUrl(), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    maintenanceMode: newMode,
                    maintenanceMessage: S.maintenanceMessage
                  })
                });
                
                if (!res.ok) throw new Error('API Sync Failed');
                App.toast(newMode ? '🚧 تم تفعيل وضع الصيانة بنجاح.' : '🔓 تم فتح الموقع بنجاح.', 'success');
              } catch (err) {
                console.warn('Failed to sync settings with server:', err);
                App.toast(newMode ? '🚧 تم تفعيل وضع الصيانة محلياً.' : '🔓 تم فتح الموقع محلياً.', 'success');
              }
              
              if (typeof Logger !== 'undefined') {
                const actionDesc = newMode ? 'تفعيل وضع الصيانة وإغلاق الموقع' : 'إلغاء وضع الصيانة وفتح الموقع للعامة';
                Logger.log('settings_change', `${actionDesc} (عبر القائمة المنسدلة للنافبار)`);
              }
              
              setTimeout(() => {
                window.location.reload();
              }, 1000);
            }
          });
        });
      }

      if (typeof Auth !== 'undefined' && typeof Auth.isActualOwner === 'function' && Auth.isActualOwner()) {
        const previewSelect = userBadge.querySelector('#dropdown-preview-role-select');
        if (previewSelect) {
          previewSelect.addEventListener('change', (e) => {
            Auth.setPreviewRole(e.target.value);
          });
        }
      }

      // Show Edit Mode switch strictly for the Owner (Disabled)
      if (false && user.role === 'owner') {
        let editBtn = document.getElementById('navbar-edit-toggle');
        let saveBtn = document.getElementById('navbar-save-toggle');
        let layoutBtn = document.getElementById('navbar-layout-toggle');
        let addPageBtn = document.getElementById('navbar-add-page');
        let addElementBtn = document.getElementById('navbar-add-element');
        let deletePageBtn = document.getElementById('navbar-delete-page');

        if (!editBtn) {
          // 1. Edit Mode toggle button
          editBtn = document.createElement('button');
          editBtn.id = 'navbar-edit-toggle';
          editBtn.className = 'btn-navbar-edit';
          editBtn.innerHTML = '<span>✏️</span><span>وضع التعديل</span>';
          editBtn.style.cssText = `
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 14px;
            background: rgba(201, 162, 39, 0.08);
            border: 1px solid rgba(201, 162, 39, 0.3);
            border-radius: 20px;
            color: #c9a227;
            font-size: 11px;
            font-weight: 800;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-left: 10px;
          `;
          
          // 2. Layout Mode button
          layoutBtn = document.createElement('button');
          layoutBtn.id = 'navbar-layout-toggle';
          layoutBtn.innerHTML = '<span>↔️</span><span>التموضع: حر</span>';
          layoutBtn.style.cssText = `
            display: none;
            align-items: center;
            gap: 6px;
            padding: 6px 14px;
            background: #7289da;
            border: none;
            border-radius: 20px;
            color: #fff;
            font-size: 11px;
            font-weight: 800;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-left: 6px;
          `;

          // 3. Save button
          saveBtn = document.createElement('button');
          saveBtn.id = 'navbar-save-toggle';
          saveBtn.innerHTML = '<span>💾</span><span>حفظ التغييرات</span>';
          saveBtn.style.cssText = `
            display: none;
            align-items: center;
            gap: 6px;
            padding: 6px 14px;
            background: linear-gradient(135deg, #2ecc71, #27ae60);
            border: none;
            border-radius: 20px;
            color: #fff;
            font-size: 11px;
            font-weight: 800;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-left: 6px;
          `;

          // 4. Add Page button (Only for Owner)
          addPageBtn = document.createElement('button');
          addPageBtn.id = 'navbar-add-page';
          addPageBtn.innerHTML = '<span>📄</span><span>أضف صفحة جديدة</span>';
          addPageBtn.style.cssText = `
            display: none;
            align-items: center;
            gap: 6px;
            padding: 6px 14px;
            background: linear-gradient(135deg, #9b59b6, #8e44ad);
            border: none;
            border-radius: 20px;
            color: #fff;
            font-size: 11px;
            font-weight: 800;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-left: 6px;
          `;

          // 5. Add Element button (Only for Owner)
          addElementBtn = document.createElement('button');
          addElementBtn.id = 'navbar-add-element';
          addElementBtn.innerHTML = '<span>➕</span><span>أضف عنصر جديد</span>';
          addElementBtn.style.cssText = `
            display: none;
            align-items: center;
            gap: 6px;
            padding: 6px 14px;
            background: linear-gradient(135deg, #e67e22, #d35400);
            border: none;
            border-radius: 20px;
            color: #fff;
            font-size: 11px;
            font-weight: 800;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-left: 6px;
          `;

          // 6. Delete Page button (Only for Owner and only on custom pages)
          const urlParams = new URLSearchParams(window.location.search);
          const customPageId = urlParams.get('id');
          const isCustomPage = window.location.pathname.includes('custom.html') && customPageId;

          if (isCustomPage) {
            deletePageBtn = document.createElement('button');
            deletePageBtn.id = 'navbar-delete-page';
            deletePageBtn.innerHTML = '<span>🗑️</span><span>حذف الصفحة</span>';
            deletePageBtn.style.cssText = `
              display: none;
              align-items: center;
              gap: 6px;
              padding: 6px 14px;
              background: linear-gradient(135deg, #e74c3c, #c0392b);
              border: none;
              border-radius: 20px;
              color: #fff;
              font-size: 11px;
              font-weight: 800;
              cursor: pointer;
              transition: all 0.3s ease;
              margin-left: 6px;
            `;
          }

          // Hover events for editBtn
          editBtn.onmouseover = () => {
            if (!document.body.classList.contains('global-live-editing')) {
              editBtn.style.background = 'rgba(201, 162, 39, 0.15)';
              editBtn.style.borderColor = '#c9a227';
            }
          };
          editBtn.onmouseout = () => {
            if (!document.body.classList.contains('global-live-editing')) {
              editBtn.style.background = 'rgba(201, 162, 39, 0.08)';
              editBtn.style.borderColor = 'rgba(201, 162, 39, 0.3)';
            }
          };

          editBtn.addEventListener('click', () => {
            const mainToggleBtn = document.getElementById('btn-toggle-live-edit');
            if (mainToggleBtn) {
              mainToggleBtn.click();
              
              const isActive = document.body.classList.contains('global-live-editing');
              if (isActive) {
                editBtn.style.background = 'linear-gradient(135deg, #c9a227, #8a6d0f)';
                editBtn.style.color = '#fff';
                editBtn.style.borderColor = '#c9a227';
                editBtn.querySelector('span:last-child').textContent = 'إلغاء التعديل';

                layoutBtn.style.display = 'flex';
                saveBtn.style.display = 'flex';
                
                // Show Add/Delete page controls only if role is owner
                if (Auth.hasRole(user.role, 'owner')) {
                  addPageBtn.style.display = 'flex';
                  addElementBtn.style.display = 'flex';
                  if (deletePageBtn) {
                    deletePageBtn.style.display = 'flex';
                  }
                }
              } else {
                editBtn.style.background = 'rgba(201, 162, 39, 0.08)';
                editBtn.style.color = '#c9a227';
                editBtn.style.borderColor = 'rgba(201, 162, 39, 0.3)';
                editBtn.querySelector('span:last-child').textContent = 'وضع التعديل';

                layoutBtn.style.display = 'none';
                saveBtn.style.display = 'none';
                addPageBtn.style.display = 'none';
                addElementBtn.style.display = 'none';
                if (deletePageBtn) {
                  deletePageBtn.style.display = 'none';
                }
              }
            } else {
              App.toast('برجاء الانتظار حتى تحميل الصفحة وتفعيل وضع التعديل من اللوحة.', 'warning');
            }
          });

          layoutBtn.addEventListener('click', () => {
            const mainLayoutBtn = document.getElementById('btn-toggle-layout-mode');
            if (mainLayoutBtn) {
              mainLayoutBtn.click();
              const mainText = mainLayoutBtn.textContent.trim();
              layoutBtn.querySelector('span:last-child').textContent = mainText;
            }
          });

          saveBtn.addEventListener('click', () => {
            const mainSaveBtn = document.getElementById('btn-save-live-edit');
            if (mainSaveBtn) {
              mainSaveBtn.click();
            }
          });

          addPageBtn.addEventListener('click', () => {
            const title = prompt('أدخل عنوان الصفحة الجديدة:');
            if (!title) return;
            const emoji = prompt('أدخل رمز تعبيري (Emoji) للصفحة (مثال: 📄):', '📄');
            
            const allPages = Storage.getCollection(Storage.keys.PAGES) || [];
            let parentPromptText = 'إذا كنت تريد جعلها صفحة فرعية، أدخل معرف (ID) الصفحة الأبوية (اتركه فارغاً لجعلها رئيسية):\n';
            allPages.forEach(p => {
              if (!p.parentId) {
                parentPromptText += `- [ ${p.id} ] : ${p.title}\n`;
              }
            });
            const parentId = prompt(parentPromptText);

            const newPage = {
              id: 'page_' + Date.now(),
              title: title,
              emoji: emoji || '📄',
              parentId: parentId || undefined,
              content: '<p style="text-align:center; padding:40px; color:rgba(255,255,255,0.4)">صفحة جديدة فارغة. استخدم وضع التعديل لإضافة محتوى وعناصر إليها بحرية!</p>',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            allPages.push(newPage);
            Storage.set(Storage.keys.PAGES, allPages);
            App.toast('<i class="fa-solid fa-champagne-glasses"></i> تم إنشاء الصفحة الجديدة بنجاح! سيتم تحديث الصفحة.', 'success');
            setTimeout(() => { window.location.reload(); }, 1000);
          });

          addElementBtn.addEventListener('click', () => {
            const targetContainer = document.querySelector('.page-body-card, #page-container, .hero-inner');
            if (!targetContainer) {
              App.toast('✕ لم نتمكن من العثور على منطقة محتوى صالحة للإضافة في هذه الصفحة!', 'error');
              return;
            }

            const type = prompt('اختر نوع العنصر المراد إضافته:\n1. عنوان رئيسي عريض (H2)\n2. عنوان فرعي ذهبي (H3)\n3. فقرة نصية (Paragraph)\n4. صورة ويب (Image)\n(أدخل الرقم 1-4):');
            if (!type) return;

            let el = null;
            if (type === '1') {
              const text = prompt('أدخل نص العنوان الرئيسي:');
              if (!text) return;
              el = document.createElement('h2');
              el.textContent = text;
              el.style.color = '#fff';
              el.style.fontWeight = '800';
              el.style.fontSize = '1.8rem';
              el.style.marginTop = '24px';
              el.style.marginBottom = '12px';
            } else if (type === '2') {
              const text = prompt('أدخل نص العنوان الفرعي:');
              if (!text) return;
              el = document.createElement('h3');
              el.textContent = text;
              el.style.color = 'var(--gold, #5c92e8)';
              el.style.fontWeight = '700';
              el.style.fontSize = '1.4rem';
              el.style.marginTop = '20px';
              el.style.marginBottom = '10px';
            } else if (type === '3') {
              const text = prompt('أدخل محتوى الفقرة النصية:');
              if (!text) return;
              el = document.createElement('p');
              el.textContent = text;
              el.style.lineHeight = '1.8';
              el.style.marginBottom = '14px';
              el.style.color = 'rgba(255,255,255,0.8)';
            } else if (type === '4') {
              const url = prompt('أدخل رابط الصورة (URL):');
              if (!url) return;
              el = document.createElement('img');
              el.src = url;
              el.style.width = '100%';
              el.style.borderRadius = '12px';
              el.style.margin = '20px 0';
              el.style.border = '1px solid rgba(201, 162, 39, 0.25)';
            } else {
              App.toast('✕ اختيار غير صالح!', 'error');
              return;
            }

            if (el) {
              const children = Array.from(targetContainer.children).filter(child => {
                return !child.closest('#navbar, #sidebar, .footer, #admin-floating-bar, #toast-container, .modal-overlay') && 
                       !['SCRIPT', 'STYLE'].includes(child.tagName);
              });
              
              const positionChoice = prompt('أين تريد موضع العنصر الجديد في الصفحة؟\n1. البداية (أعلى الصفحة)\n2. النهاية (أسفل الصفحة)\n3. قبل عنصر موجود\n4. بعد عنصر موجود\n(أدخل الرقم 1-4):', '2');
              
              let inserted = false;
              
              if (positionChoice === '1') {
                targetContainer.insertBefore(el, targetContainer.firstChild);
                inserted = true;
              } else if (positionChoice === '3' || positionChoice === '4') {
                if (children.length > 0) {
                  let listText = "العناصر الحالية بالصفحة:\n";
                  children.forEach((child, index) => {
                    const tag = child.tagName;
                    let text = (child.textContent || child.alt || "").trim().substring(0, 45).replace(/\s+/g, ' ');
                    listText += `${index + 1}. [${tag}] "${text || 'عنصر بدون نص'}"\n`;
                  });
                  
                  const targetIndexStr = prompt(`${listText}\nأدخل رقم العنصر المستهدف (1-${children.length}):`);
                  const targetIndex = parseInt(targetIndexStr) - 1;
                  
                  if (targetIndex >= 0 && targetIndex < children.length) {
                    const refEl = children[targetIndex];
                    if (positionChoice === '3') {
                      targetContainer.insertBefore(el, refEl);
                    } else {
                      targetContainer.insertBefore(el, refEl.nextSibling);
                    }
                    inserted = true;
                  }
                }
              }
              
              if (!inserted) {
                targetContainer.appendChild(el);
              }

              el.classList.add('draggable-active');
              if (['H2', 'H3', 'P'].includes(el.tagName)) {
                el.setAttribute('contenteditable', 'true');
              }
              el.scrollIntoView({ behavior: 'smooth' });
              App.toast('✏️ تم إضافة العنصر بنجاح! يمكنك الآن تعديل نصه أو ترتيبه، ثم اضغط حفظ التغييرات.', 'success');
            }

          });

          if (deletePageBtn) {
            deletePageBtn.addEventListener('click', async () => {
              const confirmDelete = await confirm('هل أنت متأكد من رغبتك في حذف هذه الصفحة نهائياً؟ لا يمكن التراجع عن هذا الإجراء وسيتم أيضاً حذف أي صفحات فرعية تابعة لها.', 'تأكيد حذف الصفحة');
              if (!confirmDelete) return;

              const allPages = Storage.getCollection(Storage.keys.PAGES) || [];
              const targetPage = allPages.find(p => p.id === customPageId);

              if (targetPage) {
                // Filter out this page and its sub-pages
                const finalPages = allPages.filter(p => p.id !== customPageId && p.parentId !== customPageId);
                Storage.set(Storage.keys.PAGES, finalPages);

                // Log activity
                if (typeof Logger !== 'undefined') {
                  Logger.log('delete_page', `قام بحذف الصفحة: ${targetPage.title}`);
                }

                toast('🔓 تم حذف الصفحة بنجاح.', 'success');
                setTimeout(() => {
                  window.location.href = getRootPath() + 'index.html';
                }, 1000);
              } else {
                toast('✕ لم يتم العثور على الصفحة في قاعدة البيانات!', 'error');
              }
            });
          }

          // Insert before userBadge inside navbar-actions
          userBadge.parentNode.insertBefore(saveBtn, userBadge);
          userBadge.parentNode.insertBefore(addElementBtn, userBadge);
          userBadge.parentNode.insertBefore(addPageBtn, userBadge);
          if (deletePageBtn) {
            userBadge.parentNode.insertBefore(deletePageBtn, userBadge);
          }
          userBadge.parentNode.insertBefore(layoutBtn, userBadge);
          userBadge.parentNode.insertBefore(editBtn, userBadge);
        }
      }
    } else {
      const editBtn = document.getElementById('navbar-edit-toggle');
      if (editBtn) editBtn.remove();
      const saveBtn = document.getElementById('navbar-save-toggle');
      if (saveBtn) saveBtn.remove();
      const layoutBtn = document.getElementById('navbar-layout-toggle');
      if (layoutBtn) layoutBtn.remove();
      const addPageBtn = document.getElementById('navbar-add-page');
      if (addPageBtn) addPageBtn.remove();
      const addElementBtn = document.getElementById('navbar-add-element');
      if (addElementBtn) addElementBtn.remove();
      const deletePageBtn = document.getElementById('navbar-delete-page');
      if (deletePageBtn) deletePageBtn.remove();

      if (!userBadge) {
        userBadge = document.createElement('div');
        userBadge.className = 'navbar-user-group';
        userBadge.style.cssText = `
          display: flex;
          align-items: center;
          gap: 12px;
        `;
        const toggle = actions.querySelector('.menu-toggle');
        if (toggle) {
          actions.insertBefore(userBadge, toggle);
        } else {
          actions.appendChild(userBadge);
        }
      } else {
        userBadge.style.display = 'flex';
      }

      userBadge.innerHTML = `
        <div class="navbar-status-badge logged-out" title="الحالة: غير متصل">
          <span class="status-dot red animate-pulse-glow"></span>
          <span class="status-text">غير مسجل</span>
        </div>
        <a href="#" class="navbar-discord-login-btn" id="nav-discord-login-btn" title="تسجيل الدخول بالديسكورد">
          <i class="fa-brands fa-discord"></i>
          <span>تسجيل الدخول</span>
        </a>
      `;

      const loginBtn = userBadge.querySelector('#nav-discord-login-btn');
      if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
          e.preventDefault();
          localStorage.setItem('auth_redirect_back', window.location.href);
          window.location.href = Auth.getDiscordAuthUrl();
        });
      }
    }
  }

  /* ── Animated Counter ─────────────────────────────── */
  function animateCounter(element, target, duration = 1500) {
    const start = 0;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease out cubic
      const current = Math.round(eased * target);
      element.textContent = current.toLocaleString('ar-SA');
      if (progress < 1) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
  }

  /* ── Intersection Observer for Animations ─────────── */
  function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';

          // Animate counters
          const counters = entry.target.querySelectorAll('[data-count]');
          counters.forEach(counter => {
            const target = parseInt(counter.dataset.count);
            animateCounter(counter, target);
          });

          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.animate-on-scroll').forEach(el => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(30px)';
      el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
      observer.observe(el);
    });
  }

  /* ── Modal Helpers ────────────────────────────────── */
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  function initModals() {
    // Close on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
          document.body.style.overflow = '';
        }
      });
    });

    // Close buttons
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.modal-overlay');
        if (modal) {
          modal.classList.remove('active');
          document.body.style.overflow = '';
        }
      });
    });
  }

  /* ── Alert Dialog ─────────────────────────────────── */
  function alert(message, title = 'تنبيه') {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay active';
      overlay.innerHTML = `
        <div class="modal" style="max-width:400px">
          <div class="modal-header">
            <h3 class="modal-title">ℹ️ ${title}</h3>
          </div>
          <div class="modal-body">
            <p style="color:var(--color-text-secondary);line-height:1.7">${message}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-gold" id="alert-ok" style="min-width:100px; padding: 8px 20px; border-radius: 8px; font-family: inherit;">حسناً</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('#alert-ok').addEventListener('click', () => {
        overlay.remove();
        resolve();
      });
      overlay.addEventListener('click', e => {
        if (e.target === overlay) { overlay.remove(); resolve(); }
      });
    });
  }

  /* ── Confirm Dialog ───────────────────────────────── */
  function confirm(message, title = 'تأكيد') {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay active';
      overlay.innerHTML = `
        <div class="modal" style="max-width:400px">
          <div class="modal-header">
            <h3 class="modal-title">⚠️ ${title}</h3>
          </div>
          <div class="modal-body">
            <p style="color:var(--color-text-secondary);line-height:1.7">${message}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" id="confirm-no">إلغاء</button>
            <button class="btn btn-danger" id="confirm-yes">تأكيد</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('#confirm-yes').addEventListener('click', () => {
        overlay.remove();
        resolve(true);
      });
      overlay.querySelector('#confirm-no').addEventListener('click', () => {
        overlay.remove();
        resolve(false);
      });
      overlay.addEventListener('click', e => {
        if (e.target === overlay) { overlay.remove(); resolve(false); }
      });
    });
  }

  /* ── Date Formatting ──────────────────────────────── */
  function formatDate(isoString, format = 'full') {
    if (!isoString) return '-';
    const date = new Date(isoString);
    if (isNaN(date)) return '-';

    const opts = {
      full:  { year: 'numeric', month: 'long', day: 'numeric' },
      short: { year: 'numeric', month: 'short', day: 'numeric' },
      time:  { hour: '2-digit', minute: '2-digit', hour12: true },
      datetime: { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true },
    };

    return date.toLocaleDateString('ar-SA', opts[format] || opts.full);
  }

  function timeAgo(isoString) {
    const date = new Date(isoString);
    const now  = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60)    return 'منذ لحظات';
    if (diff < 3600)  return `منذ ${Math.floor(diff / 60)} دقيقة`;
    if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
    if (diff < 604800) return `منذ ${Math.floor(diff / 86400)} يوم`;
    return formatDate(isoString, 'short');
  }

  /* ── Particle Background ──────────────────────────── */
  function initParticles(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    let animId;

    function resize() {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }

    function createParticles() {
      particles = [];
      const count = Math.floor((canvas.width * canvas.height) / 15000);
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          r: Math.random() * 1.5 + 0.5,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          opacity: Math.random() * 0.4 + 0.1,
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(201, 162, 39, ${p.opacity})`;
        ctx.fill();
      });

      // Draw connections
      particles.forEach((p1, i) => {
        particles.slice(i + 1).forEach(p2 => {
          const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(201, 162, 39, ${0.08 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      });

      animId = requestAnimationFrame(draw);
    }

    resize();
    createParticles();
    draw();

    const ro = new ResizeObserver(() => {
      resize();
      createParticles();
    });
    ro.observe(canvas.parentElement);

    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  }

  /* ── Global Live Editor Engine (Owner Only) ──────── */
  function initGlobalLiveEditor() {
    // 1. Restore customizations on page load
    const customizations = Storage.get(Storage.keys.PAGE_CUSTOMIZATIONS, {});
    const pagePath = window.location.pathname;
    const pageData = customizations[pagePath] || { layoutMode: 'stack', elements: [], stacks: [] };
    let layoutMode = pageData.layoutMode || 'stack';

    // Restore text and absolute positions
    if (pageData.elements && pageData.elements.length > 0) {
      pageData.elements.forEach(item => {
        try {
          const el = document.querySelector(item.selector);
          if (el) {
            if (item.html !== undefined && item.html !== null) {
              el.innerHTML = item.html;
            }
            if (pageData.layoutMode === 'absolute' && item.position === 'absolute') {
              el.style.position = 'absolute';
              el.style.left = item.left;
              el.style.top = item.top;
              el.style.transform = 'none';
              el.style.margin = '0';
              if (el.parentElement) {
                el.parentElement.style.position = 'relative';
              }
            }
          }
        } catch (err) {
          console.warn('Error restoring item:', item.selector, err);
        }
      });
    }

    // Restore vertical ordering if in stack mode
    if (pageData.layoutMode === 'stack' && pageData.stacks) {
      pageData.stacks.forEach(stack => {
        try {
          const parent = document.querySelector(stack.parentSelector);
          if (parent) {
            stack.childSelectors.forEach(sel => {
              const child = document.querySelector(sel);
              if (child && child.parentElement === parent) {
                parent.appendChild(child);
              }
            });
          }
        } catch (err) {
          console.warn('Error restoring stack order:', err);
        }
      });
    }

    // Check if user is strictly owner to display dashboard controls (Disabled)
    return;
    const currentUser = Auth.getCurrentUser();
    if (!currentUser || !Auth.hasRole(currentUser.role, 'owner')) return;

    // Inject css visual rules
    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
      .global-live-editing .draggable-active {
        cursor: grab !important;
        position: relative;
        padding: 4px;
        border: 1.5px dashed rgba(201, 162, 39, 0.4) !important;
        border-radius: 10px;
        transition: border-color 0.2s, background-color 0.2s;
      }
      .global-live-editing .draggable-active:hover {
        background: rgba(201, 162, 39, 0.08);
        border-color: rgba(201, 162, 39, 0.8) !important;
        box-shadow: 0 0 15px rgba(201, 162, 39, 0.2);
      }
      .global-live-editing .draggable-active:active {
        cursor: grabbing !important;
      }
      .global-live-editing.absolute-layout-active .draggable-active {
        position: absolute !important;
        transition: none !important;
        margin: 0 !important;
      }
      .global-live-editing [contenteditable="true"] {
        border: 1.5px dashed rgba(201, 162, 39, 0.75) !important;
        outline: none;
        padding: 4px 10px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.45);
        box-shadow: 0 0 10px rgba(201, 162, 39, 0.2);
      }
      .global-live-editing [contenteditable="true"]:focus {
        border-color: #ffd700 !important;
        box-shadow: 0 0 15px rgba(201, 162, 39, 0.5);
        background: rgba(0, 0, 0, 0.65);
      }
    `;
    document.head.appendChild(styleEl);

    // Inject Float Admin control bar
    const bar = document.createElement('div');
    bar.id = 'admin-floating-bar';
    bar.style.cssText = `
      position: fixed;
      top: 90px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 99999;
      display: none; /* Changed from flex to none to hide from screen */
      align-items: center;
      gap: 12px;
      background: rgba(13, 24, 64, 0.95);
      backdrop-filter: blur(15px);
      -webkit-backdrop-filter: blur(15px);
      border: 1.5px solid rgba(201, 162, 39, 0.5);
      padding: 12px 24px;
      border-radius: 30px;
      box-shadow: 0 10px 45px rgba(0, 0, 0, 0.7), 0 0 20px rgba(201, 162, 39, 0.15);
      animation: scaleIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    `;
    bar.innerHTML = `
      <span style="font-size:0.85rem; font-weight:800; color:#fff; display:flex; align-items:center; gap:6px;">
        <span><i class="fa-solid fa-shield-halved"></i></span> <span>وضع تعديل المالك</span>
      </span>
      <button class="btn btn-gold" id="btn-toggle-live-edit" style="padding:6px 14px; font-size:0.75rem; border-radius:15px; font-weight:700; cursor:pointer;">
        تفعيل التعديل والتحريك ✏️
      </button>
      <button class="btn btn-gold" id="btn-toggle-layout-mode" style="padding:6px 14px; font-size:0.75rem; border-radius:15px; font-weight:700; cursor:pointer; display:none; background:#7289da; color:#fff; border:none;">
        التموضع: رأسي ↔️ حر
      </button>
      <button class="btn btn-danger" id="btn-save-live-edit" style="padding:6px 14px; font-size:0.75rem; border-radius:15px; font-weight:700; cursor:pointer; display:none;">
        حفظ التغييرات 💾
      </button>
    `;
    document.body.appendChild(bar);

    const toggleBtn = document.getElementById('btn-toggle-live-edit');
    const modeBtn = document.getElementById('btn-toggle-layout-mode');
    const saveBtn = document.getElementById('btn-save-live-edit');
    let isEditing = false;
    let dragSource = null;
    let activeDragElement = null;
    let dragOffset = [0, 0];

    updateModeButtonText();

    toggleBtn.addEventListener('click', () => {
      isEditing = !isEditing;
      if (isEditing) {
        document.body.classList.add('global-live-editing');
        if (layoutMode === 'absolute') {
          document.body.classList.add('absolute-layout-active');
        }
        toggleBtn.textContent = 'إلغاء وضع التعديل ✕';
        toggleBtn.classList.remove('btn-gold');
        toggleBtn.classList.add('btn-ghost');
        saveBtn.style.display = 'block';
        modeBtn.style.display = 'block';

        App.toast('تم تفعيل التحرير والتحريك للمالك! اسحب العناصر أو انقر عليها لتعديل نصوصها بحرية.', 'info');
        enableVisualEditing();
      } else {
        disableVisualEditing();
      }
    });

    modeBtn.addEventListener('click', () => {
      layoutMode = layoutMode === 'stack' ? 'absolute' : 'stack';
      updateModeButtonText();

      if (layoutMode === 'absolute') {
        document.body.classList.add('absolute-layout-active');
        // Arrange elements absolutely with safe default offsets if they lack styled top/left
        const items = document.querySelectorAll('.draggable-active');
        items.forEach(el => {
          if (!el.style.top || el.style.position !== 'absolute') {
            const parent = el.parentElement;
            if (parent) parent.style.position = 'relative';
            const rect = el.getBoundingClientRect();
            const parentRect = parent.getBoundingClientRect();
            let pctLeft = ((rect.left - parentRect.left) / parentRect.width) * 100;
            let pctTop = ((rect.top - parentRect.top) / parentRect.height) * 100;
            
            el.style.position = 'absolute';
            el.style.left = `${pctLeft}%`;
            el.style.top = `${pctTop}%`;
            el.style.transform = 'none';
            el.style.margin = '0';
          }
        });
        App.toast('التموضع الحر نشط! اسحب أي بطاقة أو نص وضعه في أي مكان بالصفحة بحرية.', 'info');
      } else {
        document.body.classList.remove('absolute-layout-active');
        // Reset absolute positions temporarily
        const items = document.querySelectorAll('.draggable-active');
        items.forEach(el => {
          el.style.position = '';
          el.style.left = '';
          el.style.top = '';
          el.style.transform = '';
          el.style.margin = '';
        });
        App.toast('التموضع التلقائي نشط! اسحب العناصر عمودياً لترتيبها تلو الآخر.', 'info');
      }
      initDragEngine();
    });

    function updateModeButtonText() {
      modeBtn.textContent = layoutMode === 'stack' ? 'التموضع: 📋 رأسي تلقائي' : 'التموضع: <i class="fa-solid fa-crosshairs"></i> حر ومطلق';
    }

    function getUniqueSelector(el) {
      if (!(el instanceof Element)) return '';
      const path = [];
      let current = el;
      while (current && current.nodeType === Node.ELEMENT_NODE) {
        let selector = current.nodeName.toLowerCase();
        if (current.id) {
          selector += '#' + current.id;
          path.unshift(selector);
          break;
        } else {
          let sibling = current;
          let nth = 1;
          while (sibling = sibling.previousElementSibling) {
            if (sibling.nodeName.toLowerCase() === current.nodeName.toLowerCase()) {
              nth++;
            }
          }
          if (nth !== 1) {
            selector += `:nth-of-type(${nth})`;
          }
        }
        path.unshift(selector);
        current = current.parentNode;
      }
      return path.join(" > ");
    }

    function enableVisualEditing() {
      // Find all target content elements in main body, avoiding system elements
      const candidates = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, img, .qa-card, .ann-card, .dept-card, .profile-card, .stat-card, .info-card, .official-emblem, .entity-name-block, .header-page-meta, .btn, .hero-inner > *'));
      
      candidates.forEach(el => {
        // Filter out elements inside sidebar, navbar, footer, admin controls, or overlays
        if (el.closest('#navbar, #sidebar, .footer, #admin-floating-bar, #toast-container, .modal-overlay')) return;
        
        el.classList.add('draggable-active');

        // Make contenteditable if it's a text element
        const isTextNode = ['H1','H2','H3','H4','H5','H6','P','SPAN','A','BUTTON'].includes(el.tagName);
        if (isTextNode && !el.classList.contains('btn') && el.querySelectorAll('*').length === 0) {
          el.setAttribute('contenteditable', 'true');
        } else if (isTextNode) {
          // If text tag contains child elements, find text nodes or editable spans inside it
          const innerSpans = el.querySelectorAll('span, p, h1, h2, h3');
          if (innerSpans.length === 0) {
            el.setAttribute('contenteditable', 'true');
          } else {
            innerSpans.forEach(span => {
              if (!span.closest('.icon, svg, i') && span.querySelectorAll('*').length === 0) {
                span.setAttribute('contenteditable', 'true');
                span.classList.add('draggable-active');
              }
            });
          }
        }
      });

      initDragEngine();
    }

    function disableVisualEditing() {
      document.body.classList.remove('global-live-editing');
      document.body.classList.remove('absolute-layout-active');

      toggleBtn.textContent = 'تفعيل التعديل والتحريك ✏️';
      toggleBtn.classList.remove('btn-ghost');
      toggleBtn.classList.add('btn-gold');

      saveBtn.style.display = 'none';
      modeBtn.style.display = 'none';
      isEditing = false;

      // Clean classes and editable state
      const items = document.querySelectorAll('.draggable-active');
      items.forEach(el => {
        el.classList.remove('draggable-active');
        el.removeAttribute('contenteditable');
        el.removeAttribute('draggable');
        el.style.opacity = '';
        el.style.borderTop = '';
        el.style.borderBottom = '';
        
        el.ondragstart = null;
        el.ondragover = null;
        el.ondragleave = null;
        el.ondrop = null;
        el.ondragend = null;
        el.onmousedown = null;
        el.ontouchstart = null;
      });

      // Reload layout to original saved state
      window.location.reload();
    }

    function initDragEngine() {
      const items = document.querySelectorAll('.draggable-active');
      items.forEach(el => {
        // Clear previous event listeners
        el.removeAttribute('draggable');
        el.ondragstart = null;
        el.ondragover = null;
        el.ondragleave = null;
        el.ondrop = null;
        el.ondragend = null;
        el.onmousedown = null;
        el.ontouchstart = null;

        if (layoutMode === 'stack') {
          // Standard HTML5 Grid/Stack Reordering
          el.setAttribute('draggable', 'true');

          el.ondragstart = (e) => {
            if (!isEditing || layoutMode !== 'stack') return;
            dragSource = el;
            e.dataTransfer.effectAllowed = 'move';
            el.style.opacity = '0.4';
          };

          el.ondragover = (e) => {
            if (!isEditing || layoutMode !== 'stack') return;
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const midY = e.clientY - rect.top;
            if (midY < rect.height / 2) {
              el.style.borderTop = '2px dashed var(--gold)';
              el.style.borderBottom = 'none';
            } else {
              el.style.borderBottom = '2px dashed var(--gold)';
              el.style.borderTop = 'none';
            }
          };

          el.ondragleave = () => {
            el.style.borderTop = '';
            el.style.borderBottom = '';
          };

          el.ondrop = (e) => {
            if (!isEditing || layoutMode !== 'stack') return;
            e.preventDefault();
            el.style.borderTop = '';
            el.style.borderBottom = '';

            const parent = el.parentElement;
            if (dragSource && dragSource !== el && parent && dragSource.parentElement === parent) {
              const children = Array.from(parent.children);
              const targetIdx = children.indexOf(el);
              const sourceIdx = children.indexOf(dragSource);

              if (sourceIdx < targetIdx) {
                parent.insertBefore(dragSource, el.nextSibling);
              } else {
                parent.insertBefore(dragSource, el);
              }
            }
          };

          el.ondragend = () => {
            el.style.opacity = '1';
            items.forEach(i => {
              i.style.borderTop = '';
              i.style.borderBottom = '';
            });
          };

        } else {
          // Free Absolute 2D Dragging via mouse/touch
          el.onmousedown = start2DDrag;
          el.ontouchstart = start2DDrag;
        }
      });
    }

    function start2DDrag(e) {
      if (!isEditing || layoutMode !== 'absolute') return;
      if (e.target.getAttribute('contenteditable') === 'true') return; // let user click inside text to type

      const el = this;
      activeDragElement = el;

      const rect = el.getBoundingClientRect();
      const parent = el.parentElement;
      if (!parent) return;
      parent.style.position = 'relative';
      const parentRect = parent.getBoundingClientRect();

      const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

      dragOffset = [
        clientX - rect.left,
        clientY - rect.top
      ];

      document.onmousemove = drag2D;
      document.ontouchmove = drag2D;
      document.onmouseup = stop2DDrag;
      document.ontouchend = stop2DDrag;

      el.style.opacity = '0.7';
    }

    function drag2D(e) {
      if (!activeDragElement) return;

      const el = activeDragElement;
      const parent = el.parentElement;
      if (!parent) return;
      const parentRect = parent.getBoundingClientRect();

      const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

      // Position relative to parent
      let x = clientX - parentRect.left - dragOffset[0];
      let y = clientY - parentRect.top - dragOffset[1];

      // Convert to percentages
      let pctLeft = (x / parentRect.width) * 100;
      let pctTop = (y / parentRect.height) * 100;

      // Bounds
      pctLeft = Math.max(-5, Math.min(105, pctLeft));
      pctTop = Math.max(-5, Math.min(105, pctTop));

      el.style.position = 'absolute';
      el.style.left = `${pctLeft}%`;
      el.style.top = `${pctTop}%`;
      el.style.transform = 'none';
      el.style.margin = '0';
    }

    function stop2DDrag() {
      if (activeDragElement) {
        activeDragElement.style.opacity = '1';
      }
      activeDragElement = null;
      document.onmousemove = null;
      document.ontouchmove = null;
      document.onmouseup = null;
      document.ontouchend = null;
    }

    saveBtn.addEventListener('click', () => {
      const customizations = Storage.get(Storage.keys.PAGE_CUSTOMIZATIONS, {});
      
      const elementsData = [];
      const parentContainers = new Set();

      // Gather coordinates and html values
      const items = document.querySelectorAll('.draggable-active');
      items.forEach(el => {
        const selector = getUniqueSelector(el);
        if (!selector) return;

        const dataItem = {
          selector: selector,
          html: el.getAttribute('contenteditable') === 'true' ? el.innerHTML.trim() : undefined
        };

        if (layoutMode === 'absolute') {
          dataItem.position = el.style.position;
          dataItem.left = el.style.left;
          dataItem.top = el.style.top;
        }

        elementsData.push(dataItem);

        if (layoutMode === 'stack' && el.parentElement) {
          parentContainers.add(el.parentElement);
        }
      });

      // Gather stack ordering sequences
      const stacksData = [];
      parentContainers.forEach(parent => {
        const pSel = getUniqueSelector(parent);
        if (!pSel) return;

        const childSelectors = Array.from(parent.children)
          .map(child => getUniqueSelector(child))
          .filter(Boolean);

        stacksData.push({
          parentSelector: pSel,
          childSelectors: childSelectors
        });
      });

      customizations[pagePath] = {
        layoutMode: layoutMode,
        elements: elementsData,
        stacks: stacksData
      };

      Storage.set(Storage.keys.PAGE_CUSTOMIZATIONS, customizations);

      // Save custom page HTML content permanently if on custom.html
      const urlParams = new URLSearchParams(window.location.search);
      const customPageId = urlParams.get('id');
      const contentCard = document.querySelector('.page-body-card');
      if (customPageId && contentCard) {
        const allPages = Storage.getCollection(Storage.keys.PAGES) || [];
        const pageIdx = allPages.findIndex(p => p.id === customPageId);
        if (pageIdx !== -1) {
          // Remove edit classes and states before saving
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = contentCard.innerHTML;
          tempDiv.querySelectorAll('.draggable-active').forEach(el => {
            el.classList.remove('draggable-active');
            el.removeAttribute('contenteditable');
            el.removeAttribute('draggable');
            el.style.opacity = '';
            el.style.borderTop = '';
            el.style.borderBottom = '';
          });
          allPages[pageIdx].content = tempDiv.innerHTML.trim();
          Storage.set(Storage.keys.PAGES, allPages);
        }
      }

      App.toast('تم حفظ التنسيقات والتحريكات وكتابات المالك لكامل الصفحة بنجاح! 💾', 'success');
      
      setTimeout(() => {
        window.location.reload();
      }, 800);
    });
  }

  /* ── ديناميكية حقن روابط الحضور للأشخاص المصرح لهم ── */
  function injectAttendanceLinkIfNeeded() {
    const currentUser = (typeof Auth !== 'undefined') ? Auth.getCurrentUser() : null;
    const userRole = (typeof Auth !== 'undefined') ? Auth.getRole() : (currentUser ? currentUser.role : null);
    const userRank = currentUser ? currentUser.rank : null;
    const ROLE_LEVELS = {
      'owner': 6,
      'assistant_owner': 5,
      'academy_affairs': 4.5,
      'admin': 4,
      'course_admin': 3.5,
      'college_trainee': 1,
      'viewer': 0
    };
    const isAuthorized = currentUser && userRole !== 'viewer' && (
      ['1334568342345748565', '821825761673478144'].includes(currentUser.id) ||
      (ROLE_LEVELS[userRole] >= 3.5) ||
      userRole === 'college_trainee' ||
      (userRank && (
        userRank.includes('ادارة تدريب') ||
        userRank.includes('إدارة تدريب') ||
        userRank.includes('ادارة التدريب') ||
        userRank.includes('إدارة التدريب') ||
        userRank.includes('منسوبي كلية التدريب') ||
        userRank.includes('كلية التدريب')
      ))
    );

    const subInner = document.querySelector('#index-sub-inner, .navbar-sub-inner');
    const sidebarBody = document.querySelector('.sidebar-body');

    // 1. Sub-navbar injections
    if (subInner) {
      // Attendance Reports injection
      if (isAuthorized) {
        const collegeLink = Array.from(subInner.querySelectorAll('a')).find(a => {
          const href = a.getAttribute('href');
          return href && href.includes('amn7.html');
        });
        const existingLink = Array.from(subInner.querySelectorAll('a')).find(a => {
          const href = a.getAttribute('href');
          return href && href.includes('amn8.html');
        });
        if (collegeLink && !existingLink) {
          const collegeHref = collegeLink.getAttribute('href');
          let attHref = 'pages/amn8.html';
          if (collegeHref.startsWith('../')) {
            attHref = '../pages/amn8.html';
          } else if (!collegeHref.includes('pages/')) {
            attHref = 'amn8.html';
          }
          
          const attLink = document.createElement('a');
          attLink.href = attHref;
          attLink.className = 'sub-link';
          attLink.innerHTML = '<i class="fa-solid fa-clipboard-user"></i> تقارير الحضور';
          collegeLink.parentNode.insertBefore(attLink, collegeLink.nextSibling);
        }
      } else {
        const existingLink = Array.from(subInner.querySelectorAll('a')).find(a => {
          const href = a.getAttribute('href');
          return href && href.includes('amn8.html');
        });
        if (existingLink) existingLink.remove();
      }

      // Always remove archive link if present
      const existingArchiveLink = Array.from(subInner.querySelectorAll('a')).find(a => {
        const href = a.getAttribute('href');
        return href && href.includes('archive.html');
      });
      if (existingArchiveLink) existingArchiveLink.remove();
    }

    // 2. Sidebar injections
    if (sidebarBody) {
      // Attendance Reports injection
      if (isAuthorized) {
        const collegeSidebarLink = Array.from(sidebarBody.querySelectorAll('a')).find(a => {
          const href = a.getAttribute('href');
          return href && href.includes('amn7.html');
        });
        const existingSidebarLink = Array.from(sidebarBody.querySelectorAll('a')).find(a => {
          const href = a.getAttribute('href');
          return href && href.includes('amn8.html');
        });
        if (collegeSidebarLink && !existingSidebarLink) {
          const collegeHref = collegeSidebarLink.getAttribute('href');
          let attHref = 'pages/amn8.html';
          if (collegeHref.startsWith('../')) {
            attHref = '../pages/amn8.html';
          } else if (!collegeHref.includes('pages/')) {
            attHref = 'amn8.html';
          }

          const attSidebarLink = document.createElement('a');
          attSidebarLink.href = attHref;
          attSidebarLink.className = 'sidebar-nav-item';
          attSidebarLink.innerHTML = '<div class="sidebar-nav-icon"><i class="fa-solid fa-clipboard-user"></i></div>تقارير الحضور';
          collegeSidebarLink.parentNode.insertBefore(attSidebarLink, collegeSidebarLink.nextSibling);
        }
      } else {
        const existingSidebarLink = Array.from(sidebarBody.querySelectorAll('a')).find(a => {
          const href = a.getAttribute('href');
          return href && href.includes('amn8.html');
        });
        if (existingSidebarLink) existingSidebarLink.remove();
      }

      // Always remove archive sidebar link if present
      const existingArchiveSidebarLink = Array.from(sidebarBody.querySelectorAll('a')).find(a => {
        const href = a.getAttribute('href');
        return href && href.includes('archive.html');
      });
      if (existingArchiveSidebarLink) existingArchiveSidebarLink.remove();
    }
  }

  /* ── Initialize App ───────────────────────────────── */
  async function init() {
    // Initialize UI instantly and synchronously from local cache
    initTheme();
    initNavbarScroll();
    initSidebar();
    setActiveNav();
    initUserBadge();
    injectAttendanceLinkIfNeeded();

    // 1. Central Database: Load all collections from server in background
    try {
      if (typeof Storage !== 'undefined' && Storage.loadAllFromServer) {
        await Storage.loadAllFromServer();
        Storage.startRealTimePolling(5000); // Poll every 5 seconds (reduced from 3s)
      }
    } catch (e) {
      console.warn('[Storage Sync] Failed initial database load:', e);
    }

    try {
      SeedData.init();
    } catch (e) {
      console.warn('[Seed] SeedData.init() failed:', e);
    }
    
    // Sync settings with the backend server first to ensure fresh state
    try {
      await syncSettingsWithServer();
    } catch (e) {
      console.warn('[Sync] Initial settings sync failed:', e);
    }
    
    // Global Discord Auth Gate for all subpages
    checkAuthGate();
    
    // Check maintenance mode immediately
    checkMaintenanceSync();
    
    // Check if current document is locked due to active exam
    checkActiveExamDocumentLock();
    
    // Listen to storage changes to lock/unlock in real-time across tabs
    window.addEventListener('storage', (e) => {
      if (e.key === 'ps_exams') {
        checkActiveExamDocumentLock();
      }
      if (e.key === 'ps_settings' || e.key === 'ps_settings_sync') {
        checkMaintenanceSync();
        checkActiveExamDocumentLock();
      }
    });

    // Polling interval every 1.5 seconds to lock/unlock document in real-time
    setInterval(checkActiveExamDocumentLock, 1500);
    window.addEventListener('user_session_updated', (e) => {
      console.log('[App] User session updated event received, re-rendering user badge...');
      if (e.detail && e.detail.roleChanged) {
        console.log('[App] User role changed! Reloading page to apply new permissions...');
        window.location.reload();
      } else {
        initUserBadge();
        injectAttendanceLinkIfNeeded();
      }
    });
    window.addEventListener('storage_sync', () => {
      console.log('[App] Storage sync event received, checking link...');
      injectAttendanceLinkIfNeeded();
    });
    loadDiscordUsersInApp();
    initScrollAnimations();
    initModals();
    initGlobalLiveEditor();

    // Periodically sync settings with the server to auto-refresh when status changes (every 2 seconds for instant responsiveness)
    setInterval(async () => {
      try {
        await syncSettingsWithServer();
        checkMaintenanceSync();
      } catch (e) {
        console.warn('[Sync] Periodic settings sync failed:', e);
      }
    }, 2000);

    // Log page entry
    try {
      const pagePath = window.location.pathname;
      const filename = pagePath.split('/').pop() || 'index.html';
      const sessionKey = 'session_visit_' + filename;
      if (!sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, 'true');
        const pageNames = {
          'index.html': 'الرئيسية', 'amn.html': 'الرئيسية',
          'archive.html': 'أرشيف الصور',
          'login.html': 'تسجيل الدخول',
          'custom.html': 'صفحة مخصصة',
          'amn1.html': 'القيادة',
          'amn2.html': 'مدراء الأقسام',
          'amn3.html': 'المراكز',
          'amn4.html': 'الدليل الشامل',
          'amn5.html': 'العهدة',
          'amn6.html': 'المركبات',
          'amn7.html': 'كلية التدريب',
          'amn8.html': 'تقارير الحضور',
          'amn9.html': 'الاختبارات',
          'amn10.html': 'التوجيهات الميدانية',
          'amn11.html': 'الزي العسكري',
          'amn12.html': 'التقديم',
          'amn13.html': 'قاعدة البيانات',
          'amn14.html': 'الونقات',
          'amn15.html': 'الملف الشخصي',
          'amn16.html': 'لوحة التحكم',
          'mstnd1.html': 'مستند الجناح الجوي',
          'mstnd2.html': 'مستند جناح مكافحة الإرهاب',
          'mstnd3.html': 'مستند جناح المداهمة والاقتحام',
          'mstnd4.html': 'جناح الرماية والتدريب الميداني',
          'mstnd5.html': 'مستند جناح أمن الطرق',
          'mstnd6.html': 'مستند جناح المرور',
          'mstnd7.html': 'مستند جناح التدخل السريع',
          'mstnd8.html': 'مستند جناح المهام الخاصة',
          'mstnd9.html': 'مستند الضباط',
          'mstnd10.html': 'مستند الأفراد',
          'mstnd11.html': 'مستند العمليات',
          'mstnd12.html': 'مستند الأنظمة واللوائح',
          'mstnd13.html': 'مستند المباحث',
          'mstnd14.html': 'مستند مكافحة المخدرات',
          'mstnd15.html': 'مستند الصاعقة والمظليين',
          'mstnd16.html': 'مستند قيادة أمن الطرق'
        };
        const pageArName = pageNames[filename] || filename;
        if (typeof Logger !== 'undefined') {
          Logger.log('visit', `زار صفحة: ${pageArName}`);
        }
      }
    } catch (e) {
      console.error('Page visit logging error:', e);
    }

    // Theme toggle buttons
    document.querySelectorAll('[data-action="toggle-theme"]').forEach(btn => {
      btn.addEventListener('click', toggleTheme);
    });

    // Smooth scrolling
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => {
        const target = document.querySelector(a.getAttribute('href'));
        if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
      });
    });
    
  }

  /* ── وضع الصيانة والتحكم العام بالوصول ── */
  function checkMaintenanceSync() {
    const settings = Storage.get(Storage.keys.SETTINGS, {});
    if (settings.maintenanceMode !== true) return;

    const path = window.location.pathname;
    if (path.includes('login.html') || path.includes('callback.html')) return;

    // Check if the current user is an authorized admin/owner (level >= 4)
    if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
      const role = Auth.getRole();
      if (['owner', 'assistant_owner', 'admin'].includes(role)) {
        // Warning banner is only shown on the control panel (amn16.html)
        if (path.includes('amn16.html')) {
          showAdminMaintenanceWarning();
        }
        return;
      }
    }

    showMaintenanceOverlay(settings.maintenanceMessage);
  }

  function checkActiveExamDocumentLock() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'index.html';
    const cleanFilename = filename.split('?')[0].split('#')[0];
    
    // Skip checking on home, exams, admin page, callback or login
    const isExamsPage = cleanFilename === 'amn9.html';
    const isAdminPage = path.includes('/admin/');
    const isCallback = cleanFilename === 'callback.html';
    const isLogin = cleanFilename === 'login.html';
    const isHome = cleanFilename === 'index.html' || cleanFilename === 'amn.html' || cleanFilename === '';
    
    if (isExamsPage || isAdminPage || isCallback || isLogin || isHome) return;
    
    if (typeof Storage === 'undefined') return;
    
    const exams = Storage.getCollection(Storage.keys.EXAMS) || [];
    const activeExam = exams.find(e => e.isOpen === true && e.documentUrl === cleanFilename);
    const hasLockOverlay = document.getElementById('exam-lock-overlay') !== null;
    
    if (activeExam) {
      if (!hasLockOverlay) {
        showExamLockOverlay(activeExam);
      }
    } else {
      if (hasLockOverlay) {
        // The active exam is closed/not found anymore, reload the page to restore document content!
        window.location.reload();
      }
    }
  }

  function showExamLockOverlay(exam) {
    document.body.style.overflow = 'hidden';
    
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'index.html';
    const cleanFilename = filename.split('?')[0].split('#')[0];

    // Log document access attempt if not logged recently for this session/visit
    const visitLogKey = 'doc_access_logged_' + exam.id + '_' + cleanFilename;
    if (!sessionStorage.getItem(visitLogKey)) {
      sessionStorage.setItem(visitLogKey, 'true');
      const currentUser = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
      const logObj = {
        id: 'doclog_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        exam_id: exam.id,
        exam_title: exam.title,
        document_url: cleanFilename,
        user_id: currentUser ? currentUser.id : '',
        username: currentUser ? (currentUser.username || currentUser.globalName || 'زائر') : 'زائر',
        displayName: currentUser ? (currentUser.displayName || currentUser.username || 'عضو') : 'عضو',
        rank: currentUser ? (currentUser.rank || '—') : '—',
        code: currentUser ? (currentUser.code || '—') : '—',
        timestamp: new Date().toLocaleDateString('ar-SA') + ' ' + new Date().toLocaleTimeString('ar-SA', { hour12: false }),
        createdAt: new Date().toISOString()
      };
      if (typeof Storage !== 'undefined' && Storage.addToCollection) {
        Storage.addToCollection(Storage.keys.DOC_ACCESS_LOGS || 'ps_doc_access_logs', logObj);
        try { localStorage.setItem('ps_doc_access_sync', Date.now().toString()); } catch(e){}
      }
      if (typeof Logger !== 'undefined') {
        Logger.log('doc_access_attempt', `حاول العضو "${logObj.displayName}" دخول المستند المغلق (${cleanFilename}) أثناء فتح اختبار "${exam.title}"`);
      }
    }
    
    const displayMsg = 'تم إغلاق مستند الدورة أثناء فترة الاختبار.';
    
    document.body.innerHTML = `
      <div id="exam-lock-overlay" style="position: fixed; inset: 0; z-index: 999999999; background: radial-gradient(circle at 30% 30%, rgba(201, 162, 39, 0.08) 0%, transparent 60%), radial-gradient(circle at 70% 75%, rgba(13, 22, 59, 0.4) 0%, transparent 50%), #05091e; display: flex; align-items: center; justify-content: center; font-family: 'Tajawal', 'Cairo', sans-serif; direction: rtl; padding: 20px; height: 100vh; width: 100vw;">
        <div style="background: rgba(10, 18, 50, 0.5); backdrop-filter: blur(25px); -webkit-backdrop-filter: blur(25px); border: 1px solid rgba(201, 162, 39, 0.25); border-radius: 24px; padding: 50px 35px; text-align: center; max-width: 500px; width: 100%; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 40px rgba(201, 162, 39, 0.05); position: relative; overflow: hidden;">
          <div style="position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 120px; height: 3px; background: linear-gradient(90deg, transparent, #c9a227, transparent);"></div>
          
          <div style="width: 100px; height: 100px; margin: 0 auto 24px; position: relative; display: flex; align-items: center; justify-content: center;">
            <span style="font-size: 4.5rem; display: inline-block; filter: drop-shadow(0 0 15px rgba(201, 162, 39, 0.35)); animation: lockPulse 2s infinite alternate;"><i class="fa-solid fa-lock"></i></span>
          </div>
          
          <h2 style="color: #ffffff; font-size: 1.5rem; font-weight: 900; margin-bottom: 16px; letter-spacing: 0.5px;">⚠️ مستند مغلق أمنياً</h2>
          <p style="color: #ffd700; font-size: 1.15rem; font-weight: 800; line-height: 1.6; margin-bottom: 20px;">
            ${displayMsg}
          </p>
          
          <p style="color: rgba(255, 255, 255, 0.65); font-size: 0.9rem; line-height: 1.7; margin-bottom: 30px; padding: 0 10px;">
            يخضع هذا الدليل والمستند التنظيمي لقفل تلقائي مؤقت بسبب بدء اختبار نشط لهذه الدورة لمنع تسريب المعلومات وتكافؤ الفرص للمختبرين.
          </p>
          
          <div style="background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(201, 162, 39, 0.15); border-radius: 12px; padding: 16px; text-align: right; margin-bottom: 24px;">
            <div style="font-size: 0.78rem; color: rgba(255, 255, 255, 0.4); margin-bottom: 4px;">الامتحان النشط حالياً:</div>
            <div style="font-size: 1rem; color: #fff; font-weight: 800;">${exam.title}</div>
            <div style="font-size: 0.78rem; color: rgba(255, 255, 255, 0.45); margin-top: 6px;">مجموع الأسئلة: <strong style="color:#ffd700">${exam.questions ? exam.questions.length : 0}</strong> | المدة: <strong style="color:#ffd700">${exam.duration} دقيقة</strong></div>
          </div>
          
          <div style="font-size: 0.82rem; color: rgba(255,255,255,0.4); line-height: 1.6;">
            بمجرد إغلاق الاختبار من قبل مسؤول الدورة، سيعود هذا المستند للعمل بشكل طبيعي وتلقائي.
          </div>
          
          <div style="margin-top: 30px; font-size: 0.72rem; color: rgba(255, 255, 255, 0.25); display: flex; align-items: center; justify-content: center; gap: 6px; border-top: 1px solid rgba(255, 255, 255, 0.04); padding-top: 18px;">
            <span><i class="fa-solid fa-shield-halved"></i> بوابة الأمن العام الموحدة</span>
            <span>•</span>
            <span>مدينة الـ 90</span>
          </div>
        </div>
      </div>
    `;
    
    // Inject animation styling for lockPulse
    if (!document.getElementById('lock-pulse-styles')) {
      const style = document.createElement('style');
      style.id = 'lock-pulse-styles';
      style.innerHTML = `
        @keyframes lockPulse {
          0% { transform: scale(1); filter: drop-shadow(0 0 10px rgba(201, 162, 39, 0.25)); }
          100% { transform: scale(1.06); filter: drop-shadow(0 0 20px rgba(201, 162, 39, 0.5)); }
        }
      `;
      document.head.appendChild(style);
    }
  }

  /* ── بوابة الديسكورد الأمنية للصفحات الفرعية ── */
  function checkAuthGate() {
    const path = window.location.pathname;
    const isSubpage = path.includes('/pages/');
    const isCallback = path.includes('callback.html');
    const isLogin = path.includes('login.html');
    const isDatabase = path.includes('amn13.html');
    const isExams = path.includes('amn9.html');

    if (isSubpage && !isLogin && !isCallback && !isDatabase && !isExams) {
      let isLinked = false;
      if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
        const user = Auth.getCurrentUser();
        if (user && user.isDiscord === true && user.id) {
          isLinked = true;
        }
      }
      if (!isLinked) {
        const ROOT = getRootPath();
        window.location.href = ROOT + 'index.html';
      }
    }
  }

  function showAdminMaintenanceWarning(message, gradientColors, badgeBgColor) {
    const displayMsg = message || '<i class="fa-solid fa-triangle-exclamation"></i> وضع الصيانة نشط حالياً (الوصول للمنسوبين فقط)';
    const grad = gradientColors || '#e74c3c, #f39c12, #e74c3c';
    const bg = badgeBgColor || 'rgba(231, 76, 60, 0.95)';

    // Remove existing if any to prevent duplicates
    const existingWarning = document.getElementById('admin-maintenance-warning');
    if (existingWarning) existingWarning.remove();
    const existingBadge = document.getElementById('admin-maintenance-badge');
    if (existingBadge) existingBadge.remove();
    
    const warning = document.createElement('div');
    warning.id = 'admin-maintenance-warning';
    warning.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg, ${grad});
      z-index: 999999999;
      background-size: 200% 200%;
      animation: gradientMove 2s linear infinite;
    `;
    
    if (!document.getElementById('admin-warning-styles')) {
      const style = document.createElement('style');
      style.id = 'admin-warning-styles';
      style.innerHTML = `
        @keyframes gradientMove {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes cardAppear {
          from { opacity: 0; transform: scale(0.95) translateY(15px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes gearSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
    document.body.appendChild(warning);
    
    const badge = document.createElement('div');
    badge.id = 'admin-maintenance-badge';
    badge.style.cssText = `
      position: fixed;
      top: 15px;
      left: 50%;
      transform: translateX(-50%);
      background: ${bg};
      color: #fff;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 800;
      z-index: 999999999;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
      pointer-events: none;
      direction: rtl;
      font-family: 'Tajawal', 'Cairo', sans-serif;
    `;
    badge.innerHTML = displayMsg;
    document.body.appendChild(badge);
  }

  function showMaintenanceOverlay(message) {
    document.body.style.overflow = 'hidden';
    
    const ROOT = getRootPath();
    const loginLink = ROOT + 'pages/admin/login.html';
    const displayMsg = message || 'البوابة الإلكترونية مغلقة مؤقتاً لأعمال الصيانة والتحديث الفني الميداني.';
    
    const isLoggedIn = typeof Auth !== 'undefined' && Auth.isLoggedIn();
    let actionButtonsHTML = '';
    
    if (isLoggedIn) {
      const currentUser = Auth.getCurrentUser();
      const currentUserName = currentUser ? (currentUser.globalName || currentUser.username || 'عضو') : 'عضو';
      actionButtonsHTML = `
        <div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
          <button onclick="App.checkMaintenanceStatus()" style="background: linear-gradient(135deg, #2ecc71, #27ae60); color: #fff; border: none; padding: 14px 28px; font-weight: 800; border-radius: 12px; font-size: 0.95rem; box-shadow: 0 6px 20px rgba(46, 204, 113, 0.25); transition: all 0.3s; display: inline-flex; align-items: center; justify-content: center; gap: 12px; cursor: pointer; font-family: inherit;">
            <span><i class="fa-solid fa-arrows-rotate"></i></span> تحديث حالة الموقع
          </button>
          <div style="font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 8px;">
            أنت مسجل الدخول حالياً كـ: <strong>${currentUserName}</strong>
          </div>
          <a href="#" onclick="event.preventDefault(); Auth.logout()" style="color: #ff4757 !important; text-decoration: none; font-size: 11px; font-weight: bold; margin-top: 4px;">
            <i class="fa-solid fa-door-open"></i> تسجيل الخروج / تبديل الحساب
          </a>
        </div>
      `;
    } else {
      const discordAuthUrl = typeof Auth !== 'undefined' ? Auth.getDiscordAuthUrl() : '#';
      actionButtonsHTML = `
        <div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
          <button onclick="localStorage.setItem('auth_redirect_back', window.location.href); window.location.href='${discordAuthUrl}'" style="background: linear-gradient(135deg, #5865F2, #4752C4); color: #ffffff !important; text-decoration: none; padding: 14px 28px; font-weight: 800; border-radius: 12px; font-size: 0.95rem; box-shadow: 0 6px 20px rgba(88, 101, 242, 0.3); transition: all 0.3s; display: inline-flex; align-items: center; justify-content: center; gap: 12px; border: none; cursor: pointer; font-family: inherit;">
            <span>🎮</span> ربط الحساب وتسجيل الدخول بالديسكورد
          </button>
          <a href="${loginLink}" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: #fff !important; text-decoration: none; padding: 12px 24px; font-weight: 700; border-radius: 12px; font-size: 0.88rem; transition: all 0.3s; display: inline-flex; align-items: center; justify-content: center; gap: 10px;">
            <span><i class="fa-solid fa-lock-open"></i></span> تسجيل دخول الإدارة (اسم مستخدم)
          </a>
        </div>
      `;
    }
    
    // Completely replace document body content so users cannot inspect and delete the overlay to bypass it.
    document.body.innerHTML = `
      <div id="maintenance-overlay" style="position: fixed; inset: 0; z-index: 99999999; background: radial-gradient(circle at 30% 30%, rgba(231, 76, 60, 0.12) 0%, transparent 60%), radial-gradient(circle at 70% 75%, rgba(12, 22, 59, 0.4) 0%, transparent 50%), #05091e; display: flex; align-items: center; justify-content: center; font-family: 'Tajawal', 'Cairo', sans-serif; direction: rtl; padding: 20px; height: 100vh; width: 100vw;">
        <div style="background: rgba(10, 18, 50, 0.45); backdrop-filter: blur(25px); -webkit-backdrop-filter: blur(25px); border: 1px solid rgba(231, 76, 60, 0.25); border-radius: 24px; padding: 50px 35px; text-align: center; max-width: 480px; width: 100%; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 40px rgba(231, 76, 60, 0.05); position: relative; overflow: hidden;">
          <div style="position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 120px; height: 3px; background: linear-gradient(90deg, transparent, #e74c3c, transparent);"></div>
          
          <div style="width: 100px; height: 100px; margin: 0 auto 24px; position: relative; display: flex; align-items: center; justify-content: center;">
            <span style="font-size: 4.5rem; display: inline-block; animation: gearSpin 8s linear infinite; filter: drop-shadow(0 0 15px rgba(231, 76, 60, 0.35));"><i class="fa-solid fa-gear"></i></span>
            <span style="font-size: 2.2rem; position: absolute; bottom: 8px; right: 12px; filter: drop-shadow(0 0 10px rgba(201, 162, 39, 0.4));">🚧</span>
          </div>
          
          <h2 style="color: #ffffff; font-size: 1.5rem; font-weight: 900; margin-bottom: 12px; letter-spacing: 0.5px;"><i class="fa-solid fa-lock"></i> أعمال الصيانة والتطوير</h2>
          <p style="color: rgba(255, 255, 255, 0.65); font-size: 0.9rem; line-height: 1.7; margin-bottom: 30px; padding: 0 10px;" id="maintenance-overlay-message">${displayMsg}</p>
          
          ${actionButtonsHTML}
          
          <div style="margin-top: 30px; font-size: 0.72rem; color: rgba(255, 255, 255, 0.25); display: flex; align-items: center; justify-content: center; gap: 6px; border-top: 1px solid rgba(255, 255, 255, 0.04); padding-top: 18px;">
            <span><i class="fa-solid fa-shield-halved"></i> بوابة الأمن العام الموحدة</span>
            <span>•</span>
            <span>مدينة الـ 90</span>
          </div>
        </div>
      </div>
    `;
    
    // Inject animation styling for gearSpin
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes gearSpin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  async function syncSettingsWithServer() {
    try {
      const apiUrl = getSettingsApiUrl();
      let res;
      let isStaticHosting = false;
      
      try {
        res = await fetchWithTimeout(apiUrl);
      } catch (networkErr) {
        console.warn('[Sync] API URL fetch failed with network error, trying static fallback:', networkErr);
      }
      
      if (!res || !res.ok) {
        // Fallback to static settings.json file for static hosting environments (like Surge)
        const ROOT = getRootPath();
        res = await fetchWithTimeout(`${ROOT}assets/data/settings.json?t=${Date.now()}`);
        isStaticHosting = true;
      }
      if (res.ok) {
        let serverSettings = null;
        try {
          const text = await res.clone().text();
          if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
            throw new Error('Response is HTML, not JSON');
          }
          serverSettings = await res.json();
        } catch (jsonErr) {
          console.warn('[Sync] Failed to parse API response as JSON, falling back to static settings:', jsonErr.message);
          // Trigger fallback to static settings.json
          const ROOT = getRootPath();
          const fallbackRes = await fetchWithTimeout(`${ROOT}assets/data/settings.json?t=${Date.now()}`);
          if (fallbackRes.ok) {
            serverSettings = await fallbackRes.json().catch(() => null);
            isStaticHosting = true;
          }
        }
        if (serverSettings && typeof serverSettings === 'object' && Object.keys(serverSettings).length > 0) {
          const localSettings = Storage.get(Storage.keys.SETTINGS, {});
          
          let shouldMerge = true;
          if (isStaticHosting && typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
            const role = Auth.getRole();
            if (['owner', 'assistant_owner', 'admin'].includes(role)) {
              shouldMerge = false;
            }
          }


          if (shouldMerge) {
            const maintenanceChanged = localSettings.maintenanceMode !== serverSettings.maintenanceMode ||
                                       localSettings.maintenanceMessage !== serverSettings.maintenanceMessage;
                                       
            const merged = { ...localSettings, ...serverSettings };
            if (serverSettings.backendUrl) {
              merged.backendUrl = serverSettings.backendUrl;
            }
            Storage.set(Storage.keys.SETTINGS, merged);
            
            if (maintenanceChanged) {
              console.log('[Maintenance] Status changed from server sync. Reloading...');
              window.location.reload();
            }
          } else {
            // Static hosting admin bypass: Merge settings with local settings taking precedence
            const merged = { ...serverSettings, ...localSettings };
            if (serverSettings.backendUrl) {
              merged.backendUrl = serverSettings.backendUrl;
            }
            Storage.set(Storage.keys.SETTINGS, merged);

            const path = window.location.pathname;
            if (path.includes('amn16.html')) {
              // Display clear indicator if local state differs from server state
              if (serverSettings.maintenanceMode !== localSettings.maintenanceMode) {
                if (serverSettings.maintenanceMode === true && localSettings.maintenanceMode === false) {
                  showAdminMaintenanceWarning(
                    '⚠️ الموقع مغلق للصيانة للعامة (قم بتحديث settings.json وإعادة الرفع لفتحه للجميع)',
                    '#f1c40f, #e67e22, #f1c40f',
                    'rgba(230, 126, 34, 0.95)'
                  );
                } else if (serverSettings.maintenanceMode === false && localSettings.maintenanceMode === true) {
                  showAdminMaintenanceWarning(
                    '⚠️ الموقع مفتوح للعامة حالياً (قم بتحديث settings.json وإعادة الرفع لإغلاقه للجميع)',
                    '#f1c40f, #e67e22, #f1c40f',
                    'rgba(230, 126, 34, 0.95)'
                  );
                }
              } else if (serverSettings.maintenanceMode === true) {
                // Standard active warning badge
                showAdminMaintenanceWarning();
              } else {
                // Remove any warning badge
                const existingWarning = document.getElementById('admin-maintenance-warning');
                if (existingWarning) existingWarning.remove();
                const existingBadge = document.getElementById('admin-maintenance-badge');
                if (existingBadge) existingBadge.remove();
              }
            } else {
              // Non-dashboard pages should not show the mismatch warning banners
              const existingWarning = document.getElementById('admin-maintenance-warning');
              if (existingWarning) existingWarning.remove();
              const existingBadge = document.getElementById('admin-maintenance-badge');
              if (existingBadge) existingBadge.remove();
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Sync] Failed to sync settings with server:', e);
    }
  }

  async function checkMaintenanceStatus() {
    const btn = document.querySelector('#maintenance-overlay button');
    let originalHTML = '';
    if (btn) {
      originalHTML = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> جاري التحقق من حالة الموقع...';
      btn.disabled = true;
    }
    
    try {
      await syncSettingsWithServer();
      const settings = Storage.get(Storage.keys.SETTINGS, {});
      if (settings.maintenanceMode !== true) {
        toast('🔓 تم فتح الموقع للعامة بنجاح.', 'success');
        setTimeout(() => {
          window.location.reload();
        }, 1000);
        return;
      } else {
        toast('<i class="fa-solid fa-lock"></i> ما زال الموقع تحت الصيانة حالياً.', 'error');
      }
    } catch (e) {
      console.error(e);
      toast('<i class="fa-solid fa-lock"></i> ما زال الموقع تحت الصيانة حالياً.', 'error');
    }
    
    if (btn) {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }
  }

  function replaceEmojisWithIcons(htmlText) {
    if (typeof htmlText !== 'string') return htmlText;
    const mapping = {
      '🏠': '<i class="fa-solid fa-house"></i>',
      '👑': '<i class="fa-solid fa-crown"></i>',
      '🌟': '<i class="fa-solid fa-star"></i>',
      '🛡️': '<i class="fa-solid fa-shield-halved"></i>',
      '🛡': '<i class="fa-solid fa-shield-halved"></i>',
      '🎓': '<i class="fa-solid fa-graduation-cap"></i>',
      '👥': '<i class="fa-solid fa-users"></i>',
      '✍️': '<i class="fa-solid fa-pen-nib"></i>',
      '✍': '<i class="fa-solid fa-pen-nib"></i>',
      '🖼️': '<i class="fa-solid fa-image"></i>',
      '🖼': '<i class="fa-solid fa-image"></i>',
      '👁️': '<i class="fa-solid fa-eye"></i>',
      '👁': '<i class="fa-solid fa-eye"></i>',
      '🏢': '<i class="fa-solid fa-building-shield"></i>',
      '📖': '<i class="fa-solid fa-book-open"></i>',
      '📦': '<i class="fa-solid fa-box-open"></i>',
      '🚔': '<i class="fa-solid fa-car-on"></i>',
      '📝': '<i class="fa-solid fa-file-pen"></i>',
      '🪪': '<i class="fa-solid fa-id-card"></i>',
      '👕': '<i class="fa-solid fa-shirt"></i>',
      '🔒': '<i class="fa-solid fa-lock"></i>',
      '🗂️': '<i class="fa-solid fa-folder-tree"></i>',
      '🗂': '<i class="fa-solid fa-folder-tree"></i>',
      '📚': '<i class="fa-solid fa-book-bookmark"></i>',
      '📢': '<i class="fa-solid fa-bullhorn"></i>',
      '📬': '<i class="fa-solid fa-envelope-open-text"></i>',
      '🟢': '<i class="fa-solid fa-circle-check" style="color: #2ecc71;"></i>',
      '🔴': '<i class="fa-solid fa-circle-exclamation" style="color: #e74c3c;"></i>',
      '🔵': '<i class="fa-solid fa-circle-info" style="color: #3498db;"></i>',
      '⚪': '<i class="fa-solid fa-circle" style="color: #95a5a6;"></i>',
      '🟡': '<i class="fa-solid fa-circle-minus" style="color: #f1c40f;"></i>',
      '📅': '<i class="fa-solid fa-calendar-days"></i>',
      '📰': '<i class="fa-solid fa-newspaper"></i>',
      '📊': '<i class="fa-solid fa-chart-column"></i>',
      '🎨': '<i class="fa-solid fa-palette"></i>',
      '🔑': '<i class="fa-solid fa-key"></i>',
      '🔗': '<i class="fa-solid fa-link"></i>',
      '🔍': '<i class="fa-solid fa-magnifying-glass"></i>',
      '🔎': '<i class="fa-solid fa-magnifying-glass"></i>',
      '👤': '<i class="fa-solid fa-user"></i>',
      '🎭': '<i class="fa-solid fa-masks-theater"></i>',
      '🏁': '<i class="fa-solid fa-flag-checkered"></i>',
      '📧': '<i class="fa-solid fa-envelope"></i>',
      '🆔': '<i class="fa-solid fa-id-badge"></i>',
      '🚫': '<i class="fa-solid fa-ban"></i>',
      '🗣': '<i class="fa-solid fa-comments"></i>',
      '📍': '<i class="fa-solid fa-location-dot"></i>',
      '⚔': '<i class="fa-solid fa-shield-halved"></i>',
      '🗡': '<i class="fa-solid fa-shield-halved"></i>',
      '📜': '<i class="fa-solid fa-scroll"></i>',
      '💼': '<i class="fa-solid fa-briefcase"></i>',
      '💰': '<i class="fa-solid fa-wallet"></i>',
      '🪖': '<i class="fa-solid fa-helmet-safety"></i>',
      '📈': '<i class="fa-solid fa-chart-line"></i>',
      '✈': '<i class="fa-solid fa-plane"></i>',
      '🚁': '<i class="fa-solid fa-helicopter"></i>',
      '🏖': '<i class="fa-solid fa-umbrella-beach"></i>',
      '🗺': '<i class="fa-solid fa-map"></i>',
      '🟦': '<i class="fa-solid fa-square" style="color: #3498db;"></i>',
      '🟨': '<i class="fa-solid fa-square" style="color: #f1c40f;"></i>',
      '🟩': '<i class="fa-solid fa-square" style="color: #2ecc71;"></i>',
      '🟪': '<i class="fa-solid fa-square" style="color: #9b59b6;"></i>',
      '🟥': '<i class="fa-solid fa-square" style="color: #e74c3c;"></i>',
      '🚘': '<i class="fa-solid fa-car"></i>',
      '🚗': '<i class="fa-solid fa-car"></i>',
      '📻': '<i class="fa-solid fa-radio"></i>',
      '👮': '<i class="fa-solid fa-user-shield"></i>',
      '🚦': '<i class="fa-solid fa-traffic-light"></i>',
      '🛣': '<i class="fa-solid fa-road"></i>',
      '📌': '<i class="fa-solid fa-thumbtack"></i>',
      '🔫': '<i class="fa-solid fa-gun"></i>',
      '🕵': '<i class="fa-solid fa-user-secret"></i>',
      '🛑': '<i class="fa-solid fa-circle-stop"></i>',
      '🔥': '<i class="fa-solid fa-fire"></i>',
      '🏎': '<i class="fa-solid fa-gauge-high"></i>',
      '🕶': '<i class="fa-solid fa-glasses"></i>',
      '🔧': '<i class="fa-solid fa-wrench"></i>',
      '⚓': '<i class="fa-solid fa-anchor"></i>',
      '🚑': '<i class="fa-solid fa-truck-medical"></i>',
      '📟': '<i class="fa-solid fa-pager"></i>',
      '🏦': '<i class="fa-solid fa-building-columns"></i>',
      '🥩': '<i class="fa-solid fa-drumstick-bite"></i>',
      '🛒': '<i class="fa-solid fa-cart-shopping"></i>',
      '🧮': '<i class="fa-solid fa-calculator"></i>',
      '💸': '<i class="fa-solid fa-money-bill-transfer"></i>',
      '🌴': '<i class="fa-solid fa-tree"></i>',
      '★': '<i class="fa-solid fa-star"></i>',
      '🔖': '<i class="fa-solid fa-bookmark"></i>',
      '📷': '<i class="fa-solid fa-camera"></i>',
      '🧪': '<i class="fa-solid fa-flask"></i>',
      '💥': '<i class="fa-solid fa-burst"></i>',
      '😴': '<i class="fa-solid fa-bed"></i>',
      '💨': '<i class="fa-solid fa-wind"></i>',
      '✉': '<i class="fa-solid fa-envelope"></i>',
      '🔹': '<i class="fa-solid fa-caret-left"></i>',
      '💪': '<i class="fa-solid fa-dumbbell"></i>',
      '⛔': '<i class="fa-solid fa-ban"></i>',
      '🔸': '<i class="fa-solid fa-caret-left"></i>',
      '🏙': '<i class="fa-solid fa-city"></i>',
      '🏔': '<i class="fa-solid fa-mountain"></i>',
      '✦': '<i class="fa-solid fa-star-of-life"></i>',
      '❄': '<i class="fa-solid fa-snowflake"></i>',
      '👔': '<i class="fa-solid fa-user-tie"></i>',
      '👉': '<i class="fa-solid fa-hand-point-left"></i>',
      '💬': '<i class="fa-brands fa-discord"></i>',
      '🌐': '<i class="fa-solid fa-globe"></i>',
      '▶': '<i class="fa-brands fa-youtube"></i>',
      '▶️': '<i class="fa-brands fa-youtube"></i>',
      '❤': '<i class="fa-solid fa-heart" style="color: #e74c3c;"></i>',
      '🪐': '<i class="fa-solid fa-planet-ringed"></i>',
      '🛠️': '<i class="fa-solid fa-wrench"></i>',
      '🛠': '<i class="fa-solid fa-wrench"></i>',
      '🤝': '<i class="fa-solid fa-handshake"></i>',
      '🎪': '<i class="fa-solid fa-calendar-check"></i>',
      '🐛': '<i class="fa-solid fa-bug"></i>',
      '💡': '<i class="fa-solid fa-lightbulb"></i>',
      '⚖️': '<i class="fa-solid fa-scale-balanced"></i>',
      '⚖': '<i class="fa-solid fa-scale-balanced"></i>',
      '💎': '<i class="fa-solid fa-gem"></i>',
      '👾': '<i class="fa-solid fa-gamepad"></i>',
      '💻': '<i class="fa-solid fa-laptop-code"></i>',
      '🎗️': '<i class="fa-solid fa-ribbon"></i>',
      '🎗': '<i class="fa-solid fa-ribbon"></i>',
      '⚙️': '<i class="fa-solid fa-gear"></i>',
      '⚙': '<i class="fa-solid fa-gear"></i>',
      '🎉': '<i class="fa-solid fa-champagne-glasses"></i>',
      '🎯': '<i class="fa-solid fa-crosshairs"></i>',
      '🚨': '<i class="fa-solid fa-triangle-exclamation"></i>',
      '🔄': '<i class="fa-solid fa-arrows-rotate"></i>',
      '🚪': '<i class="fa-solid fa-door-open"></i>',
      '🔐': '<i class="fa-solid fa-lock-open"></i>',
      '🏫': '<i class="fa-solid fa-school"></i>',
      '📑': '<i class="fa-solid fa-file-invoice"></i>',
      '🏆': '<i class="fa-solid fa-trophy"></i>',
      '📡': '<i class="fa-solid fa-tower-broadcast"></i>',
      '🦅': '<i class="fa-solid fa-feather"></i>',
      '🏛️': '<i class="fa-solid fa-landmark"></i>',
      '🏛': '<i class="fa-solid fa-landmark"></i>'
    };
    const regex = /[\u{1F300}-\u{1F9FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{1F400}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F19A}\u{1F200}-\u{1F251}❤★✦✗✓➡➔]/gu;
    return htmlText.replace(regex, (match) => {
      const norm = match.replace(/\ufe0f/g, '');
      return mapping[norm] || mapping[match] || match;
    });
  }

  return {
    init, toast, toggleTheme, initParticles,
    openModal, closeModal, confirm, alert,
    formatDate, timeAgo, animateCounter,
    syncSettingsWithServer,
    getSettingsApiUrl,
    getApiBase,
    checkMaintenanceStatus,
    replaceEmojisWithIcons,
    initUserBadge,
    injectAttendanceLinkIfNeeded
  };
})();

window.App = App;

window.resolveDiscordCDNUrl = function(path, type = 'avatar') {
  if (!path) return '';
  const match = path.match(/(avatars|banners)\/(\d+)_([a-zA-Z0-9_]+)\.(\w+)/);
  if (match) {
    const [_, dirType, id, hash, ext] = match;
    const resolvedType = dirType === 'banners' ? 'banners' : 'avatars';
    const format = hash.startsWith('a_') ? 'gif' : ext;
    const size = resolvedType === 'banners' ? '2048' : '1024';
    return `https://cdn.discordapp.com/${resolvedType}/${id}/${hash}.${format}?size=${size}`;
  }
  return '';
};

window.handleAvatarError = function(imgElement, fallbackPath) {
  if (!imgElement.dataset.triedDiscord) {
    imgElement.dataset.triedDiscord = 'true';
    const cdnUrl = window.resolveDiscordCDNUrl(imgElement.src, 'avatar');
    if (cdnUrl) {
      imgElement.src = cdnUrl;
      return;
    }
  }
  imgElement.src = fallbackPath;
};

window.resolveDiscordAsset = function(path, type = 'avatar') {
  if (!path) return '';
  
  // On production (Surge), bypass local cache files and resolve directly to Discord CDN
  // to avoid broken images caused by delayed background sync/deployments.
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!isLocalhost && (path.includes('avatars/') || path.includes('banners/'))) {
    const cdnUrl = window.resolveDiscordCDNUrl(path, type);
    if (cdnUrl) return cdnUrl;
  }
  
  if (path.startsWith('assets/') || path.startsWith('uploads/') || path.includes('/assets/') || path.includes('/uploads/') || path.includes('\\assets\\') || path.includes('\\uploads\\')) {
    let cleanPath = path;
    const assetsIdx = path.indexOf('assets/');
    const uploadsIdx = path.indexOf('uploads/');
    const assetsBackIdx = path.indexOf('assets\\');
    const uploadsBackIdx = path.indexOf('uploads\\');
    
    if (assetsIdx !== -1) cleanPath = path.substring(assetsIdx).replace(/\\/g, '/');
    else if (uploadsIdx !== -1) cleanPath = path.substring(uploadsIdx).replace(/\\/g, '/');
    else if (assetsBackIdx !== -1) cleanPath = path.substring(assetsBackIdx).replace(/\\/g, '/');
    else if (uploadsBackIdx !== -1) cleanPath = path.substring(uploadsBackIdx).replace(/\\/g, '/');

    const pathName = window.location.pathname;
    let prefix = './';
    if (pathName.includes('/pages/admin/')) {
      prefix = '../../';
    } else if (pathName.includes('/pages/')) {
      prefix = '../';
    } else if (pathName.includes('/auth/discord/callback')) {
      prefix = '../../../';
    }
    return prefix + cleanPath;
  }

  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    if (path.includes('cdn.discordapp.com/')) {
      const size = type === 'banner' ? '2048' : '1024';
      if (!path.includes('size=')) {
        return path + (path.includes('?') ? '&' : '?') + 'size=' + size;
      }
    }
    return path;
  }
  
  const match = path.match(/(?:avatars|banners)\/(\d+)_([a-zA-Z0-9_]+)\.(\w+)/);
  if (match) {
    const [_, id, hash, ext] = match;
    const format = hash.startsWith('a_') ? 'gif' : ext;
    const size = type === 'banner' ? '2048' : '1024';
    return `https://cdn.discordapp.com/${type}s/${id}/${hash}.${format}?size=${size}`;
  }
  
  return path;
};

// Auto-initialize when DOM ready
document.addEventListener('DOMContentLoaded', App.init);