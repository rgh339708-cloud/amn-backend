// Mocking window and browser objects for node
global.window = { location: { pathname: '/pages/attendance-reports.html', search: '' } };
global.document = {
  head: { appendChild: () => {} },
  getElementById: () => null,
  addEventListener: () => {},
  createElement: () => ({ id: '', rel: '', href: '', crossOrigin: '' })
};

// Mock Storage
global.Storage = {
  keys: { PAGES: 'ps_pages' },
  getCollection: () => [
    { id: 'home', title: 'الرئيسية', emoji: '🏠', isSystem: true, allowedRoles: ['*'] },
    { id: 'leadership', title: 'القيادة', emoji: '👑', isSystem: true, allowedRoles: ['*'] },
    { id: 'managers', title: 'مدراء الأقسام', emoji: '🏅', isSystem: true, allowedRoles: ['*'] },
    { id: 'centers', title: 'المراكز', emoji: '🏢', isSystem: true, allowedRoles: ['*'] },
    { id: 'guide', title: 'الدليل الشامل', emoji: '📖', isSystem: true, allowedRoles: ['*'] },
    { id: 'inventory', title: 'العهدة', emoji: '📦', isSystem: true, allowedRoles: ['*'] },
    { id: 'vehicles', title: 'المركبات', emoji: '🚘', isSystem: true, allowedRoles: ['*'] },
    { id: 'college', title: 'كلية التدريب', emoji: '🎓', isSystem: true, allowedRoles: ['*'] },
    { id: 'attendance-reports', title: 'تقارير الحضور', emoji: '📋', isSystem: true, allowedRoles: ['owner', 'assistant_owner', 'academy_affairs', 'admin', 'course_admin'] },
    { id: 'exams', title: 'الاختبارات', emoji: '📝', isSystem: true, allowedRoles: ['*'] },
    { id: 'archive', title: 'أرشيف الاختبارات', emoji: '📚', isSystem: true, allowedRoles: ['owner', 'assistant_owner', 'admin'] }
  ]
};

// Mock Auth
global.Auth = {
  seedSystemPages: () => {},
  getCurrentUser: () => ({ username: 'TestUser', role: 'owner' }),
  checkPageAccess: () => true
};

const fs = require('fs');
const path = require('path');
const componentsCode = fs.readFileSync(path.join(__dirname, '../assets/js/components.js'), 'utf8');

// Evaluate the components code
eval(componentsCode + '\nglobal.Components = Components;');

try {
  const navbarHtml = Components.navbar('attendance-reports');
  console.log('Navbar successfully generated. Length:', navbarHtml.length);
  const sidebarHtml = Components.sidebar('attendance-reports');
  console.log('Sidebar successfully generated. Length:', sidebarHtml.length);
} catch (e) {
  console.error('Error generating components:', e);
}
