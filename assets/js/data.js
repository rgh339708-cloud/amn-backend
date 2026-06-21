/**
 * data.js - البيانات التجريبية الافتراضية
 * Seed data for Public Security Portal
 */

const SeedData = (() => {

  async function init() {
    if (!Storage.get(Storage.keys.INITIALIZED)) {
      console.log('[Data] ps_initialized is missing. Trying to load collections from server first...');
      try {
        await Storage.loadAllFromServer();
      } catch (e) {
        console.warn('[Data] Failed to load collections from server:', e);
      }
      
      const existingExams = Storage.getCollection(Storage.keys.EXAMS) || [];
      const existingUsers = Storage.getCollection(Storage.keys.USERS) || [];
      if (existingExams.length > 0 || existingUsers.length > 0) {
        console.log('[Data] Failsafe: Collections not empty. Marking ps_initialized as true.');
        Storage.set(Storage.keys.INITIALIZED, true);
      }
    }

    if (Storage.get(Storage.keys.INITIALIZED)) {
      // Force update of centers if old ones exist in Storage
      const currentCenters = Storage.get(Storage.keys.CENTERS);
      const ctr002 = currentCenters && currentCenters.find(c => c.id === 'ctr_002');
      const ctr003 = currentCenters && currentCenters.find(c => c.id === 'ctr_003');
      const ctr004 = currentCenters && currentCenters.find(c => c.id === 'ctr_004');
      const centersOutdated = !currentCenters 
        || currentCenters.length < 4
        || !ctr002
        || !ctr003
        || !ctr004
        || ctr002.name !== 'مركز الأمن العام – شمال لوس'
        || ctr003.name !== 'مركز الأمن العام – ساندي'
        || ctr004.name !== 'مركز الأمن العام – بوليتو'
        || (currentCenters.length === 1 && (currentCenters[0].name === 'المركز الرئيسي' || currentCenters[0].location === 'المنطقة الوسطى' || !currentCenters[0].description));
      if (centersOutdated) {
        console.log('[Data] Resetting centers to latest version...');
        _seedCenters();
      }

      // Clean up default mock users if they exist
      const currentUsers = Storage.getCollection(Storage.keys.USERS) || [];
      const hasMockUsers = currentUsers.some(u => u.id === 'user_owner_001' || u.id === 'user_super_001' || u.id === 'user_admin_001' || u.id === 'user_editor_001' || u.id === 'user_viewer_001');
      if (hasMockUsers) {
        console.log('[Data] Filtering out default mock users from users collection...');
        const filteredUsers = currentUsers.filter(u => u.id !== 'user_owner_001' && u.id !== 'user_super_001' && u.id !== 'user_admin_001' && u.id !== 'user_editor_001' && u.id !== 'user_viewer_001');
        Storage.set(Storage.keys.USERS, filteredUsers);
      }

      const settings = Storage.get(Storage.keys.SETTINGS) || {};
      let updated = false;
      if (!settings.discordLink || settings.discordLink === '#' || settings.discordLink.includes('publicsecurity')) {
        settings.discordLink = 'https://discord.gg/UpAUaRcqe';
        updated = true;
      }
      if (!settings.officialSiteLink || settings.officialSiteLink === '#' || settings.officialSiteLink.includes('publicsecurity90.gov') || settings.officialSiteLink.includes('amn-90-rm.surge.sh')) {
        settings.officialSiteLink = 'https://amn-3-90.surge.sh/index.html';
        updated = true;
      }
      if (!settings.welcomeTitle || settings.welcomeTitle === '• المنصة الرسمية - إصدار 1.0 •' || settings.welcomeTitle === 'البوابة الرسمية لأدارة الامن العام') {
        settings.welcomeTitle = 'الموقع الرسمي لإدارة الامن العام';
        updated = true;
      }
      if (!settings.heroDesc || settings.heroDesc.includes('منصة موحدة لجميع شؤون القطاع')) {
        settings.heroDesc = 'موقع شامل لجميع شؤون إدارة الامن العام';
        updated = true;
      }
      // Inject new updates dynamically if not present
      const currentAnnouncements = Storage.getCollection(Storage.keys.ANNOUNCEMENTS) || [];
      if (!currentAnnouncements.some(a => a.id === 'ann_007')) {
        console.log('[Data] Seeding Discord login update announcement...');
        const updateAnn = {
          id: 'ann_007',
          title: 'تحديث البوابة الرقمية: إطلاق نظام تسجيل الدخول الموحد Discord OAuth2 والربط الثنائي للمنسوبين',
          body: `<p>بناءً على التوجيهات لتأمين وحماية البوابة الرقمية للأمن العام بمدينة الـ90، تم إطلاق نظام تسجيل الدخول الموحد عن طريق Discord OAuth2 بالكامل ويشمل:</p><ul><li><b>مصادقة رقمية موحدة:</b> إمكانية تسجيل الدخول المباشر والآمن باستخدام حساب ديسكورد الرسمي الخاص بالمنسوب.</li><li><b>التحقق التلقائي من قواعد البيانات:</b> ربط تسجيل الدخول بوجود العضو في جداول قطاع الأمن العام المعتمدة (الأساسي، المنتدبين، الإدارة). في حال عدم تطابق البيانات، يتم حظر الدخول فوراً لحماية السرية الأمنية.</li><li><b>نظام منع التكرار والربط المتعدد:</b> فرض قيود برمجية صارمة تمنع ربط أكثر من حساب ديسكورد بنفس المستخدم، أو ربط نفس حساب ديسكورد بأكثر من مستخدم.</li><li><b>شارات ديسكورد التفاعلية باللوحة:</b> تظهر شارات ديسكورد الرسمية للمنسوبين وحالة ارتباط حساباتهم (مرتبط / غير مرتبط) في جدول إدارة الصلاحيات للمالك العام.</li></ul>`,
          priority: 'high',
          category: 'تحديثات',
          emoji: '<i class="fa-brands fa-discord"></i>',
          author: 'المكتب التقني',
          authorRole: 'التطوير والدعم',
          pinned: true,
          views: 150,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        currentAnnouncements.forEach(a => { if (a.pinned) a.pinned = false; });
        currentAnnouncements.unshift(updateAnn);
        Storage.set(Storage.keys.ANNOUNCEMENTS, currentAnnouncements);
      }

      if (!currentAnnouncements.some(a => a.id === 'ann_006')) {
        console.log('[Data] Seeding exams update announcement...');
        const updateAnn = {
          id: 'ann_006',
          title: 'تحديث البوابة الرقمية: إطلاق نظام الاختبارات والدورات المطور وقفل المستندات التلقائي',
          body: `<p>بناءً على التوجيهات الأمنية لتطوير المسار التعليمي والتدريبي للجهاز، تم إطلاق نظام الاختبارات والدورات المطور والذي يشمل:</p><ul><li><b>بنك أسئلة مستقل لكل دورة:</b> إمكانية إدارة الأسئلة بعشوائية تامة للأسئلة والخيارات لكل مختبر.</li><li><b>رتبة مسؤول دورة (<i class="fa-solid fa-graduation-cap"></i>):</b> صلاحيات مخصصة لإدارة الاختبارات وبنك الأسئلة ومتابعة النتائج.</li><li><b>قفل المستندات التلقائي في الوقت الفعلي:</b> عند بدء أي اختبار، يتم قفل مستند الدورة فوراً لمنع تسريب الإجابات، ويعاد فتحه تلقائياً في الوقت الفعلي عند إغلاق الاختبار.</li><li><b>منع التكرار والإعادة:</b> حفظ النتيجة فوراً ومنع الإعادة التلقائية إلا بإذن مسؤول الدورة.</li></ul>`,
          priority: 'high',
          category: 'تحديثات',
          emoji: '<i class="fa-solid fa-graduation-cap"></i>',
          author: 'المكتب التقني',
          authorRole: 'التطوير والدعم',
          pinned: false,
          views: 120,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        currentAnnouncements.unshift(updateAnn);
        Storage.set(Storage.keys.ANNOUNCEMENTS, currentAnnouncements);
      }

      if (!currentAnnouncements.some(a => a.id === 'ann_005')) {
        console.log('[Data] Seeding update announcement...');
        const updateAnn = {
          id: 'ann_005',
          title: 'تحديث البوابة الرقمية: إضافة شاشة الدخول الموحدة وأنظمة التحميل الهيكلية',
          body: `<p>بناءً على توجيهات الشؤون التقنية بالأمن العام، تم إطلاق تحديث جديد للوزارة شمل:</p><ul><li>شاشة دخول تفاعلية عسكرية تظهر عند تحميل الموقع مصحوبة بشعار الأمن العام والتوهج الذهبي.</li><li>نظام تحميل ذكي (Skeleton Loaders) في صفحة قاعدة البيانات وصفحة الملفات الشخصية لتسهيل تصفح البيانات وجعلها أكثر سلاسة وسرعة.</li></ul>`,
          priority: 'high',
          category: 'تحديثات',
          emoji: '<i class="fa-solid fa-gear"></i>',
          author: 'المكتب التقني',
          authorRole: 'التطوير والدعم',
          pinned: false,
          views: 541,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        currentAnnouncements.unshift(updateAnn);
        Storage.set(Storage.keys.ANNOUNCEMENTS, currentAnnouncements);
      }

      const currentNews = Storage.getCollection(Storage.keys.NEWS) || [];
      if (!currentNews.some(n => n.id === 'news_007')) {
        const updateNews = {
          id: 'news_007',
          title: 'إطلاق نظام الدخول الموحد والربط الثنائي الآمن Discord OAuth2 للمنسوبين',
          category: 'تحديث',
          emoji: '<i class="fa-brands fa-discord"></i>',
          date: '2026-06-13',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        currentNews.unshift(updateNews);
        Storage.set(Storage.keys.NEWS, currentNews);
      }

      if (!currentNews.some(n => n.id === 'news_006')) {
        const updateNews = {
          id: 'news_006',
          title: 'إطلاق نظام الاختبارات المطور ورتبة مسؤول دورة لتأمين المسار التدريبي للضباط والأفراد',
          category: 'تحديث',
          emoji: '<i class="fa-solid fa-graduation-cap"></i>',
          date: '2026-06-08',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        currentNews.unshift(updateNews);
        Storage.set(Storage.keys.NEWS, currentNews);
      }

      if (!currentNews.some(n => n.id === 'news_005')) {
        const updateNews = {
          id: 'news_005',
          title: 'إطلاق شاشة الدخول الجديدة وأنظمة شيمر البيانات السلسة',
          category: 'تحديث',
          emoji: '🚀',
          date: '2026-06-08',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        currentNews.unshift(updateNews);
        Storage.set(Storage.keys.NEWS, currentNews);
      }

      const currentExams = Storage.getCollection(Storage.keys.EXAMS) || [];
      const seeded = _getSeededExams();
      const seededOps = seeded.find(e => e.id === 'exam_004');
      
      let opExam = null;
      const otherExams = currentExams.filter(e => {
        const isOps = e.id === 'exam_004' || (e.title && (e.title.includes('العمليات') || e.title.includes('عمليات')));
        const isMock = e.id === 'exam_001' || e.id === 'exam_002' || e.id === 'exam_003';
        if (isOps) {
          if (!opExam) {
            opExam = e;
          }
          return false;
        }
        if (isMock) {
          return false;
        }
        return true;
      });
      
      if (!opExam) {
        if (seededOps) {
          otherExams.push(seededOps);
        }
      } else {
        otherExams.push({
          ...opExam,
          id: 'exam_004',
          title: seededOps.title,
          description: seededOps.description,
          category: seededOps.category,
          emoji: seededOps.emoji,
          duration: seededOps.duration,
          passingScore: seededOps.passingScore,
          questionsCountToShow: seededOps.questionsCountToShow,
          questions: seededOps.questions,
          documentUrl: seededOps.documentUrl
        });
      }
      Storage.set(Storage.keys.EXAMS, otherExams);

      if (updated) {
        Storage.set(Storage.keys.SETTINGS, settings);
      }
      return;
    }
    console.log('[Data] Seeding initial data...');

    _seedUsers();
    _seedAnnouncements();
    _seedNews();
    _seedPromotions();
    _seedGuideTopics();
    _seedArchive();
    _seedExams();
    _seedDatabase();
    _seedMembers();
    _seedCenters();
    _seedSettings();

    Storage.set(Storage.keys.INITIALIZED, true);
    console.log('[Data] Seed complete.');
  }

  /* ── Users ────────────────────────────────────────── */
  function _seedUsers() {
    const users = [
      {
        id: '1334568342345748565',
        username: '3gjo',
        discord: '3gjo',
        password: 'owner123_change_me',
        role: 'owner',
        rank: 'المالك',
        avatar: 'assets/img/avatars/1334568342345748565_e2dcb67601cdaefd19b887ad9c1105a9.png',
        status: 'active',
        joinDate: '2024-01-01',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: '1120142432554713261',
        username: 'z6tw',
        discord: 'z6tw',
        password: 'owner123_change_me',
        role: 'owner',
        rank: 'المالك',
        avatar: 'assets/img/avatars/1120142432554713261_a_65592f53553fbd8ea6c2f685c727cc42.gif',
        status: 'active',
        joinDate: '2024-01-01',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: '821825761673478144',
        username: 'ifm711',
        discord: 'ifm711',
        password: 'owner123_change_me',
        role: 'owner',
        rank: 'المالك',
        avatar: 'assets/img/avatars/821825761673478144_b3b693f252bec5acb1ba12fdfbf5bf75.png',
        status: 'active',
        joinDate: '2024-01-01',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    ];
    Storage.set(Storage.keys.USERS, users);
  }

  /* ── Announcements ────────────────────────────────── */
  function _seedAnnouncements() {
    const items = [
      {
        id: 'ann_007',
        title: 'تحديث البوابة الرقمية: إطلاق نظام تسجيل الدخول الموحد Discord OAuth2 والربط الثنائي للمنسوبين',
        body: `<p>بناءً على التوجيهات لتأمين وحماية البوابة الرقمية للأمن العام بمدينة الـ90، تم إطلاق نظام تسجيل الدخول الموحد عن طريق Discord OAuth2 بالكامل ويشمل:</p><ul><li><b>مصادقة رقمية موحدة:</b> إمكانية تسجيل الدخول المباشر والآمن باستخدام حساب ديسكورد الرسمي الخاص بالمنسوب.</li><li><b>التحقق التلقائي من قواعد البيانات:</b> ربط تسجيل الدخول بوجود العضو في جداول قطاع الأمن العام المعتمدة (الأساسي، المنتدبين، الإدارة). في حال عدم تطابق البيانات، يتم حظر الدخول فوراً لحماية السرية الأمنية.</li><li><b>نظام منع التكرار والربط المتعدد:</b> فرض قيود برمجية صارمة تمنع ربط أكثر من حساب ديسكورد بنفس المستخدم، أو ربط نفس حساب ديسكورد بأكثر من مستخدم.</li><li><b>شارات ديسكورد التفاعلية باللوحة:</b> تظهر شارات ديسكورد الرسمية للمنسوبين وحالة ارتباط حساباتهم (مرتبط / غير مرتبط) في جدول إدارة الصلاحيات للمالك العام.</li></ul>`,
        priority: 'high',
        category: 'تحديثات',
        emoji: '<i class="fa-brands fa-discord"></i>',
        author: 'المكتب التقني',
        authorRole: 'التطوير والدعم',
        pinned: true,
        views: 150,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'ann_006',
        title: 'تحديث البوابة الرقمية: إطلاق نظام الاختبارات والدورات المطور وقفل المستندات التلقائي',
        body: `<p>بناءً على التوجيهات الأمنية لتطوير المسار التعليمي والتدريبي للجهاز، تم إطلاق نظام الاختبارات والدورات المطور والذي يشمل:</p><ul><li><b>بنك أسئلة مستقل لكل دورة:</b> إمكانية إدارة الأسئلة بعشوائية تامة للأسئلة والخيارات لكل مختبر.</li><li><b>رتبة مسؤول دورة (<i class="fa-solid fa-graduation-cap"></i>):</b> صلاحيات مخصصة لإدارة الاختبارات وبنك الأسئلة ومتابعة النتائج.</li><li><b>قفل المستندات التلقائي في الوقت الفعلي:</b> عند بدء أي اختبار، يتم قفل مستند الدورة فوراً لمنع تسريب الإجابات، ويعاد فتحه تلقائياً في الوقت الفعلي عند إغلاق الاختبار.</li><li><b>منع التكرار والإعادة:</b> حفظ النتيجة فوراً ومنع الإعادة التلقائية إلا بإذن مسؤول الدورة.</li></ul>`,
        priority: 'high',
        category: 'تحديثات',
        emoji: '<i class="fa-solid fa-graduation-cap"></i>',
        author: 'المكتب التقني',
        authorRole: 'التطوير والدعم',
        pinned: false,
        views: 120,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'ann_005',
        title: 'تحديث البوابة الرقمية: إضافة شاشة الدخول الموحدة وأنظمة التحميل الهيكلية',
        body: `<p>بناءً على توجيهات الشؤون التقنية بالأمن العام، تم إطلاق تحديث جديد للوزارة شمل:</p><ul><li>شاشة دخول تفاعلية عسكرية تظهر عند تحميل الموقع مصحوبة بشعار الأمن العام والتوهج الذهبي.</li><li>نظام تحميل ذكي (Skeleton Loaders) في صفحة قاعدة البيانات وصفحة الملفات الشخصية لتسهيل تصفح البيانات وجعلها أكثر سلاسة وسرعة.</li></ul>`,
        priority: 'high',
        category: 'تحديثات',
        emoji: '<i class="fa-solid fa-gear"></i>',
        author: 'المكتب التقني',
        authorRole: 'التطوير والدعم',
        pinned: false,
        views: 541,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'ann_001',
        title: 'افتتاح مركز التدريب المتقدم الجديد',
        body: `<p>يسر قيادة الأمن العام الإعلان عن افتتاح مركز التدريب المتقدم الجديد رسمياً، والذي سيوفر بيئة تدريبية متكاملة لجميع منتسبي الجهاز.</p><p>يضم المركز أحدث المعدات والتقنيات اللازمة لرفع مستوى الكفاءة الميدانية، ويشمل قاعات محاكاة متطورة وملاعب تدريب مفتوحة.</p>`,
        priority: 'high',
        category: 'تدريب',
        emoji: '<i class="fa-solid fa-school"></i>',
        author: 'القائد الأعلى',
        authorRole: 'قيادة الجهاز',
        pinned: false,
        views: 342,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 'ann_002',
        title: 'إعلان موعد اختبارات الترقية للمرحلة الثانية',
        body: `<p>تُعلن إدارة شؤون الأفراد عن موعد اختبارات الترقية لمرحلة الضباط المساعدين والضباط.</p><p>ستُقام الاختبارات خلال الأسبوع القادم وفق الجدول المرفق، ويُطلب من جميع المتقدمين الالتزام بالحضور في الوقت المحدد.</p>`,
        priority: 'medium',
        category: 'ترقيات',
        emoji: '📋',
        author: 'إدارة شؤون الأفراد',
        authorRole: 'الإدارة',
        pinned: false,
        views: 218,
        createdAt: new Date(Date.now() - 172800000).toISOString(),
        updatedAt: new Date(Date.now() - 172800000).toISOString(),
      },
      {
        id: 'ann_003',
        title: 'تحديث بروتوكول التعامل مع الحوادث الميدانية',
        body: `<p>بناءً على توجيهات قيادة الجهاز، يتم إعلامكم بالتحديثات الجديدة على بروتوكول التعامل مع الحوادث الميدانية.</p><p>يُرجى الاطلاع على الدليل المحدث في قسم الدليل الشامل واعتماده مرجعاً رسمياً اعتباراً من تاريخ هذا الإعلان.</p>`,
        priority: 'low',
        category: 'إجراءات',
        emoji: '<i class="fa-solid fa-file-invoice"></i>',
        author: 'مكتب العمليات',
        authorRole: 'العمليات',
        pinned: false,
        views: 156,
        createdAt: new Date(Date.now() - 259200000).toISOString(),
        updatedAt: new Date(Date.now() - 259200000).toISOString(),
      },
      {
        id: 'ann_004',
        title: 'حملة التوعية الأمنية - المرحلة الثالثة',
        body: `<p>تنطلق الأسبوع القادم المرحلة الثالثة من حملة التوعية الأمنية الشاملة، والتي تهدف إلى رفع مستوى الوعي الأمني بين المنتسبين والمجتمع.</p>`,
        priority: 'medium',
        category: 'تدريب',
        emoji: '<i class="fa-solid fa-shield-halved"></i>',
        author: 'مكتب العلاقات العامة',
        authorRole: 'العلاقات العامة',
        pinned: false,
        views: 89,
        createdAt: new Date(Date.now() - 345600000).toISOString(),
        updatedAt: new Date(Date.now() - 345600000).toISOString(),
      },
    ];
    Storage.set(Storage.keys.ANNOUNCEMENTS, items);
  }

  /* ── News ─────────────────────────────────────────── */
  function _seedNews() {
    const items = [
      { id: 'news_007', title: 'إطلاق نظام الدخول الموحد والربط الثنائي الآمن Discord OAuth2 للمنسوبين', category: 'تحديث', emoji: '<i class="fa-brands fa-discord"></i>', date: '2026-06-13', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'news_006', title: 'إطلاق نظام الاختبارات المطور ورتبة مسؤول دورة لتأمين المسار التدريبي للضباط والأفراد', category: 'تحديث', emoji: '<i class="fa-solid fa-graduation-cap"></i>', date: '2026-06-08', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'news_005', title: 'إطلاق شاشة الدخول الجديدة وأنظمة شيمر البيانات السلسة', category: 'تحديث', emoji: '🚀', date: '2026-06-08', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'news_001', title: 'سيرفر الأمن العام يحتفل بمرور سنة على إطلاقه', category: 'أخبار', emoji: '<i class="fa-solid fa-champagne-glasses"></i>', date: '2025-05-28', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'news_002', title: 'مناورة ميدانية ناجحة بمشاركة جميع الوحدات', category: 'ميداني', emoji: '<i class="fa-solid fa-helicopter"></i>', date: '2025-05-27', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'news_003', title: 'إطلاق نظام التقارير الإلكترونية الجديد', category: 'تقنية', emoji: '<i class="fa-solid fa-laptop-code"></i>', date: '2025-05-26', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'news_004', title: 'تكريم أفضل عناصر الجهاز لشهر مايو', category: 'تكريم', emoji: '<i class="fa-solid fa-trophy"></i>', date: '2025-05-25', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    Storage.set(Storage.keys.NEWS, items);
  }

  /* ── Promotions ───────────────────────────────────── */
  function _seedPromotions() {
    const items = [
      { id: 'promo_001', name: 'أحمد عبدالله', fromRank: 'نقيب', toRank: 'رائد', date: '2025-05-28', promotedBy: 'اللواء ناصر', unit: 'وحدة الاستجابة السريعة', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'promo_002', name: 'محمد سالم', fromRank: 'ملازم أول', toRank: 'نقيب', date: '2025-05-27', promotedBy: 'اللواء ناصر', unit: 'وحدة المراقبة', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'promo_003', name: 'خالد الراشد', fromRank: 'رقيب', toRank: 'رقيب أول', date: '2025-05-26', promotedBy: 'العقيد علي', unit: 'الدورية الميدانية', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'promo_004', name: 'عمر الحسن', fromRank: 'عريف', toRank: 'رقيب', date: '2025-05-25', promotedBy: 'العقيد علي', unit: 'الادارة العامه للامن العام', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'promo_005', name: 'فيصل النعيمي', fromRank: 'جندي أول', toRank: 'عريف', date: '2025-05-24', promotedBy: 'الرائد كريم', unit: 'وحدة حفظ النظام', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    Storage.set(Storage.keys.PROMOTIONS, items);
  }

  /* ── Guide Topics ─────────────────────────────────── */
  function _seedGuideTopics() {
    const topics = [];
    Storage.set(Storage.keys.GUIDE_TOPICS, topics);
  }

  /* ── Archive ──────────────────────────────────────── */
  function _seedArchive() {
    Storage.set(Storage.keys.ARCHIVE, []);
  }

  /* ── Exams ────────────────────────────────────────── */
  function _getSeededExams() {
    return [
      {
        id: 'exam_004',
        title: 'اختبار دورة العمليات الميدانية',
        description: 'اختبار دورة العمليات الميدانية لقياس كفاءة إدارة الموجه اللاسلكي وتوجيه الوحدات.',
        category: 'العمليات والتحكم',
        emoji: '<i class="fa-solid fa-tower-broadcast"></i>',
        duration: 15,
        passingScore: 67,
        isOpen: false,
        openedAt: '',
        closedAt: '',
        documentUrl: 'ops-document.html',
        questionsCountToShow: 15,
        questions: [
          {
            q: 'ما هو مركز العمليات؟',
            options: ['القيادة والتحكم في الأمن العام', 'وحدة مرور', 'وحدة تحقيق', 'وحدة إسعاف'],
            correct: 0
          },
          {
            q: 'ما وظيفة مركز العمليات الأساسية؟',
            options: ['إصدار المخالفات', 'استلام وتوجيه البلاغات', 'التحقيق الجنائي', 'التفتيش'],
            correct: 1
          },
          {
            q: 'مركز العمليات يعتبر:',
            options: ['وحدة ميدانية', 'حلقة وصل بين القطاعات الأمنية', 'وحدة تحقيق', 'وحدة مرور فقط'],
            correct: 1
          },
          {
            q: 'من مهام العمليات:',
            options: ['العمل الميداني', 'توجيه الوحدات', 'التحقيق', 'التفتيش'],
            correct: 1
          },
          {
            q: 'ماذا يمنع على الوحدات الميدانية؟',
            options: ['استخدام الراديو', 'التوجه بدون إذن العمليات', 'طلب الدعم', 'تحديث الحالة'],
            correct: 1
          },
          {
            q: 'يجب على العمليات التأكد من:',
            options: ['لون المركبة', 'استلام البلاغ من الوحدات', 'عدد اللاعبين', 'نوع السلاح'],
            correct: 1
          },
          {
            q: 'يمنع التعميم بدون:',
            options: ['لون المركبة', 'معلومات لوحة كاملة', 'نوع الطريق', 'الوقت'],
            correct: 1
          },
          {
            q: 'نائب العمليات هو:',
            options: ['قائد المرور', 'المساند للعمليات', 'ضابط تحقيق', 'قائد ميداني'],
            correct: 1
          },
          {
            q: 'عند غياب العمليات يتولى:',
            options: ['البحث والتحري', 'نائب العمليات', 'التدخل السريع', 'المرور'],
            correct: 1
          },
          {
            q: 'من مهام نائب العمليات:',
            options: ['التحقيق', 'تسجيل الغفوات', 'التفتيش', 'التوقيف'],
            correct: 1
          },
          {
            q: 'ترتيب توزيع الوحدات يبدأ بـ:',
            options: ['الشمال', 'الشرق', 'الوسط', 'الغرب'],
            correct: 2
          },
          {
            q: 'بعد الوسط يأتي:',
            options: ['الجنوب', 'الشرق', 'الشمال', 'الغرب'],
            correct: 0
          },
          {
            q: 'اللقب الأول للدورة:',
            options: ['نائب عمليات', 'مركز عمليات الأمن العام', 'قائد ميداني', 'مشرف'],
            correct: 1
          },
          {
            q: 'اللقب الثاني للدورة:',
            options: ['قائد عمليات', 'نائب مركز عمليات الأمن العام', 'ضابط مرور', 'مشرف'],
            correct: 1
          },
          {
            q: 'أعلى رتبة ميدانية:',
            options: ['رعد', 'قيادة', 'درع', 'حزم'],
            correct: 1
          },
          {
            q: 'رعد تعني:',
            options: ['فريق فما فوق', 'لواء', 'جندي', 'رقيب'],
            correct: 0
          },
          {
            q: 'درع تعني:',
            options: ['لواء', 'عقيد', 'رائد', 'جندي'],
            correct: 0
          },
          {
            q: 'حزم تعني:',
            options: ['عقيد وعميد', 'رقيب', 'جندي', 'ملازم'],
            correct: 0
          },
          {
            q: 'مدار تعني:',
            options: ['رائد ومقدم', 'لواء', 'جندي', 'فريق'],
            correct: 0
          },
          {
            q: 'تسعين تشمل:',
            options: ['ملازم إلى نقيب', 'جندي إلى رقيب', 'فريق', 'عميد'],
            correct: 0
          },
          {
            q: 'ضابط الغرب مسؤول عن:',
            options: ['شرق المدينة', 'غرب المدينة', 'شمال المدينة', 'جنوب المدينة'],
            correct: 1
          },
          {
            q: 'ضابط الجنوب مسؤول عن:',
            options: ['الجنوب', 'الشرق', 'الغرب', 'الوسط'],
            correct: 0
          },
          {
            q: 'ساهر تابع لـ:',
            options: ['التحقيق', 'المرور والرادارات', 'العمليات', 'التدخل السريع'],
            correct: 1
          },
          {
            q: 'سير يشترط:',
            options: ['ملازم', 'جندي', 'رئيس رقباء فما فوق', 'عقيد'],
            correct: 2
          },
          {
            q: 'ميم يشمل:',
            options: ['جندي أول إلى رقيب أول', 'ملازم فقط', 'عقيد', 'فريق'],
            correct: 0
          },
          {
            q: 'رصد المرور هو:',
            options: ['وحدة علنية', 'وحدة سرية', 'وحدة إسعاف', 'وحدة تحقيق'],
            correct: 1
          },
          {
            q: 'صقر 1 من:',
            options: ['ملازم فما فوق', 'جندي', 'رقيب', 'فريق'],
            correct: 0
          },
          {
            q: 'صقر 2 من:',
            options: ['وكيل رقيب إلى رئيس رقباء', 'ملازم', 'فريق', 'لواء'],
            correct: 0
          },
          {
            q: 'شهاب هو:',
            options: ['مرور', 'مهمات خاصة', 'تحقيق', 'إسعاف'],
            correct: 1
          },
          {
            q: 'برق يشترط:',
            options: ['دورة المهمات الخاصة', 'المرور', 'التحقيق', 'الجمارك'],
            correct: 0
          },
          {
            q: 'مهام (1-3) من:',
            options: ['رقيب إلى رئيس رقباء', 'ملازم', 'فريق', 'لواء'],
            correct: 0
          },
          {
            q: 'مكافحة 1 هي:',
            options: ['المرور', 'مكافحة المخدرات', 'التحقيق', 'العمليات'],
            correct: 1
          },
          {
            q: 'سيف 1 هو:',
            options: ['نقيب فما فوق', 'جندي', 'ملازم', 'رقيب'],
            correct: 0
          },
          {
            q: 'رصد مكافحة هو:',
            options: ['وحدة سرية', 'وحدة مرور', 'وحدة إسعاف', 'وحدة تحقيق'],
            correct: 1
          },
          {
            q: 'بحث وتحري هو:',
            options: ['وحدة علنية', 'جهاز سري للجرائم', 'مرور', 'إسعاف'],
            correct: 1
          },
          {
            q: 'التدخل السريع مختص بـ:',
            options: ['المخالفات', 'البلاغات عالية الخطورة', 'المرور', 'التقارير'],
            correct: 1
          },
          {
            q: 'يمنع على العمليات:',
            options: ['التوجيه', 'العمل الميداني', 'البلاغات', 'الراديو'],
            correct: 1
          },
          {
            q: 'مكان تواجد العمليات:',
            options: ['الشارع', 'مبنى الإدارة العامة', 'الميدان', 'المركبة'],
            correct: 1
          },
          {
            q: 'عدم التواجد يؤدي إلى:',
            options: ['ترقية', 'سحب الدورة', 'مكافأة', 'لا شيء'],
            correct: 1
          },
          {
            q: 'يمنع التوجه بدون:',
            options: ['مركبة', 'إذن العمليات', 'دعم', 'سلاح'],
            correct: 1
          },
          {
            q: 'المطاردة الجنائية:',
            options: ['1 دورية', '3 دوريات', '5 دوريات', '10 دوريات'],
            correct: 1
          },
          {
            q: 'البلاغ المروري:',
            options: ['1 دورية', '2 دورية', '3 دوريات', '5 دوريات'],
            correct: 1
          },
          {
            q: 'في السرقة يتم إرسال:',
            options: ['مدني', 'ضابط مسؤول', 'جندي', 'إسعاف'],
            correct: 1
          },
          {
            q: 'مدة الغفوة:',
            options: ['5 دقائق', '10 دقائق', '15 دقيقة', '20 دقيقة'],
            correct: 1
          },
          {
            q: 'موجة الغفوة:',
            options: ['1', '2', '4.5', '3'],
            correct: 2
          },
          {
            q: 'الغفوة ممنوعة في:',
            options: ['الموجة الرئيسية', 'غرفة العمليات', 'الميدان', 'السيارة'],
            correct: 0
          },
          {
            q: 'أقصى تأخير للتقرير:',
            options: ['5 دقائق', '10 دقائق', '20 دقيقة', 'ساعة'],
            correct: 1
          }
        ],
        attempts: 0,
        passRate: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
  }

  function _seedExams() {
    Storage.set(Storage.keys.EXAMS, _getSeededExams());
  }

  /* ── Database (Members records) ───────────────────── */
  function _seedDatabase() {
    const rows = [
      { id: 'db_001', name: 'اللواء ناصر العتيبي', rank: 'لواء', unit: 'القيادة العامة', status: 'active', badge: 'PS-001', joinDate: '2024-01-01', discord: 'Naser#2001', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'db_002', name: 'العميد خالد المطيري', rank: 'عميد', unit: 'إدارة العمليات', status: 'active', badge: 'PS-002', joinDate: '2024-01-15', discord: 'Khaled#3002', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'db_003', name: 'العقيد فيصل الشمري', rank: 'عقيد', unit: 'وحدة الاستجابة', status: 'active', badge: 'PS-003', joinDate: '2024-02-01', discord: 'Faisal#4003', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'db_004', name: 'المقدم سلطان الدوسري', rank: 'مقدم', unit: 'دورية الحدود', status: 'active', badge: 'PS-004', joinDate: '2024-02-20', discord: 'Sultan#5004', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'db_005', name: 'الرائد كريم النعيمي', rank: 'رائد', unit: 'مكتب التحقيقات', status: 'active', badge: 'PS-005', joinDate: '2024-03-05', discord: 'Karim#6005', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'db_006', name: 'النقيب أحمد الهاجري', rank: 'نقيب', unit: 'وحدة المراقبة', status: 'active', badge: 'PS-006', joinDate: '2024-03-18', discord: 'Ahmed#7006', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'db_007', name: 'الملازم أول ماجد السبيعي', rank: 'ملازم أول', unit: 'الكلية التدريبية', status: 'active', badge: 'PS-007', joinDate: '2024-04-01', discord: 'Majed#8007', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'db_008', name: 'الرقيب عمر الغامدي', rank: 'رقيب', unit: 'دورية المدينة', status: 'on_leave', badge: 'PS-008', joinDate: '2024-04-15', discord: 'Omar#9008', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'db_009', name: 'العريف يوسف العنزي', rank: 'عريف', unit: 'نقطة التفتيش', status: 'active', badge: 'PS-009', joinDate: '2024-05-01', discord: 'Yousef#0009', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'db_010', name: 'الجندي عبدالرحمن القحطاني', rank: 'جندي', unit: 'وحدة حفظ النظام', status: 'training', badge: 'PS-010', joinDate: '2024-05-20', discord: 'Abdulrhman#0010', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'db_011', name: 'الرائد نواف الزهراني', rank: 'رائد', unit: 'إدارة العمليات', status: 'active', badge: 'PS-011', joinDate: '2024-06-01', discord: 'Nawaf#1011', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'db_012', name: 'النقيب حسن الأحمد', rank: 'نقيب', unit: 'وحدة الاستجابة', status: 'inactive', badge: 'PS-012', joinDate: '2024-06-15', discord: 'Hassan#2012', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    Storage.set(Storage.keys.DATABASE_ROWS, rows);
  }

  /* ── Members ──────────────────────────────────────── */
  function _seedMembers() {
    const members = [
      {
        id: 'mem_001',
        name: 'الفريق أول خالد بن سلطان',
        role: 'مدير الأمن العام',
        rank: 'فريق أول',
        department: 'القيادة العامة',
        emoji: '<i class="fa-solid fa-crown"></i>',
        bio: 'القائد العام لجهاز الأمن العام وصاحب الرؤية التطويرية الشاملة للمنظومة الأمنية والميدانية.',
        type: 'leadership',
        joinedDate: '2022-01-01',
        achievements: 'وسام الملك عبدالعزيز من الدرجة الممتازة، نوط الإنقاذ، نوط الإتقان',
        phone: '011-401-1111',
        status: 'active',
        experience: '25 سنة في الخدمة العسكرية'
      },
      {
        id: 'mem_002',
        name: 'اللواء ركن عساف السبيعي',
        role: 'نائب مدير الأمن العام',
        rank: 'لواء',
        department: 'القيادة العامة',
        emoji: '⭐',
        bio: 'نائب مدير الأمن العام والمشرف العام على التخطيط العملياتي والتنسيق المشترك بين مختلف القطاعات.',
        type: 'leadership',
        joinedDate: '2022-06-15',
        achievements: 'نوط المعركة، نوط الإدارة العسكرية، نوط الابتكار العملياتي',
        phone: '011-401-2222',
        status: 'active',
        experience: '20 سنة في الخدمة العسكرية'
      },
      {
        id: 'mem_003',
        name: 'العميد خالد المطيري',
        role: 'مدير إدارة العمليات الميدانية',
        rank: 'عميد',
        department: 'إدارة العمليات',
        emoji: '<i class="fa-solid fa-tower-broadcast"></i>',
        bio: 'المسؤول الأول عن قيادة وتوجيه الوحدات الميدانية وسرعة استجابة الدوريات الأمنية للبلاغات الجنائية والطارئة.',
        type: 'management',
        joinedDate: '2023-02-10',
        achievements: 'نوط الخدمة العسكرية، نوط الشجاعة، نوط القيادة الميدانية',
        phone: '011-401-3333',
        status: 'active',
        experience: '18 سنة في الخدمة العسكرية'
      },
      {
        id: 'mem_004',
        name: 'العقيد فيصل الشمري',
        role: 'مدير إدارة المهام والواجبات الخاصة',
        rank: 'عقيد',
        department: 'المهام الخاصة',
        emoji: '<i class="fa-solid fa-medal"></i>',
        bio: 'يشرف على تخطيط وتنفيذ العمليات عالية الخطورة ومكافحة الشغب وحماية الشخصيات والمنشآت الهامة.',
        type: 'management',
        joinedDate: '2023-05-20',
        achievements: 'نوط الشجاعة، نوط الرماية، نوط التمرين المشترك',
        phone: '011-401-4444',
        status: 'active',
        experience: '15 سنة في الخدمة العسكرية'
      },
      {
        id: 'mem_005',
        name: 'الرائد كريم النعيمي',
        role: 'مدير إدارة التدريب والتطوير',
        rank: 'رائد',
        department: 'كلية التدريب',
        emoji: '<i class="fa-solid fa-book-bookmark"></i>',
        bio: 'رئيس كلية التدريب الأمنية والمشرف العام على إعداد المناهج والحقائب التدريبية واختبارات الأفراد.',
        type: 'management',
        joinedDate: '2024-01-05',
        achievements: 'نوط المعلم، نوط الابتكار والتطوير الأكاديمي',
        phone: '011-401-5555',
        status: 'active',
        experience: '12 سنة في الخدمة العسكرية'
      },
      {
        id: 'mem_006',
        name: 'النقيب سامي الرشيد',
        role: 'مدير إدارة مكافحة المخدرات',
        rank: 'نقيب',
        department: 'مكافحة المخدرات',
        emoji: '<i class="fa-solid fa-feather"></i>',
        bio: 'مدير شعبة مكافحة المخدرات والمسؤول عن العمليات السرية لتعقب المروجين وحماية المجتمع من السموم.',
        type: 'management',
        joinedDate: '2024-03-12',
        achievements: 'نوط الأمن، نوط التميز الأمني، شهادة تقدير من معالي وزير الداخلية',
        phone: '011-401-6666',
        status: 'active',
        experience: '10 سنوات في الخدمة العسكرية'
      },
      {
        id: 'mem_007',
        name: 'المقدم سلطان الدوسري',
        role: 'قائد مركز العمليات بالادارة العامة',
        rank: 'مقدم',
        department: 'إدارة العمليات',
        emoji: '<i class="fa-solid fa-building-shield"></i>',
        bio: 'مدير مركز العمليات بالادارة العامة للأمن العام والمشرف المباشر على توزيع واستنفار الوحدات ببلدية لوس سانتوس.',
        type: 'management',
        joinedDate: '2023-09-01',
        achievements: 'نوط الخدمة الممتازة، نوط الإدارة الميدانية',
        phone: '011-401-7777',
        status: 'active',
        experience: '14 سنة في الخدمة العسكرية'
      },
      {
        id: 'mem_008',
        name: 'الرائد نواف الزهراني',
        role: 'ضابط العمليات بالادارة العامة',
        rank: 'رائد',
        department: 'إدارة العمليات',
        emoji: '<i class="fa-solid fa-landmark"></i>',
        bio: 'ضابط العمليات بالادارة العامة للأمن العام والمشرف على تأمين الأحياء وتطبيق الأنظمة المرورية والجنائية فيها.',
        type: 'management',
        joinedDate: '2024-02-15',
        achievements: 'نوط حفظ النظام، شهادة تميز في تطبيق القانون الميداني',
        phone: '011-401-8888',
        status: 'active',
        experience: '11 سنة في الخدمة العسكرية'
      }
    ];
    Storage.set(Storage.keys.MEMBERS, members);
  }

  /* ── Centers ──────────────────────────────────────── */
  function _seedCenters() {
    const centers = [
      { 
        id: 'ctr_001', 
        name: 'الادارة العامه للامن العام', 
        location: 'طريق الهايوي', 
        commander: 'الفريق أول خالد بن سلطان', 
        staff: 127, 
        status: 'active', 
        emoji: '<i class="fa-solid fa-building-shield"></i>',
        image: '../assets/img/hq.jpg',
        description: 'الإدارة العامة للأمن العام هو المقر الرئيسي الذي تُدار من خلاله أعمال وعمليات جهاز الأمن العام، ويُعنى بالإشراف على الإدارات والوحدات المختلفة، وتنسيق الخطط الأمنية والإدارية، ومتابعة شؤون الأفراد والموارد'
      },
      {
        id: 'ctr_002',
        name: 'مركز الأمن العام – شمال لوس',
        location: 'شمال لوس',
        status: 'active',
        image: '../assets/img/center_north.jpg',
        description: 'مركز الأمن العام في شمال لوس هو الجهة الأمنية المسؤولة عن حفظ الأمن والاستقرار ضمن نطاقه الجغرافي، ويعمل على استقبال البلاغات والاستجابة للحالات الأمنية والجنائية والمرورية، ومتابعة القضايا الميدانية، وتقديم الدعم للمواطنين، بما يضمن حماية الأرواح والممتلكات وتعزيز الأمن والنظام العام.'
      },

      {
        id: 'ctr_003',
        name: 'مركز الأمن العام – ساندي',
        location: 'ساندي',
        status: 'active',
        image: '../assets/img/center_sandy.png',
        description: 'مركز الأمن العام في ساندي هو الجهة الأمنية المسؤولة عن حفظ الأمن والاستقرار في منطقة ساندي، ويعمل على استقبال البلاغات والاستجابة للحالات الأمنية والجنائية والمرورية، متابعة القضايا الميدانية، وتقديم الخدمات الأمنية للمواطنين، بما يضمن حماية الأرواح والممتلكات وتعزيز الأمن والنظام العام.'
      },
      {
        id: 'ctr_004',
        name: 'مركز الأمن العام – بوليتو',
        location: 'بوليتو',
        status: 'active',
        image: '../assets/img/center_bolito.png',
        description: 'مركز الأمن العام في بوليتو هو الجهة الأمنية المختصة بحفظ الأمن والاستقرار داخل مدينة بوليتو، ويختص باستقبال البلاغات ومتابعة الحالات الأمنية والجنائية، والاستجابة السريعة للحوادث والطوارئ، وتقديم الدعم الأمني للمواطنين، بما يسهم في تعزيز الأمن والمحافظة على النظام العام.'
      }
    ];
    Storage.set(Storage.keys.CENTERS, centers);
  }

  /* ── Settings ─────────────────────────────────────── */
  function _seedSettings() {
    Storage.set(Storage.keys.SETTINGS, {
      serverName: 'إدارة الأمن العام - مدينة الـ90',
      serverIp: 'connect cfx.re/join/abcdef',
      discordLink: 'https://discord.gg/UpAUaRcqe',
      officialSiteLink: 'https://amn-3-90.surge.sh/index.html',
      youtubeLink: 'https://youtube.com/@publicsecurity',
      heroTitleLine1: '',
      heroTitleLine2: 'إدارة الأمن العام',
      heroTitleLine3: 'مدينة الـ 90',
      heroDesc: 'موقع شامل لجميع شؤون إدارة الامن العام',
      welcomeTitle: 'الموقع الرسمي لإدارة الامن العام',
      welcomeText: 'بوابة الأمن العام الإلكترونية تقدم الخدمات الميدانية والإدارية والتدريبية لمنسوبي الأمن العام في مدينة الـ90، حيث نسعى لتقديم أعلى مستويات التنظيم والكفاءة الأمنية الميدانية.',
      totalMembers: 127,
      onlineMembers: 34,
      theme: 'dark',
    });
  }

  return { init };
})();

window.SeedData = SeedData;
