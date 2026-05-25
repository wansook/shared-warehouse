const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  // 1. Go to customer-login
  await page.goto('http://localhost:3004/customer-login', { waitUntil: 'networkidle' });
  
  // Fill phone and click send OTP
  await page.fill('input[placeholder*="전화번호"], input[name="phone"]', '01012345678');
  await page.click('button:has-text("인증번호"), button:has-text("전송")');
  
  // Wait a bit, then go to dashboard directly (it will redirect to login)
  // Instead, let's try admin-login
  await page.goto('http://localhost:3004/admin-login', { waitUntil: 'networkidle' });
  
  // Fill admin credentials
  const phoneInput = page.locator('input[placeholder*="전화번호"], input[name="phone"], input[name="username"], input[type="text"]').first();
  const passInput = page.locator('input[name="password"], input[type="password"]').first();
  
  if (await phoneInput.count() > 0) {
    await phoneInput.fill('01012345678');
  }
  if (await passInput.count() > 0) {
    await passInput.fill('admin1234');
  }
  
  await page.click('button:has-text("로그인"), button:has-text("전송")');
  await page.waitForTimeout(3000);
  
  // Check current URL
  const currentUrl = page.url();
  console.log('After login redirect:', currentUrl);
  
  // If still on login page, try direct dashboard with stored token
  if (currentUrl.includes('login')) {
    // Set auth in localStorage manually and go to dashboard
    await page.addInitScript(() => {
      localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3OTY3Nzg4OSwiZXhwIjoxNzc5NzY0Mjg5fQ.GKLtE9QDCZ_CnV6LWBzETbTKyXRCqW37srSrja5T4pk');
      localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }));
      localStorage.setItem('selectedWarehouseId', '2');
    });
  }
  
  await page.goto('http://localhost:3004/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  
  await page.screenshot({ path: 'screens/dashboard_with_data.png', fullPage: false });
  console.log('Dashboard screenshot saved!');
  
  await browser.close();
})();
