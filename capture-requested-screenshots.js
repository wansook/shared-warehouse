const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const jwt = require('./backend/node_modules/jsonwebtoken');

const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const outDir = path.join(__dirname, 'screenshots');
const jwtSecret = process.env.JWT_SECRET || 'change-me-jwt-secret';

const adminUser = {
  id: 1,
  username: 'screenshot_admin',
  role: 'admin',
  phone: '',
};

const adminToken = jwt.sign(adminUser, jwtSecret, { expiresIn: '24h' });

async function prepareAuth(page) {
  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem('token', token);
    window.localStorage.setItem('user', JSON.stringify(user));
  }, { token: adminToken, user: adminUser });
}

async function waitForApp(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
  await page.waitForTimeout(1200);
}

async function capture(page, name) {
  const filePath = path.join(outDir, name);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function clickTab(page, label) {
  const tab = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
  const count = await tab.count();
  if (!count) return false;
  await tab.click();
  await page.waitForTimeout(900);
  return true;
}

async function run() {
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });

  const results = [];

  async function publicPage(index, route, label) {
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await waitForApp(page);
      const filePath = await capture(page, `${index}_${label}.png`);
      results.push({ index, route, label, status: 'OK', filePath });
    } catch (error) {
      results.push({ index, route, label, status: 'FAIL', reason: error.message });
    } finally {
      await page.close();
    }
  }

  async function authPage(index, route, label, action) {
    const page = await context.newPage();
    try {
      await prepareAuth(page);
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await waitForApp(page);
      if (action) await action(page);
      const filePath = await capture(page, `${index}_${label}.png`);
      results.push({ index, route, label, status: 'OK', filePath });
    } catch (error) {
      results.push({ index, route, label, status: 'FAIL', reason: error.message });
    } finally {
      await page.close();
    }
  }

  await publicPage('01', '/login', 'login');
  await publicPage('02', '/customer-login', 'customer-login');
  await publicPage('03', '/register', 'register');
  await authPage('04', '/profile', 'profile');
  await authPage('05', '/dashboard', 'dashboard-layout', async (page) => {
    await clickTab(page, 'Layout');
  });
  await authPage('06', '/dashboard', 'dashboard-contracts', async (page) => {
    const ok = await clickTab(page, 'Contracts');
    if (!ok) throw new Error('Contracts tab button was not found.');
  });
  await authPage('07', '/dashboard', 'dashboard-payments', async (page) => {
    const ok = await clickTab(page, 'Payments|Payment|결제');
    if (!ok) throw new Error('Payment tab button was not found in the current dashboard UI.');
  });
  await authPage('08', '/dashboard', 'dashboard-hardware', async (page) => {
    const hardwareTab = await clickTab(page, 'Hardware|하드웨어');
    if (!hardwareTab) {
      const adminTab = await clickTab(page, 'Admin');
      if (!adminTab) throw new Error('Hardware/Admin tab button was not found.');
      await page.waitForSelector('text=Hardware', { timeout: 10000 });
    }
  });
  await authPage('09', '/layout-editor', 'layout-editor');
  await authPage('10', '/layout-viewer', 'layout-viewer');
  await publicPage('11', '/emergency-keypad', 'emergency-keypad');

  await browser.close();

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter((r) => r.status !== 'OK');
  process.exitCode = failed.length ? 2 : 0;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
