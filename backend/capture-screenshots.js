const { chromium } = require('playwright');
const http = require('http');

async function loginAndGetToken() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      username: 'admin',
      password: 'admin1234'
    });

    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.token);
        } catch (e) {
          reject(new Error('Failed to parse response'));
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('1. 로그인 토큰 발급...');
  let token = await loginAndGetToken();
  console.log('2. 토큰 발급 완료');

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const urls = [
    { url: 'http://localhost:3000', name: '01_login' },
    { url: 'http://localhost:3000/customer-login', name: '02_customer-login' },
    { url: 'http://localhost:3000/register', name: '03_register' },
    { url: 'http://localhost:3000/profile', name: '04_profile' },
    { url: 'http://localhost:3000/dashboard', name: '05_dashboard' },
    { url: 'http://localhost:3000/layout-editor', name: '06_layout-editor' },
    { url: 'http://localhost:3000/layout-viewer', name: '07_layout-viewer' },
    { url: 'http://localhost:3000/emergency-keypad', name: '08_emergency-keypad' }
  ];

  for (const { url, name } of urls) {
    console.log(`3. ${url} 접속 중...`);
    
    // 토큰이 필요한 페이지면 저장
    if (['profile', 'dashboard', 'layout-editor', 'layout-viewer', 'emergency-keypad'].some(p => url.includes(p))) {
      await page.addInitScript(token => {
        localStorage.setItem('token', token);
      }, token);
    }

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: `C:\\git\\shared-warehouse\\screenshots\\${name}.png`, fullPage: true });
    console.log(`✅ ${name} 스샷 저장 완료`);
  }

  await browser.close();
  console.log('4. 모든 스샷 저장 완료!');
}

main().catch(console.error);
