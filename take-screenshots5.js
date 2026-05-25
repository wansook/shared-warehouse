const { chromium } = require('playwright');
const fs = require('fs');
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwidXNlcm5hbWUiOiJ0ZXN0dXNlciIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzc5NTU2NDM2LCJleHAiOjE3Nzk2NDI4MzZ9.-QGXEGOomPMtXuHTgsmuEXrhqzCRSvE5WVGTfG8ulKU';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  // Contracts tab
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.context().addCookies([{ name: 'token', value: token, domain: 'localhost', path: '/' }]);
    await page.goto('http://localhost:52813/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    // Find and click contracts tab button
    const contractBtn = page.locator('button').filter({ hasText: '계약' }).first();
    if (await contractBtn.count() > 0) {
      await contractBtn.click();
      await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: 'C:/git/shared-warehouse/screens/05_dashboard_contracts_v2.png', fullPage: true });
    const size = fs.statSync('C:/git/shared-warehouse/screens/05_dashboard_contracts_v2.png').size;
    results.push({ name: '05_dashboard_contracts_v2.png', label: '대시보드 (계약)', size: (size/1024).toFixed(1) + 'KB', status: 'OK' });
    console.log('OK 계약: ' + (size/1024).toFixed(1) + 'KB');
    await page.close();
  } catch (e) {
    results.push({ name: '05_dashboard_contracts_v2.png', label: '대시보드 (계약)', status: 'FAIL: ' + e.message.substring(0,60), size: '0KB' });
    console.log('FAIL 계약: ' + e.message.substring(0,60));
  }

  // Hardware tab
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.context().addCookies([{ name: 'token', value: token, domain: 'localhost', path: '/' }]);
    await page.goto('http://localhost:52813/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    const hwBtn = page.locator('button').filter({ hasText: '하드웨어' }).first();
    if (await hwBtn.count() > 0) {
      await hwBtn.click();
      await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: 'C:/git/shared-warehouse/screens/06_dashboard_hardware_v2.png', fullPage: true });
    const size = fs.statSync('C:/git/shared-warehouse/screens/06_dashboard_hardware_v2.png').size;
    results.push({ name: '06_dashboard_hardware_v2.png', label: '대시보드 (하드웨어)', size: (size/1024).toFixed(1) + 'KB', status: 'OK' });
    console.log('OK 하드웨어: ' + (size/1024).toFixed(1) + 'KB');
    await page.close();
  } catch (e) {
    results.push({ name: '06_dashboard_hardware_v2.png', label: '대시보드 (하드웨어)', status: 'FAIL: ' + e.message.substring(0,60), size: '0KB' });
    console.log('FAIL 하드웨어: ' + e.message.substring(0,60));
  }

  await browser.close();
})();
