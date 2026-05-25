const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  // 1. Login first
  console.log('Logging in...');
  await page.goto('http://localhost:3003/', { waitUntil: 'networkidle' });
  await page.click('button:has-text("로그인")');
  await page.fill('input[placeholder*="전화번호"], input[name="phone"]', '01012345678');
  await page.click('button:has-text("인증번호"), button:has-text("전송")');
  
  // 2. Go to dashboard directly (bypass auth for now)
  await page.goto('http://localhost:3003/dashboard', { waitUntil: 'networkidle' });
  
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:\\git\\shared-warehouse\\screens\\dashboard_new_design.png', fullPage: false });
  console.log('Screenshot saved: screens/dashboard_new_design.png');

  await browser.close();
})();
