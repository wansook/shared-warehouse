const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');

function apiPost(path, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost', port: 3001, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({}); } });
    });
    req.on('error', () => resolve({}));
    req.write(data);
    req.end();
  });
}

(async () => {
  // Login
  const adminRes = await apiPost('/api/login', { username: 'screenshot_admin', password: '1234' });
  const userRes = await apiPost('/api/login', { username: 'screenshottest', password: 'screen1234' });
  console.log('Admin:', adminRes.message, '| User:', userRes.message);
  console.log('Admin role:', adminRes.user?.role);
  console.log('User role:', userRes.user?.role);
  console.log('Admin token:', adminRes.token ? adminRes.token.substring(0, 20) + '...' : 'null');
  
  if (!adminRes.token || !userRes.token) return;
  
  // 05_dashboard_hardware (user)
  console.log('\n=== 05_dashboard_hardware (user) ===');
  const b1 = await chromium.launch();
  const p1 = await b1.newPage();
  
  await p1.goto('http://localhost:52813/dashboard', { waitUntil: 'networkidle', timeout: 15000 });
  await p1.waitForTimeout(1000);
  console.log('Before auth:', p1.url());
  
  // Set token
  await p1.evaluate((t) => { localStorage.setItem('token', t); }, userRes.token);
  await p1.evaluate((u) => { localStorage.setItem('user', JSON.stringify(u)); }, userRes.user);
  
  await p1.reload({ waitUntil: 'networkidle' });
  await p1.waitForTimeout(3000);
  
  console.log('After auth:', p1.url());
  await p1.screenshot({ path: 'screens/05_dashboard_hardware.png', fullPage: true });
  console.log('Size:', fs.statSync('screens/05_dashboard_hardware.png').size);
  await b1.close();
  
  // 06_layout_editor (admin)
  console.log('\n=== 06_layout_editor (admin) ===');
  const b2 = await chromium.launch();
  const p2 = await b2.newPage();
  
  await p2.goto('http://localhost:52813/layout-editor', { waitUntil: 'networkidle', timeout: 15000 });
  await p2.waitForTimeout(1000);
  console.log('Before auth:', p2.url());
  
  await p2.evaluate((t) => { localStorage.setItem('token', t); }, adminRes.token);
  await p2.evaluate((u) => { localStorage.setItem('user', JSON.stringify(u)); }, adminRes.user);
  
  await p2.reload({ waitUntil: 'networkidle' });
  await p2.waitForTimeout(3000);
  
  console.log('After auth:', p2.url());
  await p2.screenshot({ path: 'screens/06_layout_editor.png', fullPage: true });
  console.log('Size:', fs.statSync('screens/06_layout_editor.png').size);
  await b2.close();
  
  console.log('\n=== Done ===');
})();
