const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  
  // Set auth in localStorage
  await page.addInitScript(() => {
    localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiJ9.test');
    localStorage.setItem('user', JSON.stringify({id:1,username:'admin',role:'admin'}));
    localStorage.setItem('selectedWarehouseId','2');
  });
  
  await page.goto('http://localhost:3004/dashboard', { waitUntil: 'networkidle', timeout: 15000 });
  await new Promise(r => setTimeout(r, 3000));
  
  // Check what's on the page
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Page body text preview:', bodyText.substring(0, 500));
  
  await page.screenshot({ path: 'screens/dashboard_auth_cabinets.png', fullPage: false });
  console.log('Screenshot saved!');
  
  await browser.close();
})();
