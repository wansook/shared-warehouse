const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  
  const urls = [
    'http://localhost:52813/login',
    'http://localhost:52813/register',
    'http://localhost:52813/dashboard',
    'http://localhost:52813/layout-editor',
  ];

  for (const url of urls) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      
      const title = await page.title();
      const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 200));
      const html = await page.content();
      const size = Buffer.byteLength(html);
      
      console.log('\n=== ' + url + ' ===');
      console.log('Title: ' + title);
      console.log('Body (200 chars): ' + bodyText);
      console.log('HTML size: ' + size);
    } catch (e) {
      console.log('ERROR ' + url + ': ' + e.message);
    }
    await page.close();
  }

  await browser.close();
})();
