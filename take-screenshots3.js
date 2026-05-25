const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwidXNlcm5hbWUiOiJ0ZXN0dXNlciIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzc5NTU2NDM2LCJleHAiOjE3Nzk2NDI4MzZ9.-QGXEGOomPMtXuHTgsmuEXrhqzCRSvE5WVGTfG8ulKU';

// Clean old screenshots
const dir = 'C:/git/shared-warehouse/screens';
fs.readdirSync(dir).filter(f => f.includes('_v2.png')).forEach(f => fs.unlinkSync(path.join(dir, f)));

(async () => {
  console.log('=== Launching browser ===');
  const browser = await chromium.launch({ headless: true });
  const results = [];

  const pages = [
    { url: 'http://localhost:52813/login', name: '01_login_v2.png', label: '로그인 화면' },
    { url: 'http://localhost:52813/register', name: '02_register_v2.png', label: '회원가입 화면' },
  ];

  for (const p of pages) {
    try {
      console.log('Navigating to: ' + p.url + ' ...');
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.context().addCookies([{ name: 'token', value: token, domain: 'localhost', path: '/' }]);
      await page.goto(p.url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'C:/git/shared-warehouse/screens/' + p.name, fullPage: true });
      const size = fs.statSync('C:/git/shared-warehouse/screens/' + p.name).size;
      results.push({ name: p.name, label: p.label, status: 'OK', size: (size/1024).toFixed(1) + 'KB' });
      console.log('  -> OK ' + p.label + ': ' + (size/1024).toFixed(1) + 'KB');
    } catch (e) {
      results.push({ name: p.name, label: p.label, status: 'FAIL: ' + e.message.substring(0,80), size: '0KB' });
      console.log('  -> FAIL ' + p.label + ': ' + e.message.substring(0,80));
    }
  }

  await browser.close();
  console.log('\n=== Results ===');
  for (const r of results) {
    console.log(r.status + ' ' + r.label + ': ' + r.name + ' (' + r.size + ')');
  }
})();
