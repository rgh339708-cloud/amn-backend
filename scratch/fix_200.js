const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', '200.html');
let content = fs.readFileSync(filePath, 'utf8');

const targetRegex = /<\/ul>\s*<div class="footer-bottom">[\s\S]*?<\/footer>/;
const replacement = `</ul>
    </div>

    <!-- Links 2 -->
    <div>
      <div class="footer-col-title">التدريب والمعرفة</div>
      <ul class="footer-links-list">
        <li><a href="pages/guide.html">الدليل الشامل</a></li>
        <li><a href="pages/college.html">كلية الأمن العام</a></li>
        <li><a href="pages/uniform.html">الزي العسكري الرسمي</a></li>
      </ul>
    </div>
  </div>

  <hr class="footer-divider">

  <div class="footer-bottom">
    <span>© 2026 إدارة الأمن العام - مدينة الـ90 · جميع الحقوق محفوظة إلى أصحابها ريان بن محمد - إبراهيم بن علي - عمر المالكي</span>
  </div>
</footer>`;

if (targetRegex.test(content)) {
  content = content.replace(targetRegex, replacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully fixed 200.html footer.');
} else {
  console.error('Target pattern not found in 200.html');
}
