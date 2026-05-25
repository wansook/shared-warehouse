const { chromium } = require('playwright');
const fs = require('fs');
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwidXNlcm5hbWUiOiJ0ZXN0dXNlciIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzc5NTU1NTUyLCJleHAiOjE3Nzk2NDE5NTJ9.t1R1ce4_p3h4FSxG9_TLxRhrVW3qk5Zm8MiBEq7sNGU';

(async () => {
  const browser = await chromium.launch();
  const results = [];

  const pages = [
    { url: 'http://localhost:52813/login', name: '01_login_v2.png', label: '로그인 화면' },
    { url: 'http://localhost:52813/register', name: '02_register_v2.png', label: '회원가입 화면' },
    { url: 'http://localhost:52813/dashboard', name: '03_dashboard_cabinets_v2.png', label: '대시보드 (캐비넷)' },
    { url: 'http://localhost:52813/dashboard', name: '04_dashboard_contracts_v2.png', label: '대시보드 (계약)', tab: 'contracts' },
    { url: 'http://localhost:52813/dashboard', name: '05_dashboard_hardware_v2.png', label: '대시보드 (하드웨어)', tab: 'hardware' },
    { url: 'http://localhost:52813/layout-editor', name: '06_layout_editor_v2.png', label: 'LayoutEditor' },
  ];

  for (const p of pages) {
    try {
      const page = await browser.newPage();
      await page.context().addCookies([{ name: 'token', value: token, domain: 'localhost', path: '/' }]);
      await page.goto(p.url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
      if (p.tab) {
        const tabBtn = page.locator('button:has-text(' + p.tab + ')').first();
        if (await tabBtn.count() > 0) await tabBtn.click();
        await page.waitForTimeout(1000);
      }
      await page.screenshot({ path: 'C:/git/shared-warehouse/screens/' + p.name, fullPage: true });
      const size = fs.statSync('C:/git/shared-warehouse/screens/' + p.name).size;
      results.push({ name: p.name, label: p.label, status: 'OK', size: (size/1024).toFixed(0) + 'KB' });
      console.log('OK ' + p.label + ': ' + p.name + ' (' + (size/1024).toFixed(0) + 'KB)');
    } catch (e) {
      results.push({ name: p.name, label: p.label, status: 'FAIL: ' + e.message, size: '0KB' });
      console.log('FAIL ' + p.label + ': ' + e.message);
    }
  }

  await browser.close();
  console.log('\n=== 스크린샷 결과 ===');
  for (const r of results) {
    console.log(r.status + ' ' + r.label + ': ' + r.name + ' (' + r.size + ')');
  }
})();
