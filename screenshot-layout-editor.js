const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  
  await page.addInitScript(() => {
    localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiJ9.test');
    localStorage.setItem('user', JSON.stringify({id:1,username:'admin',role:'admin'}));
    localStorage.setItem('selectedWarehouseId','2');
  });
  
  await page.goto('http://localhost:3004/dashboard', { waitUntil: 'networkidle', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  
  // Click admin button or layout tab
  const editButton = page.locator('button:has-text("Edit layout"), button:has-text("레이아웃 편집")');
  if (await editButton.count() > 0) {
    await editButton.first().click();
    await new Promise(r => setTimeout(r, 2000));
  }
  
  await page.screenshot({ path: 'screens/layout_editor_cabinets.png', fullPage: false });
  console.log('Saved!');
  
  await browser.close();
})();
