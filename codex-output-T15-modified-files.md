# T15 Modified Files

## backend/.env.example

````dotenv
# Server
NODE_ENV=development
PORT=3001
DB_PATH=./warehouse.db
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Secrets - replace with strong unique values before production.
# The server refuses to start in NODE_ENV=production when JWT_SECRET or OTP_SECRET
# is missing or left as the default value below.
JWT_SECRET=change-me-jwt-secret
OTP_SECRET=change-me-otp-secret
HARDWARE_API_SECRET=change-me-hardware-secret

# Hardware
SERIAL_PORT=
BAUD_RATE=9600
RELAY_DELAY=3000
DOOR_TIMEOUT=60000
FIRE_ALARM_PIN=0

# Naver reservation email sync
EMAIL_IMAP_HOST=imap.naver.com
EMAIL_IMAP_PORT=993
EMAIL_USER=your_email@naver.com
EMAIL_PASSWORD=your_app_password

# Naver partner crawler
NAVER_PARTNER_URL=https://partner.smtopia.com/reservation
NAVER_PARTNER_ID=your_partner_id
NAVER_PARTNER_PW=your_partner_password
NAVER_CRAWLER_MAX_ATTEMPTS=3
NAVER_CRAWLER_RETRY_DELAY_MS=30000

# Watchdog
WATCHDOG_RESTART_DELAY_MS=5000
WATCHDOG_MAX_RESTART_DELAY_MS=60000
WATCHDOG_CRASH_WINDOW_MS=120000
WATCHDOG_HEALTH_INTERVAL_MS=15000
WATCHDOG_HEALTH_TIMEOUT_MS=5000
WATCHDOG_LAUNCH_KIOSK=true

# Kakao/SMS notifications
KAKAO_TALK_API_KEY=your_kakao_api_key
KAKAO_TALK_TEMPLATE_ID=your_template_id
KAKAO_ADMIN_PHONE=010XXXXXXXX

````

## backend/db.js

````js
module.exports = require('./src/db');

````

## backend/src/db/index.js

````js
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'warehouse.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('DB connection error:', err.message);
  else console.log(`SQLite connected: ${dbPath}`);
});

module.exports = db;

````

## backend/naver-sync.js

````js
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const db = require('./db');

const IMAP_CONFIG = {
  host: process.env.EMAIL_IMAP_HOST || 'imap.naver.com',
  port: parseInt(process.env.EMAIL_IMAP_PORT, 10) || 993,
  secure: true,
  user: process.env.EMAIL_USER || '',
  password: process.env.EMAIL_PASSWORD || '',
};

const CRAWLER_CONFIG = {
  partnerUrl: process.env.NAVER_PARTNER_URL || 'https://partner.smtopia.com/reservation',
  partnerId: process.env.NAVER_PARTNER_ID || '',
  partnerPw: process.env.NAVER_PARTNER_PW || '',
  maxAttempts: parseInt(process.env.NAVER_CRAWLER_MAX_ATTEMPTS, 10) || 3,
  retryDelayMs: parseInt(process.env.NAVER_CRAWLER_RETRY_DELAY_MS, 10) || 30000,
};

let imap = null;

function ensureNaverSyncTables() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS naver_reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reservation_id TEXT UNIQUE,
      customer_name TEXT,
      phone TEXT,
      service_name TEXT,
      start_date DATETIME,
      end_date DATETIME,
      status TEXT DEFAULT 'synced',
      synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS naver_email_sync (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_key TEXT UNIQUE NOT NULL,
      message_id TEXT,
      uid TEXT,
      subject TEXT,
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS naver_crawler_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      success INTEGER DEFAULT 0,
      attempt INTEGER,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  });
}

function getFirstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) return match[1].trim();
  }
  return '';
}

function normalizePhone(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function normalizeDate(value) {
  return String(value || '').replace(/\./g, '-').replace(/\//g, '-').trim();
}

function buildSyncKey(parsed, uid) {
  if (parsed?.messageId) return `message-id:${parsed.messageId}`;
  if (uid) return `uid:${uid}`;
  return null;
}

function parseNaverReservationEmail(rawEmail) {
  return {
    customer_name: rawEmail.customer_name || '',
    phone: normalizePhone(rawEmail.phone),
    service_name: rawEmail.service_name || '',
    start_date: normalizeDate(rawEmail.start_date),
    end_date: normalizeDate(rawEmail.end_date || rawEmail.start_date),
    reservation_id: rawEmail.reservation_id || `naver_${Date.now()}`,
  };
}

function parseNaverReservationEmailFromParsed(parsed, uid) {
  const subject = parsed?.subject || '';
  if (!subject.includes('?덉빟') && !subject.toLowerCase().includes('naver') && !subject.includes('?ㅼ씠踰?)) {
    return null;
  }

  const body = [parsed?.text, parsed?.html].filter(Boolean).join('\n');
  const customerName = getFirstMatch(body, [
    /?덉빟??s*[:竊?\s*(.+?)(?:\r?\n|$)/i,
    /?대쫫\s*[:竊?\s*(.+?)(?:\r?\n|$)/i,
    /name\s*[:竊?\s*(.+?)(?:\r?\n|$)/i,
  ]);
  const phone = getFirstMatch(body, [
    /?곕씫泥?s*[:竊?\s*([0-9\-\s]+)/i,
    /?대???s*[:竊?\s*([0-9\-\s]+)/i,
    /phone\s*[:竊?\s*([0-9\-\s]+)/i,
  ]);
  const serviceName = getFirstMatch(body, [
    /?곹뭹\s*[:竊?\s*(.+?)(?:\r?\n|$)/i,
    /?쒕퉬??s*[:竊?\s*(.+?)(?:\r?\n|$)/i,
    /service\s*[:竊?\s*(.+?)(?:\r?\n|$)/i,
  ]);
  const startDate = getFirstMatch(body, [
    /?댁슜??s*[:竊?\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/i,
    /?덉빟??s*[:竊?\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/i,
    /date\s*[:竊?\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/i,
  ]);

  return parseNaverReservationEmail({
    reservation_id: parsed?.messageId || (uid ? `naver_uid_${uid}` : `naver_${Date.now()}`),
    customer_name: customerName,
    phone,
    service_name: serviceName,
    start_date: startDate,
    end_date: startDate,
  });
}

function hasProcessedSyncKey(syncKey) {
  return new Promise((resolve, reject) => {
    if (!syncKey) {
      resolve(false);
      return;
    }
    db.get(`SELECT id FROM naver_email_sync WHERE sync_key = ?`, [syncKey], (err, row) => {
      if (err) reject(err);
      else resolve(Boolean(row));
    });
  });
}

function markProcessedEmail({ syncKey, messageId, uid, subject }) {
  return new Promise((resolve, reject) => {
    if (!syncKey) {
      resolve();
      return;
    }
    db.run(
      `INSERT OR IGNORE INTO naver_email_sync (sync_key, message_id, uid, subject) VALUES (?, ?, ?, ?)`,
      [syncKey, messageId || null, uid ? String(uid) : null, subject || ''],
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

function saveReservation(reservation) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR IGNORE INTO naver_reservations
       (reservation_id, customer_name, phone, service_name, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        reservation.reservation_id,
        reservation.customer_name,
        reservation.phone,
        reservation.service_name,
        reservation.start_date,
        reservation.end_date,
      ],
      function onInsert(err) {
        if (err) {
          reject(err);
          return;
        }
        if (this.changes > 0) {
          console.log(`[naver-sync] reservation saved: ${reservation.reservation_id}`);
        }
        resolve(this.changes);
      },
    );
  });
}

async function processEmailMessage(msg) {
  let uid = null;
  msg.once('attributes', (attrs) => {
    uid = attrs.uid;
  });

  return new Promise((resolve) => {
    msg.on('body', async (stream) => {
      try {
        const parsed = await simpleParser(stream);
        const syncKey = buildSyncKey(parsed, uid);
        if (await hasProcessedSyncKey(syncKey)) {
          resolve(0);
          return;
        }

        const reservation = parseNaverReservationEmailFromParsed(parsed, uid);
        if (!reservation || !reservation.customer_name || !reservation.phone) {
          await markProcessedEmail({ syncKey, messageId: parsed?.messageId, uid, subject: parsed?.subject || '' });
          resolve(0);
          return;
        }

        const changes = await saveReservation(reservation);
        await markProcessedEmail({ syncKey, messageId: parsed?.messageId, uid, subject: parsed?.subject || '' });
        resolve(changes);
      } catch (err) {
        console.error('[naver-sync] parse error:', err.message);
        resolve(0);
      }
    });
  });
}

async function fetchEmails() {
  ensureNaverSyncTables();

  return new Promise((resolve, reject) => {
    if (!IMAP_CONFIG.user || !IMAP_CONFIG.password) {
      console.log('[naver-sync] EMAIL_USER or EMAIL_PASSWORD is not configured; skipping email sync');
      resolve(0);
      return;
    }

    imap = new Imap(IMAP_CONFIG);
    let settled = false;

    const finish = (err, count = 0) => {
      if (settled) return;
      settled = true;
      if (imap) imap.end();
      if (err) reject(err);
      else resolve(count);
    };

    imap.once('error', (err) => {
      console.error('[naver-sync] IMAP connection error:', err.message);
      finish(err);
    });

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err) => {
        if (err) {
          finish(err);
          return;
        }

        imap.search([['UNSEEN']], (searchErr, results) => {
          if (searchErr) {
            finish(searchErr);
            return;
          }
          if (!results || results.length === 0) {
            finish(null, 0);
            return;
          }

          const tasks = [];
          const fetch = imap.fetch(results, { bodies: '', markSeen: false });

          fetch.on('message', (msg) => {
            tasks.push(processEmailMessage(msg));
          });

          fetch.once('error', (fetchErr) => {
            console.error('[naver-sync] fetch error:', fetchErr.message);
            finish(fetchErr);
          });

          fetch.once('end', async () => {
            try {
              const changes = await Promise.all(tasks);
              finish(null, changes.reduce((sum, value) => sum + value, 0));
            } catch (err) {
              finish(err);
            }
          });
        });
      });
    });

    imap.connect();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function auditCrawler(eventType, success, attempt, note = '') {
  ensureNaverSyncTables();
  db.run(
    `INSERT INTO naver_crawler_audit (event_type, success, attempt, note) VALUES (?, ?, ?, ?)`,
    [eventType, success ? 1 : 0, attempt || null, note],
  );
  console.log(`[naver-crawler] ${eventType} attempt=${attempt || '-'} success=${success ? 'yes' : 'no'} ${note}`);
}

async function crawlNaverPartnerOnce() {
  const puppeteer = require('puppeteer');
  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(CRAWLER_CONFIG.partnerUrl, { waitUntil: 'networkidle2' });
    await page.type('#id', CRAWLER_CONFIG.partnerId);
    await page.type('#pw', CRAWLER_CONFIG.partnerPw);
    await page.click('#loginBtn');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

    const loginFailed = await page.evaluate(() => {
      const text = document.body?.innerText || '';
      return text.includes('濡쒓렇???ㅽ뙣') || text.includes('鍮꾨?踰덊샇') || text.includes('?좉툑');
    });
    if (loginFailed) throw new Error('partner login failed or account lock warning detected');

    const reservations = await page.evaluate(() => {
      const rows = document.querySelectorAll('.reservation-row');
      return Array.from(rows).map((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 5) return null;
        return {
          reservation_id: cells[0].textContent.trim(),
          customer_name: cells[1].textContent.trim(),
          phone: cells[2].textContent.trim(),
          service_name: cells[3].textContent.trim(),
          start_date: cells[4].textContent.trim(),
          end_date: cells[4].textContent.trim(),
        };
      }).filter(Boolean);
    });

    let count = 0;
    for (const reservation of reservations) {
      count += await saveReservation(parseNaverReservationEmail(reservation));
    }
    return count;
  } finally {
    if (browser) await browser.close();
  }
}

async function crawlNaverPartner() {
  if (!CRAWLER_CONFIG.partnerId || !CRAWLER_CONFIG.partnerPw) {
    console.log('[naver-crawler] NAVER_PARTNER_ID or NAVER_PARTNER_PW is not configured; skipping crawler sync');
    auditCrawler('skip_missing_credentials', true, 0);
    return 0;
  }

  for (let attempt = 1; attempt <= CRAWLER_CONFIG.maxAttempts; attempt += 1) {
    try {
      auditCrawler('attempt_start', true, attempt);
      const count = await crawlNaverPartnerOnce();
      auditCrawler('attempt_success', true, attempt, `synced=${count}`);
      return count;
    } catch (err) {
      auditCrawler('attempt_failure', false, attempt, err.message);
      if (attempt === CRAWLER_CONFIG.maxAttempts) {
        console.error('[naver-crawler] max attempts reached; stop to avoid account lock');
        return 0;
      }
      await sleep(CRAWLER_CONFIG.retryDelayMs);
    }
  }

  return 0;
}

function startSyncScheduler(intervalMs = 600000) {
  console.log(`[naver-sync] scheduler started: email=${intervalMs}ms crawler=3600000ms`);

  const emailTimer = setInterval(async () => {
    try {
      const count = await fetchEmails();
      console.log(`[naver-sync] email processed: ${count}`);
    } catch (err) {
      console.error('[naver-sync] email error:', err.message);
    }
  }, intervalMs);

  const crawlerTimer = setInterval(async () => {
    try {
      const count = await crawlNaverPartner();
      console.log(`[naver-crawler] synced: ${count}`);
    } catch (err) {
      console.error('[naver-crawler] error:', err.message);
    }
  }, 3600000);

  return [emailTimer, crawlerTimer];
}

module.exports = {
  fetchEmails,
  crawlNaverPartner,
  saveReservation,
  startSyncScheduler,
  parseNaverReservationEmail,
  parseNaverReservationEmailFromParsed,
  ensureNaverSyncTables,
  IMAP_CONFIG,
  CRAWLER_CONFIG,
};

````

## backend/server.js

````js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./db');
const naverSync = require('./naver-sync');
const hardware = require('./hardware');

const app = express();
const PORT = process.env.PORT || 3001;
const backgroundJobTimers = [];

const DEFAULT_JWT_SECRET = 'change-me-jwt-secret';
const DEFAULT_OTP_SECRET = 'change-me-otp-secret';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
const OTP_SECRET = process.env.OTP_SECRET || DEFAULT_OTP_SECRET;
const HARDWARE_API_SECRET = process.env.HARDWARE_API_SECRET || '';
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  const invalidSecrets = [];
  if (!process.env.JWT_SECRET || JWT_SECRET === DEFAULT_JWT_SECRET) invalidSecrets.push('JWT_SECRET');
  if (!process.env.OTP_SECRET || OTP_SECRET === DEFAULT_OTP_SECRET) invalidSecrets.push('OTP_SECRET');

  if (invalidSecrets.length > 0) {
    throw new Error(`Production requires non-default secrets: ${invalidSecrets.join(', ')}`);
  }
}
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || CORS_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('CORS origin not allowed'));
  },
  credentials: true,
}));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ============= 테이블 생성 =============
db.serialize(() => {
  // users
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    phone TEXT,
    pin_code TEXT,
    role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // warehouses
  db.run(`CREATE TABLE IF NOT EXISTS warehouses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT,
    capacity INTEGER DEFAULT 0,
    owner_id INTEGER,
    layout_data TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  )`);

  // cabinets (캐비넷)
  db.run(`CREATE TABLE IF NOT EXISTS cabinets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id INTEGER NOT NULL,
    size TEXT CHECK(size IN ('S', 'M', 'L')),
    relay_channel INTEGER,
    status TEXT DEFAULT 'available' CHECK(status IN ('available', 'occupied', 'maintenance', 'expired_soon')),
    current_contract_id INTEGER,
    position_x INTEGER DEFAULT 0,
    position_y INTEGER DEFAULT 0,
    position_index INTEGER DEFAULT 0,
    layout_data TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
    FOREIGN KEY (current_contract_id) REFERENCES contracts(id)
  )`);

  // contracts (계약)
  db.run(`CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    cabinet_id INTEGER NOT NULL,
    start_date DATETIME NOT NULL,
    end_date DATETIME NOT NULL,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'expired', 'cancelled', 'pending')),
    total_amount INTEGER DEFAULT 0,
    billing_key TEXT,
    auto_renew INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (cabinet_id) REFERENCES cabinets(id)
  )`);

  // payments (결제)
  db.run(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    pg_approval_number TEXT,
    payment_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'completed' CHECK(status IN ('completed', 'refunded', 'failed')),
    receipt_password TEXT,
    billing_key TEXT,
    FOREIGN KEY (contract_id) REFERENCES contracts(id)
  )`);

  // access_logs (출입 기록)
  db.run(`CREATE TABLE IF NOT EXISTS access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    warehouse_id INTEGER NOT NULL,
    auth_method TEXT CHECK(auth_method IN ('pin', 'otp', 'qr', 'admin')),
    success INTEGER DEFAULT 1,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
  )`);

  // 네이버 예약 동기화 테이블
  db.run(`CREATE TABLE IF NOT EXISTS naver_reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reservation_id TEXT UNIQUE,
    customer_name TEXT,
    phone TEXT,
    service_name TEXT,
    start_date DATETIME,
    end_date DATETIME,
    status TEXT DEFAULT 'synced',
    synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // hardware_status (하드웨어 상태)
  db.run(`CREATE TABLE IF NOT EXISTS hardware_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id INTEGER NOT NULL,
    door_status TEXT DEFAULT 'closed' CHECK(door_status IN ('open', 'closed', 'error')),
    fire_alarm INTEGER DEFAULT 0,
    last_check DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
  )`);

  // hardware_events (하드웨어 이벤트 감사 로그)
  db.run(`CREATE TABLE IF NOT EXISTS hardware_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    warehouse_id INTEGER,
    event_type TEXT NOT NULL,
    success INTEGER DEFAULT 1,
    source_ip TEXT,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
  )`);

  // items (기존 재고)
  db.run(`CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    quantity INTEGER DEFAULT 0,
    unit TEXT DEFAULT '개',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
  )`);

  // inventory_logs
  db.run(`CREATE TABLE IF NOT EXISTS inventory_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    warehouse_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('in', 'out')),
    quantity INTEGER NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  db.run(`ALTER TABLE contracts ADD COLUMN auto_renew INTEGER DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('contracts.auto_renew 마이그레이션 오류:', err.message);
    }
  });

  console.log('모든 테이블 준비 완료');
});

// ============= 미들웨어 =============
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: '인증 토큰이 필요합니다.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: '유효하지 않은 토큰입니다.' });
    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: '관리자 권한이 필요합니다.' });
  }
  next();
};

const isSelfOrAdmin = (req, userId) => req.user.id === parseInt(userId, 10) || req.user.role === 'admin';

const accessAttempts = new Map();
const accessFailures = new Map();
const ACCESS_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const ACCESS_RATE_LIMIT_MAX = 10;
const ACCESS_FAILURE_LIMIT = 5;
const ACCESS_LOCKOUT_MS = 10 * 60 * 1000;

const getRequestSource = (req) => ({
  ip: req.ip || req.socket?.remoteAddress || 'unknown',
  device: req.headers['x-device-key'] || req.headers['x-device-id'] || 'unknown',
  userAgent: req.headers['user-agent'] || 'unknown',
});

const buildAccessKeys = (req) => {
  const source = getRequestSource(req);
  const { auth_method, auth_value } = req.body || {};
  const userKey = auth_method && auth_value ? `${auth_method}:${String(auth_value)}` : 'anonymous';
  return [
    `ip:${source.ip}`,
    `device:${source.device}`,
    `user:${userKey}`,
  ];
};

const rateLimitAccessAuth = (req, res, next) => {
  const key = buildAccessKeys(req).join('|');
  const now = Date.now();
  const bucket = accessAttempts.get(key) || { count: 0, resetAt: now + ACCESS_RATE_LIMIT_WINDOW_MS };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + ACCESS_RATE_LIMIT_WINDOW_MS;
  }

  bucket.count += 1;
  accessAttempts.set(key, bucket);

  if (bucket.count > ACCESS_RATE_LIMIT_MAX) {
    return res.status(429).json({ message: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' });
  }

  next();
};

const checkAccessLockout = (req, res, next) => {
  const now = Date.now();
  const lockedKey = buildAccessKeys(req).find((key) => {
    const failure = accessFailures.get(key);
    if (!failure) return false;
    if (failure.lockedUntil && failure.lockedUntil > now) return true;
    if (failure.lockedUntil && failure.lockedUntil <= now) accessFailures.delete(key);
    return false;
  });

  if (lockedKey) {
    return res.status(423).json({ message: '인증 실패 횟수 초과로 잠시 잠금 처리되었습니다. 10분 후 다시 시도하세요.' });
  }

  next();
};

const recordAccessFailure = (req) => {
  const now = Date.now();
  buildAccessKeys(req).forEach((key) => {
    const failure = accessFailures.get(key) || { count: 0, lockedUntil: null };
    failure.count += 1;
    if (failure.count >= ACCESS_FAILURE_LIMIT) {
      failure.lockedUntil = now + ACCESS_LOCKOUT_MS;
    }
    accessFailures.set(key, failure);
  });
};

const clearAccessFailures = (req) => {
  buildAccessKeys(req).forEach((key) => accessFailures.delete(key));
};

const requireHardwareSecretOrLocalhost = (req, res, next) => {
  const remoteAddress = req.ip || req.socket?.remoteAddress || '';
  const isLocalhost = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress);
  const providedSecret = req.headers['x-hardware-secret'] || req.body?.secret;

  if (isLocalhost || (HARDWARE_API_SECRET && providedSecret === HARDWARE_API_SECRET)) {
    return next();
  }

  return res.status(403).json({ message: '하드웨어 API 접근 권한이 없습니다.' });
};

const requireHardwareSecret = (req, res, next) => {
  const providedSecret = req.headers['x-hardware-secret'] || req.body?.secret;
  if (HARDWARE_API_SECRET && providedSecret === HARDWARE_API_SECRET) return next();
  return res.status(403).json({ message: '하드웨어 API 접근 권한이 없습니다.' });
};

const logHardwareEvent = (req, { warehouseId, eventType, success = true, note = '' }) => {
  const source = getRequestSource(req);
  db.run(
    `INSERT INTO hardware_events (user_id, warehouse_id, event_type, success, source_ip, note) VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user?.id || null, warehouseId || null, eventType, success ? 1 : 0, source.ip, note],
  );

  if (warehouseId) {
    db.run(
      `INSERT INTO access_logs (user_id, warehouse_id, auth_method, success, note) VALUES (?, ?, ?, ?, ?)`,
      [req.user?.id || null, warehouseId, 'admin', success ? 1 : 0, `hardware:${eventType} ${note}`.trim()],
    );
  }
};

// ============= Time-based OTP =============
// OTP는 오프라인에서도 동작 가능하도록 phone 기반 hash 사용
const generateOTP = (phone, timeWindow) => {
  const hash = crypto.createHash('sha256').update(`${phone}${OTP_SECRET}${timeWindow}`).digest('hex');
  return parseInt(hash.substring(0, 8), 16) % 1000000;
};

const validateOTP = (phone, otp) => {
  const now = Math.floor(Date.now() / 60000);
  for (let i = 0; i < 3; i++) {
    if (generateOTP(phone, now - i) === otp) return true;
  }
  return false;
};

// ============= PIN 동기화 (미니 PC) =============
function syncPinToMiniPC(userId) {
  console.log(`[PIN 동기화] 사용자 ${userId} PIN 변경됨 - 평문 파일 저장은 비활성화됨`);
}

async function hashPin(pin) {
  if (!pin) return null;
  return bcrypt.hash(String(pin), 10);
}

async function verifyPin(pin, pinHash) {
  if (!pin || !pinHash) return false;
  if (pinHash.startsWith('$2')) return bcrypt.compare(String(pin), pinHash);

  // 기존 평문 PIN 데이터의 점진 마이그레이션을 위한 호환 처리.
  return String(pin) === String(pinHash);
}

// ============= FCM 푸시 알림 =============
async function sendFCMPush(tokens, title, body, data) {
  // TODO: 실제 FCM API 연동
  console.log(`[FCM 푸시] 토큰 ${tokens.length}개 → ${title}: ${body}`);
  return { success: true, tokens };
}

async function sendKakaoAlert(phone, templateId, variables) {
  // TODO: 카카오 알림톡 API 연동
  console.log(`[알림톡] ${phone} → ${templateId}:`, variables);
  return { success: true };
}

async function sendSMS(phone, message) {
  // TODO: SMS API 연동
  console.log(`[SMS] ${phone} → ${message}`);
  return { success: true };
}

// 푸시 알림 발송 (FCM → 카카오 → SMS 폴백)
async function notifyUser(userId, title, body) {
  return new Promise(async (resolve) => {
    db.get(`SELECT phone FROM users WHERE id = ?`, [userId], (err, user) => {
      if (err || !user) { resolve({ success: false, error: 'user not found' }); return; }

      // 1단계: FCM 푸시 (가장 우선)
      sendFCMPush([`user_${userId}_token`], title, body, { user_id: userId })
        .then(result => {
          if (result.success) {
            console.log(`[알림 발송 완료] FCM → 사용자 ${userId}`);
            resolve(result);
          } else {
            // 2단계: 카카오 알림톡
            sendKakaoAlert(user.phone, 'alert_template', { title, body })
              .then(result2 => {
                if (result2.success) {
                  console.log(`[알림 발송 완료] 카카오 → ${user.phone}`);
                  resolve(result2);
                } else {
                  // 3단계: SMS
                  sendSMS(user.phone, `[${title}] ${body}`).then(r => resolve(r));
                }
              });
          }
        });
    });
  });
}

// ============= 자동 연장 결제 (빌링) 스케줄러 =============
let billingScheduled = {};

async function scheduleAutoBilling(contractId, billingKey) {
  billingScheduled[contractId] = billingKey;
  // TODO: PG사 API 연동 (예: 토스페이먼츠, 카카오페이)
  console.log(`[빌링 예약] 계약 ${contractId} - billing_key: ${billingKey}`);
}

async function executeAutoBilling(contractId) {
  const billingKey = billingScheduled[contractId];
  if (!billingKey) {
    console.log(`[빌링 실패] 계약 ${contractId}에 예약된 billing_key 없음`);
    return { success: false, error: 'no billing key' };
  }

  // TODO: PG사 API 호출 (자동 결제)
  // 예: POST https://api.tosspayments.com/v1/payments/confirm
  //     { billingKey, amount, orderId, orderName }
  console.log(`[빌링 실행] 계약 ${contractId} - billing_key: ${billingKey}`);

  return { success: true, contractId };
}

// ============= 자동 연장 결제 (auto_renew 기반 스케줄러) =============
async function checkAndAutoRenew() {
  return new Promise((resolve) => {
    db.all(`SELECT c.id, c.user_id, c.billing_key, c.end_date, c.auto_renew, u.phone, u.username
             FROM contracts c
             JOIN users u ON c.user_id = u.id
             WHERE c.status = 'active'
             AND c.auto_renew = 1
             AND c.billing_key IS NOT NULL
             AND c.end_date <= datetime('now', '+1 day')`, [], (err, contracts) => {
      if (err) { resolve({ error: err.message }); return; }
      if (!contracts || contracts.length === 0) { resolve({ count: 0 }); return; }

      let completed = 0;
      contracts.forEach(async c => {
        console.log(`[자동 연장] ${c.username} (${c.phone}) - 계약 ${c.id} (${c.end_date})`);

        // 1단계: PG사 자동 결제
        try {
          const result = await executeAutoBilling(c.id);
          if (result.success) {
            // 계약 연장
            db.run(`UPDATE contracts SET status = 'active', end_date = datetime('now', '+30 days') WHERE id = ?`, [c.id], (err) => {
              if (!err) {
                console.log(`[자동 연장 성공] 계약 ${c.id} 연장 완료`);
                // 2단계: 알림 발송 (FCM → 카카오 → SMS)
                notifyUser(c.user_id, '계약 연장 완료', `${c.username}님, 계약이 자동으로 연장되었습니다.`)
                  .then(() => console.log(`[자동 연장 알림] 발송 완료`));
              }
            });
            delete billingScheduled[c.id];
          } else {
            // 결제 실패 → 관리자 알림
            notifyUser(c.user_id, '계약 연장 실패', `${c.username}님, 자동 결제에 실패했습니다. 재시도 합니다.`);
            console.error(`[자동 연장 실패] 계약 ${c.id} 결제 실패`);
          }
        } catch (err) {
          console.error(`[자동 연장 오류] 계약 ${c.id}:`, err.message);
        }
        completed++;
        if (completed === contracts.length) resolve({ count: completed });
      });
    });
  });
}

function startBackgroundJobs() {
  if (backgroundJobTimers.length > 0) return backgroundJobTimers;

  // 매일 자정에 실행
  backgroundJobTimers.push(setInterval(() => {
  console.log('[자동 연장 스케줄러] 실행 중...');
  checkAndAutoRenew().then(r => {
    console.log(`[자동 연장 스케줄러] ${r.count || 0}건 처리 완료`);
  });
  }, 86400000)); // 24시간

  backgroundJobTimers.push(setInterval(runContractExpiryJob, 3600000));
  backgroundJobTimers.push(setInterval(runExpiryAlertJob, 86400000));

  return backgroundJobTimers;
}

// ============= 회원 API =============
app.post('/api/register', async (req, res) => {
  const { username, email, password, phone } = req.body;
  console.log('[REGISTER] req.body:', JSON.stringify(req.body));
  if (!username || !email || !password) return res.status(400).json({ message: '필수 필드 입력' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const hashedPin = await hashPin(req.body.pin_code);
    console.log('[REGISTER] hash OK');
    // 첫 번째 유저는 자동 admin 승급
    db.get(`SELECT COUNT(*) AS cnt FROM users`, [], (err, row) => {
      const isFirst = (!err && row && row.cnt === 0);
      const role = isFirst ? 'admin' : 'user';
      if (isFirst) console.log('[REGISTER] first user -> admin');

      db.run(`INSERT INTO users (username, email, password, phone, role, pin_code) VALUES (?, ?, ?, ?, ?, ?)`,
        [username, email, hashedPassword, phone || '', role, hashedPin], function (err) {
          if (err) {
            console.error('[REGISTER] DB error:', err.message);
            if (err.message.includes('UNIQUE')) return res.status(409).json({ message: '중복된 아이디/이메일' });
            return res.status(500).json({ message: '서버 오류: ' + err.message });
          }
          console.log('[REGISTER] OK userId:', this.lastID, 'role:', role);
          res.status(201).json({ message: '회원가입 완료', userId: this.lastID, role: role });
        });
    });
  } catch (error) {
    console.error('[REGISTER] catch:', error.message);
    res.status(500).json({ message: '서버 오류: ' + error.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: '필수 필드 입력' });

  db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (!user) return res.status(401).json({ message: '아이디 없음' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: '비밀번호 불일치' });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ message: '로그인 성공', token, user: { id: user.id, username: user.username, role: user.role, phone: user.phone } });
  });
});

// ============= 관리자 API: 사용자 목록 =============
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  db.all(`SELECT id, username, email, phone, role, created_at FROM users ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    res.json(rows);
  });
});

// ============= 관리자 API: PIN 수정/초기화 =============
app.put('/api/admin/users/:userId/pin', authenticateToken, requireAdmin, async (req, res) => {
  const { new_pin, reset } = req.body;

  if (reset === true) {
    // PIN 초기화 (4자리 랜덤 숫자)
    const randomPin = Math.floor(1000 + Math.random() * 9000).toString();
    console.log(`[CS] PIN 초기화: 사용자 ${req.params.userId}`);

    const hashedPin = await hashPin(randomPin);
    db.run(`UPDATE users SET pin_code = ? WHERE id = ?`, [hashedPin, req.params.userId], function (err) {
      if (err) return res.status(500).json({ message: '서버 오류: ' + err.message });
      if (this.changes === 0) return res.status(404).json({ message: '사용자를 찾을 수 없음' });

      syncPinToMiniPC(req.params.userId);
      res.json({ message: 'PIN 초기화 완료' });
    });
  } else {
    // PIN 직접 설정 (정확히 4자리)
    if (!new_pin || new_pin.length !== 4) {
      return res.status(400).json({ message: 'PIN은 정확히 4자리여야 합니다.' });
    }
    if (!/^[0-9]+$/.test(new_pin)) {
      return res.status(400).json({ message: 'PIN은 숫자만 입력 가능합니다.' });
    }

    console.log(`[CS] PIN 변경: 사용자 ${req.params.userId}`);

    const hashedPin = await hashPin(new_pin);
    db.run(`UPDATE users SET pin_code = ? WHERE id = ?`, [hashedPin, req.params.userId], function (err) {
      if (err) return res.status(500).json({ message: '서버 오류: ' + err.message });
      if (this.changes === 0) return res.status(404).json({ message: '사용자를 찾을 수 없음' });

      syncPinToMiniPC(req.params.userId);
      res.json({ message: 'PIN 업데이트 완료' });
    });
  }
});

// ============= 레이아웃 빌더 API =============
// 창고 레이아웃 조회
app.get('/api/warehouses/:id/layout', authenticateToken, (req, res) => {
  db.get(`SELECT layout_data FROM warehouses WHERE id = ?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (!row) return res.status(404).json({ message: '창고를 찾을 수 없음' });
    try {
      res.json(JSON.parse(row.layout_data || '[]'));
    } catch {
      res.json([]);
    }
  });
});

// 창고 레이아웃 저장
app.put('/api/warehouses/:id/layout', authenticateToken, requireAdmin, (req, res) => {
  const { layout_data } = req.body;
  if (!Array.isArray(layout_data)) return res.status(400).json({ message: '레이아웃 데이터는 배열이어야 합니다.' });

  const data = JSON.stringify(layout_data);

  db.run(`UPDATE warehouses SET layout_data = ? WHERE id = ?`, [data, req.params.id], function (err) {
    if (err) return res.status(500).json({ message: '서버 오류: ' + err.message });
    if (this.changes === 0) return res.status(404).json({ message: '찾을 수 없음' });
    res.json({ message: '레이아웃 저장 완료' });
  });
});

// 캐비넷 위치 저장 (드래그 앤 드롭)
app.put('/api/cabinets/:id/layout', authenticateToken, requireAdmin, (req, res) => {
  const { position_x, position_y, position_index, size, layout_data } = req.body;

  const updates = [];
  const params = [];

  if (position_x !== undefined) { updates.push('position_x = ?'); params.push(position_x); }
  if (position_y !== undefined) { updates.push('position_y = ?'); params.push(position_y); }
  if (position_index !== undefined) { updates.push('position_index = ?'); params.push(position_index); }
  if (layout_data) {
    updates.push('layout_data = ?');
    params.push(typeof layout_data === 'string' ? layout_data : JSON.stringify(layout_data));
  }

  if (updates.length === 0) return res.status(400).json({ message: '업데이트할 데이터 필요' });

  params.push(req.params.id);
  db.run(`UPDATE cabinets SET ${updates.join(', ')} WHERE id = ?`, params, function (err) {
    if (err) return res.status(500).json({ message: '서버 오류: ' + err.message });
    if (this.changes === 0) return res.status(404).json({ message: '찾을 수 없음' });
    res.json({ message: '위치 저장 완료' });
  });
});

// ============= 창고 API =============
app.get('/api/warehouses', authenticateToken, (req, res) => {
  db.all(`SELECT * FROM warehouses ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    res.json(rows);
  });
});

app.post('/api/warehouses', authenticateToken, requireAdmin, (req, res) => {
  const { name, location, capacity } = req.body;
  if (!name) return res.status(400).json({ message: '창고 이름 입력' });

  db.run(`INSERT INTO warehouses (name, location, capacity, owner_id) VALUES (?, ?, ?, ?)`,
    [name, location || '', capacity || 0, req.user.id], function (err) {
      if (err) return res.status(500).json({ message: '서버 오류' });
      // 하드웨어 상태 초기화
      db.run(`INSERT INTO hardware_status (warehouse_id) VALUES (?)`, [this.lastID]);
      res.status(201).json({ message: '창고 생성 완료', warehouseId: this.lastID });
    });
});

app.delete('/api/warehouses/:id', authenticateToken, requireAdmin, (req, res) => {
  db.run(`DELETE FROM warehouses WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (this.changes === 0) return res.status(404).json({ message: '찾을 수 없음' });
    res.json({ message: '삭제 완료' });
  });
});

// ============= 캐비넷 API =============
app.get('/api/warehouses/:warehouseId/cabinets', authenticateToken, (req, res) => {
  // Validate warehouse exists and user has access
  db.get(`SELECT id, owner_id FROM warehouses WHERE id = ?`, [req.params.warehouseId], (err, warehouse) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (!warehouse) return res.status(404).json({ message: '창고를 찾을 수 없음' });
    if (req.user.role !== 'admin' && warehouse.owner_id !== req.user.id) {
      return res.status(403).json({ message: '접근 권한이 없습니다.' });
    }
    db.all(`SELECT c.*, w.name as warehouse_name FROM cabinets c JOIN warehouses w ON c.warehouse_id = w.id WHERE c.warehouse_id = ?`,
      [req.params.warehouseId], (err, rows) => {
      if (err) return res.status(500).json({ message: '서버 오류' });
      res.json(rows);
    });
  });
});

app.post('/api/warehouses/:warehouseId/cabinets', authenticateToken, requireAdmin, (req, res) => {
  const { size, relay_channel, position_x, position_y, position_index } = req.body;
  if (!size) return res.status(400).json({ message: '크기 선택' });

  db.run(
    `INSERT INTO cabinets (warehouse_id, size, relay_channel, position_x, position_y, position_index) VALUES (?, ?, ?, ?, ?, ?)`,
    [req.params.warehouseId, size, relay_channel || 0, position_x || 0, position_y || 0, position_index || 0],
    function (err) {
      if (err) return res.status(500).json({ message: '서버 오류' });
      res.status(201).json({ message: '캐비넷 추가', cabinetId: this.lastID });
    });
});

app.put('/api/cabinets/:id/status', authenticateToken, requireAdmin, (req, res) => {
  const { status } = req.body;
  const validStatuses = ['available', 'occupied', 'maintenance', 'expired_soon'];
  if (!validStatuses.includes(status)) return res.status(400).json({ message: '잘못된 상태' });

  db.run(`UPDATE cabinets SET status = ? WHERE id = ?`, [status, req.params.id], function (err) {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (this.changes === 0) return res.status(404).json({ message: '찾을 수 없음' });
    res.json({ message: '상태 변경 완료' });
  });
});

// ============= 계약 API =============
app.get('/api/contracts', authenticateToken, (req, res) => {
  const userId = req.user.role === 'admin' ? null : req.user.id;
  if (userId) {
    db.all(`SELECT c.*, u.username, cab.size FROM contracts c JOIN users u ON c.user_id = u.id JOIN cabinets cab ON c.cabinet_id = cab.id WHERE c.user_id = ?`,
      [userId], (err, rows) => {
        if (err) return res.status(500).json({ message: '서버 오류' });
        res.json(rows);
      });
  } else {
    db.all(`SELECT c.*, u.username, cab.size FROM contracts c JOIN users u ON c.user_id = u.id JOIN cabinets cab ON c.cabinet_id = cab.id ORDER BY c.created_at DESC`,
      [], (err, rows) => {
        if (err) return res.status(500).json({ message: '서버 오류' });
        res.json(rows);
      });
  }
});

app.post('/api/contracts', authenticateToken, (req, res) => {
  const { user_id, cabinet_id, start_date, end_date, total_amount } = req.body;
  if (!cabinet_id || !start_date || !end_date) return res.status(400).json({ message: '필수 필드 입력' });
  const contractUserId = user_id ? parseInt(user_id, 10) : req.user.id;
  const amount = Number(total_amount);
  const startDate = new Date(start_date);
  const endDate = new Date(end_date);

  if (!Number.isInteger(contractUserId)) return res.status(400).json({ message: '유효한 사용자 ID가 필요합니다.' });
  if (req.user.role !== 'admin' && req.user.id !== contractUserId) {
    return res.status(403).json({ message: '다른 사용자 계약을 생성할 수 없습니다.' });
  }
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate >= endDate) {
    return res.status(400).json({ message: '계약 시작일은 종료일보다 빨라야 합니다.' });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: '결제 금액은 양수여야 합니다.' });
  }

  // 캐비넷 상태 확인
  db.get(`SELECT status FROM cabinets WHERE id = ?`, [cabinet_id], (err, cabinet) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (!cabinet || cabinet.status !== 'available') return res.status(400).json({ message: '사용 불가 캐비넷' });

    db.get(`SELECT id FROM contracts WHERE cabinet_id = ? AND status = 'active' LIMIT 1`, [cabinet_id], (err, activeContract) => {
      if (err) return res.status(500).json({ message: '서버 오류' });
      if (activeContract) return res.status(409).json({ message: '이미 활성 계약이 있는 캐비넷입니다.' });

      db.run(`INSERT INTO contracts (user_id, cabinet_id, start_date, end_date, total_amount) VALUES (?, ?, ?, ?, ?)`,
        [contractUserId, cabinet_id, start_date, end_date, amount], function (err) {
          if (err) return res.status(500).json({ message: '서버 오류' });

          // 캐비넷 상태 변경
          db.run(`UPDATE cabinets SET status = 'occupied', current_contract_id = ? WHERE id = ?`,
            [this.lastID, cabinet_id]);

          res.status(201).json({ message: '계약 생성', contractId: this.lastID });
        });
    });
  });
});

app.put('/api/contracts/:id/cancel', authenticateToken, requireAdmin, (req, res) => {
  db.get(`SELECT cabinet_id FROM contracts WHERE id = ?`, [req.params.id], (err, contract) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (!contract) return res.status(404).json({ message: '찾을 수 없음' });

    db.run(`UPDATE contracts SET status = 'cancelled' WHERE id = ?`, [req.params.id]);
    db.run(`UPDATE cabinets SET status = 'available', current_contract_id = NULL WHERE id = ?`, [contract.cabinet_id]);
    res.json({ message: '계약 취소 완료' });
  });
});

// ============= 결제 API (자동 연장 빌링 포함) =============
app.post('/api/payments', authenticateToken, requireAdmin, (req, res) => {
  const { contract_id, amount, pg_approval_number, billing_key, receipt_password: customReceipt } = req.body;
  if (!contract_id || !amount) return res.status(400).json({ message: '필수 필드 입력' });

  const receiptPassword = customReceipt || Math.floor(100000 + Math.random() * 900000).toString();

  db.run(
    `INSERT INTO payments (contract_id, amount, pg_approval_number, receipt_password, billing_key) VALUES (?, ?, ?, ?, ?)`,
    [contract_id, amount, pg_approval_number || '', receiptPassword, billing_key || null],
    function (err) {
      if (err) return res.status(500).json({ message: '서버 오류' });

      // billing_key가 있으면 자동 연장 예약
      if (billing_key) {
        scheduleAutoBilling(contract_id, billing_key);
        db.run(`UPDATE contracts SET billing_key = ? WHERE id = ?`, [billing_key, contract_id]);
      }

      res.status(201).json({ message: '결제 완료', paymentId: this.lastID, receiptPassword });
    });
});

app.post('/api/payments/:id/receipt', authenticateToken, (req, res) => {
  const password = req.body?.password || req.query?.password;
  db.get(`SELECT p.*, c.start_date, c.end_date, c.user_id, u.username FROM payments p JOIN contracts c ON p.contract_id = c.id JOIN users u ON c.user_id = u.id WHERE p.id = ?`,
    [req.params.id], (err, payment) => {
      if (err) return res.status(500).json({ message: '서버 오류' });
      if (!payment) return res.status(404).json({ message: '찾을 수 없음' });
      if (req.user.role !== 'admin' && req.user.id !== payment.user_id) {
        return res.status(403).json({ message: '접근 권한이 없습니다.' });
      }
      if (payment.receipt_password !== password) return res.status(403).json({ message: '비밀번호 불일치' });
      res.json(payment);
    });
});

// ============= 출입 인증 API (오프라인 지원) =============
app.post('/api/access/authenticate', rateLimitAccessAuth, checkAccessLockout, (req, res) => {
  const { warehouse_id, auth_method, auth_value } = req.body;
  if (!warehouse_id || !auth_method || !auth_value) return res.status(400).json({ message: '필수 필드' });

  let success = false;
  let userId = null;

  if (auth_method === 'pin') {
    // PIN 인증
    db.all(`SELECT id, pin_code FROM users WHERE pin_code IS NOT NULL`, [], async (err, users) => {
      if (err) return res.status(500).json({ success: false, message: '서버 오류' });

      for (const user of users) {
        if (await verifyPin(auth_value, user.pin_code)) {
          if (!String(user.pin_code).startsWith('$2')) {
            const migratedHash = await hashPin(auth_value);
            db.run(`UPDATE users SET pin_code = ? WHERE id = ?`, [migratedHash, user.id]);
          }
          userId = user.id;
          success = true;
          completeAuth(userId);
          return;
        }
      }

      logAccess(null, warehouse_id, auth_method, false, 'PIN 인증 실패');
      return res.status(401).json({ success: false, message: '인증 실패' });
    });
  } else if (auth_method === 'otp') {
    // Time-based OTP (오프라인 지원)
    db.get(`SELECT phone FROM users WHERE id = (SELECT user_id FROM contracts WHERE cabinet_id IN (SELECT id FROM cabinets WHERE warehouse_id = ?) AND status = 'active')`,
      [warehouse_id], (err, user) => {
        if (err || !user || !user.phone) {
          logAccess(null, warehouse_id, auth_method, false, 'OTP 사용자 없음');
          return res.status(401).json({ success: false, message: '인증 실패' });
        }
        if (validateOTP(user.phone, parseInt(auth_value))) {
          success = true;
          completeAuth(user.id);
        } else {
          logAccess(null, warehouse_id, auth_method, false, 'OTP 불일치');
          return res.status(401).json({ success: false, message: '인증 실패' });
        }
      });
  } else if (auth_method === 'qr') {
    // QR 코드 인증 (contract_id 기반)
    db.get(`SELECT user_id FROM contracts WHERE id = ? AND status = 'active'`, [auth_value], (err, contract) => {
      if (err || !contract) {
        logAccess(null, warehouse_id, auth_method, false, 'QR 계약 없음');
        return res.status(401).json({ success: false, message: '인증 실패' });
      }
      userId = contract.user_id;
      success = true;
      completeAuth(userId);
    });
  } else {
    return res.status(400).json({ success: false, message: '지원하지 않는 인증 방식' });
  }

  function completeAuth(uid) {
    clearAccessFailures(req);
    logAccess(uid, warehouse_id, auth_method, true, '인증 성공');
    // 릴레이 제어 (문 열기)
    controlDoor(warehouse_id, 'open');
    res.json({ success: true, message: '인증 성공 - 출입문 개방' });
  }

  function logAccess(uid, wid, method, success, note) {
    const source = getRequestSource(req);
    const auditNote = `${note} | method=${method} warehouse=${wid} ip=${source.ip} device=${source.device} userAgent=${source.userAgent}`;
    if (!success) recordAccessFailure(req);
    db.run(`INSERT INTO access_logs (user_id, warehouse_id, auth_method, success, note) VALUES (?, ?, ?, ?, ?)`,
      [uid, wid, method, success ? 1 : 0, auditNote]);
  }

  function controlDoor(wid, action) {
    // 릴레이 제어 로직 (실제 하드웨어 연동 시 구현)
    console.log(`[도어 제어] 창고 ${wid} - ${action}`);
    db.run(`UPDATE hardware_status SET door_status = ?, last_check = CURRENT_TIMESTAMP WHERE warehouse_id = ?`,
      [action === 'open' ? 'open' : 'closed', wid]);

    // 3초 후 자동 잠금
    setTimeout(() => {
      db.run(`UPDATE hardware_status SET door_status = 'closed', last_check = CURRENT_TIMESTAMP WHERE warehouse_id = ?`, [wid]);
      console.log(`[도어 제어] 창고 ${wid} - 자동 잠금`);
    }, 3000);
  }
});

// 출입 로그 조회
app.get('/api/warehouses/:warehouseId/access-logs', authenticateToken, (req, res) => {
  db.all(`SELECT al.*, u.username, 'access' as log_type FROM access_logs al LEFT JOIN users u ON al.user_id = u.id WHERE al.warehouse_id = ? ORDER BY al.created_at DESC LIMIT 100`,
    [req.params.warehouseId], (err, rows) => {
      if (err) return res.status(500).json({ message: '서버 오류' });
      res.json(rows);
    });
});

// ============= 네이버 예약 동기화 (실제 모듈 연동) =============
app.post('/api/admin/sync-naver-emails', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const count = await naverSync.fetchEmails();
    res.json({ message: `이메일 파싱 완료: ${count}건 처리` });
  } catch (err) {
    res.status(500).json({ message: `파싱 오류: ${err.message}` });
  }
});

app.post('/api/admin/sync-naver-crawler', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const count = await naverSync.crawlNaverPartner();
    res.json({ message: `크롤링 동기화 완료: ${count}건` });
  } catch (err) {
    res.status(500).json({ message: `크롤링 오류: ${err.message}` });
  }
});

app.post('/api/admin/sync-naver-reservations', authenticateToken, requireAdmin, (req, res) => {
  // 수동 데이터 입력 (테스트용)
  const { reservations } = req.body;
  if (!reservations || !Array.isArray(reservations)) {
    return res.status(400).json({ message: '예약 데이터 필수' });
  }

  let count = 0;
  const insert = db.prepare(`INSERT OR IGNORE INTO naver_reservations (reservation_id, customer_name, phone, service_name, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)`);

  reservations.forEach(r => {
    insert.run(r.reservation_id, r.customer_name, r.phone, r.service_name, r.start_date, r.end_date, function (err) {
      if (!err && this.changes > 0) count++;
    });
  });
  insert.finalize();

  res.json({ message: `동기화 완료: ${count}건 신규 등록` });
});

app.get('/api/admin/naver-reservations', authenticateToken, requireAdmin, (req, res) => {
  db.all(`SELECT * FROM naver_reservations ORDER BY synced_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    res.json(rows);
  });
});

// ============= 하드웨어 제어 API (모듈 연동) =============
app.post('/api/admin/door/unlock', authenticateToken, requireAdmin, requireHardwareSecret, (req, res) => {
  const { warehouse_id, duration } = req.body;
  if (!warehouse_id) return res.status(400).json({ message: '창고 ID 필수' });

  hardware.unlockDoor(warehouse_id, duration || undefined);
  logHardwareEvent(req, {
    warehouseId: warehouse_id,
    eventType: 'door_unlock',
    note: `duration=${duration || 3000}`,
  });
  res.json({ message: `문 개방 완료 (${duration ? duration/1000 : 3}초 후 자동 잠금)` });
});

app.post('/api/admin/relay/control', authenticateToken, requireAdmin, requireHardwareSecret, async (req, res) => {
  const { warehouse_id, channel, action } = req.body;
  if (!warehouse_id || !channel || !action) return res.status(400).json({ message: '필수 필드' });

  try {
    await hardware.controlRelay(warehouse_id, channel, action);
    logHardwareEvent(req, {
      warehouseId: warehouse_id,
      eventType: 'relay_control',
      note: `channel=${channel} action=${action}`,
    });
    res.json({ message: `릴레이 ${action} 완료` });
  } catch (err) {
    logHardwareEvent(req, {
      warehouseId: warehouse_id,
      eventType: 'relay_control',
      success: false,
      note: `channel=${channel} action=${action} error=${err.message}`,
    });
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/admin/hardware/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const status = await hardware.getHardwareStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/hardware/fire-alarm', requireHardwareSecretOrLocalhost, (req, res) => {
  const { warehouse_id } = req.body;
  if (!warehouse_id) return res.status(400).json({ message: '창고 ID 필수' });

  hardware.handleFireAlarm(warehouse_id);
  logHardwareEvent(req, {
    warehouseId: warehouse_id,
    eventType: 'fire_alarm',
    note: 'fire alarm signal received',
  });
  res.json({ message: '화재 경보 처리 - 문 강제 개방' });
});

// ============= 기존 API (재고, 프로필 등) =============
app.get('/api/warehouses/:warehouseId/items', authenticateToken, (req, res) => {
  db.all(`SELECT * FROM items WHERE warehouse_id = ? ORDER BY name`, [req.params.warehouseId], (err, rows) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    res.json(rows);
  });
});

app.post('/api/warehouses/:warehouseId/items', authenticateToken, (req, res) => {
  const { name, description, quantity, unit } = req.body;
  if (!name) return res.status(400).json({ message: '이름 필수' });
  db.run(`INSERT INTO items (warehouse_id, name, description, quantity, unit) VALUES (?, ?, ?, ?, ?)`,
    [req.params.warehouseId, name, description || '', quantity || 0, unit || '개'], function (err) {
      if (err) return res.status(500).json({ message: '서버 오류' });
      res.status(201).json({ message: '추가 완료', itemId: this.lastID });
    });
});

app.put('/api/items/:id', authenticateToken, (req, res) => {
  const { name, description, quantity, unit } = req.body;
  db.run(`UPDATE items SET name = ?, description = ?, quantity = ?, unit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [name, description, quantity, unit, req.params.id], function (err) {
      if (err) return res.status(500).json({ message: '서버 오류' });
      if (this.changes === 0) return res.status(404).json({ message: '찾을 수 없음' });
      res.json({ message: '수정 완료' });
    });
});

app.delete('/api/items/:id', authenticateToken, (req, res) => {
  db.run(`DELETE FROM items WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (this.changes === 0) return res.status(404).json({ message: '찾을 수 없음' });
    res.json({ message: '삭제 완료' });
  });
});

app.post('/api/items/:itemId/stock', authenticateToken, (req, res) => {
  const { type, quantity, note } = req.body;
  if (!type || !quantity || quantity <= 0) return res.status(400).json({ message: '유효한 값 입력' });

  db.get(`SELECT * FROM items WHERE id = ?`, [req.params.itemId], (err, item) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (!item) return res.status(404).json({ message: '찾을 수 없음' });
    if (type === 'out' && item.quantity < quantity) return res.status(400).json({ message: '부족한 수량' });

    const newQuantity = type === 'in' ? item.quantity + quantity : item.quantity - quantity;
    db.run(`UPDATE items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [newQuantity, req.params.itemId], (err) => {
      if (err) return res.status(500).json({ message: '서버 오류' });
      db.run(`INSERT INTO inventory_logs (item_id, warehouse_id, user_id, type, quantity, note) VALUES (?, ?, ?, ?, ?, ?)`,
        [req.params.itemId, item.warehouse_id, req.user.id, type, quantity, note || '']);
      res.json({ message: type === 'in' ? '입고 완료' : '출고 완료', newQuantity });
    });
  });
});

app.get('/api/warehouses/:warehouseId/logs', authenticateToken, (req, res) => {
  // Return both inventory logs and access logs combined
  db.all(`SELECT il.*, i.name as item_name, u.username, 'inventory' as log_type FROM inventory_logs il JOIN items i ON il.item_id = i.id JOIN users u ON il.user_id = u.id WHERE il.warehouse_id = ? ORDER BY created_at DESC LIMIT 50`,
    [req.params.warehouseId], (err, rows) => {
      if (err) return res.status(500).json({ message: '서버 오류' });
      res.json(rows);
    });
});

app.get('/api/warehouses/:warehouseId/stats', authenticateToken, (req, res) => {
  db.get(`SELECT COUNT(*) as total_items, COALESCE(SUM(quantity), 0) as total_quantity FROM items WHERE warehouse_id = ?`,
    [req.params.warehouseId], (err, row) => {
      if (err) return res.status(500).json({ message: '서버 오류' });
      res.json(row);
    });
});

app.get('/api/search', authenticateToken, (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  db.all(`SELECT i.*, w.name as warehouse_name FROM items i JOIN warehouses w ON i.warehouse_id = w.id WHERE i.name LIKE ? OR i.description LIKE ? LIMIT 20`,
    [`%${q}%`, `%${q}%`], (err, rows) => {
      if (err) return res.status(500).json({ message: '서버 오류' });
      res.json(rows);
    });
});

app.get('/api/profile/:userId', authenticateToken, (req, res) => {
  if (!isSelfOrAdmin(req, req.params.userId)) {
    return res.status(403).json({ message: '접근 권한이 없습니다.' });
  }
  db.get(`SELECT id, username, email, phone, role, created_at FROM users WHERE id = ?`, [req.params.userId], (err, user) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (!user) return res.status(404).json({ message: '찾을 수 없음' });
    res.json(user);
  });
});

app.put('/api/profile/:userId', authenticateToken, async (req, res) => {
  if (!isSelfOrAdmin(req, req.params.userId)) {
    return res.status(403).json({ message: '접근 권한이 없습니다.' });
  }
  const { username, email, phone, pin_code } = req.body;
  if (!username || !email) return res.status(400).json({ message: '필수 필드' });
  const params = [username, email, phone || ''];
  let sql = `UPDATE users SET username = ?, email = ?, phone = ?`;
  if (pin_code) {
    sql += `, pin_code = ?`;
    params.push(await hashPin(pin_code));
  }
  sql += ` WHERE id = ?`;
  params.push(req.params.userId);

  db.run(sql, params, function (err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(409).json({ message: '중복' });
        return res.status(500).json({ message: '서버 오류' });
      }
      if (this.changes === 0) return res.status(404).json({ message: '찾을 수 없음' });
      res.json({ message: '프로필 수정 완료' });
    });
});

// 만료 임박 캐비넷 체크 (매시간 실행)
function runContractExpiryJob() {
  db.all(`SELECT c.id, c.cabinet_id FROM contracts c WHERE c.status = 'active' AND c.end_date <= datetime('now', '+7 days') AND c.end_date >= datetime('now')`, [], (err, contracts) => {
    if (err) return;
    contracts.forEach(c => {
      db.run(`UPDATE cabinets SET status = 'expired_soon' WHERE id = ? AND status = 'occupied'`, [c.cabinet_id]);
    });
  });

  // 만료된 계약 처리
  db.all(`SELECT id, cabinet_id FROM contracts WHERE status = 'active' AND end_date < datetime('now')`, [], (err, contracts) => {
    if (err) return;
    contracts.forEach(c => {
      db.run(`UPDATE contracts SET status = 'expired' WHERE id = ?`, [c.id]);
      db.run(`UPDATE cabinets SET status = 'available', current_contract_id = NULL WHERE id = ?`, [c.cabinet_id]);
    });
  });
}

// ============= 알림톡 API (만료 예정/계약 알림) =============
app.post('/api/admin/send-alert', authenticateToken, requireAdmin, (req, res) => {
  const { user_id, template_type, message } = req.body;
  if (!user_id || !template_type) return res.status(400).json({ message: '필수 필드' });

  // 사용자 전화번호 조회
  db.get(`SELECT phone FROM users WHERE id = ?`, [user_id], (err, user) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (!user || !user.phone) return res.status(404).json({ message: '전화번호 없음' });

    // TODO: 실제 카카오 알림톡 API 연동
    console.log(`[알림톡] 사용자 ${user_id} (${user.phone}) → ${template_type}: ${message}`);

    // 결제 알림 / 만료 예정 / 계약 확인 등 템플릿별 발송
    res.json({ message: `알림 발송 완료 (${user.phone})`, template_type });
  });
});

// 만료 예정 계약자에게 자동 알림 발송 (매일 1회)
function runExpiryAlertJob() {
  db.all(`SELECT c.id, c.user_id, c.end_date, u.phone, u.username
           FROM contracts c
           JOIN users u ON c.user_id = u.id
           WHERE c.status = 'active'
           AND c.end_date <= datetime('now', '+3 days')
           AND c.end_date >= datetime('now')`, [], (err, contracts) => {
    if (err) return;
    contracts.forEach(c => {
      console.log(`[자동 알림] ${c.username} (${c.phone}) - 계약 만료 (${c.end_date})`);
      // TODO: 카카오 알림톡 API 호출
    });
  });
}

// ============= 전역 에러 핸들러 =============
app.use((err, req, res, next) => {
  console.error('[GLOBAL ERROR]', err.stack);
  res.status(500).json({ message: '서버 오류: ' + err.message });
});

async function startServer(port = PORT) {
  const server = app.listen(port, async () => {
    console.log(`서버 실행 중: http://localhost:${port}`);

    // 하드웨어 모듈 초기화
    try {
      await hardware.init();
    } catch (err) {
      console.error('[초기화] 하드웨어 모듈 오류:', err.message);
    }

    startBackgroundJobs();
    backgroundJobTimers.push(...naverSync.startSyncScheduler(600000)); // 10분마다
  });

  return server;
}

function stopBackgroundJobs() {
  while (backgroundJobTimers.length > 0) {
    clearInterval(backgroundJobTimers.pop());
  }
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer,
  stopBackgroundJobs,
  db,
};


````

## backend/package.json

````json
{
  "name": "backend",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "build": "node --check server.js && node --check hardware.js && node --check naver-sync.js",
    "test": "node --test test/*.test.js"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "commonjs",
  "dependencies": {
    "bcryptjs": "^3.0.3",
    "cors": "^2.8.6",
    "dotenv": "^17.4.2",
    "express": "^5.2.1",
    "imap": "^0.8.19",
    "jsonwebtoken": "^9.0.3",
    "mailparser": "^3.9.8",
    "puppeteer": "^24.43.1",
    "serialport": "^13.0.0",
    "sqlite3": "^6.0.1",
    "uuid": "^14.0.0"
  },
  "devDependencies": {
    "supertest": "^7.2.2"
  }
}

````

## backend/package-lock.json

````json
{
  "name": "backend",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "backend",
      "version": "1.0.0",
      "license": "ISC",
      "dependencies": {
        "bcryptjs": "^3.0.3",
        "cors": "^2.8.6",
        "dotenv": "^17.4.2",
        "express": "^5.2.1",
        "imap": "^0.8.19",
        "jsonwebtoken": "^9.0.3",
        "mailparser": "^3.9.8",
        "puppeteer": "^24.43.1",
        "serialport": "^13.0.0",
        "sqlite3": "^6.0.1",
        "uuid": "^14.0.0"
      },
      "devDependencies": {
        "supertest": "^7.2.2"
      }
    },
    "node_modules/@babel/code-frame": {
      "version": "7.29.0",
      "resolved": "https://registry.npmjs.org/@babel/code-frame/-/code-frame-7.29.0.tgz",
      "integrity": "sha512-9NhCeYjq9+3uxgdtp20LSiJXJvN0FeCtNGpJxuMFZ1Kv3cWUNb6DOhJwUvcVCzKGR66cw4njwM6hrJLqgOwbcw==",
      "license": "MIT",
      "dependencies": {
        "@babel/helper-validator-identifier": "^7.28.5",
        "js-tokens": "^4.0.0",
        "picocolors": "^1.1.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-validator-identifier": {
      "version": "7.28.5",
      "resolved": "https://registry.npmjs.org/@babel/helper-validator-identifier/-/helper-validator-identifier-7.28.5.tgz",
      "integrity": "sha512-qSs4ifwzKJSV39ucNjsvc6WVHs6b7S03sOh2OcHF9UHfVPqWWALUsNUVzhSBiItjRZoLHx7nIarVjqKVusUZ1Q==",
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@isaacs/fs-minipass": {
      "version": "4.0.1",
      "resolved": "https://registry.npmjs.org/@isaacs/fs-minipass/-/fs-minipass-4.0.1.tgz",
      "integrity": "sha512-wgm9Ehl2jpeqP3zw/7mo3kRHFp5MEDhqAdwy1fTGkHAwnkGOVsgpvQhL8B5n1qlb01jV3n/bI0ZfZp5lWA1k4w==",
      "license": "ISC",
      "dependencies": {
        "minipass": "^7.0.4"
      },
      "engines": {
        "node": ">=18.0.0"
      }
    },
    "node_modules/@noble/hashes": {
      "version": "1.8.0",
      "resolved": "https://registry.npmjs.org/@noble/hashes/-/hashes-1.8.0.tgz",
      "integrity": "sha512-jCs9ldd7NwzpgXDIf6P3+NrHh9/sD6CQdxHyjQI+h/6rDNo88ypBxxz45UDuZHz9r3tNz7N/VInSVoVdtXEI4A==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "^14.21.3 || >=16"
      },
      "funding": {
        "url": "https://paulmillr.com/funding/"
      }
    },
    "node_modules/@paralleldrive/cuid2": {
      "version": "2.3.1",
      "resolved": "https://registry.npmjs.org/@paralleldrive/cuid2/-/cuid2-2.3.1.tgz",
      "integrity": "sha512-XO7cAxhnTZl0Yggq6jOgjiOHhbgcO4NqFqwSmQpjK3b6TEE6Uj/jfSk6wzYyemh3+I0sHirKSetjQwn5cZktFw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@noble/hashes": "^1.1.5"
      }
    },
    "node_modules/@puppeteer/browsers": {
      "version": "2.13.2",
      "resolved": "https://registry.npmjs.org/@puppeteer/browsers/-/browsers-2.13.2.tgz",
      "integrity": "sha512-5EUZSUIc37H6aIXyWO0Z4y8NlF8NnjgmqeQgOGiswAU7pY0HOo16ho4+alIWmSfdZnjqBRawMsP3I5YqLSn6kw==",
      "license": "Apache-2.0",
      "dependencies": {
        "debug": "^4.4.3",
        "extract-zip": "^2.0.1",
        "progress": "^2.0.3",
        "proxy-agent": "^6.5.0",
        "semver": "^7.7.4",
        "tar-fs": "^3.1.1",
        "yargs": "^17.7.2"
      },
      "bin": {
        "browsers": "lib/cjs/main-cli.js"
      },
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/@puppeteer/browsers/node_modules/tar-fs": {
      "version": "3.1.2",
      "resolved": "https://registry.npmjs.org/tar-fs/-/tar-fs-3.1.2.tgz",
      "integrity": "sha512-QGxxTxxyleAdyM3kpFs14ymbYmNFrfY+pHj7Z8FgtbZ7w2//VAgLMac7sT6nRpIHjppXO2AwwEOg0bPFVRcmXw==",
      "license": "MIT",
      "dependencies": {
        "pump": "^3.0.0",
        "tar-stream": "^3.1.5"
      },
      "optionalDependencies": {
        "bare-fs": "^4.0.1",
        "bare-path": "^3.0.0"
      }
    },
    "node_modules/@puppeteer/browsers/node_modules/tar-stream": {
      "version": "3.2.0",
      "resolved": "https://registry.npmjs.org/tar-stream/-/tar-stream-3.2.0.tgz",
      "integrity": "sha512-ojzvCvVaNp6aOTFmG7jaRD0meowIAuPc3cMMhSgKiVWws1GyHbGd/xvnyuRKcKlMpt3qvxx6r0hreCNITP9hIg==",
      "license": "MIT",
      "dependencies": {
        "b4a": "^1.6.4",
        "bare-fs": "^4.5.5",
        "fast-fifo": "^1.2.0",
        "streamx": "^2.15.0"
      }
    },
    "node_modules/@selderee/plugin-htmlparser2": {
      "version": "0.11.0",
      "resolved": "https://registry.npmjs.org/@selderee/plugin-htmlparser2/-/plugin-htmlparser2-0.11.0.tgz",
      "integrity": "sha512-P33hHGdldxGabLFjPPpaTxVolMrzrcegejx+0GxjrIb9Zv48D8yAIA/QTDR2dFl7Uz7urX8aX6+5bCZslr+gWQ==",
      "license": "MIT",
      "dependencies": {
        "domhandler": "^5.0.3",
        "selderee": "^0.11.0"
      },
      "funding": {
        "url": "https://ko-fi.com/killymxi"
      }
    },
    "node_modules/@serialport/binding-mock": {
      "version": "10.2.2",
      "resolved": "https://registry.npmjs.org/@serialport/binding-mock/-/binding-mock-10.2.2.tgz",
      "integrity": "sha512-HAFzGhk9OuFMpuor7aT5G1ChPgn5qSsklTFOTUX72Rl6p0xwcSVsRtG/xaGp6bxpN7fI9D/S8THLBWbBgS6ldw==",
      "license": "MIT",
      "dependencies": {
        "@serialport/bindings-interface": "^1.2.1",
        "debug": "^4.3.3"
      },
      "engines": {
        "node": ">=12.0.0"
      }
    },
    "node_modules/@serialport/bindings-cpp": {
      "version": "13.0.0",
      "resolved": "https://registry.npmjs.org/@serialport/bindings-cpp/-/bindings-cpp-13.0.0.tgz",
      "integrity": "sha512-r25o4Bk/vaO1LyUfY/ulR6hCg/aWiN6Wo2ljVlb4Pj5bqWGcSRC4Vse4a9AcapuAu/FeBzHCbKMvRQeCuKjzIQ==",
      "hasInstallScript": true,
      "license": "MIT",
      "dependencies": {
        "@serialport/bindings-interface": "1.2.2",
        "@serialport/parser-readline": "12.0.0",
        "debug": "4.4.0",
        "node-addon-api": "8.3.0",
        "node-gyp-build": "4.8.4"
      },
      "engines": {
        "node": ">=18.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/serialport/donate"
      }
    },
    "node_modules/@serialport/bindings-cpp/node_modules/@serialport/parser-delimiter": {
      "version": "12.0.0",
      "resolved": "https://registry.npmjs.org/@serialport/parser-delimiter/-/parser-delimiter-12.0.0.tgz",
      "integrity": "sha512-gu26tVt5lQoybhorLTPsH2j2LnX3AOP2x/34+DUSTNaUTzu2fBXw+isVjQJpUBFWu6aeQRZw5bJol5X9Gxjblw==",
      "license": "MIT",
      "engines": {
        "node": ">=12.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/serialport/donate"
      }
    },
    "node_modules/@serialport/bindings-cpp/node_modules/@serialport/parser-readline": {
      "version": "12.0.0",
      "resolved": "https://registry.npmjs.org/@serialport/parser-readline/-/parser-readline-12.0.0.tgz",
      "integrity": "sha512-O7cywCWC8PiOMvo/gglEBfAkLjp/SENEML46BXDykfKP5mTPM46XMaX1L0waWU6DXJpBgjaL7+yX6VriVPbN4w==",
      "license": "MIT",
      "dependencies": {
        "@serialport/parser-delimiter": "12.0.0"
      },
      "engines": {
        "node": ">=12.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/serialport/donate"
      }
    },
    "node_modules/@serialport/bindings-cpp/node_modules/debug": {
      "version": "4.4.0",
      "resolved": "https://registry.npmjs.org/debug/-/debug-4.4.0.tgz",
      "integrity": "sha512-6WTZ/IxCY/T6BALoZHaE4ctp9xm+Z5kY/pzYaCHRFeyVhojxlrm+46y68HA6hr0TcwEssoxNiDEUJQjfPZ/RYA==",
      "license": "MIT",
      "dependencies": {
        "ms": "^2.1.3"
      },
      "engines": {
        "node": ">=6.0"
      },
      "peerDependenciesMeta": {
        "supports-color": {
          "optional": true
        }
      }
    },
    "node_modules/@serialport/bindings-cpp/node_modules/node-addon-api": {
      "version": "8.3.0",
      "resolved": "https://registry.npmjs.org/node-addon-api/-/node-addon-api-8.3.0.tgz",
      "integrity": "sha512-8VOpLHFrOQlAH+qA0ZzuGRlALRA6/LVh8QJldbrC4DY0hXoMP0l4Acq8TzFC018HztWiRqyCEj2aTWY2UvnJUg==",
      "license": "MIT",
      "engines": {
        "node": "^18 || ^20 || >= 21"
      }
    },
    "node_modules/@serialport/bindings-interface": {
      "version": "1.2.2",
      "resolved": "https://registry.npmjs.org/@serialport/bindings-interface/-/bindings-interface-1.2.2.tgz",
      "integrity": "sha512-CJaUd5bLvtM9c5dmO9rPBHPXTa9R2UwpkJ0wdh9JCYcbrPWsKz+ErvR0hBLeo7NPeiFdjFO4sonRljiw4d2XiA==",
      "license": "MIT",
      "engines": {
        "node": "^12.22 || ^14.13 || >=16"
      }
    },
    "node_modules/@serialport/parser-byte-length": {
      "version": "13.0.0",
      "resolved": "https://registry.npmjs.org/@serialport/parser-byte-length/-/parser-byte-length-13.0.0.tgz",
      "integrity": "sha512-32yvqeTAqJzAEtX5zCrN1Mej56GJ5h/cVFsCDPbF9S1ZSC9FWjOqNAgtByseHfFTSTs/4ZBQZZcZBpolt8sUng==",
      "license": "MIT",
      "engines": {
        "node": ">=20.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/serialport/donate"
      }
    },
    "node_modules/@serialport/parser-cctalk": {
      "version": "13.0.0",
      "resolved": "https://registry.npmjs.org/@serialport/parser-cctalk/-/parser-cctalk-13.0.0.tgz",
      "integrity": "sha512-RErAe57g9gvnlieVYGIn1xymb1bzNXb2QtUQd14FpmbQQYlcrmuRnJwKa1BgTCujoCkhtaTtgHlbBWOxm8U2uA==",
      "license": "MIT",
      "engines": {
        "node": ">=20.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/serialport/donate"
      }
    },
    "node_modules/@serialport/parser-delimiter": {
      "version": "13.0.0",
      "resolved": "https://registry.npmjs.org/@serialport/parser-delimiter/-/parser-delimiter-13.0.0.tgz",
      "integrity": "sha512-Qqyb0FX1avs3XabQqNaZSivyVbl/yl0jywImp7ePvfZKLwx7jBZjvL+Hawt9wIG6tfq6zbFM24vzCCK7REMUig==",
      "license": "MIT",
      "engines": {
        "node": ">=20.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/serialport/donate"
      }
    },
    "node_modules/@serialport/parser-inter-byte-timeout": {
      "version": "13.0.0",
      "resolved": "https://registry.npmjs.org/@serialport/parser-inter-byte-timeout/-/parser-inter-byte-timeout-13.0.0.tgz",
      "integrity": "sha512-a0w0WecTW7bD2YHWrpTz1uyiWA2fDNym0kjmPeNSwZ2XCP+JbirZt31l43m2ey6qXItTYVuQBthm75sPVeHnGA==",
      "license": "MIT",
      "engines": {
        "node": ">=20.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/serialport/donate"
      }
    },
    "node_modules/@serialport/parser-packet-length": {
      "version": "13.0.0",
      "resolved": "https://registry.npmjs.org/@serialport/parser-packet-length/-/parser-packet-length-13.0.0.tgz",
      "integrity": "sha512-60ZDDIqYRi0Xs2SPZUo4Jr5LLIjtb+rvzPKMJCohrO6tAqSDponcNpcB1O4W21mKTxYjqInSz+eMrtk0LLfZIg==",
      "license": "MIT",
      "engines": {
        "node": ">=8.6.0"
      }
    },
    "node_modules/@serialport/parser-readline": {
      "version": "13.0.0",
      "resolved": "https://registry.npmjs.org/@serialport/parser-readline/-/parser-readline-13.0.0.tgz",
      "integrity": "sha512-dov3zYoyf0dt1Sudd1q42VVYQ4WlliF0MYvAMA3MOyiU1IeG4hl0J6buBA2w4gl3DOCC05tGgLDN/3yIL81gsA==",
      "license": "MIT",
      "dependencies": {
        "@serialport/parser-delimiter": "13.0.0"
      },
      "engines": {
        "node": ">=20.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/serialport/donate"
      }
    },
    "node_modules/@serialport/parser-ready": {
      "version": "13.0.0",
      "resolved": "https://registry.npmjs.org/@serialport/parser-ready/-/parser-ready-13.0.0.tgz",
      "integrity": "sha512-JNUQA+y2Rfs4bU+cGYNqOPnNMAcayhhW+XJZihSLQXOHcZsFnOa2F9YtMg9VXRWIcnHldHYtisp62Etjlw24bw==",
      "license": "MIT",
      "engines": {
        "node": ">=20.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/serialport/donate"
      }
    },
    "node_modules/@serialport/parser-regex": {
      "version": "13.0.0",
      "resolved": "https://registry.npmjs.org/@serialport/parser-regex/-/parser-regex-13.0.0.tgz",
      "integrity": "sha512-m7HpIf56G5XcuDdA3DB34Z0pJiwxNRakThEHjSa4mG05OnWYv0IG8l2oUyYfuGMowQWaVnQ+8r+brlPxGVH+eA==",
      "license": "MIT",
      "engines": {
        "node": ">=20.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/serialport/donate"
      }
    },
    "node_modules/@serialport/parser-slip-encoder": {
      "version": "13.0.0",
      "resolved": "https://registry.npmjs.org/@serialport/parser-slip-encoder/-/parser-slip-encoder-13.0.0.tgz",
      "integrity": "sha512-fUHZEExm6izJ7rg0A1yjXwu4sOzeBkPAjDZPfb+XQoqgtKAk+s+HfICiYn7N2QU9gyaeCO8VKgWwi+b/DowYOg==",
      "license": "MIT",
      "engines": {
        "node": ">=20.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/serialport/donate"
      }
    },
    "node_modules/@serialport/parser-spacepacket": {
      "version": "13.0.0",
      "resolved": "https://registry.npmjs.org/@serialport/parser-spacepacket/-/parser-spacepacket-13.0.0.tgz",
      "integrity": "sha512-DoXJ3mFYmyD8X/8931agJvrBPxqTaYDsPoly9/cwQSeh/q4EjQND9ySXBxpWz5WcpyCU4jOuusqCSAPsbB30Eg==",
      "license": "MIT",
      "engines": {
        "node": ">=20.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/serialport/donate"
      }
    },
    "node_modules/@serialport/stream": {
      "version": "13.0.0",
      "resolved": "https://registry.npmjs.org/@serialport/stream/-/stream-13.0.0.tgz",
      "integrity": "sha512-F7xLJKsjGo2WuEWMSEO1SimRcOA+WtWICsY13r0ahx8s2SecPQH06338g28OT7cW7uRXI7oEQAk62qh5gHJW3g==",
      "license": "MIT",
      "dependencies": {
        "@serialport/bindings-interface": "1.2.2",
        "debug": "4.4.0"
      },
      "engines": {
        "node": ">=20.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/serialport/donate"
      }
    },
    "node_modules/@serialport/stream/node_modules/debug": {
      "version": "4.4.0",
      "resolved": "https://registry.npmjs.org/debug/-/debug-4.4.0.tgz",
      "integrity": "sha512-6WTZ/IxCY/T6BALoZHaE4ctp9xm+Z5kY/pzYaCHRFeyVhojxlrm+46y68HA6hr0TcwEssoxNiDEUJQjfPZ/RYA==",
      "license": "MIT",
      "dependencies": {
        "ms": "^2.1.3"
      },
      "engines": {
        "node": ">=6.0"
      },
      "peerDependenciesMeta": {
        "supports-color": {
          "optional": true
        }
      }
    },
    "node_modules/@tootallnate/quickjs-emscripten": {
      "version": "0.23.0",
      "resolved": "https://registry.npmjs.org/@tootallnate/quickjs-emscripten/-/quickjs-emscripten-0.23.0.tgz",
      "integrity": "sha512-C5Mc6rdnsaJDjO3UpGW/CQTHtCKaYlScZTly4JIu97Jxo/odCiH0ITnDXSJPTOrEKk/ycSZ0AOgTmkDtkOsvIA==",
      "license": "MIT"
    },
    "node_modules/@types/node": {
      "version": "25.9.0",
      "resolved": "https://registry.npmjs.org/@types/node/-/node-25.9.0.tgz",
      "integrity": "sha512-AOQwYUNolgy3VosiRqXrACUXTN8nJUtPl7FJXMqZVyxiiCLhQuG3jXKvCS1ALr+Y2OmZhzzLVlYPEqJaiqkaJQ==",
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "undici-types": ">=7.24.0 <7.24.7"
      }
    },
    "node_modules/@types/yauzl": {
      "version": "2.10.3",
      "resolved": "https://registry.npmjs.org/@types/yauzl/-/yauzl-2.10.3.tgz",
      "integrity": "sha512-oJoftv0LSuaDZE3Le4DbKX+KS9G36NzOeSap90UIK0yMA/NhKJhqlSGtNDORNRaIbQfzjXDrQa0ytJ6mNRGz/Q==",
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "@types/node": "*"
      }
    },
    "node_modules/@zone-eu/mailsplit": {
      "version": "5.4.8",
      "resolved": "https://registry.npmjs.org/@zone-eu/mailsplit/-/mailsplit-5.4.8.tgz",
      "integrity": "sha512-eEyACj4JZ7sjzRvy26QhLgKEMWwQbsw1+QZnlLX+/gihcNH07lVPOcnwf5U6UAL7gkc//J3jVd76o/WS+taUiA==",
      "license": "(MIT OR EUPL-1.1+)",
      "dependencies": {
        "libbase64": "1.3.0",
        "libmime": "5.3.7",
        "libqp": "2.1.1"
      }
    },
    "node_modules/@zone-eu/mailsplit/node_modules/iconv-lite": {
      "version": "0.6.3",
      "resolved": "https://registry.npmjs.org/iconv-lite/-/iconv-lite-0.6.3.tgz",
      "integrity": "sha512-4fCk79wshMdzMp2rH06qWrJE4iolqLhCUH+OiuIgU++RB0+94NlDL81atO7GX55uUKueo0txHNtvEyI6D7WdMw==",
      "license": "MIT",
      "dependencies": {
        "safer-buffer": ">= 2.1.2 < 3.0.0"
      },
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/@zone-eu/mailsplit/node_modules/libmime": {
      "version": "5.3.7",
      "resolved": "https://registry.npmjs.org/libmime/-/libmime-5.3.7.tgz",
      "integrity": "sha512-FlDb3Wtha8P01kTL3P9M+ZDNDWPKPmKHWaU/cG/lg5pfuAwdflVpZE+wm9m7pKmC5ww6s+zTxBKS1p6yl3KpSw==",
      "license": "MIT",
      "dependencies": {
        "encoding-japanese": "2.2.0",
        "iconv-lite": "0.6.3",
        "libbase64": "1.3.0",
        "libqp": "2.1.1"
      }
    },
    "node_modules/abbrev": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/abbrev/-/abbrev-4.0.0.tgz",
      "integrity": "sha512-a1wflyaL0tHtJSmLSOVybYhy22vRih4eduhhrkcjgrWGnRfrZtovJ2FRjxuTtkkj47O/baf0R86QU5OuYpz8fA==",
      "license": "ISC",
      "optional": true,
      "engines": {
        "node": "^20.17.0 || >=22.9.0"
      }
    },
    "node_modules/accepts": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/accepts/-/accepts-2.0.0.tgz",
      "integrity": "sha512-5cvg6CtKwfgdmVqY1WIiXKc3Q1bkRqGLi+2W/6ao+6Y7gu/RCwRuAhGEzh5B4KlszSuTLgZYuqFqo5bImjNKng==",
      "license": "MIT",
      "dependencies": {
        "mime-types": "^3.0.0",
        "negotiator": "^1.0.0"
      },
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/agent-base": {
      "version": "7.1.4",
      "resolved": "https://registry.npmjs.org/agent-base/-/agent-base-7.1.4.tgz",
      "integrity": "sha512-MnA+YT8fwfJPgBx3m60MNqakm30XOkyIoH1y6huTQvC0PwZG7ki8NacLBcrPbNoo8vEZy7Jpuk7+jMO+CUovTQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 14"
      }
    },
    "node_modules/ansi-regex": {
      "version": "5.0.1",
      "resolved": "https://registry.npmjs.org/ansi-regex/-/ansi-regex-5.0.1.tgz",
      "integrity": "sha512-quJQXlTSUGL2LH9SUXo8VwsY4soanhgo6LNSm84E1LBcE8s3O0wpdiRzyR9z/ZZJMlMWv37qOOb9pdJlMUEKFQ==",
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/ansi-styles": {
      "version": "4.3.0",
      "resolved": "https://registry.npmjs.org/ansi-styles/-/ansi-styles-4.3.0.tgz",
      "integrity": "sha512-zbB9rCJAT1rbjiVDb2hqKFHNYLxgtk8NURxZ3IZwD3F6NtxbXZQCnnSi1Lkx+IDohdPlFp222wVALIheZJQSEg==",
      "license": "MIT",
      "dependencies": {
        "color-convert": "^2.0.1"
      },
      "engines": {
        "node": ">=8"
      },
      "funding": {
        "url": "https://github.com/chalk/ansi-styles?sponsor=1"
      }
    },
    "node_modules/argparse": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/argparse/-/argparse-2.0.1.tgz",
      "integrity": "sha512-8+9WqebbFzpX9OR+Wa6O29asIogeRMzcGtAINdpMHHyAg10f05aSFVBbcEqGf/PXw1EjAZ+q2/bEBg3DvurK3Q==",
      "license": "Python-2.0"
    },
    "node_modules/asap": {
      "version": "2.0.6",
      "resolved": "https://registry.npmjs.org/asap/-/asap-2.0.6.tgz",
      "integrity": "sha512-BSHWgDSAiKs50o2Re8ppvp3seVHXSRM44cdSsT9FfNEUUZLOGWVCsiWaRPWM1Znn+mqZ1OfVZ3z3DWEzSp7hRA==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/ast-types": {
      "version": "0.13.4",
      "resolved": "https://registry.npmjs.org/ast-types/-/ast-types-0.13.4.tgz",
      "integrity": "sha512-x1FCFnFifvYDDzTaLII71vG5uvDwgtmDTEVWAxrgeiR8VjMONcCXJx7E+USjDtHlwFmt9MysbqgF9b9Vjr6w+w==",
      "license": "MIT",
      "dependencies": {
        "tslib": "^2.0.1"
      },
      "engines": {
        "node": ">=4"
      }
    },
    "node_modules/asynckit": {
      "version": "0.4.0",
      "resolved": "https://registry.npmjs.org/asynckit/-/asynckit-0.4.0.tgz",
      "integrity": "sha512-Oei9OH4tRh0YqU3GxhX79dM/mwVgvbZJaSNaRk+bshkj0S5cfHcgYakreBjrHwatXKbz+IoIdYLxrKim2MjW0Q==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/b4a": {
      "version": "1.8.1",
      "resolved": "https://registry.npmjs.org/b4a/-/b4a-1.8.1.tgz",
      "integrity": "sha512-aiqre1Nr0B/6DgE2N5vwTc+2/oQZ4Wh1t4NznYY4E00y8LCt6NqdRv81so00oo27D8MVKTpUa/MwUUtBLXCoDw==",
      "license": "Apache-2.0",
      "peerDependencies": {
        "react-native-b4a": "*"
      },
      "peerDependenciesMeta": {
        "react-native-b4a": {
          "optional": true
        }
      }
    },
    "node_modules/bare-events": {
      "version": "2.8.3",
      "resolved": "https://registry.npmjs.org/bare-events/-/bare-events-2.8.3.tgz",
      "integrity": "sha512-HdUm8EMQBLaJvGUdidNNbqpA1kYkwNcb+MYxkxCLAPJGQzlv9J0C24h8V65Z4c5GLd/JEALDvpFCQgpLJqc0zw==",
      "license": "Apache-2.0",
      "peerDependencies": {
        "bare-abort-controller": "*"
      },
      "peerDependenciesMeta": {
        "bare-abort-controller": {
          "optional": true
        }
      }
    },
    "node_modules/bare-fs": {
      "version": "4.7.1",
      "resolved": "https://registry.npmjs.org/bare-fs/-/bare-fs-4.7.1.tgz",
      "integrity": "sha512-WDRsyVN52eAx/lBamKD6uyw8H4228h/x0sGGGegOamM2cd7Pag88GfMQalobXI+HaEUxpCkbKQUDOQqt9wawRw==",
      "license": "Apache-2.0",
      "dependencies": {
        "bare-events": "^2.5.4",
        "bare-path": "^3.0.0",
        "bare-stream": "^2.6.4",
        "bare-url": "^2.2.2",
        "fast-fifo": "^1.3.2"
      },
      "engines": {
        "bare": ">=1.16.0"
      },
      "peerDependencies": {
        "bare-buffer": "*"
      },
      "peerDependenciesMeta": {
        "bare-buffer": {
          "optional": true
        }
      }
    },
    "node_modules/bare-os": {
      "version": "3.9.1",
      "resolved": "https://registry.npmjs.org/bare-os/-/bare-os-3.9.1.tgz",
      "integrity": "sha512-6M5XjcnsygQNPMCMPXSK379xrJFiZ/AEMNBmFEmQW8d/789VQATvriyi5r0HYTL9TkQ26rn3kgdTG3aisbrXkQ==",
      "license": "Apache-2.0",
      "engines": {
        "bare": ">=1.14.0"
      }
    },
    "node_modules/bare-path": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/bare-path/-/bare-path-3.0.0.tgz",
      "integrity": "sha512-tyfW2cQcB5NN8Saijrhqn0Zh7AnFNsnczRcuWODH0eYAXBsJ5gVxAUuNr7tsHSC6IZ77cA0SitzT+s47kot8Mw==",
      "license": "Apache-2.0",
      "dependencies": {
        "bare-os": "^3.0.1"
      }
    },
    "node_modules/bare-stream": {
      "version": "2.13.1",
      "resolved": "https://registry.npmjs.org/bare-stream/-/bare-stream-2.13.1.tgz",
      "integrity": "sha512-Vp0cnjYyrEC4whYTymQ+YZi6pBpfiICZO3cfRG8sy67ZNWe951urv1x4eW1BKNngw3U+3fPYb5JQvHbCtxH7Ow==",
      "license": "Apache-2.0",
      "dependencies": {
        "streamx": "^2.25.0",
        "teex": "^1.0.1"
      },
      "peerDependencies": {
        "bare-abort-controller": "*",
        "bare-buffer": "*",
        "bare-events": "*"
      },
      "peerDependenciesMeta": {
        "bare-abort-controller": {
          "optional": true
        },
        "bare-buffer": {
          "optional": true
        },
        "bare-events": {
          "optional": true
        }
      }
    },
    "node_modules/bare-url": {
      "version": "2.4.3",
      "resolved": "https://registry.npmjs.org/bare-url/-/bare-url-2.4.3.tgz",
      "integrity": "sha512-Kccpc7ACfXaxfeInfqKcZtW4pT5YBn1mesc4sCsun6sRwtbJ4h+sNOaksUpYEJUKfN65YWC6Bw2OJEFiKxq8nQ==",
      "license": "Apache-2.0",
      "dependencies": {
        "bare-path": "^3.0.0"
      }
    },
    "node_modules/base64-js": {
      "version": "1.5.1",
      "resolved": "https://registry.npmjs.org/base64-js/-/base64-js-1.5.1.tgz",
      "integrity": "sha512-AKpaYlHn8t4SVbOHCy+b5+KKgvR4vrsD8vbvrbiQJps7fKDTkjkDry6ji0rUJjC0kzbNePLwzxq8iypo41qeWA==",
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/feross"
        },
        {
          "type": "patreon",
          "url": "https://www.patreon.com/feross"
        },
        {
          "type": "consulting",
          "url": "https://feross.org/support"
        }
      ],
      "license": "MIT"
    },
    "node_modules/basic-ftp": {
      "version": "5.3.1",
      "resolved": "https://registry.npmjs.org/basic-ftp/-/basic-ftp-5.3.1.tgz",
      "integrity": "sha512-bopVNp6ugyA150DDuZfPFdt1KZ5a94ZDiwX4hMgZDzF+GttD80lEy8kj98kbyhLXnPvhtIo93mdnLIjpCAeeOw==",
      "license": "MIT",
      "engines": {
        "node": ">=10.0.0"
      }
    },
    "node_modules/bcryptjs": {
      "version": "3.0.3",
      "resolved": "https://registry.npmjs.org/bcryptjs/-/bcryptjs-3.0.3.tgz",
      "integrity": "sha512-GlF5wPWnSa/X5LKM1o0wz0suXIINz1iHRLvTS+sLyi7XPbe5ycmYI3DlZqVGZZtDgl4DmasFg7gOB3JYbphV5g==",
      "license": "BSD-3-Clause",
      "bin": {
        "bcrypt": "bin/bcrypt"
      }
    },
    "node_modules/bindings": {
      "version": "1.5.0",
      "resolved": "https://registry.npmjs.org/bindings/-/bindings-1.5.0.tgz",
      "integrity": "sha512-p2q/t/mhvuOj/UeLlV6566GD/guowlr0hHxClI0W9m7MWYkL1F0hLo+0Aexs9HSPCtR1SXQ0TD3MMKrXZajbiQ==",
      "license": "MIT",
      "dependencies": {
        "file-uri-to-path": "1.0.0"
      }
    },
    "node_modules/bl": {
      "version": "4.1.0",
      "resolved": "https://registry.npmjs.org/bl/-/bl-4.1.0.tgz",
      "integrity": "sha512-1W07cM9gS6DcLperZfFSj+bWLtaPGSOHWhPiGzXmvVJbRLdG82sH/Kn8EtW1VqWVA54AKf2h5k5BbnIbwF3h6w==",
      "license": "MIT",
      "dependencies": {
        "buffer": "^5.5.0",
        "inherits": "^2.0.4",
        "readable-stream": "^3.4.0"
      }
    },
    "node_modules/body-parser": {
      "version": "2.2.2",
      "resolved": "https://registry.npmjs.org/body-parser/-/body-parser-2.2.2.tgz",
      "integrity": "sha512-oP5VkATKlNwcgvxi0vM0p/D3n2C3EReYVX+DNYs5TjZFn/oQt2j+4sVJtSMr18pdRr8wjTcBl6LoV+FUwzPmNA==",
      "license": "MIT",
      "dependencies": {
        "bytes": "^3.1.2",
        "content-type": "^1.0.5",
        "debug": "^4.4.3",
        "http-errors": "^2.0.0",
        "iconv-lite": "^0.7.0",
        "on-finished": "^2.4.1",
        "qs": "^6.14.1",
        "raw-body": "^3.0.1",
        "type-is": "^2.0.1"
      },
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/buffer": {
      "version": "5.7.1",
      "resolved": "https://registry.npmjs.org/buffer/-/buffer-5.7.1.tgz",
      "integrity": "sha512-EHcyIPBQ4BSGlvjB16k5KgAJ27CIsHY/2JBmCRReo48y9rQ3MaUzWX3KVlBa4U7MyX02HdVj0K7C3WaB3ju7FQ==",
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/feross"
        },
        {
          "type": "patreon",
          "url": "https://www.patreon.com/feross"
        },
        {
          "type": "consulting",
          "url": "https://feross.org/support"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "base64-js": "^1.3.1",
        "ieee754": "^1.1.13"
      }
    },
    "node_modules/buffer-crc32": {
      "version": "0.2.13",
      "resolved": "https://registry.npmjs.org/buffer-crc32/-/buffer-crc32-0.2.13.tgz",
      "integrity": "sha512-VO9Ht/+p3SN7SKWqcrgEzjGbRSJYTx+Q1pTQC0wrWqHx0vpJraQ6GtHx8tvcg1rlK1byhU5gccxgOgj7B0TDkQ==",
      "license": "MIT",
      "engines": {
        "node": "*"
      }
    },
    "node_modules/buffer-equal-constant-time": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/buffer-equal-constant-time/-/buffer-equal-constant-time-1.0.1.tgz",
      "integrity": "sha512-zRpUiDwd/xk6ADqPMATG8vc9VPrkck7T07OIx0gnjmJAnHnTVXNQG3vfvWNuiZIkwu9KrKdA1iJKfsfTVxE6NA==",
      "license": "BSD-3-Clause"
    },
    "node_modules/bytes": {
      "version": "3.1.2",
      "resolved": "https://registry.npmjs.org/bytes/-/bytes-3.1.2.tgz",
      "integrity": "sha512-/Nf7TyzTx6S3yRJObOAV7956r8cr2+Oj8AC5dt8wSP3BQAoeX58NoHyCU8P8zGkNXStjTSi6fzO6F0pBdcYbEg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/call-bind-apply-helpers": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/call-bind-apply-helpers/-/call-bind-apply-helpers-1.0.2.tgz",
      "integrity": "sha512-Sp1ablJ0ivDkSzjcaJdxEunN5/XvksFJ2sMBFfq6x0ryhQV/2b/KwFe21cMpmHtPOSij8K99/wSfoEuTObmuMQ==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0",
        "function-bind": "^1.1.2"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/call-bound": {
      "version": "1.0.4",
      "resolved": "https://registry.npmjs.org/call-bound/-/call-bound-1.0.4.tgz",
      "integrity": "sha512-+ys997U96po4Kx/ABpBCqhA9EuxJaQWDQg7295H4hBphv3IZg0boBKuwYpt4YXp6MZ5AmZQnU/tyMTlRpaSejg==",
      "license": "MIT",
      "dependencies": {
        "call-bind-apply-helpers": "^1.0.2",
        "get-intrinsic": "^1.3.0"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/callsites": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/callsites/-/callsites-3.1.0.tgz",
      "integrity": "sha512-P8BjAsXvZS+VIDUI11hHCQEv74YT67YUi5JJFNWIqL235sBmjX4+qx9Muvls5ivyNENctx46xQLQ3aTuE7ssaQ==",
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/chownr": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/chownr/-/chownr-3.0.0.tgz",
      "integrity": "sha512-+IxzY9BZOQd/XuYPRmrvEVjF/nqj5kgT4kEq7VofrDoM1MxoRjEWkrCC3EtLi59TVawxTAn+orJwFQcrqEN1+g==",
      "license": "BlueOak-1.0.0",
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/chromium-bidi": {
      "version": "14.0.0",
      "resolved": "https://registry.npmjs.org/chromium-bidi/-/chromium-bidi-14.0.0.tgz",
      "integrity": "sha512-9gYlLtS6tStdRWzrtXaTMnqcM4dudNegMXJxkR0I/CXObHalYeYcAMPrL19eroNZHtJ8DQmu1E+ZNOYu/IXMXw==",
      "license": "Apache-2.0",
      "dependencies": {
        "mitt": "^3.0.1",
        "zod": "^3.24.1"
      },
      "peerDependencies": {
        "devtools-protocol": "*"
      }
    },
    "node_modules/cliui": {
      "version": "8.0.1",
      "resolved": "https://registry.npmjs.org/cliui/-/cliui-8.0.1.tgz",
      "integrity": "sha512-BSeNnyus75C4//NQ9gQt1/csTXyo/8Sb+afLAkzAptFuMsod9HFokGNudZpi/oQV73hnVK+sR+5PVRMd+Dr7YQ==",
      "license": "ISC",
      "dependencies": {
        "string-width": "^4.2.0",
        "strip-ansi": "^6.0.1",
        "wrap-ansi": "^7.0.0"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/color-convert": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/color-convert/-/color-convert-2.0.1.tgz",
      "integrity": "sha512-RRECPsj7iu/xb5oKYcsFHSppFNnsj/52OVTRKb4zP5onXwVF3zVmmToNcOfGC+CRDpfK/U584fMg38ZHCaElKQ==",
      "license": "MIT",
      "dependencies": {
        "color-name": "~1.1.4"
      },
      "engines": {
        "node": ">=7.0.0"
      }
    },
    "node_modules/color-name": {
      "version": "1.1.4",
      "resolved": "https://registry.npmjs.org/color-name/-/color-name-1.1.4.tgz",
      "integrity": "sha512-dOy+3AuW3a2wNbZHIuMZpTcgjGuLU/uBL/ubcZF9OXbDo8ff4O8yVp5Bf0efS8uEoYo5q4Fx7dY9OgQGXgAsQA==",
      "license": "MIT"
    },
    "node_modules/combined-stream": {
      "version": "1.0.8",
      "resolved": "https://registry.npmjs.org/combined-stream/-/combined-stream-1.0.8.tgz",
      "integrity": "sha512-FQN4MRfuJeHf7cBbBMJFXhKSDq+2kAArBlmRBvcvFE5BB1HZKXtSFASDhdlz9zOYwxh8lDdnvmMOe/+5cdoEdg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "delayed-stream": "~1.0.0"
      },
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/component-emitter": {
      "version": "1.3.1",
      "resolved": "https://registry.npmjs.org/component-emitter/-/component-emitter-1.3.1.tgz",
      "integrity": "sha512-T0+barUSQRTUQASh8bx02dl+DhF54GtIDY13Y3m9oWTklKbb3Wv974meRpeZ3lp1JpLVECWWNHC4vaG2XHXouQ==",
      "dev": true,
      "license": "MIT",
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/content-disposition": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/content-disposition/-/content-disposition-1.1.0.tgz",
      "integrity": "sha512-5jRCH9Z/+DRP7rkvY83B+yGIGX96OYdJmzngqnw2SBSxqCFPd0w2km3s5iawpGX8krnwSGmF0FW5Nhr0Hfai3g==",
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/content-type": {
      "version": "1.0.5",
      "resolved": "https://registry.npmjs.org/content-type/-/content-type-1.0.5.tgz",
      "integrity": "sha512-nTjqfcBFEipKdXCv4YDQWCfmcLZKm81ldF0pAopTvyrFGVbcR6P/VAAd5G7N+0tTr8QqiU0tFadD6FK4NtJwOA==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/cookie": {
      "version": "0.7.2",
      "resolved": "https://registry.npmjs.org/cookie/-/cookie-0.7.2.tgz",
      "integrity": "sha512-yki5XnKuf750l50uGTllt6kKILY4nQ1eNIQatoXEByZ5dWgnKqbnqmTrBE5B4N7lrMJKQ2ytWMiTO2o0v6Ew/w==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/cookie-signature": {
      "version": "1.2.2",
      "resolved": "https://registry.npmjs.org/cookie-signature/-/cookie-signature-1.2.2.tgz",
      "integrity": "sha512-D76uU73ulSXrD1UXF4KE2TMxVVwhsnCgfAyTg9k8P6KGZjlXKrOLe4dJQKI3Bxi5wjesZoFXJWElNWBjPZMbhg==",
      "license": "MIT",
      "engines": {
        "node": ">=6.6.0"
      }
    },
    "node_modules/cookiejar": {
      "version": "2.1.4",
      "resolved": "https://registry.npmjs.org/cookiejar/-/cookiejar-2.1.4.tgz",
      "integrity": "sha512-LDx6oHrK+PhzLKJU9j5S7/Y3jM/mUHvD/DeI1WQmJn652iPC5Y4TBzC9l+5OMOXlyTTA+SmVUPm0HQUwpD5Jqw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/core-util-is": {
      "version": "1.0.3",
      "resolved": "https://registry.npmjs.org/core-util-is/-/core-util-is-1.0.3.tgz",
      "integrity": "sha512-ZQBvi1DcpJ4GDqanjucZ2Hj3wEO5pZDS89BWbkcrvdxksJorwUDDZamX9ldFkp9aw2lmBDLgkObEA4DWNJ9FYQ==",
      "license": "MIT"
    },
    "node_modules/cors": {
      "version": "2.8.6",
      "resolved": "https://registry.npmjs.org/cors/-/cors-2.8.6.tgz",
      "integrity": "sha512-tJtZBBHA6vjIAaF6EnIaq6laBBP9aq/Y3ouVJjEfoHbRBcHBAHYcMh/w8LDrk2PvIMMq8gmopa5D4V8RmbrxGw==",
      "license": "MIT",
      "dependencies": {
        "object-assign": "^4",
        "vary": "^1"
      },
      "engines": {
        "node": ">= 0.10"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/cosmiconfig": {
      "version": "9.0.1",
      "resolved": "https://registry.npmjs.org/cosmiconfig/-/cosmiconfig-9.0.1.tgz",
      "integrity": "sha512-hr4ihw+DBqcvrsEDioRO31Z17x71pUYoNe/4h6Z0wB72p7MU7/9gH8Q3s12NFhHPfYBBOV3qyfUxmr/Yn3shnQ==",
      "license": "MIT",
      "dependencies": {
        "env-paths": "^2.2.1",
        "import-fresh": "^3.3.0",
        "js-yaml": "^4.1.0",
        "parse-json": "^5.2.0"
      },
      "engines": {
        "node": ">=14"
      },
      "funding": {
        "url": "https://github.com/sponsors/d-fischer"
      },
      "peerDependencies": {
        "typescript": ">=4.9.5"
      },
      "peerDependenciesMeta": {
        "typescript": {
          "optional": true
        }
      }
    },
    "node_modules/data-uri-to-buffer": {
      "version": "6.0.2",
      "resolved": "https://registry.npmjs.org/data-uri-to-buffer/-/data-uri-to-buffer-6.0.2.tgz",
      "integrity": "sha512-7hvf7/GW8e86rW0ptuwS3OcBGDjIi6SZva7hCyWC0yYry2cOPmLIjXAUHI6DK2HsnwJd9ifmt57i8eV2n4YNpw==",
      "license": "MIT",
      "engines": {
        "node": ">= 14"
      }
    },
    "node_modules/debug": {
      "version": "4.4.3",
      "resolved": "https://registry.npmjs.org/debug/-/debug-4.4.3.tgz",
      "integrity": "sha512-RGwwWnwQvkVfavKVt22FGLw+xYSdzARwm0ru6DhTVA3umU5hZc28V3kO4stgYryrTlLpuvgI9GiijltAjNbcqA==",
      "license": "MIT",
      "dependencies": {
        "ms": "^2.1.3"
      },
      "engines": {
        "node": ">=6.0"
      },
      "peerDependenciesMeta": {
        "supports-color": {
          "optional": true
        }
      }
    },
    "node_modules/decompress-response": {
      "version": "6.0.0",
      "resolved": "https://registry.npmjs.org/decompress-response/-/decompress-response-6.0.0.tgz",
      "integrity": "sha512-aW35yZM6Bb/4oJlZncMH2LCoZtJXTRxES17vE3hoRiowU2kWHaJKFkSBDnDR+cm9J+9QhXmREyIfv0pji9ejCQ==",
      "license": "MIT",
      "dependencies": {
        "mimic-response": "^3.1.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/deep-extend": {
      "version": "0.6.0",
      "resolved": "https://registry.npmjs.org/deep-extend/-/deep-extend-0.6.0.tgz",
      "integrity": "sha512-LOHxIOaPYdHlJRtCQfDIVZtfw/ufM8+rVj649RIHzcm/vGwQRXFt6OPqIFWsm2XEMrNIEtWR64sY1LEKD2vAOA==",
      "license": "MIT",
      "engines": {
        "node": ">=4.0.0"
      }
    },
    "node_modules/deepmerge": {
      "version": "4.3.1",
      "resolved": "https://registry.npmjs.org/deepmerge/-/deepmerge-4.3.1.tgz",
      "integrity": "sha512-3sUqbMEc77XqpdNO7FRyRog+eW3ph+GYCbj+rK+uYyRMuwsVy0rMiVtPn+QJlKFvWP/1PYpapqYn0Me2knFn+A==",
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/degenerator": {
      "version": "5.0.1",
      "resolved": "https://registry.npmjs.org/degenerator/-/degenerator-5.0.1.tgz",
      "integrity": "sha512-TllpMR/t0M5sqCXfj85i4XaAzxmS5tVA16dqvdkMwGmzI+dXLXnw3J+3Vdv7VKw+ThlTMboK6i9rnZ6Nntj5CQ==",
      "license": "MIT",
      "dependencies": {
        "ast-types": "^0.13.4",
        "escodegen": "^2.1.0",
        "esprima": "^4.0.1"
      },
      "engines": {
        "node": ">= 14"
      }
    },
    "node_modules/delayed-stream": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/delayed-stream/-/delayed-stream-1.0.0.tgz",
      "integrity": "sha512-ZySD7Nf91aLB0RxL4KGrKHBXl7Eds1DAmEdcoVawXnLD7SDhpNgtuII2aAkg7a7QS41jxPSZ17p4VdGnMHk3MQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.4.0"
      }
    },
    "node_modules/depd": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/depd/-/depd-2.0.0.tgz",
      "integrity": "sha512-g7nH6P6dyDioJogAAGprGpCtVImJhpPk/roCzdb3fIh61/s/nPsfR6onyMwkCAR/OlC3yBC0lESvUoQEAssIrw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/detect-libc": {
      "version": "2.1.2",
      "resolved": "https://registry.npmjs.org/detect-libc/-/detect-libc-2.1.2.tgz",
      "integrity": "sha512-Btj2BOOO83o3WyH59e8MgXsxEQVcarkUOpEYrubB0urwnN10yQ364rsiByU11nZlqWYZm05i/of7io4mzihBtQ==",
      "license": "Apache-2.0",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/devtools-protocol": {
      "version": "0.0.1608973",
      "resolved": "https://registry.npmjs.org/devtools-protocol/-/devtools-protocol-0.0.1608973.tgz",
      "integrity": "sha512-Tpm17fxYzt+J7VrGdc1k8YdRqS3YV7se/M6KeemEqvUbq/n7At1rWVuXMxQgpWkdwSdIEKYbU//Bve+Shm4YNQ==",
      "license": "BSD-3-Clause"
    },
    "node_modules/dezalgo": {
      "version": "1.0.4",
      "resolved": "https://registry.npmjs.org/dezalgo/-/dezalgo-1.0.4.tgz",
      "integrity": "sha512-rXSP0bf+5n0Qonsb+SVVfNfIsimO4HEtmnIpPHY8Q1UCzKlQrDMfdobr8nJOOsRgWCyMRqeSBQzmWUMq7zvVig==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "asap": "^2.0.0",
        "wrappy": "1"
      }
    },
    "node_modules/dom-serializer": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/dom-serializer/-/dom-serializer-2.0.0.tgz",
      "integrity": "sha512-wIkAryiqt/nV5EQKqQpo3SToSOV9J0DnbJqwK7Wv/Trc92zIAYZ4FlMu+JPFW1DfGFt81ZTCGgDEabffXeLyJg==",
      "license": "MIT",
      "dependencies": {
        "domelementtype": "^2.3.0",
        "domhandler": "^5.0.2",
        "entities": "^4.2.0"
      },
      "funding": {
        "url": "https://github.com/cheeriojs/dom-serializer?sponsor=1"
      }
    },
    "node_modules/domelementtype": {
      "version": "2.3.0",
      "resolved": "https://registry.npmjs.org/domelementtype/-/domelementtype-2.3.0.tgz",
      "integrity": "sha512-OLETBj6w0OsagBwdXnPdN0cnMfF9opN69co+7ZrbfPGrdpPVNBUj02spi6B1N7wChLQiPn4CSH/zJvXw56gmHw==",
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/fb55"
        }
      ],
      "license": "BSD-2-Clause"
    },
    "node_modules/domhandler": {
      "version": "5.0.3",
      "resolved": "https://registry.npmjs.org/domhandler/-/domhandler-5.0.3.tgz",
      "integrity": "sha512-cgwlv/1iFQiFnU96XXgROh8xTeetsnJiDsTc7TYCLFd9+/WNkIqPTxiM/8pSd8VIrhXGTf1Ny1q1hquVqDJB5w==",
      "license": "BSD-2-Clause",
      "dependencies": {
        "domelementtype": "^2.3.0"
      },
      "engines": {
        "node": ">= 4"
      },
      "funding": {
        "url": "https://github.com/fb55/domhandler?sponsor=1"
      }
    },
    "node_modules/domutils": {
      "version": "3.2.2",
      "resolved": "https://registry.npmjs.org/domutils/-/domutils-3.2.2.tgz",
      "integrity": "sha512-6kZKyUajlDuqlHKVX1w7gyslj9MPIXzIFiz/rGu35uC1wMi+kMhQwGhl4lt9unC9Vb9INnY9Z3/ZA3+FhASLaw==",
      "license": "BSD-2-Clause",
      "dependencies": {
        "dom-serializer": "^2.0.0",
        "domelementtype": "^2.3.0",
        "domhandler": "^5.0.3"
      },
      "funding": {
        "url": "https://github.com/fb55/domutils?sponsor=1"
      }
    },
    "node_modules/dotenv": {
      "version": "17.4.2",
      "resolved": "https://registry.npmjs.org/dotenv/-/dotenv-17.4.2.tgz",
      "integrity": "sha512-nI4U3TottKAcAD9LLud4Cb7b2QztQMUEfHbvhTH09bqXTxnSie8WnjPALV/WMCrJZ6UV/qHJ6L03OqO3LcdYZw==",
      "license": "BSD-2-Clause",
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://dotenvx.com"
      }
    },
    "node_modules/dunder-proto": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/dunder-proto/-/dunder-proto-1.0.1.tgz",
      "integrity": "sha512-KIN/nDJBQRcXw0MLVhZE9iQHmG68qAVIBg9CqmUYjmQIhgij9U5MFvrqkUL5FbtyyzZuOeOt0zdeRe4UY7ct+A==",
      "license": "MIT",
      "dependencies": {
        "call-bind-apply-helpers": "^1.0.1",
        "es-errors": "^1.3.0",
        "gopd": "^1.2.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/ecdsa-sig-formatter": {
      "version": "1.0.11",
      "resolved": "https://registry.npmjs.org/ecdsa-sig-formatter/-/ecdsa-sig-formatter-1.0.11.tgz",
      "integrity": "sha512-nagl3RYrbNv6kQkeJIpt6NJZy8twLB/2vtz6yN9Z4vRKHN4/QZJIEbqohALSgwKdnksuY3k5Addp5lg8sVoVcQ==",
      "license": "Apache-2.0",
      "dependencies": {
        "safe-buffer": "^5.0.1"
      }
    },
    "node_modules/ee-first": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/ee-first/-/ee-first-1.1.1.tgz",
      "integrity": "sha512-WMwm9LhRUo+WUaRN+vRuETqG89IgZphVSNkdFgeb6sS/E4OrDIN7t48CAewSHXc6C8lefD8KKfr5vY61brQlow==",
      "license": "MIT"
    },
    "node_modules/emoji-regex": {
      "version": "8.0.0",
      "resolved": "https://registry.npmjs.org/emoji-regex/-/emoji-regex-8.0.0.tgz",
      "integrity": "sha512-MSjYzcWNOA0ewAHpz0MxpYFvwg6yjy1NG3xteoqz644VCo/RPgnr1/GGt+ic3iJTzQ8Eu3TdM14SawnVUmGE6A==",
      "license": "MIT"
    },
    "node_modules/encodeurl": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/encodeurl/-/encodeurl-2.0.0.tgz",
      "integrity": "sha512-Q0n9HRi4m6JuGIV1eFlmvJB7ZEVxu93IrMyiMsGC0lrMJMWzRgx6WGquyfQgZVb31vhGgXnfmPNNXmxnOkRBrg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/encoding-japanese": {
      "version": "2.2.0",
      "resolved": "https://registry.npmjs.org/encoding-japanese/-/encoding-japanese-2.2.0.tgz",
      "integrity": "sha512-EuJWwlHPZ1LbADuKTClvHtwbaFn4rOD+dRAbWysqEOXRc2Uui0hJInNJrsdH0c+OhJA4nrCBdSkW4DD5YxAo6A==",
      "license": "MIT",
      "engines": {
        "node": ">=8.10.0"
      }
    },
    "node_modules/end-of-stream": {
      "version": "1.4.5",
      "resolved": "https://registry.npmjs.org/end-of-stream/-/end-of-stream-1.4.5.tgz",
      "integrity": "sha512-ooEGc6HP26xXq/N+GCGOT0JKCLDGrq2bQUZrQ7gyrJiZANJ/8YDTxTpQBXGMn+WbIQXNVpyWymm7KYVICQnyOg==",
      "license": "MIT",
      "dependencies": {
        "once": "^1.4.0"
      }
    },
    "node_modules/entities": {
      "version": "4.5.0",
      "resolved": "https://registry.npmjs.org/entities/-/entities-4.5.0.tgz",
      "integrity": "sha512-V0hjH4dGPh9Ao5p0MoRY6BVqtwCjhz6vI5LT8AJ55H+4g9/4vbHx1I54fS0XuclLhDHArPQCiMjDxjaL8fPxhw==",
      "license": "BSD-2-Clause",
      "engines": {
        "node": ">=0.12"
      },
      "funding": {
        "url": "https://github.com/fb55/entities?sponsor=1"
      }
    },
    "node_modules/env-paths": {
      "version": "2.2.1",
      "resolved": "https://registry.npmjs.org/env-paths/-/env-paths-2.2.1.tgz",
      "integrity": "sha512-+h1lkLKhZMTYjog1VEpJNG7NZJWcuc2DDk/qsqSTRRCOXiLjeQ1d1/udrUGhqMxUgAlwKNZ0cf2uqan5GLuS2A==",
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/error-ex": {
      "version": "1.3.4",
      "resolved": "https://registry.npmjs.org/error-ex/-/error-ex-1.3.4.tgz",
      "integrity": "sha512-sqQamAnR14VgCr1A618A3sGrygcpK+HEbenA/HiEAkkUwcZIIB/tgWqHFxWgOyDh4nB4JCRimh79dR5Ywc9MDQ==",
      "license": "MIT",
      "dependencies": {
        "is-arrayish": "^0.2.1"
      }
    },
    "node_modules/es-define-property": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/es-define-property/-/es-define-property-1.0.1.tgz",
      "integrity": "sha512-e3nRfgfUZ4rNGL232gUgX06QNyyez04KdjFrF+LTRoOXmrOgFKDg4BCdsjW8EnT69eqdYGmRpJwiPVYNrCaW3g==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/es-errors": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/es-errors/-/es-errors-1.3.0.tgz",
      "integrity": "sha512-Zf5H2Kxt2xjTvbJvP2ZWLEICxA6j+hAmMzIlypy4xcBg1vKVnx89Wy0GbS+kf5cwCVFFzdCFh2XSCFNULS6csw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/es-object-atoms": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/es-object-atoms/-/es-object-atoms-1.1.1.tgz",
      "integrity": "sha512-FGgH2h8zKNim9ljj7dankFPcICIK9Cp5bm+c2gQSYePhpaG5+esrLODihIorn+Pe6FGJzWhXQotPv73jTaldXA==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/es-set-tostringtag": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/es-set-tostringtag/-/es-set-tostringtag-2.1.0.tgz",
      "integrity": "sha512-j6vWzfrGVfyXxge+O0x5sh6cvxAog0a/4Rdd2K36zCMV5eJ+/+tOAngRO8cODMNWbVRdVlmGZQL2YS3yR8bIUA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0",
        "get-intrinsic": "^1.2.6",
        "has-tostringtag": "^1.0.2",
        "hasown": "^2.0.2"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/escalade": {
      "version": "3.2.0",
      "resolved": "https://registry.npmjs.org/escalade/-/escalade-3.2.0.tgz",
      "integrity": "sha512-WUj2qlxaQtO4g6Pq5c29GTcWGDyd8itL8zTlipgECz3JesAiiOKotd8JU6otB3PACgG6xkJUyVhboMS+bje/jA==",
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/escape-html": {
      "version": "1.0.3",
      "resolved": "https://registry.npmjs.org/escape-html/-/escape-html-1.0.3.tgz",
      "integrity": "sha512-NiSupZ4OeuGwr68lGIeym/ksIZMJodUGOSCZ/FSnTxcrekbvqrgdUxlJOMpijaKZVjAJrWrGs/6Jy8OMuyj9ow==",
      "license": "MIT"
    },
    "node_modules/escodegen": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/escodegen/-/escodegen-2.1.0.tgz",
      "integrity": "sha512-2NlIDTwUWJN0mRPQOdtQBzbUHvdGY2P1VXSyU83Q3xKxM7WHX2Ql8dKq782Q9TgQUNOLEzEYu9bzLNj1q88I5w==",
      "license": "BSD-2-Clause",
      "dependencies": {
        "esprima": "^4.0.1",
        "estraverse": "^5.2.0",
        "esutils": "^2.0.2"
      },
      "bin": {
        "escodegen": "bin/escodegen.js",
        "esgenerate": "bin/esgenerate.js"
      },
      "engines": {
        "node": ">=6.0"
      },
      "optionalDependencies": {
        "source-map": "~0.6.1"
      }
    },
    "node_modules/esprima": {
      "version": "4.0.1",
      "resolved": "https://registry.npmjs.org/esprima/-/esprima-4.0.1.tgz",
      "integrity": "sha512-eGuFFw7Upda+g4p+QHvnW0RyTX/SVeJBDM/gCtMARO0cLuT2HcEKnTPvhjV6aGeqrCB/sbNop0Kszm0jsaWU4A==",
      "license": "BSD-2-Clause",
      "bin": {
        "esparse": "bin/esparse.js",
        "esvalidate": "bin/esvalidate.js"
      },
      "engines": {
        "node": ">=4"
      }
    },
    "node_modules/estraverse": {
      "version": "5.3.0",
      "resolved": "https://registry.npmjs.org/estraverse/-/estraverse-5.3.0.tgz",
      "integrity": "sha512-MMdARuVEQziNTeJD8DgMqmhwR11BRQ/cBP+pLtYdSTnf3MIO8fFeiINEbX36ZdNlfU/7A9f3gUw49B3oQsvwBA==",
      "license": "BSD-2-Clause",
      "engines": {
        "node": ">=4.0"
      }
    },
    "node_modules/esutils": {
      "version": "2.0.3",
      "resolved": "https://registry.npmjs.org/esutils/-/esutils-2.0.3.tgz",
      "integrity": "sha512-kVscqXk4OCp68SZ0dkgEKVi6/8ij300KBWTJq32P/dYeWTSwK41WyTxalN1eRmA5Z9UU/LX9D7FWSmV9SAYx6g==",
      "license": "BSD-2-Clause",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/etag": {
      "version": "1.8.1",
      "resolved": "https://registry.npmjs.org/etag/-/etag-1.8.1.tgz",
      "integrity": "sha512-aIL5Fx7mawVa300al2BnEE4iNvo1qETxLrPI/o05L7z6go7fCw1J6EQmbK4FmJ2AS7kgVF/KEZWufBfdClMcPg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/events-universal": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/events-universal/-/events-universal-1.0.1.tgz",
      "integrity": "sha512-LUd5euvbMLpwOF8m6ivPCbhQeSiYVNb8Vs0fQ8QjXo0JTkEHpz8pxdQf0gStltaPpw0Cca8b39KxvK9cfKRiAw==",
      "license": "Apache-2.0",
      "dependencies": {
        "bare-events": "^2.7.0"
      }
    },
    "node_modules/expand-template": {
      "version": "2.0.3",
      "resolved": "https://registry.npmjs.org/expand-template/-/expand-template-2.0.3.tgz",
      "integrity": "sha512-XYfuKMvj4O35f/pOXLObndIRvyQ+/+6AhODh+OKWj9S9498pHHn/IMszH+gt0fBCRWMNfk1ZSp5x3AifmnI2vg==",
      "license": "(MIT OR WTFPL)",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/exponential-backoff": {
      "version": "3.1.3",
      "resolved": "https://registry.npmjs.org/exponential-backoff/-/exponential-backoff-3.1.3.tgz",
      "integrity": "sha512-ZgEeZXj30q+I0EN+CbSSpIyPaJ5HVQD18Z1m+u1FXbAeT94mr1zw50q4q6jiiC447Nl/YTcIYSAftiGqetwXCA==",
      "license": "Apache-2.0",
      "optional": true
    },
    "node_modules/express": {
      "version": "5.2.1",
      "resolved": "https://registry.npmjs.org/express/-/express-5.2.1.tgz",
      "integrity": "sha512-hIS4idWWai69NezIdRt2xFVofaF4j+6INOpJlVOLDO8zXGpUVEVzIYk12UUi2JzjEzWL3IOAxcTubgz9Po0yXw==",
      "license": "MIT",
      "dependencies": {
        "accepts": "^2.0.0",
        "body-parser": "^2.2.1",
        "content-disposition": "^1.0.0",
        "content-type": "^1.0.5",
        "cookie": "^0.7.1",
        "cookie-signature": "^1.2.1",
        "debug": "^4.4.0",
        "depd": "^2.0.0",
        "encodeurl": "^2.0.0",
        "escape-html": "^1.0.3",
        "etag": "^1.8.1",
        "finalhandler": "^2.1.0",
        "fresh": "^2.0.0",
        "http-errors": "^2.0.0",
        "merge-descriptors": "^2.0.0",
        "mime-types": "^3.0.0",
        "on-finished": "^2.4.1",
        "once": "^1.4.0",
        "parseurl": "^1.3.3",
        "proxy-addr": "^2.0.7",
        "qs": "^6.14.0",
        "range-parser": "^1.2.1",
        "router": "^2.2.0",
        "send": "^1.1.0",
        "serve-static": "^2.2.0",
        "statuses": "^2.0.1",
        "type-is": "^2.0.1",
        "vary": "^1.1.2"
      },
      "engines": {
        "node": ">= 18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/extract-zip": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/extract-zip/-/extract-zip-2.0.1.tgz",
      "integrity": "sha512-GDhU9ntwuKyGXdZBUgTIe+vXnWj0fppUEtMDL0+idd5Sta8TGpHssn/eusA9mrPr9qNDym6SxAYZjNvCn/9RBg==",
      "license": "BSD-2-Clause",
      "dependencies": {
        "debug": "^4.1.1",
        "get-stream": "^5.1.0",
        "yauzl": "^2.10.0"
      },
      "bin": {
        "extract-zip": "cli.js"
      },
      "engines": {
        "node": ">= 10.17.0"
      },
      "optionalDependencies": {
        "@types/yauzl": "^2.9.1"
      }
    },
    "node_modules/fast-fifo": {
      "version": "1.3.2",
      "resolved": "https://registry.npmjs.org/fast-fifo/-/fast-fifo-1.3.2.tgz",
      "integrity": "sha512-/d9sfos4yxzpwkDkuN7k2SqFKtYNmCTzgfEpz82x34IM9/zc8KGxQoXg1liNC/izpRM/MBdt44Nmx41ZWqk+FQ==",
      "license": "MIT"
    },
    "node_modules/fast-safe-stringify": {
      "version": "2.1.1",
      "resolved": "https://registry.npmjs.org/fast-safe-stringify/-/fast-safe-stringify-2.1.1.tgz",
      "integrity": "sha512-W+KJc2dmILlPplD/H4K9l9LcAHAfPtP6BY84uVLXQ6Evcz9Lcg33Y2z1IVblT6xdY54PXYVHEv+0Wpq8Io6zkA==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/fd-slicer": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/fd-slicer/-/fd-slicer-1.1.0.tgz",
      "integrity": "sha512-cE1qsB/VwyQozZ+q1dGxR8LBYNZeofhEdUNGSMbQD3Gw2lAzX9Zb3uIU6Ebc/Fmyjo9AWWfnn0AUCHqtevs/8g==",
      "license": "MIT",
      "dependencies": {
        "pend": "~1.2.0"
      }
    },
    "node_modules/fdir": {
      "version": "6.5.0",
      "resolved": "https://registry.npmjs.org/fdir/-/fdir-6.5.0.tgz",
      "integrity": "sha512-tIbYtZbucOs0BRGqPJkshJUYdL+SDH7dVM8gjy+ERp3WAUjLEFJE+02kanyHtwjWOnwrKYBiwAmM0p4kLJAnXg==",
      "license": "MIT",
      "optional": true,
      "engines": {
        "node": ">=12.0.0"
      },
      "peerDependencies": {
        "picomatch": "^3 || ^4"
      },
      "peerDependenciesMeta": {
        "picomatch": {
          "optional": true
        }
      }
    },
    "node_modules/file-uri-to-path": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/file-uri-to-path/-/file-uri-to-path-1.0.0.tgz",
      "integrity": "sha512-0Zt+s3L7Vf1biwWZ29aARiVYLx7iMGnEUl9x33fbB/j3jR81u/O2LbqK+Bm1CDSNDKVtJ/YjwY7TUd5SkeLQLw==",
      "license": "MIT"
    },
    "node_modules/finalhandler": {
      "version": "2.1.1",
      "resolved": "https://registry.npmjs.org/finalhandler/-/finalhandler-2.1.1.tgz",
      "integrity": "sha512-S8KoZgRZN+a5rNwqTxlZZePjT/4cnm0ROV70LedRHZ0p8u9fRID0hJUZQpkKLzro8LfmC8sx23bY6tVNxv8pQA==",
      "license": "MIT",
      "dependencies": {
        "debug": "^4.4.0",
        "encodeurl": "^2.0.0",
        "escape-html": "^1.0.3",
        "on-finished": "^2.4.1",
        "parseurl": "^1.3.3",
        "statuses": "^2.0.1"
      },
      "engines": {
        "node": ">= 18.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/form-data": {
      "version": "4.0.5",
      "resolved": "https://registry.npmjs.org/form-data/-/form-data-4.0.5.tgz",
      "integrity": "sha512-8RipRLol37bNs2bhoV67fiTEvdTrbMUYcFTiy3+wuuOnUog2QBHCZWXDRijWQfAkhBj2Uf5UnVaiWwA5vdd82w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "asynckit": "^0.4.0",
        "combined-stream": "^1.0.8",
        "es-set-tostringtag": "^2.1.0",
        "hasown": "^2.0.2",
        "mime-types": "^2.1.12"
      },
      "engines": {
        "node": ">= 6"
      }
    },
    "node_modules/form-data/node_modules/mime-db": {
      "version": "1.52.0",
      "resolved": "https://registry.npmjs.org/mime-db/-/mime-db-1.52.0.tgz",
      "integrity": "sha512-sPU4uV7dYlvtWJxwwxHD0PuihVNiE7TyAbQ5SWxDCB9mUYvOgroQOwYQQOKPJ8CIbE+1ETVlOoK1UC2nU3gYvg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/form-data/node_modules/mime-types": {
      "version": "2.1.35",
      "resolved": "https://registry.npmjs.org/mime-types/-/mime-types-2.1.35.tgz",
      "integrity": "sha512-ZDY+bPm5zTTF+YpCrAU9nK0UgICYPT0QtT1NZWFv4s++TNkcgVaT0g6+4R2uI4MjQjzysHB1zxuWL50hzaeXiw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "mime-db": "1.52.0"
      },
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/formidable": {
      "version": "3.5.4",
      "resolved": "https://registry.npmjs.org/formidable/-/formidable-3.5.4.tgz",
      "integrity": "sha512-YikH+7CUTOtP44ZTnUhR7Ic2UASBPOqmaRkRKxRbywPTe5VxF7RRCck4af9wutiZ/QKM5nME9Bie2fFaPz5Gug==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@paralleldrive/cuid2": "^2.2.2",
        "dezalgo": "^1.0.4",
        "once": "^1.4.0"
      },
      "engines": {
        "node": ">=14.0.0"
      },
      "funding": {
        "url": "https://ko-fi.com/tunnckoCore/commissions"
      }
    },
    "node_modules/forwarded": {
      "version": "0.2.0",
      "resolved": "https://registry.npmjs.org/forwarded/-/forwarded-0.2.0.tgz",
      "integrity": "sha512-buRG0fpBtRHSTCOASe6hD258tEubFoRLb4ZNA6NxMVHNw2gOcwHo9wyablzMzOA5z9xA9L1KNjk/Nt6MT9aYow==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/fresh": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/fresh/-/fresh-2.0.0.tgz",
      "integrity": "sha512-Rx/WycZ60HOaqLKAi6cHRKKI7zxWbJ31MhntmtwMoaTeF7XFH9hhBp8vITaMidfljRQ6eYWCKkaTK+ykVJHP2A==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/fs-constants": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/fs-constants/-/fs-constants-1.0.0.tgz",
      "integrity": "sha512-y6OAwoSIf7FyjMIv94u+b5rdheZEjzR63GTyZJm5qh4Bi+2YgwLCcI/fPFZkL5PSixOt6ZNKm+w+Hfp/Bciwow==",
      "license": "MIT"
    },
    "node_modules/function-bind": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/function-bind/-/function-bind-1.1.2.tgz",
      "integrity": "sha512-7XHNxH7qX9xG5mIwxkhumTox/MIRNcOgDrxWsMt2pAr23WHp6MrRlN7FBSFpCpr+oVO0F744iUgR82nJMfG2SA==",
      "license": "MIT",
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/get-caller-file": {
      "version": "2.0.5",
      "resolved": "https://registry.npmjs.org/get-caller-file/-/get-caller-file-2.0.5.tgz",
      "integrity": "sha512-DyFP3BM/3YHTQOCUL/w0OZHR0lpKeGrxotcHWcqNEdnltqFwXVfhEBQ94eIo34AfQpo0rGki4cyIiftY06h2Fg==",
      "license": "ISC",
      "engines": {
        "node": "6.* || 8.* || >= 10.*"
      }
    },
    "node_modules/get-intrinsic": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/get-intrinsic/-/get-intrinsic-1.3.0.tgz",
      "integrity": "sha512-9fSjSaos/fRIVIp+xSJlE6lfwhES7LNtKaCBIamHsjr2na1BiABJPo0mOjjz8GJDURarmCPGqaiVg5mfjb98CQ==",
      "license": "MIT",
      "dependencies": {
        "call-bind-apply-helpers": "^1.0.2",
        "es-define-property": "^1.0.1",
        "es-errors": "^1.3.0",
        "es-object-atoms": "^1.1.1",
        "function-bind": "^1.1.2",
        "get-proto": "^1.0.1",
        "gopd": "^1.2.0",
        "has-symbols": "^1.1.0",
        "hasown": "^2.0.2",
        "math-intrinsics": "^1.1.0"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/get-proto": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/get-proto/-/get-proto-1.0.1.tgz",
      "integrity": "sha512-sTSfBjoXBp89JvIKIefqw7U2CCebsc74kiY6awiGogKtoSGbgjYE/G/+l9sF3MWFPNc9IcoOC4ODfKHfxFmp0g==",
      "license": "MIT",
      "dependencies": {
        "dunder-proto": "^1.0.1",
        "es-object-atoms": "^1.0.0"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/get-stream": {
      "version": "5.2.0",
      "resolved": "https://registry.npmjs.org/get-stream/-/get-stream-5.2.0.tgz",
      "integrity": "sha512-nBF+F1rAZVCu/p7rjzgA+Yb4lfYXrpl7a6VmJrU8wF9I1CKvP/QwPNZHnOlwbTkY6dvtFIzFMSyQXbLoTQPRpA==",
      "license": "MIT",
      "dependencies": {
        "pump": "^3.0.0"
      },
      "engines": {
        "node": ">=8"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/get-uri": {
      "version": "6.0.5",
      "resolved": "https://registry.npmjs.org/get-uri/-/get-uri-6.0.5.tgz",
      "integrity": "sha512-b1O07XYq8eRuVzBNgJLstU6FYc1tS6wnMtF1I1D9lE8LxZSOGZ7LhxN54yPP6mGw5f2CkXY2BQUL9Fx41qvcIg==",
      "license": "MIT",
      "dependencies": {
        "basic-ftp": "^5.0.2",
        "data-uri-to-buffer": "^6.0.2",
        "debug": "^4.3.4"
      },
      "engines": {
        "node": ">= 14"
      }
    },
    "node_modules/github-from-package": {
      "version": "0.0.0",
      "resolved": "https://registry.npmjs.org/github-from-package/-/github-from-package-0.0.0.tgz",
      "integrity": "sha512-SyHy3T1v2NUXn29OsWdxmK6RwHD+vkj3v8en8AOBZ1wBQ/hCAQ5bAQTD02kW4W9tUp/3Qh6J8r9EvntiyCmOOw==",
      "license": "MIT"
    },
    "node_modules/gopd": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/gopd/-/gopd-1.2.0.tgz",
      "integrity": "sha512-ZUKRh6/kUFoAiTAtTYPZJ3hw9wNxx+BIBOijnlG9PnrJsCcSjs1wyyD6vJpaYtgnzDrKYRSqf3OO6Rfa93xsRg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/graceful-fs": {
      "version": "4.2.11",
      "resolved": "https://registry.npmjs.org/graceful-fs/-/graceful-fs-4.2.11.tgz",
      "integrity": "sha512-RbJ5/jmFcNNCcDV5o9eTnBLJ/HszWV0P73bc+Ff4nS/rJj+YaS6IGyiOL0VoBYX+l1Wrl3k63h/KrH+nhJ0XvQ==",
      "license": "ISC",
      "optional": true
    },
    "node_modules/has-symbols": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/has-symbols/-/has-symbols-1.1.0.tgz",
      "integrity": "sha512-1cDNdwJ2Jaohmb3sg4OmKaMBwuC48sYni5HUw2DvsC8LjGTLK9h+eb1X6RyuOHe4hT0ULCW68iomhjUoKUqlPQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/has-tostringtag": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/has-tostringtag/-/has-tostringtag-1.0.2.tgz",
      "integrity": "sha512-NqADB8VjPFLM2V0VvHUewwwsw0ZWBaIdgo+ieHtK3hasLz4qeCRjYcqfB6AQrBggRKppKF8L52/VqdVsO47Dlw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "has-symbols": "^1.0.3"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/hasown": {
      "version": "2.0.3",
      "resolved": "https://registry.npmjs.org/hasown/-/hasown-2.0.3.tgz",
      "integrity": "sha512-ej4AhfhfL2Q2zpMmLo7U1Uv9+PyhIZpgQLGT1F9miIGmiCJIoCgSmczFdrc97mWT4kVY72KA+WnnhJ5pghSvSg==",
      "license": "MIT",
      "dependencies": {
        "function-bind": "^1.1.2"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/he": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/he/-/he-1.2.0.tgz",
      "integrity": "sha512-F/1DnUGPopORZi0ni+CvrCgHQ5FyEAHRLSApuYWMmrbSwoN2Mn/7k+Gl38gJnR7yyDZk6WLXwiGod1JOWNDKGw==",
      "license": "MIT",
      "bin": {
        "he": "bin/he"
      }
    },
    "node_modules/html-to-text": {
      "version": "9.0.5",
      "resolved": "https://registry.npmjs.org/html-to-text/-/html-to-text-9.0.5.tgz",
      "integrity": "sha512-qY60FjREgVZL03vJU6IfMV4GDjGBIoOyvuFdpBDIX9yTlDw0TjxVBQp+P8NvpdIXNJvfWBTNul7fsAQJq2FNpg==",
      "license": "MIT",
      "dependencies": {
        "@selderee/plugin-htmlparser2": "^0.11.0",
        "deepmerge": "^4.3.1",
        "dom-serializer": "^2.0.0",
        "htmlparser2": "^8.0.2",
        "selderee": "^0.11.0"
      },
      "engines": {
        "node": ">=14"
      }
    },
    "node_modules/htmlparser2": {
      "version": "8.0.2",
      "resolved": "https://registry.npmjs.org/htmlparser2/-/htmlparser2-8.0.2.tgz",
      "integrity": "sha512-GYdjWKDkbRLkZ5geuHs5NY1puJ+PXwP7+fHPRz06Eirsb9ugf6d8kkXav6ADhcODhFFPMIXyxkxSuMf3D6NCFA==",
      "funding": [
        "https://github.com/fb55/htmlparser2?sponsor=1",
        {
          "type": "github",
          "url": "https://github.com/sponsors/fb55"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "domelementtype": "^2.3.0",
        "domhandler": "^5.0.3",
        "domutils": "^3.0.1",
        "entities": "^4.4.0"
      }
    },
    "node_modules/http-errors": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/http-errors/-/http-errors-2.0.1.tgz",
      "integrity": "sha512-4FbRdAX+bSdmo4AUFuS0WNiPz8NgFt+r8ThgNWmlrjQjt1Q7ZR9+zTlce2859x4KSXrwIsaeTqDoKQmtP8pLmQ==",
      "license": "MIT",
      "dependencies": {
        "depd": "~2.0.0",
        "inherits": "~2.0.4",
        "setprototypeof": "~1.2.0",
        "statuses": "~2.0.2",
        "toidentifier": "~1.0.1"
      },
      "engines": {
        "node": ">= 0.8"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/http-proxy-agent": {
      "version": "7.0.2",
      "resolved": "https://registry.npmjs.org/http-proxy-agent/-/http-proxy-agent-7.0.2.tgz",
      "integrity": "sha512-T1gkAiYYDWYx3V5Bmyu7HcfcvL7mUrTWiM6yOfa3PIphViJ/gFPbvidQ+veqSOHci/PxBcDabeUNCzpOODJZig==",
      "license": "MIT",
      "dependencies": {
        "agent-base": "^7.1.0",
        "debug": "^4.3.4"
      },
      "engines": {
        "node": ">= 14"
      }
    },
    "node_modules/https-proxy-agent": {
      "version": "7.0.6",
      "resolved": "https://registry.npmjs.org/https-proxy-agent/-/https-proxy-agent-7.0.6.tgz",
      "integrity": "sha512-vK9P5/iUfdl95AI+JVyUuIcVtd4ofvtrOr3HNtM2yxC9bnMbEdp3x01OhQNnjb8IJYi38VlTE3mBXwcfvywuSw==",
      "license": "MIT",
      "dependencies": {
        "agent-base": "^7.1.2",
        "debug": "4"
      },
      "engines": {
        "node": ">= 14"
      }
    },
    "node_modules/iconv-lite": {
      "version": "0.7.2",
      "resolved": "https://registry.npmjs.org/iconv-lite/-/iconv-lite-0.7.2.tgz",
      "integrity": "sha512-im9DjEDQ55s9fL4EYzOAv0yMqmMBSZp6G0VvFyTMPKWxiSBHUj9NW/qqLmXUwXrrM7AvqSlTCfvqRb0cM8yYqw==",
      "license": "MIT",
      "dependencies": {
        "safer-buffer": ">= 2.1.2 < 3.0.0"
      },
      "engines": {
        "node": ">=0.10.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/ieee754": {
      "version": "1.2.1",
      "resolved": "https://registry.npmjs.org/ieee754/-/ieee754-1.2.1.tgz",
      "integrity": "sha512-dcyqhDvX1C46lXZcVqCpK+FtMRQVdIMN6/Df5js2zouUsqG7I6sFxitIC+7KYK29KdXOLHdu9zL4sFnoVQnqaA==",
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/feross"
        },
        {
          "type": "patreon",
          "url": "https://www.patreon.com/feross"
        },
        {
          "type": "consulting",
          "url": "https://feross.org/support"
        }
      ],
      "license": "BSD-3-Clause"
    },
    "node_modules/imap": {
      "version": "0.8.19",
      "resolved": "https://registry.npmjs.org/imap/-/imap-0.8.19.tgz",
      "integrity": "sha512-z5DxEA1uRnZG73UcPA4ES5NSCGnPuuouUx43OPX7KZx1yzq3N8/vx2mtXEShT5inxB3pRgnfG1hijfu7XN2YMw==",
      "dependencies": {
        "readable-stream": "1.1.x",
        "utf7": ">=1.0.2"
      },
      "engines": {
        "node": ">=0.8.0"
      }
    },
    "node_modules/imap/node_modules/readable-stream": {
      "version": "1.1.14",
      "resolved": "https://registry.npmjs.org/readable-stream/-/readable-stream-1.1.14.tgz",
      "integrity": "sha512-+MeVjFf4L44XUkhM1eYbD8fyEsxcV81pqMSR5gblfcLCHfZvbrqy4/qYHE+/R5HoBUT11WV5O08Cr1n3YXkWVQ==",
      "license": "MIT",
      "dependencies": {
        "core-util-is": "~1.0.0",
        "inherits": "~2.0.1",
        "isarray": "0.0.1",
        "string_decoder": "~0.10.x"
      }
    },
    "node_modules/imap/node_modules/string_decoder": {
      "version": "0.10.31",
      "resolved": "https://registry.npmjs.org/string_decoder/-/string_decoder-0.10.31.tgz",
      "integrity": "sha512-ev2QzSzWPYmy9GuqfIVildA4OdcGLeFZQrq5ys6RtiuF+RQQiZWr8TZNyAcuVXyQRYfEO+MsoB/1BuQVhOJuoQ==",
      "license": "MIT"
    },
    "node_modules/import-fresh": {
      "version": "3.3.1",
      "resolved": "https://registry.npmjs.org/import-fresh/-/import-fresh-3.3.1.tgz",
      "integrity": "sha512-TR3KfrTZTYLPB6jUjfx6MF9WcWrHL9su5TObK4ZkYgBdWKPOFoSoQIdEuTuR82pmtxH2spWG9h6etwfr1pLBqQ==",
      "license": "MIT",
      "dependencies": {
        "parent-module": "^1.0.0",
        "resolve-from": "^4.0.0"
      },
      "engines": {
        "node": ">=6"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/inherits": {
      "version": "2.0.4",
      "resolved": "https://registry.npmjs.org/inherits/-/inherits-2.0.4.tgz",
      "integrity": "sha512-k/vGaX4/Yla3WzyMCvTQOXYeIHvqOKtnqBduzTHpzpQZzAskKMhZ2K+EnBiSM9zGSoIFeMpXKxa4dYeZIQqewQ==",
      "license": "ISC"
    },
    "node_modules/ini": {
      "version": "1.3.8",
      "resolved": "https://registry.npmjs.org/ini/-/ini-1.3.8.tgz",
      "integrity": "sha512-JV/yugV2uzW5iMRSiZAyDtQd+nxtUnjeLt0acNdw98kKLrvuRVyB80tsREOE7yvGVgalhZ6RNXCmEHkUKBKxew==",
      "license": "ISC"
    },
    "node_modules/ip-address": {
      "version": "10.2.0",
      "resolved": "https://registry.npmjs.org/ip-address/-/ip-address-10.2.0.tgz",
      "integrity": "sha512-/+S6j4E9AHvW9SWMSEY9Xfy66O5PWvVEJ08O0y5JGyEKQpojb0K0GKpz/v5HJ/G0vi3D2sjGK78119oXZeE0qA==",
      "license": "MIT",
      "engines": {
        "node": ">= 12"
      }
    },
    "node_modules/ipaddr.js": {
      "version": "1.9.1",
      "resolved": "https://registry.npmjs.org/ipaddr.js/-/ipaddr.js-1.9.1.tgz",
      "integrity": "sha512-0KI/607xoxSToH7GjN1FfSbLoU0+btTicjsQSWQlh/hZykN8KpmMf7uYwPW3R+akZ6R/w18ZlXSHBYXiYUPO3g==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.10"
      }
    },
    "node_modules/is-arrayish": {
      "version": "0.2.1",
      "resolved": "https://registry.npmjs.org/is-arrayish/-/is-arrayish-0.2.1.tgz",
      "integrity": "sha512-zz06S8t0ozoDXMG+ube26zeCTNXcKIPJZJi8hBrF4idCLms4CG9QtK7qBl1boi5ODzFpjswb5JPmHCbMpjaYzg==",
      "license": "MIT"
    },
    "node_modules/is-fullwidth-code-point": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/is-fullwidth-code-point/-/is-fullwidth-code-point-3.0.0.tgz",
      "integrity": "sha512-zymm5+u+sCsSWyD9qNaejV3DFvhCKclKdizYaJUuHA83RLjb7nSuGnddCHGv0hk+KY7BMAlsWeK4Ueg6EV6XQg==",
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/is-promise": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/is-promise/-/is-promise-4.0.0.tgz",
      "integrity": "sha512-hvpoI6korhJMnej285dSg6nu1+e6uxs7zG3BYAm5byqDsgJNWwxzM6z6iZiAgQR4TJ30JmBTOwqZUw3WlyH3AQ==",
      "license": "MIT"
    },
    "node_modules/isarray": {
      "version": "0.0.1",
      "resolved": "https://registry.npmjs.org/isarray/-/isarray-0.0.1.tgz",
      "integrity": "sha512-D2S+3GLxWH+uhrNEcoh/fnmYeP8E8/zHl644d/jdA0g2uyXvy3sb0qxotE+ne0LtccHknQzWwZEzhak7oJ0COQ==",
      "license": "MIT"
    },
    "node_modules/isexe": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/isexe/-/isexe-4.0.0.tgz",
      "integrity": "sha512-FFUtZMpoZ8RqHS3XeXEmHWLA4thH+ZxCv2lOiPIn1Xc7CxrqhWzNSDzD+/chS/zbYezmiwWLdQC09JdQKmthOw==",
      "license": "BlueOak-1.0.0",
      "optional": true,
      "engines": {
        "node": ">=20"
      }
    },
    "node_modules/js-tokens": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/js-tokens/-/js-tokens-4.0.0.tgz",
      "integrity": "sha512-RdJUflcE3cUzKiMqQgsCu06FPu9UdIJO0beYbPhHN4k6apgJtifcoCtT9bcxOpYBtpD2kCM6Sbzg4CausW/PKQ==",
      "license": "MIT"
    },
    "node_modules/js-yaml": {
      "version": "4.1.1",
      "resolved": "https://registry.npmjs.org/js-yaml/-/js-yaml-4.1.1.tgz",
      "integrity": "sha512-qQKT4zQxXl8lLwBtHMWwaTcGfFOZviOJet3Oy/xmGk2gZH677CJM9EvtfdSkgWcATZhj/55JZ0rmy3myCT5lsA==",
      "license": "MIT",
      "dependencies": {
        "argparse": "^2.0.1"
      },
      "bin": {
        "js-yaml": "bin/js-yaml.js"
      }
    },
    "node_modules/json-parse-even-better-errors": {
      "version": "2.3.1",
      "resolved": "https://registry.npmjs.org/json-parse-even-better-errors/-/json-parse-even-better-errors-2.3.1.tgz",
      "integrity": "sha512-xyFwyhro/JEof6Ghe2iz2NcXoj2sloNsWr/XsERDK/oiPCfaNhl5ONfp+jQdAZRQQ0IJWNzH9zIZF7li91kh2w==",
      "license": "MIT"
    },
    "node_modules/jsonwebtoken": {
      "version": "9.0.3",
      "resolved": "https://registry.npmjs.org/jsonwebtoken/-/jsonwebtoken-9.0.3.tgz",
      "integrity": "sha512-MT/xP0CrubFRNLNKvxJ2BYfy53Zkm++5bX9dtuPbqAeQpTVe0MQTFhao8+Cp//EmJp244xt6Drw/GVEGCUj40g==",
      "license": "MIT",
      "dependencies": {
        "jws": "^4.0.1",
        "lodash.includes": "^4.3.0",
        "lodash.isboolean": "^3.0.3",
        "lodash.isinteger": "^4.0.4",
        "lodash.isnumber": "^3.0.3",
        "lodash.isplainobject": "^4.0.6",
        "lodash.isstring": "^4.0.1",
        "lodash.once": "^4.0.0",
        "ms": "^2.1.1",
        "semver": "^7.5.4"
      },
      "engines": {
        "node": ">=12",
        "npm": ">=6"
      }
    },
    "node_modules/jwa": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/jwa/-/jwa-2.0.1.tgz",
      "integrity": "sha512-hRF04fqJIP8Abbkq5NKGN0Bbr3JxlQ+qhZufXVr0DvujKy93ZCbXZMHDL4EOtodSbCWxOqR8MS1tXA5hwqCXDg==",
      "license": "MIT",
      "dependencies": {
        "buffer-equal-constant-time": "^1.0.1",
        "ecdsa-sig-formatter": "1.0.11",
        "safe-buffer": "^5.0.1"
      }
    },
    "node_modules/jws": {
      "version": "4.0.1",
      "resolved": "https://registry.npmjs.org/jws/-/jws-4.0.1.tgz",
      "integrity": "sha512-EKI/M/yqPncGUUh44xz0PxSidXFr/+r0pA70+gIYhjv+et7yxM+s29Y+VGDkovRofQem0fs7Uvf4+YmAdyRduA==",
      "license": "MIT",
      "dependencies": {
        "jwa": "^2.0.1",
        "safe-buffer": "^5.0.1"
      }
    },
    "node_modules/leac": {
      "version": "0.6.0",
      "resolved": "https://registry.npmjs.org/leac/-/leac-0.6.0.tgz",
      "integrity": "sha512-y+SqErxb8h7nE/fiEX07jsbuhrpO9lL8eca7/Y1nuWV2moNlXhyd59iDGcRf6moVyDMbmTNzL40SUyrFU/yDpg==",
      "license": "MIT",
      "funding": {
        "url": "https://ko-fi.com/killymxi"
      }
    },
    "node_modules/libbase64": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/libbase64/-/libbase64-1.3.0.tgz",
      "integrity": "sha512-GgOXd0Eo6phYgh0DJtjQ2tO8dc0IVINtZJeARPeiIJqge+HdsWSuaDTe8ztQ7j/cONByDZ3zeB325AHiv5O0dg==",
      "license": "MIT"
    },
    "node_modules/libmime": {
      "version": "5.3.8",
      "resolved": "https://registry.npmjs.org/libmime/-/libmime-5.3.8.tgz",
      "integrity": "sha512-ZrCY+Q66mPvasAfjsQ/IgahzoBvfE1VdtGRpo1hwRB1oK3wJKxhKA3GOcd2a6j7AH5eMFccxK9fBoCpRZTf8ng==",
      "license": "MIT",
      "dependencies": {
        "encoding-japanese": "2.2.0",
        "iconv-lite": "0.7.2",
        "libbase64": "1.3.0",
        "libqp": "2.1.1"
      }
    },
    "node_modules/libqp": {
      "version": "2.1.1",
      "resolved": "https://registry.npmjs.org/libqp/-/libqp-2.1.1.tgz",
      "integrity": "sha512-0Wd+GPz1O134cP62YU2GTOPNA7Qgl09XwCqM5zpBv87ERCXdfDtyKXvV7c9U22yWJh44QZqBocFnXN11K96qow==",
      "license": "MIT"
    },
    "node_modules/lines-and-columns": {
      "version": "1.2.4",
      "resolved": "https://registry.npmjs.org/lines-and-columns/-/lines-and-columns-1.2.4.tgz",
      "integrity": "sha512-7ylylesZQ/PV29jhEDl3Ufjo6ZX7gCqJr5F7PKrqc93v7fzSymt1BpwEU8nAUXs8qzzvqhbjhK5QZg6Mt/HkBg==",
      "license": "MIT"
    },
    "node_modules/linkify-it": {
      "version": "5.0.0",
      "resolved": "https://registry.npmjs.org/linkify-it/-/linkify-it-5.0.0.tgz",
      "integrity": "sha512-5aHCbzQRADcdP+ATqnDuhhJ/MRIqDkZX5pyjFHRRysS8vZ5AbqGEoFIb6pYHPZ+L/OC2Lc+xT8uHVVR5CAK/wQ==",
      "license": "MIT",
      "dependencies": {
        "uc.micro": "^2.0.0"
      }
    },
    "node_modules/lodash.includes": {
      "version": "4.3.0",
      "resolved": "https://registry.npmjs.org/lodash.includes/-/lodash.includes-4.3.0.tgz",
      "integrity": "sha512-W3Bx6mdkRTGtlJISOvVD/lbqjTlPPUDTMnlXZFnVwi9NKJ6tiAk6LVdlhZMm17VZisqhKcgzpO5Wz91PCt5b0w==",
      "license": "MIT"
    },
    "node_modules/lodash.isboolean": {
      "version": "3.0.3",
      "resolved": "https://registry.npmjs.org/lodash.isboolean/-/lodash.isboolean-3.0.3.tgz",
      "integrity": "sha512-Bz5mupy2SVbPHURB98VAcw+aHh4vRV5IPNhILUCsOzRmsTmSQ17jIuqopAentWoehktxGd9e/hbIXq980/1QJg==",
      "license": "MIT"
    },
    "node_modules/lodash.isinteger": {
      "version": "4.0.4",
      "resolved": "https://registry.npmjs.org/lodash.isinteger/-/lodash.isinteger-4.0.4.tgz",
      "integrity": "sha512-DBwtEWN2caHQ9/imiNeEA5ys1JoRtRfY3d7V9wkqtbycnAmTvRRmbHKDV4a0EYc678/dia0jrte4tjYwVBaZUA==",
      "license": "MIT"
    },
    "node_modules/lodash.isnumber": {
      "version": "3.0.3",
      "resolved": "https://registry.npmjs.org/lodash.isnumber/-/lodash.isnumber-3.0.3.tgz",
      "integrity": "sha512-QYqzpfwO3/CWf3XP+Z+tkQsfaLL/EnUlXWVkIk5FUPc4sBdTehEqZONuyRt2P67PXAk+NXmTBcc97zw9t1FQrw==",
      "license": "MIT"
    },
    "node_modules/lodash.isplainobject": {
      "version": "4.0.6",
      "resolved": "https://registry.npmjs.org/lodash.isplainobject/-/lodash.isplainobject-4.0.6.tgz",
      "integrity": "sha512-oSXzaWypCMHkPC3NvBEaPHf0KsA5mvPrOPgQWDsbg8n7orZ290M0BmC/jgRZ4vcJ6DTAhjrsSYgdsW/F+MFOBA==",
      "license": "MIT"
    },
    "node_modules/lodash.isstring": {
      "version": "4.0.1",
      "resolved": "https://registry.npmjs.org/lodash.isstring/-/lodash.isstring-4.0.1.tgz",
      "integrity": "sha512-0wJxfxH1wgO3GrbuP+dTTk7op+6L41QCXbGINEmD+ny/G/eCqGzxyCsh7159S+mgDDcoarnBw6PC1PS5+wUGgw==",
      "license": "MIT"
    },
    "node_modules/lodash.once": {
      "version": "4.1.1",
      "resolved": "https://registry.npmjs.org/lodash.once/-/lodash.once-4.1.1.tgz",
      "integrity": "sha512-Sb487aTOCr9drQVL8pIxOzVhafOjZN9UU54hiN8PU3uAiSV7lx1yYNpbNmex2PK6dSJoNTSJUUswT651yww3Mg==",
      "license": "MIT"
    },
    "node_modules/lru-cache": {
      "version": "7.18.3",
      "resolved": "https://registry.npmjs.org/lru-cache/-/lru-cache-7.18.3.tgz",
      "integrity": "sha512-jumlc0BIUrS3qJGgIkWZsyfAM7NCWiBcCDhnd+3NNM5KbBmLTgHVfWBcg6W+rLUsIpzpERPsvwUP7CckAQSOoA==",
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/mailparser": {
      "version": "3.9.8",
      "resolved": "https://registry.npmjs.org/mailparser/-/mailparser-3.9.8.tgz",
      "integrity": "sha512-7jSlFGXiianVnhnb6wdutJFloD34488nrHY7r6FNqwXAhZ7YiJDYrKKTxZJ0oSrXcAPHm8YoYnh97xyGtrBQ3w==",
      "license": "MIT",
      "dependencies": {
        "@zone-eu/mailsplit": "5.4.8",
        "encoding-japanese": "2.2.0",
        "he": "1.2.0",
        "html-to-text": "9.0.5",
        "iconv-lite": "0.7.2",
        "libmime": "5.3.8",
        "linkify-it": "5.0.0",
        "nodemailer": "8.0.5",
        "punycode.js": "2.3.1",
        "tlds": "1.261.0"
      }
    },
    "node_modules/math-intrinsics": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/math-intrinsics/-/math-intrinsics-1.1.0.tgz",
      "integrity": "sha512-/IXtbwEk5HTPyEwyKX6hGkYXxM9nbj64B+ilVJnC/R6B0pH5G4V3b0pVbL7DBj4tkhBAppbQUlf6F6Xl9LHu1g==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/media-typer": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/media-typer/-/media-typer-1.1.0.tgz",
      "integrity": "sha512-aisnrDP4GNe06UcKFnV5bfMNPBUw4jsLGaWwWfnH3v02GnBuXX2MCVn5RbrWo0j3pczUilYblq7fQ7Nw2t5XKw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/merge-descriptors": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/merge-descriptors/-/merge-descriptors-2.0.0.tgz",
      "integrity": "sha512-Snk314V5ayFLhp3fkUREub6WtjBfPdCPY1Ln8/8munuLuiYhsABgBVWsozAG+MWMbVEvcdcpbi9R7ww22l9Q3g==",
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/methods": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/methods/-/methods-1.1.2.tgz",
      "integrity": "sha512-iclAHeNqNm68zFtnZ0e+1L2yUIdvzNoauKU4WBA3VvH/vPFieF7qfRlwUZU+DA9P9bPXIS90ulxoUoCH23sV2w==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/mime": {
      "version": "2.6.0",
      "resolved": "https://registry.npmjs.org/mime/-/mime-2.6.0.tgz",
      "integrity": "sha512-USPkMeET31rOMiarsBNIHZKLGgvKc/LrjofAnBlOttf5ajRvqiRA8QsenbcooctK6d6Ts6aqZXBA+XbkKthiQg==",
      "dev": true,
      "license": "MIT",
      "bin": {
        "mime": "cli.js"
      },
      "engines": {
        "node": ">=4.0.0"
      }
    },
    "node_modules/mime-db": {
      "version": "1.54.0",
      "resolved": "https://registry.npmjs.org/mime-db/-/mime-db-1.54.0.tgz",
      "integrity": "sha512-aU5EJuIN2WDemCcAp2vFBfp/m4EAhWJnUNSSw0ixs7/kXbd6Pg64EmwJkNdFhB8aWt1sH2CTXrLxo/iAGV3oPQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/mime-types": {
      "version": "3.0.2",
      "resolved": "https://registry.npmjs.org/mime-types/-/mime-types-3.0.2.tgz",
      "integrity": "sha512-Lbgzdk0h4juoQ9fCKXW4by0UJqj+nOOrI9MJ1sSj4nI8aI2eo1qmvQEie4VD1glsS250n15LsWsYtCugiStS5A==",
      "license": "MIT",
      "dependencies": {
        "mime-db": "^1.54.0"
      },
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/mimic-response": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/mimic-response/-/mimic-response-3.1.0.tgz",
      "integrity": "sha512-z0yWI+4FDrrweS8Zmt4Ej5HdJmky15+L2e6Wgn3+iK5fWzb6T3fhNFq2+MeTRb064c6Wr4N/wv0DzQTjNzHNGQ==",
      "license": "MIT",
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/minimist": {
      "version": "1.2.8",
      "resolved": "https://registry.npmjs.org/minimist/-/minimist-1.2.8.tgz",
      "integrity": "sha512-2yyAR8qBkN3YuheJanUpWC5U3bb5osDywNB8RzDVlDwDHbocAJveqqj1u8+SVD7jkWT4yvsHCpWqqWqAxb0zCA==",
      "license": "MIT",
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/minipass": {
      "version": "7.1.3",
      "resolved": "https://registry.npmjs.org/minipass/-/minipass-7.1.3.tgz",
      "integrity": "sha512-tEBHqDnIoM/1rXME1zgka9g6Q2lcoCkxHLuc7ODJ5BxbP5d4c2Z5cGgtXAku59200Cx7diuHTOYfSBD8n6mm8A==",
      "license": "BlueOak-1.0.0",
      "engines": {
        "node": ">=16 || 14 >=14.17"
      }
    },
    "node_modules/minizlib": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/minizlib/-/minizlib-3.1.0.tgz",
      "integrity": "sha512-KZxYo1BUkWD2TVFLr0MQoM8vUUigWD3LlD83a/75BqC+4qE0Hb1Vo5v1FgcfaNXvfXzr+5EhQ6ing/CaBijTlw==",
      "license": "MIT",
      "dependencies": {
        "minipass": "^7.1.2"
      },
      "engines": {
        "node": ">= 18"
      }
    },
    "node_modules/mitt": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/mitt/-/mitt-3.0.1.tgz",
      "integrity": "sha512-vKivATfr97l2/QBCYAkXYDbrIWPM2IIKEl7YPhjCvKlG3kE2gm+uBo6nEXK3M5/Ffh/FLpKExzOQ3JJoJGFKBw==",
      "license": "MIT"
    },
    "node_modules/mkdirp-classic": {
      "version": "0.5.3",
      "resolved": "https://registry.npmjs.org/mkdirp-classic/-/mkdirp-classic-0.5.3.tgz",
      "integrity": "sha512-gKLcREMhtuZRwRAfqP3RFW+TK4JqApVBtOIftVgjuABpAtpxhPGaDcfvbhNvD0B8iD1oUr/txX35NjcaY6Ns/A==",
      "license": "MIT"
    },
    "node_modules/ms": {
      "version": "2.1.3",
      "resolved": "https://registry.npmjs.org/ms/-/ms-2.1.3.tgz",
      "integrity": "sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==",
      "license": "MIT"
    },
    "node_modules/napi-build-utils": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/napi-build-utils/-/napi-build-utils-2.0.0.tgz",
      "integrity": "sha512-GEbrYkbfF7MoNaoh2iGG84Mnf/WZfB0GdGEsM8wz7Expx/LlWf5U8t9nvJKXSp3qr5IsEbK04cBGhol/KwOsWA==",
      "license": "MIT"
    },
    "node_modules/negotiator": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/negotiator/-/negotiator-1.0.0.tgz",
      "integrity": "sha512-8Ofs/AUQh8MaEcrlq5xOX0CQ9ypTF5dl78mjlMNfOK08fzpgTHQRQPBxcPlEtIw0yRpws+Zo/3r+5WRby7u3Gg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/netmask": {
      "version": "2.1.1",
      "resolved": "https://registry.npmjs.org/netmask/-/netmask-2.1.1.tgz",
      "integrity": "sha512-eonl3sLUha+S1GzTPxychyhnUzKyeQkZ7jLjKrBagJgPla13F+uQ71HgpFefyHgqrjEbCPkDArxYsjY8/+gLKA==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4.0"
      }
    },
    "node_modules/node-abi": {
      "version": "3.92.0",
      "resolved": "https://registry.npmjs.org/node-abi/-/node-abi-3.92.0.tgz",
      "integrity": "sha512-KdHvFWZjEKDf0cakgFjebl371GPsISX2oZHcuyKqM7DtogIsHrqKeLTo8wBHxaXRAQlY2PsPlZmfo+9ZCxEREQ==",
      "license": "MIT",
      "dependencies": {
        "semver": "^7.3.5"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/node-addon-api": {
      "version": "8.7.0",
      "resolved": "https://registry.npmjs.org/node-addon-api/-/node-addon-api-8.7.0.tgz",
      "integrity": "sha512-9MdFxmkKaOYVTV+XVRG8ArDwwQ77XIgIPyKASB1k3JPq3M8fGQQQE3YpMOrKm6g//Ktx8ivZr8xo1Qmtqub+GA==",
      "license": "MIT",
      "engines": {
        "node": "^18 || ^20 || >= 21"
      }
    },
    "node_modules/node-gyp": {
      "version": "12.3.0",
      "resolved": "https://registry.npmjs.org/node-gyp/-/node-gyp-12.3.0.tgz",
      "integrity": "sha512-QNcUWM+HgJplcPzBvFBZ9VXacyGZ4+VTOb80PwWR+TlVzoHbRKULNEzpRsnaoxG3Wzr7Qh7BYxGDU3CbKib2Yg==",
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "env-paths": "^2.2.0",
        "exponential-backoff": "^3.1.1",
        "graceful-fs": "^4.2.6",
        "nopt": "^9.0.0",
        "proc-log": "^6.0.0",
        "semver": "^7.3.5",
        "tar": "^7.5.4",
        "tinyglobby": "^0.2.12",
        "undici": "^6.25.0",
        "which": "^6.0.0"
      },
      "bin": {
        "node-gyp": "bin/node-gyp.js"
      },
      "engines": {
        "node": "^20.17.0 || >=22.9.0"
      }
    },
    "node_modules/node-gyp-build": {
      "version": "4.8.4",
      "resolved": "https://registry.npmjs.org/node-gyp-build/-/node-gyp-build-4.8.4.tgz",
      "integrity": "sha512-LA4ZjwlnUblHVgq0oBF3Jl/6h/Nvs5fzBLwdEF4nuxnFdsfajde4WfxtJr3CaiH+F6ewcIB/q4jQ4UzPyid+CQ==",
      "license": "MIT",
      "bin": {
        "node-gyp-build": "bin.js",
        "node-gyp-build-optional": "optional.js",
        "node-gyp-build-test": "build-test.js"
      }
    },
    "node_modules/nodemailer": {
      "version": "8.0.5",
      "resolved": "https://registry.npmjs.org/nodemailer/-/nodemailer-8.0.5.tgz",
      "integrity": "sha512-0PF8Yb1yZuQfQbq+5/pZJrtF6WQcjTd5/S4JOHs9PGFxuTqoB/icwuB44pOdURHJbRKX1PPoJZtY7R4VUoCC8w==",
      "license": "MIT-0",
      "engines": {
        "node": ">=6.0.0"
      }
    },
    "node_modules/nopt": {
      "version": "9.0.0",
      "resolved": "https://registry.npmjs.org/nopt/-/nopt-9.0.0.tgz",
      "integrity": "sha512-Zhq3a+yFKrYwSBluL4H9XP3m3y5uvQkB/09CwDruCiRmR/UJYnn9W4R48ry0uGC70aeTPKLynBtscP9efFFcPw==",
      "license": "ISC",
      "optional": true,
      "dependencies": {
        "abbrev": "^4.0.0"
      },
      "bin": {
        "nopt": "bin/nopt.js"
      },
      "engines": {
        "node": "^20.17.0 || >=22.9.0"
      }
    },
    "node_modules/object-assign": {
      "version": "4.1.1",
      "resolved": "https://registry.npmjs.org/object-assign/-/object-assign-4.1.1.tgz",
      "integrity": "sha512-rJgTQnkUnH1sFw8yT6VSU3zD3sWmu6sZhIseY8VX+GRu3P6F7Fu+JNDoXfklElbLJSnc3FUQHVe4cU5hj+BcUg==",
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/object-inspect": {
      "version": "1.13.4",
      "resolved": "https://registry.npmjs.org/object-inspect/-/object-inspect-1.13.4.tgz",
      "integrity": "sha512-W67iLl4J2EXEGTbfeHCffrjDfitvLANg0UlX3wFUUSTx92KXRFegMHUVgSqE+wvhAbi4WqjGg9czysTV2Epbew==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/on-finished": {
      "version": "2.4.1",
      "resolved": "https://registry.npmjs.org/on-finished/-/on-finished-2.4.1.tgz",
      "integrity": "sha512-oVlzkg3ENAhCk2zdv7IJwd/QUD4z2RxRwpkcGY8psCVcCYZNq4wYnVWALHM+brtuJjePWiYF/ClmuDr8Ch5+kg==",
      "license": "MIT",
      "dependencies": {
        "ee-first": "1.1.1"
      },
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/once": {
      "version": "1.4.0",
      "resolved": "https://registry.npmjs.org/once/-/once-1.4.0.tgz",
      "integrity": "sha512-lNaJgI+2Q5URQBkccEKHTQOPaXdUxnZZElQTZY0MFUAuaEqe1E+Nyvgdz/aIyNi6Z9MzO5dv1H8n58/GELp3+w==",
      "license": "ISC",
      "dependencies": {
        "wrappy": "1"
      }
    },
    "node_modules/pac-proxy-agent": {
      "version": "7.2.0",
      "resolved": "https://registry.npmjs.org/pac-proxy-agent/-/pac-proxy-agent-7.2.0.tgz",
      "integrity": "sha512-TEB8ESquiLMc0lV8vcd5Ql/JAKAoyzHFXaStwjkzpOpC5Yv+pIzLfHvjTSdf3vpa2bMiUQrg9i6276yn8666aA==",
      "license": "MIT",
      "dependencies": {
        "@tootallnate/quickjs-emscripten": "^0.23.0",
        "agent-base": "^7.1.2",
        "debug": "^4.3.4",
        "get-uri": "^6.0.1",
        "http-proxy-agent": "^7.0.0",
        "https-proxy-agent": "^7.0.6",
        "pac-resolver": "^7.0.1",
        "socks-proxy-agent": "^8.0.5"
      },
      "engines": {
        "node": ">= 14"
      }
    },
    "node_modules/pac-resolver": {
      "version": "7.0.1",
      "resolved": "https://registry.npmjs.org/pac-resolver/-/pac-resolver-7.0.1.tgz",
      "integrity": "sha512-5NPgf87AT2STgwa2ntRMr45jTKrYBGkVU36yT0ig/n/GMAa3oPqhZfIQ2kMEimReg0+t9kZViDVZ83qfVUlckg==",
      "license": "MIT",
      "dependencies": {
        "degenerator": "^5.0.0",
        "netmask": "^2.0.2"
      },
      "engines": {
        "node": ">= 14"
      }
    },
    "node_modules/parent-module": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/parent-module/-/parent-module-1.0.1.tgz",
      "integrity": "sha512-GQ2EWRpQV8/o+Aw8YqtfZZPfNRWZYkbidE9k5rpl/hC3vtHHBfGm2Ifi6qWV+coDGkrUKZAxE3Lot5kcsRlh+g==",
      "license": "MIT",
      "dependencies": {
        "callsites": "^3.0.0"
      },
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/parse-json": {
      "version": "5.2.0",
      "resolved": "https://registry.npmjs.org/parse-json/-/parse-json-5.2.0.tgz",
      "integrity": "sha512-ayCKvm/phCGxOkYRSCM82iDwct8/EonSEgCSxWxD7ve6jHggsFl4fZVQBPRNgQoKiuV/odhFrGzQXZwbifC8Rg==",
      "license": "MIT",
      "dependencies": {
        "@babel/code-frame": "^7.0.0",
        "error-ex": "^1.3.1",
        "json-parse-even-better-errors": "^2.3.0",
        "lines-and-columns": "^1.1.6"
      },
      "engines": {
        "node": ">=8"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/parseley": {
      "version": "0.12.1",
      "resolved": "https://registry.npmjs.org/parseley/-/parseley-0.12.1.tgz",
      "integrity": "sha512-e6qHKe3a9HWr0oMRVDTRhKce+bRO8VGQR3NyVwcjwrbhMmFCX9KszEV35+rn4AdilFAq9VPxP/Fe1wC9Qjd2lw==",
      "license": "MIT",
      "dependencies": {
        "leac": "^0.6.0",
        "peberminta": "^0.9.0"
      },
      "funding": {
        "url": "https://ko-fi.com/killymxi"
      }
    },
    "node_modules/parseurl": {
      "version": "1.3.3",
      "resolved": "https://registry.npmjs.org/parseurl/-/parseurl-1.3.3.tgz",
      "integrity": "sha512-CiyeOxFT/JZyN5m0z9PfXw4SCBJ6Sygz1Dpl0wqjlhDEGGBP1GnsUVEL0p63hoG1fcj3fHynXi9NYO4nWOL+qQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/path-to-regexp": {
      "version": "8.4.2",
      "resolved": "https://registry.npmjs.org/path-to-regexp/-/path-to-regexp-8.4.2.tgz",
      "integrity": "sha512-qRcuIdP69NPm4qbACK+aDogI5CBDMi1jKe0ry5rSQJz8JVLsC7jV8XpiJjGRLLol3N+R5ihGYcrPLTno6pAdBA==",
      "license": "MIT",
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/peberminta": {
      "version": "0.9.0",
      "resolved": "https://registry.npmjs.org/peberminta/-/peberminta-0.9.0.tgz",
      "integrity": "sha512-XIxfHpEuSJbITd1H3EeQwpcZbTLHc+VVr8ANI9t5sit565tsI4/xK3KWTUFE2e6QiangUkh3B0jihzmGnNrRsQ==",
      "license": "MIT",
      "funding": {
        "url": "https://ko-fi.com/killymxi"
      }
    },
    "node_modules/pend": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/pend/-/pend-1.2.0.tgz",
      "integrity": "sha512-F3asv42UuXchdzt+xXqfW1OGlVBe+mxa2mqI0pg5yAHZPvFmY3Y6drSf/GQ1A86WgWEN9Kzh/WrgKa6iGcHXLg==",
      "license": "MIT"
    },
    "node_modules/picocolors": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz",
      "integrity": "sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==",
      "license": "ISC"
    },
    "node_modules/picomatch": {
      "version": "4.0.4",
      "resolved": "https://registry.npmjs.org/picomatch/-/picomatch-4.0.4.tgz",
      "integrity": "sha512-QP88BAKvMam/3NxH6vj2o21R6MjxZUAd6nlwAS/pnGvN9IVLocLHxGYIzFhg6fUQ+5th6P4dv4eW9jX3DSIj7A==",
      "license": "MIT",
      "optional": true,
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://github.com/sponsors/jonschlinkert"
      }
    },
    "node_modules/prebuild-install": {
      "version": "7.1.3",
      "resolved": "https://registry.npmjs.org/prebuild-install/-/prebuild-install-7.1.3.tgz",
      "integrity": "sha512-8Mf2cbV7x1cXPUILADGI3wuhfqWvtiLA1iclTDbFRZkgRQS0NqsPZphna9V+HyTEadheuPmjaJMsbzKQFOzLug==",
      "deprecated": "No longer maintained. Please contact the author of the relevant native addon; alternatives are available.",
      "license": "MIT",
      "dependencies": {
        "detect-libc": "^2.0.0",
        "expand-template": "^2.0.3",
        "github-from-package": "0.0.0",
        "minimist": "^1.2.3",
        "mkdirp-classic": "^0.5.3",
        "napi-build-utils": "^2.0.0",
        "node-abi": "^3.3.0",
        "pump": "^3.0.0",
        "rc": "^1.2.7",
        "simple-get": "^4.0.0",
        "tar-fs": "^2.0.0",
        "tunnel-agent": "^0.6.0"
      },
      "bin": {
        "prebuild-install": "bin.js"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/proc-log": {
      "version": "6.1.0",
      "resolved": "https://registry.npmjs.org/proc-log/-/proc-log-6.1.0.tgz",
      "integrity": "sha512-iG+GYldRf2BQ0UDUAd6JQ/RwzaQy6mXmsk/IzlYyal4A4SNFw54MeH4/tLkF4I5WoWG9SQwuqWzS99jaFQHBuQ==",
      "license": "ISC",
      "optional": true,
      "engines": {
        "node": "^20.17.0 || >=22.9.0"
      }
    },
    "node_modules/progress": {
      "version": "2.0.3",
      "resolved": "https://registry.npmjs.org/progress/-/progress-2.0.3.tgz",
      "integrity": "sha512-7PiHtLll5LdnKIMw100I+8xJXR5gW2QwWYkT6iJva0bXitZKa/XMrSbdmg3r2Xnaidz9Qumd0VPaMrZlF9V9sA==",
      "license": "MIT",
      "engines": {
        "node": ">=0.4.0"
      }
    },
    "node_modules/proxy-addr": {
      "version": "2.0.7",
      "resolved": "https://registry.npmjs.org/proxy-addr/-/proxy-addr-2.0.7.tgz",
      "integrity": "sha512-llQsMLSUDUPT44jdrU/O37qlnifitDP+ZwrmmZcoSKyLKvtZxpyV0n2/bD/N4tBAAZ/gJEdZU7KMraoK1+XYAg==",
      "license": "MIT",
      "dependencies": {
        "forwarded": "0.2.0",
        "ipaddr.js": "1.9.1"
      },
      "engines": {
        "node": ">= 0.10"
      }
    },
    "node_modules/proxy-agent": {
      "version": "6.5.0",
      "resolved": "https://registry.npmjs.org/proxy-agent/-/proxy-agent-6.5.0.tgz",
      "integrity": "sha512-TmatMXdr2KlRiA2CyDu8GqR8EjahTG3aY3nXjdzFyoZbmB8hrBsTyMezhULIXKnC0jpfjlmiZ3+EaCzoInSu/A==",
      "license": "MIT",
      "dependencies": {
        "agent-base": "^7.1.2",
        "debug": "^4.3.4",
        "http-proxy-agent": "^7.0.1",
        "https-proxy-agent": "^7.0.6",
        "lru-cache": "^7.14.1",
        "pac-proxy-agent": "^7.1.0",
        "proxy-from-env": "^1.1.0",
        "socks-proxy-agent": "^8.0.5"
      },
      "engines": {
        "node": ">= 14"
      }
    },
    "node_modules/proxy-from-env": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/proxy-from-env/-/proxy-from-env-1.1.0.tgz",
      "integrity": "sha512-D+zkORCbA9f1tdWRK0RaCR3GPv50cMxcrz4X8k5LTSUD1Dkw47mKJEZQNunItRTkWwgtaUSo1RVFRIG9ZXiFYg==",
      "license": "MIT"
    },
    "node_modules/pump": {
      "version": "3.0.4",
      "resolved": "https://registry.npmjs.org/pump/-/pump-3.0.4.tgz",
      "integrity": "sha512-VS7sjc6KR7e1ukRFhQSY5LM2uBWAUPiOPa/A3mkKmiMwSmRFUITt0xuj+/lesgnCv+dPIEYlkzrcyXgquIHMcA==",
      "license": "MIT",
      "dependencies": {
        "end-of-stream": "^1.1.0",
        "once": "^1.3.1"
      }
    },
    "node_modules/punycode.js": {
      "version": "2.3.1",
      "resolved": "https://registry.npmjs.org/punycode.js/-/punycode.js-2.3.1.tgz",
      "integrity": "sha512-uxFIHU0YlHYhDQtV4R9J6a52SLx28BCjT+4ieh7IGbgwVJWO+km431c4yRlREUAsAmt/uMjQUyQHNEPf0M39CA==",
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/puppeteer": {
      "version": "24.43.1",
      "resolved": "https://registry.npmjs.org/puppeteer/-/puppeteer-24.43.1.tgz",
      "integrity": "sha512-/FSOViCrqRdb1HDocpsM9Z1giA71gTQPUt3SpHGVRALKAy/rJr1fLFYZW9F23qPxqVxTHQnbh/5B5opJST3kAw==",
      "hasInstallScript": true,
      "license": "Apache-2.0",
      "dependencies": {
        "@puppeteer/browsers": "2.13.2",
        "chromium-bidi": "14.0.0",
        "cosmiconfig": "^9.0.0",
        "devtools-protocol": "0.0.1608973",
        "puppeteer-core": "24.43.1",
        "typed-query-selector": "^2.12.2"
      },
      "bin": {
        "puppeteer": "lib/cjs/puppeteer/node/cli.js"
      },
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/puppeteer-core": {
      "version": "24.43.1",
      "resolved": "https://registry.npmjs.org/puppeteer-core/-/puppeteer-core-24.43.1.tgz",
      "integrity": "sha512-T5ScUMAsmhdNbgDR41AGESYeS6V9MSgetkSnVhhW+gXvzC42VesKCn5ld87gAZDJ6vLHL9GkRvY9WtQWSnwFbw==",
      "license": "Apache-2.0",
      "dependencies": {
        "@puppeteer/browsers": "2.13.2",
        "chromium-bidi": "14.0.0",
        "debug": "^4.4.3",
        "devtools-protocol": "0.0.1608973",
        "typed-query-selector": "^2.12.2",
        "webdriver-bidi-protocol": "0.4.1",
        "ws": "^8.20.0"
      },
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/qs": {
      "version": "6.15.2",
      "resolved": "https://registry.npmjs.org/qs/-/qs-6.15.2.tgz",
      "integrity": "sha512-Rzq0KEyX/w/tEybncDgdkZrJgVUsUMk3xjh3t5bv3S1HTAtg+uOYt72+ZfwiQwKdysThkTBdL/rTi6HDmX9Ddw==",
      "license": "BSD-3-Clause",
      "dependencies": {
        "side-channel": "^1.1.0"
      },
      "engines": {
        "node": ">=0.6"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/range-parser": {
      "version": "1.2.1",
      "resolved": "https://registry.npmjs.org/range-parser/-/range-parser-1.2.1.tgz",
      "integrity": "sha512-Hrgsx+orqoygnmhFbKaHE6c296J+HTAQXoxEF6gNupROmmGJRoyzfG3ccAveqCBrwr/2yxQ5BVd/GTl5agOwSg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "node_modules/raw-body": {
      "version": "3.0.2",
      "resolved": "https://registry.npmjs.org/raw-body/-/raw-body-3.0.2.tgz",
      "integrity": "sha512-K5zQjDllxWkf7Z5xJdV0/B0WTNqx6vxG70zJE4N0kBs4LovmEYWJzQGxC9bS9RAKu3bgM40lrd5zoLJ12MQ5BA==",
      "license": "MIT",
      "dependencies": {
        "bytes": "~3.1.2",
        "http-errors": "~2.0.1",
        "iconv-lite": "~0.7.0",
        "unpipe": "~1.0.0"
      },
      "engines": {
        "node": ">= 0.10"
      }
    },
    "node_modules/rc": {
      "version": "1.2.8",
      "resolved": "https://registry.npmjs.org/rc/-/rc-1.2.8.tgz",
      "integrity": "sha512-y3bGgqKj3QBdxLbLkomlohkvsA8gdAiUQlSBJnBhfn+BPxg4bc62d8TcBW15wavDfgexCgccckhcZvywyQYPOw==",
      "license": "(BSD-2-Clause OR MIT OR Apache-2.0)",
      "dependencies": {
        "deep-extend": "^0.6.0",
        "ini": "~1.3.0",
        "minimist": "^1.2.0",
        "strip-json-comments": "~2.0.1"
      },
      "bin": {
        "rc": "cli.js"
      }
    },
    "node_modules/readable-stream": {
      "version": "3.6.2",
      "resolved": "https://registry.npmjs.org/readable-stream/-/readable-stream-3.6.2.tgz",
      "integrity": "sha512-9u/sniCrY3D5WdsERHzHE4G2YCXqoG5FTHUiCC4SIbr6XcLZBY05ya9EKjYek9O5xOAwjGq+1JdGBAS7Q9ScoA==",
      "license": "MIT",
      "dependencies": {
        "inherits": "^2.0.3",
        "string_decoder": "^1.1.1",
        "util-deprecate": "^1.0.1"
      },
      "engines": {
        "node": ">= 6"
      }
    },
    "node_modules/require-directory": {
      "version": "2.1.1",
      "resolved": "https://registry.npmjs.org/require-directory/-/require-directory-2.1.1.tgz",
      "integrity": "sha512-fGxEI7+wsG9xrvdjsrlmL22OMTTiHRwAMroiEeMgq8gzoLC/PQr7RsRDSTLUg/bZAZtF+TVIkHc6/4RIKrui+Q==",
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/resolve-from": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/resolve-from/-/resolve-from-4.0.0.tgz",
      "integrity": "sha512-pb/MYmXstAkysRFx8piNI1tGFNQIFA3vkE3Gq4EuA1dF6gHp/+vgZqsCGJapvy8N3Q+4o7FwvquPJcnZ7RYy4g==",
      "license": "MIT",
      "engines": {
        "node": ">=4"
      }
    },
    "node_modules/router": {
      "version": "2.2.0",
      "resolved": "https://registry.npmjs.org/router/-/router-2.2.0.tgz",
      "integrity": "sha512-nLTrUKm2UyiL7rlhapu/Zl45FwNgkZGaCpZbIHajDYgwlJCOzLSk+cIPAnsEqV955GjILJnKbdQC1nVPz+gAYQ==",
      "license": "MIT",
      "dependencies": {
        "debug": "^4.4.0",
        "depd": "^2.0.0",
        "is-promise": "^4.0.0",
        "parseurl": "^1.3.3",
        "path-to-regexp": "^8.0.0"
      },
      "engines": {
        "node": ">= 18"
      }
    },
    "node_modules/safe-buffer": {
      "version": "5.2.1",
      "resolved": "https://registry.npmjs.org/safe-buffer/-/safe-buffer-5.2.1.tgz",
      "integrity": "sha512-rp3So07KcdmmKbGvgaNxQSJr7bGVSVk5S9Eq1F+ppbRo70+YeaDxkw5Dd8NPN+GD6bjnYm2VuPuCXmpuYvmCXQ==",
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/feross"
        },
        {
          "type": "patreon",
          "url": "https://www.patreon.com/feross"
        },
        {
          "type": "consulting",
          "url": "https://feross.org/support"
        }
      ],
      "license": "MIT"
    },
    "node_modules/safer-buffer": {
      "version": "2.1.2",
      "resolved": "https://registry.npmjs.org/safer-buffer/-/safer-buffer-2.1.2.tgz",
      "integrity": "sha512-YZo3K82SD7Riyi0E1EQPojLz7kpepnSQI9IyPbHHg1XXXevb5dJI7tpyN2ADxGcQbHG7vcyRHk0cbwqcQriUtg==",
      "license": "MIT"
    },
    "node_modules/selderee": {
      "version": "0.11.0",
      "resolved": "https://registry.npmjs.org/selderee/-/selderee-0.11.0.tgz",
      "integrity": "sha512-5TF+l7p4+OsnP8BCCvSyZiSPc4x4//p5uPwK8TCnVPJYRmU2aYKMpOXvw8zM5a5JvuuCGN1jmsMwuU2W02ukfA==",
      "license": "MIT",
      "dependencies": {
        "parseley": "^0.12.0"
      },
      "funding": {
        "url": "https://ko-fi.com/killymxi"
      }
    },
    "node_modules/semver": {
      "version": "7.8.0",
      "resolved": "https://registry.npmjs.org/semver/-/semver-7.8.0.tgz",
      "integrity": "sha512-AcM7dV/5ul4EekoQ29Agm5vri8JNqRyj39o0qpX6vDF2GZrtutZl5RwgD1XnZjiTAfncsJhMI48QQH3sN87YNA==",
      "license": "ISC",
      "bin": {
        "semver": "bin/semver.js"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/send": {
      "version": "1.2.1",
      "resolved": "https://registry.npmjs.org/send/-/send-1.2.1.tgz",
      "integrity": "sha512-1gnZf7DFcoIcajTjTwjwuDjzuz4PPcY2StKPlsGAQ1+YH20IRVrBaXSWmdjowTJ6u8Rc01PoYOGHXfP1mYcZNQ==",
      "license": "MIT",
      "dependencies": {
        "debug": "^4.4.3",
        "encodeurl": "^2.0.0",
        "escape-html": "^1.0.3",
        "etag": "^1.8.1",
        "fresh": "^2.0.0",
        "http-errors": "^2.0.1",
        "mime-types": "^3.0.2",
        "ms": "^2.1.3",
        "on-finished": "^2.4.1",
        "range-parser": "^1.2.1",
        "statuses": "^2.0.2"
      },
      "engines": {
        "node": ">= 18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/serialport": {
      "version": "13.0.0",
      "resolved": "https://registry.npmjs.org/serialport/-/serialport-13.0.0.tgz",
      "integrity": "sha512-PHpnTd8isMGPfFTZNCzOZp9m4mAJSNWle9Jxu6BPTcWq7YXl5qN7tp8Sgn0h+WIGcD6JFz5QDgixC2s4VW7vzg==",
      "license": "MIT",
      "dependencies": {
        "@serialport/binding-mock": "10.2.2",
        "@serialport/bindings-cpp": "13.0.0",
        "@serialport/parser-byte-length": "13.0.0",
        "@serialport/parser-cctalk": "13.0.0",
        "@serialport/parser-delimiter": "13.0.0",
        "@serialport/parser-inter-byte-timeout": "13.0.0",
        "@serialport/parser-packet-length": "13.0.0",
        "@serialport/parser-readline": "13.0.0",
        "@serialport/parser-ready": "13.0.0",
        "@serialport/parser-regex": "13.0.0",
        "@serialport/parser-slip-encoder": "13.0.0",
        "@serialport/parser-spacepacket": "13.0.0",
        "@serialport/stream": "13.0.0",
        "debug": "4.4.0"
      },
      "engines": {
        "node": ">=20.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/serialport/donate"
      }
    },
    "node_modules/serialport/node_modules/debug": {
      "version": "4.4.0",
      "resolved": "https://registry.npmjs.org/debug/-/debug-4.4.0.tgz",
      "integrity": "sha512-6WTZ/IxCY/T6BALoZHaE4ctp9xm+Z5kY/pzYaCHRFeyVhojxlrm+46y68HA6hr0TcwEssoxNiDEUJQjfPZ/RYA==",
      "license": "MIT",
      "dependencies": {
        "ms": "^2.1.3"
      },
      "engines": {
        "node": ">=6.0"
      },
      "peerDependenciesMeta": {
        "supports-color": {
          "optional": true
        }
      }
    },
    "node_modules/serve-static": {
      "version": "2.2.1",
      "resolved": "https://registry.npmjs.org/serve-static/-/serve-static-2.2.1.tgz",
      "integrity": "sha512-xRXBn0pPqQTVQiC8wyQrKs2MOlX24zQ0POGaj0kultvoOCstBQM5yvOhAVSUwOMjQtTvsPWoNCHfPGwaaQJhTw==",
      "license": "MIT",
      "dependencies": {
        "encodeurl": "^2.0.0",
        "escape-html": "^1.0.3",
        "parseurl": "^1.3.3",
        "send": "^1.2.0"
      },
      "engines": {
        "node": ">= 18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/setprototypeof": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/setprototypeof/-/setprototypeof-1.2.0.tgz",
      "integrity": "sha512-E5LDX7Wrp85Kil5bhZv46j8jOeboKq5JMmYM3gVGdGH8xFpPWXUMsNrlODCrkoxMEeNi/XZIwuRvY4XNwYMJpw==",
      "license": "ISC"
    },
    "node_modules/side-channel": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/side-channel/-/side-channel-1.1.0.tgz",
      "integrity": "sha512-ZX99e6tRweoUXqR+VBrslhda51Nh5MTQwou5tnUDgbtyM0dBgmhEDtWGP/xbKn6hqfPRHujUNwz5fy/wbbhnpw==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0",
        "object-inspect": "^1.13.3",
        "side-channel-list": "^1.0.0",
        "side-channel-map": "^1.0.1",
        "side-channel-weakmap": "^1.0.2"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/side-channel-list": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/side-channel-list/-/side-channel-list-1.0.1.tgz",
      "integrity": "sha512-mjn/0bi/oUURjc5Xl7IaWi/OJJJumuoJFQJfDDyO46+hBWsfaVM65TBHq2eoZBhzl9EchxOijpkbRC8SVBQU0w==",
      "license": "MIT",
      "dependencies": {
        "es-errors": "^1.3.0",
        "object-inspect": "^1.13.4"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/side-channel-map": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/side-channel-map/-/side-channel-map-1.0.1.tgz",
      "integrity": "sha512-VCjCNfgMsby3tTdo02nbjtM/ewra6jPHmpThenkTYh8pG9ucZ/1P8So4u4FGBek/BjpOVsDCMoLA/iuBKIFXRA==",
      "license": "MIT",
      "dependencies": {
        "call-bound": "^1.0.2",
        "es-errors": "^1.3.0",
        "get-intrinsic": "^1.2.5",
        "object-inspect": "^1.13.3"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/side-channel-weakmap": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/side-channel-weakmap/-/side-channel-weakmap-1.0.2.tgz",
      "integrity": "sha512-WPS/HvHQTYnHisLo9McqBHOJk2FkHO/tlpvldyrnem4aeQp4hai3gythswg6p01oSoTl58rcpiFAjF2br2Ak2A==",
      "license": "MIT",
      "dependencies": {
        "call-bound": "^1.0.2",
        "es-errors": "^1.3.0",
        "get-intrinsic": "^1.2.5",
        "object-inspect": "^1.13.3",
        "side-channel-map": "^1.0.1"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/simple-concat": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/simple-concat/-/simple-concat-1.0.1.tgz",
      "integrity": "sha512-cSFtAPtRhljv69IK0hTVZQ+OfE9nePi/rtJmw5UjHeVyVroEqJXP1sFztKUy1qU+xvz3u/sfYJLa947b7nAN2Q==",
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/feross"
        },
        {
          "type": "patreon",
          "url": "https://www.patreon.com/feross"
        },
        {
          "type": "consulting",
          "url": "https://feross.org/support"
        }
      ],
      "license": "MIT"
    },
    "node_modules/simple-get": {
      "version": "4.0.1",
      "resolved": "https://registry.npmjs.org/simple-get/-/simple-get-4.0.1.tgz",
      "integrity": "sha512-brv7p5WgH0jmQJr1ZDDfKDOSeWWg+OVypG99A/5vYGPqJ6pxiaHLy8nxtFjBA7oMa01ebA9gfh1uMCFqOuXxvA==",
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/feross"
        },
        {
          "type": "patreon",
          "url": "https://www.patreon.com/feross"
        },
        {
          "type": "consulting",
          "url": "https://feross.org/support"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "decompress-response": "^6.0.0",
        "once": "^1.3.1",
        "simple-concat": "^1.0.0"
      }
    },
    "node_modules/smart-buffer": {
      "version": "4.2.0",
      "resolved": "https://registry.npmjs.org/smart-buffer/-/smart-buffer-4.2.0.tgz",
      "integrity": "sha512-94hK0Hh8rPqQl2xXc3HsaBoOXKV20MToPkcXvwbISWLEs+64sBq5kFgn2kJDHb1Pry9yrP0dxrCI9RRci7RXKg==",
      "license": "MIT",
      "engines": {
        "node": ">= 6.0.0",
        "npm": ">= 3.0.0"
      }
    },
    "node_modules/socks": {
      "version": "2.8.9",
      "resolved": "https://registry.npmjs.org/socks/-/socks-2.8.9.tgz",
      "integrity": "sha512-LJhUYUvItdQ0LkJTmPeaEObWXAqFyfmP85x0tch/ez9cahmhlBBLbIqDFnvBnUJGagb0JbIQrkBs1wJ+yRYpEw==",
      "license": "MIT",
      "dependencies": {
        "ip-address": "^10.1.1",
        "smart-buffer": "^4.2.0"
      },
      "engines": {
        "node": ">= 10.0.0",
        "npm": ">= 3.0.0"
      }
    },
    "node_modules/socks-proxy-agent": {
      "version": "8.0.5",
      "resolved": "https://registry.npmjs.org/socks-proxy-agent/-/socks-proxy-agent-8.0.5.tgz",
      "integrity": "sha512-HehCEsotFqbPW9sJ8WVYB6UbmIMv7kUUORIF2Nncq4VQvBfNBLibW9YZR5dlYCSUhwcD628pRllm7n+E+YTzJw==",
      "license": "MIT",
      "dependencies": {
        "agent-base": "^7.1.2",
        "debug": "^4.3.4",
        "socks": "^2.8.3"
      },
      "engines": {
        "node": ">= 14"
      }
    },
    "node_modules/source-map": {
      "version": "0.6.1",
      "resolved": "https://registry.npmjs.org/source-map/-/source-map-0.6.1.tgz",
      "integrity": "sha512-UjgapumWlbMhkBgzT7Ykc5YXUT46F0iKu8SGXq0bcwP5dz/h0Plj6enJqjz1Zbq2l5WaqYnrVbwWOWMyF3F47g==",
      "license": "BSD-3-Clause",
      "optional": true,
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/sqlite3": {
      "version": "6.0.1",
      "resolved": "https://registry.npmjs.org/sqlite3/-/sqlite3-6.0.1.tgz",
      "integrity": "sha512-X0czUUMG2tmSqJpEQa3tCuZSHKIx8PwM53vLZzKp/o6Rpy25fiVfjdbnZ988M8+O3ZWR1ih0K255VumCb3MAnQ==",
      "hasInstallScript": true,
      "license": "BSD-3-Clause",
      "dependencies": {
        "bindings": "^1.5.0",
        "node-addon-api": "^8.0.0",
        "prebuild-install": "^7.1.3",
        "tar": "^7.5.10"
      },
      "engines": {
        "node": ">=20.17.0"
      },
      "optionalDependencies": {
        "node-gyp": "12.x"
      },
      "peerDependencies": {
        "node-gyp": "12.x"
      },
      "peerDependenciesMeta": {
        "node-gyp": {
          "optional": true
        }
      }
    },
    "node_modules/statuses": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/statuses/-/statuses-2.0.2.tgz",
      "integrity": "sha512-DvEy55V3DB7uknRo+4iOGT5fP1slR8wQohVdknigZPMpMstaKJQWhwiYBACJE3Ul2pTnATihhBYnRhZQHGBiRw==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/streamx": {
      "version": "2.25.0",
      "resolved": "https://registry.npmjs.org/streamx/-/streamx-2.25.0.tgz",
      "integrity": "sha512-0nQuG6jf1w+wddNEEXCF4nTg3LtufWINB5eFEN+5TNZW7KWJp6x87+JFL43vaAUPyCfH1wID+mNVyW6OHtFamg==",
      "license": "MIT",
      "dependencies": {
        "events-universal": "^1.0.0",
        "fast-fifo": "^1.3.2",
        "text-decoder": "^1.1.0"
      }
    },
    "node_modules/string_decoder": {
      "version": "1.3.0",
      "resolved": "https://registry.npmjs.org/string_decoder/-/string_decoder-1.3.0.tgz",
      "integrity": "sha512-hkRX8U1WjJFd8LsDJ2yQ/wWWxaopEsABU1XfkM8A+j0+85JAGppt16cr1Whg6KIbb4okU6Mql6BOj+uup/wKeA==",
      "license": "MIT",
      "dependencies": {
        "safe-buffer": "~5.2.0"
      }
    },
    "node_modules/string-width": {
      "version": "4.2.3",
      "resolved": "https://registry.npmjs.org/string-width/-/string-width-4.2.3.tgz",
      "integrity": "sha512-wKyQRQpjJ0sIp62ErSZdGsjMJWsap5oRNihHhu6G7JVO/9jIB6UyevL+tXuOqrng8j/cxKTWyWUwvSTriiZz/g==",
      "license": "MIT",
      "dependencies": {
        "emoji-regex": "^8.0.0",
        "is-fullwidth-code-point": "^3.0.0",
        "strip-ansi": "^6.0.1"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/strip-ansi": {
      "version": "6.0.1",
      "resolved": "https://registry.npmjs.org/strip-ansi/-/strip-ansi-6.0.1.tgz",
      "integrity": "sha512-Y38VPSHcqkFrCpFnQ9vuSXmquuv5oXOKpGeT6aGrr3o3Gc9AlVa6JBfUSOCnbxGGZF+/0ooI7KrPuUSztUdU5A==",
      "license": "MIT",
      "dependencies": {
        "ansi-regex": "^5.0.1"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/strip-json-comments": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/strip-json-comments/-/strip-json-comments-2.0.1.tgz",
      "integrity": "sha512-4gB8na07fecVVkOI6Rs4e7T6NOTki5EmL7TUduTs6bu3EdnSycntVJ4re8kgZA+wx9IueI2Y11bfbgwtzuE0KQ==",
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/superagent": {
      "version": "10.3.0",
      "resolved": "https://registry.npmjs.org/superagent/-/superagent-10.3.0.tgz",
      "integrity": "sha512-B+4Ik7ROgVKrQsXTV0Jwp2u+PXYLSlqtDAhYnkkD+zn3yg8s/zjA2MeGayPoY/KICrbitwneDHrjSotxKL+0XQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "component-emitter": "^1.3.1",
        "cookiejar": "^2.1.4",
        "debug": "^4.3.7",
        "fast-safe-stringify": "^2.1.1",
        "form-data": "^4.0.5",
        "formidable": "^3.5.4",
        "methods": "^1.1.2",
        "mime": "2.6.0",
        "qs": "^6.14.1"
      },
      "engines": {
        "node": ">=14.18.0"
      }
    },
    "node_modules/supertest": {
      "version": "7.2.2",
      "resolved": "https://registry.npmjs.org/supertest/-/supertest-7.2.2.tgz",
      "integrity": "sha512-oK8WG9diS3DlhdUkcFn4tkNIiIbBx9lI2ClF8K+b2/m8Eyv47LSawxUzZQSNKUrVb2KsqeTDCcjAAVPYaSLVTA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "cookie-signature": "^1.2.2",
        "methods": "^1.1.2",
        "superagent": "^10.3.0"
      },
      "engines": {
        "node": ">=14.18.0"
      }
    },
    "node_modules/tar": {
      "version": "7.5.15",
      "resolved": "https://registry.npmjs.org/tar/-/tar-7.5.15.tgz",
      "integrity": "sha512-dzGK0boVlC4W5QFuQN1EFSl3bIDYsk7Tj40U6eIBnK2k/8ml7TZ5agbI5j5+qnoVcAA+rNtBml8SEiLxZpNqRQ==",
      "license": "BlueOak-1.0.0",
      "dependencies": {
        "@isaacs/fs-minipass": "^4.0.0",
        "chownr": "^3.0.0",
        "minipass": "^7.1.2",
        "minizlib": "^3.1.0",
        "yallist": "^5.0.0"
      },
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/tar-fs": {
      "version": "2.1.4",
      "resolved": "https://registry.npmjs.org/tar-fs/-/tar-fs-2.1.4.tgz",
      "integrity": "sha512-mDAjwmZdh7LTT6pNleZ05Yt65HC3E+NiQzl672vQG38jIrehtJk/J3mNwIg+vShQPcLF/LV7CMnDW6vjj6sfYQ==",
      "license": "MIT",
      "dependencies": {
        "chownr": "^1.1.1",
        "mkdirp-classic": "^0.5.2",
        "pump": "^3.0.0",
        "tar-stream": "^2.1.4"
      }
    },
    "node_modules/tar-fs/node_modules/chownr": {
      "version": "1.1.4",
      "resolved": "https://registry.npmjs.org/chownr/-/chownr-1.1.4.tgz",
      "integrity": "sha512-jJ0bqzaylmJtVnNgzTeSOs8DPavpbYgEr/b0YL8/2GO3xJEhInFmhKMUnEJQjZumK7KXGFhUy89PrsJWlakBVg==",
      "license": "ISC"
    },
    "node_modules/tar-stream": {
      "version": "2.2.0",
      "resolved": "https://registry.npmjs.org/tar-stream/-/tar-stream-2.2.0.tgz",
      "integrity": "sha512-ujeqbceABgwMZxEJnk2HDY2DlnUZ+9oEcb1KzTVfYHio0UE6dG71n60d8D2I4qNvleWrrXpmjpt7vZeF1LnMZQ==",
      "license": "MIT",
      "dependencies": {
        "bl": "^4.0.3",
        "end-of-stream": "^1.4.1",
        "fs-constants": "^1.0.0",
        "inherits": "^2.0.3",
        "readable-stream": "^3.1.1"
      },
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/teex": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/teex/-/teex-1.0.1.tgz",
      "integrity": "sha512-eYE6iEI62Ni1H8oIa7KlDU6uQBtqr4Eajni3wX7rpfXD8ysFx8z0+dri+KWEPWpBsxXfxu58x/0jvTVT1ekOSg==",
      "license": "MIT",
      "dependencies": {
        "streamx": "^2.12.5"
      }
    },
    "node_modules/text-decoder": {
      "version": "1.2.7",
      "resolved": "https://registry.npmjs.org/text-decoder/-/text-decoder-1.2.7.tgz",
      "integrity": "sha512-vlLytXkeP4xvEq2otHeJfSQIRyWxo/oZGEbXrtEEF9Hnmrdly59sUbzZ/QgyWuLYHctCHxFF4tRQZNQ9k60ExQ==",
      "license": "Apache-2.0",
      "dependencies": {
        "b4a": "^1.6.4"
      }
    },
    "node_modules/tinyglobby": {
      "version": "0.2.16",
      "resolved": "https://registry.npmjs.org/tinyglobby/-/tinyglobby-0.2.16.tgz",
      "integrity": "sha512-pn99VhoACYR8nFHhxqix+uvsbXineAasWm5ojXoN8xEwK5Kd3/TrhNn1wByuD52UxWRLy8pu+kRMniEi6Eq9Zg==",
      "license": "MIT",
      "optional": true,
      "dependencies": {
        "fdir": "^6.5.0",
        "picomatch": "^4.0.4"
      },
      "engines": {
        "node": ">=12.0.0"
      },
      "funding": {
        "url": "https://github.com/sponsors/SuperchupuDev"
      }
    },
    "node_modules/tlds": {
      "version": "1.261.0",
      "resolved": "https://registry.npmjs.org/tlds/-/tlds-1.261.0.tgz",
      "integrity": "sha512-QXqwfEl9ddlGBaRFXIvNKK6OhipSiLXuRuLJX5DErz0o0Q0rYxulWLdFryTkV5PkdZct5iMInwYEGe/eR++1AA==",
      "license": "MIT",
      "bin": {
        "tlds": "bin.js"
      }
    },
    "node_modules/toidentifier": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/toidentifier/-/toidentifier-1.0.1.tgz",
      "integrity": "sha512-o5sSPKEkg/DIQNmH43V0/uerLrpzVedkUh8tGNvaeXpfpuwjKenlSox/2O/BTlZUtEe+JG7s5YhEz608PlAHRA==",
      "license": "MIT",
      "engines": {
        "node": ">=0.6"
      }
    },
    "node_modules/tslib": {
      "version": "2.8.1",
      "resolved": "https://registry.npmjs.org/tslib/-/tslib-2.8.1.tgz",
      "integrity": "sha512-oJFu94HQb+KVduSUQL7wnpmqnfmLsOA/nAh6b6EH0wCEoK0/mPeXU6c3wKDV83MkOuHPRHtSXKKU99IBazS/2w==",
      "license": "0BSD"
    },
    "node_modules/tunnel-agent": {
      "version": "0.6.0",
      "resolved": "https://registry.npmjs.org/tunnel-agent/-/tunnel-agent-0.6.0.tgz",
      "integrity": "sha512-McnNiV1l8RYeY8tBgEpuodCC1mLUdbSN+CYBL7kJsJNInOP8UjDDEwdk6Mw60vdLLrr5NHKZhMAOSrR2NZuQ+w==",
      "license": "Apache-2.0",
      "dependencies": {
        "safe-buffer": "^5.0.1"
      },
      "engines": {
        "node": "*"
      }
    },
    "node_modules/type-is": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/type-is/-/type-is-2.1.0.tgz",
      "integrity": "sha512-faYHw0anBbc/kWF3zFTEnxSFOAGUX9GFbOBthvDdLsIlEoWOFOtS0zgCiQYwIskL9iGXZL3kAXD8OoZ4GmMATA==",
      "license": "MIT",
      "dependencies": {
        "content-type": "^2.0.0",
        "media-typer": "^1.1.0",
        "mime-types": "^3.0.0"
      },
      "engines": {
        "node": ">= 18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/type-is/node_modules/content-type": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/content-type/-/content-type-2.0.0.tgz",
      "integrity": "sha512-j/O/d7GcZCyNl7/hwZAb606rzqkyvaDctLmckbxLzHvFBzTJHuGEdodATcP3yIRoDrLHkIATJuvzbFlp/ki2cQ==",
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "node_modules/typed-query-selector": {
      "version": "2.12.2",
      "resolved": "https://registry.npmjs.org/typed-query-selector/-/typed-query-selector-2.12.2.tgz",
      "integrity": "sha512-EOPFbyIub4ngnEdqi2yOcNeDLaX/0jcE1JoAXQDDMIthap7FoN795lc/SHfIq2d416VufXpM8z/lD+WRm2gfOQ==",
      "license": "MIT"
    },
    "node_modules/uc.micro": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/uc.micro/-/uc.micro-2.1.0.tgz",
      "integrity": "sha512-ARDJmphmdvUk6Glw7y9DQ2bFkKBHwQHLi2lsaH6PPmz/Ka9sFOBsBluozhDltWmnv9u/cF6Rt87znRTPV+yp/A==",
      "license": "MIT"
    },
    "node_modules/undici": {
      "version": "6.25.0",
      "resolved": "https://registry.npmjs.org/undici/-/undici-6.25.0.tgz",
      "integrity": "sha512-ZgpWDC5gmNiuY9CnLVXEH8rl50xhRCuLNA97fAUnKi8RRuV4E6KG31pDTsLVUKnohJE0I3XDrTeEydAXRw47xg==",
      "license": "MIT",
      "optional": true,
      "engines": {
        "node": ">=18.17"
      }
    },
    "node_modules/undici-types": {
      "version": "7.24.6",
      "resolved": "https://registry.npmjs.org/undici-types/-/undici-types-7.24.6.tgz",
      "integrity": "sha512-WRNW+sJgj5OBN4/0JpHFqtqzhpbnV0GuB+OozA9gCL7a993SmU+1JBZCzLNxYsbMfIeDL+lTsphD5jN5N+n0zg==",
      "license": "MIT",
      "optional": true
    },
    "node_modules/unpipe": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/unpipe/-/unpipe-1.0.0.tgz",
      "integrity": "sha512-pjy2bYhSsufwWlKwPc+l3cN7+wuJlK6uz0YdJEOlQDbl6jo/YlPi4mb8agUkVC8BF7V8NuzeyPNqRksA3hztKQ==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/utf7": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/utf7/-/utf7-1.0.2.tgz",
      "integrity": "sha512-qQrPtYLLLl12NF4DrM9CvfkxkYI97xOb5dsnGZHE3teFr0tWiEZ9UdgMPczv24vl708cYMpe6mGXGHrotIp3Bw==",
      "dependencies": {
        "semver": "~5.3.0"
      }
    },
    "node_modules/utf7/node_modules/semver": {
      "version": "5.3.0",
      "resolved": "https://registry.npmjs.org/semver/-/semver-5.3.0.tgz",
      "integrity": "sha512-mfmm3/H9+67MCVix1h+IXTpDwL6710LyHuk7+cWC9T1mE0qz4iHhh6r4hU2wrIT9iTsAAC2XQRvfblL028cpLw==",
      "license": "ISC",
      "bin": {
        "semver": "bin/semver"
      }
    },
    "node_modules/util-deprecate": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/util-deprecate/-/util-deprecate-1.0.2.tgz",
      "integrity": "sha512-EPD5q1uXyFxJpCrLnCc1nHnq3gOa6DZBocAIiI2TaSCA7VCJ1UJDMagCzIkXNsUYfD1daK//LTEQ8xiIbrHtcw==",
      "license": "MIT"
    },
    "node_modules/uuid": {
      "version": "14.0.0",
      "resolved": "https://registry.npmjs.org/uuid/-/uuid-14.0.0.tgz",
      "integrity": "sha512-Qo+uWgilfSmAhXCMav1uYFynlQO7fMFiMVZsQqZRMIXp0O7rR7qjkj+cPvBHLgBqi960QCoo/PH2/6ZtVqKvrg==",
      "funding": [
        "https://github.com/sponsors/broofa",
        "https://github.com/sponsors/ctavan"
      ],
      "license": "MIT",
      "bin": {
        "uuid": "dist-node/bin/uuid"
      }
    },
    "node_modules/vary": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/vary/-/vary-1.1.2.tgz",
      "integrity": "sha512-BNGbWLfd0eUPabhkXUVm0j8uuvREyTh5ovRa/dyow/BqAbZJyC+5fU+IzQOzmAKzYqYRAISoRhdQr3eIZ/PXqg==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.8"
      }
    },
    "node_modules/webdriver-bidi-protocol": {
      "version": "0.4.1",
      "resolved": "https://registry.npmjs.org/webdriver-bidi-protocol/-/webdriver-bidi-protocol-0.4.1.tgz",
      "integrity": "sha512-ARrjNjtWRRs2w4Tk7nqrf2gBI0QXWuOmMCx2hU+1jUt6d00MjMxURrhxhGbrsoiZKJrhTSTzbIrc554iKI10qw==",
      "license": "Apache-2.0"
    },
    "node_modules/which": {
      "version": "6.0.1",
      "resolved": "https://registry.npmjs.org/which/-/which-6.0.1.tgz",
      "integrity": "sha512-oGLe46MIrCRqX7ytPUf66EAYvdeMIZYn3WaocqqKZAxrBpkqHfL/qvTyJ/bTk5+AqHCjXmrv3CEWgy368zhRUg==",
      "license": "ISC",
      "optional": true,
      "dependencies": {
        "isexe": "^4.0.0"
      },
      "bin": {
        "node-which": "bin/which.js"
      },
      "engines": {
        "node": "^20.17.0 || >=22.9.0"
      }
    },
    "node_modules/wrap-ansi": {
      "version": "7.0.0",
      "resolved": "https://registry.npmjs.org/wrap-ansi/-/wrap-ansi-7.0.0.tgz",
      "integrity": "sha512-YVGIj2kamLSTxw6NsZjoBxfSwsn0ycdesmc4p+Q21c5zPuZ1pl+NfxVdxPtdHvmNVOQ6XSYG4AUtyt/Fi7D16Q==",
      "license": "MIT",
      "dependencies": {
        "ansi-styles": "^4.0.0",
        "string-width": "^4.1.0",
        "strip-ansi": "^6.0.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/chalk/wrap-ansi?sponsor=1"
      }
    },
    "node_modules/wrappy": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/wrappy/-/wrappy-1.0.2.tgz",
      "integrity": "sha512-l4Sp/DRseor9wL6EvV2+TuQn63dMkPjZ/sp9XkghTEbV9KlPS1xUsZ3u7/IQO4wxtcFB4bgpQPRcR3QCvezPcQ==",
      "license": "ISC"
    },
    "node_modules/ws": {
      "version": "8.20.1",
      "resolved": "https://registry.npmjs.org/ws/-/ws-8.20.1.tgz",
      "integrity": "sha512-It4dO0K5v//JtTXuPkfEOaI3uUN87iYPnqo/ZzqCoG3g8uhA66QUMs/SrM0YK7/NAu+r4LMh/9dq2A7k+rHs+w==",
      "license": "MIT",
      "engines": {
        "node": ">=10.0.0"
      },
      "peerDependencies": {
        "bufferutil": "^4.0.1",
        "utf-8-validate": ">=5.0.2"
      },
      "peerDependenciesMeta": {
        "bufferutil": {
          "optional": true
        },
        "utf-8-validate": {
          "optional": true
        }
      }
    },
    "node_modules/y18n": {
      "version": "5.0.8",
      "resolved": "https://registry.npmjs.org/y18n/-/y18n-5.0.8.tgz",
      "integrity": "sha512-0pfFzegeDWJHJIAmTLRP2DwHjdF5s7jo9tuztdQxAhINCdvS+3nGINqPd00AphqJR/0LhANUS6/+7SCb98YOfA==",
      "license": "ISC",
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/yallist": {
      "version": "5.0.0",
      "resolved": "https://registry.npmjs.org/yallist/-/yallist-5.0.0.tgz",
      "integrity": "sha512-YgvUTfwqyc7UXVMrB+SImsVYSmTS8X/tSrtdNZMImM+n7+QTriRXyXim0mBrTXNeqzVF0KWGgHPeiyViFFrNDw==",
      "license": "BlueOak-1.0.0",
      "engines": {
        "node": ">=18"
      }
    },
    "node_modules/yargs": {
      "version": "17.7.2",
      "resolved": "https://registry.npmjs.org/yargs/-/yargs-17.7.2.tgz",
      "integrity": "sha512-7dSzzRQ++CKnNI/krKnYRV7JKKPUXMEh61soaHKg9mrWEhzFWhFnxPxGl+69cD1Ou63C13NUPCnmIcrvqCuM6w==",
      "license": "MIT",
      "dependencies": {
        "cliui": "^8.0.1",
        "escalade": "^3.1.1",
        "get-caller-file": "^2.0.5",
        "require-directory": "^2.1.1",
        "string-width": "^4.2.3",
        "y18n": "^5.0.5",
        "yargs-parser": "^21.1.1"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/yargs-parser": {
      "version": "21.1.1",
      "resolved": "https://registry.npmjs.org/yargs-parser/-/yargs-parser-21.1.1.tgz",
      "integrity": "sha512-tVpsJW7DdjecAiFpbIB1e3qxIQsE6NoPc5/eTdrbbIC4h0LVsWhnoa3g+m2HclBIujHzsxZ4VJVA+GUuc2/LBw==",
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/yauzl": {
      "version": "2.10.0",
      "resolved": "https://registry.npmjs.org/yauzl/-/yauzl-2.10.0.tgz",
      "integrity": "sha512-p4a9I6X6nu6IhoGmBqAcbJy1mlC4j27vEPZX9F4L4/vZT3Lyq1VkFHw/V/PUcB9Buo+DG3iHkT0x3Qya58zc3g==",
      "license": "MIT",
      "dependencies": {
        "buffer-crc32": "~0.2.3",
        "fd-slicer": "~1.1.0"
      }
    },
    "node_modules/zod": {
      "version": "3.25.76",
      "resolved": "https://registry.npmjs.org/zod/-/zod-3.25.76.tgz",
      "integrity": "sha512-gzUt/qt81nXsFGKIFcC3YnfEAx5NkunCfnDlvuBSSFS02bcXu4Lmea0AFIUwbLWxWPx3d9p8S5QoaujKcNQxcQ==",
      "license": "MIT",
      "funding": {
        "url": "https://github.com/sponsors/colinhacks"
      }
    }
  }
}

````

## backend/test/fixtures/naver-reservation.eml

````text
From: Naver Reservation <booking@naver.com>
To: warehouse@example.com
Subject: ?ㅼ씠踰??덉빟 ?뚮┝
Message-ID: <fixture-reservation-001@naver.test>
Content-Type: text/plain; charset=UTF-8

?덉빟?? ?띻만???곕씫泥? 010-1234-5678
?곹뭹: ?뚰삎 李쎄퀬 1媛쒖썡
?댁슜?? 2026-05-23

````

## backend/test/naver-parser.test.js

````js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { simpleParser } = require('mailparser');

process.env.DB_PATH = path.join(os.tmpdir(), `shared-warehouse-parser-${process.pid}.db`);

const {
  parseNaverReservationEmailFromParsed,
  parseNaverReservationEmail,
} = require('../naver-sync');
const db = require('../db');

test('parses Naver reservation fixture', async () => {
  const raw = fs.readFileSync(path.join(__dirname, 'fixtures', 'naver-reservation.eml'));
  const parsed = await simpleParser(raw);
  const reservation = parseNaverReservationEmailFromParsed(parsed, 1001);

  assert.equal(reservation.customer_name, '?띻만??);
  assert.equal(reservation.phone, '01012345678');
  assert.equal(reservation.service_name, '?뚰삎 李쎄퀬 1媛쒖썡');
  assert.equal(reservation.start_date, '2026-05-23');
  assert.equal(reservation.reservation_id, '<fixture-reservation-001@naver.test>');
});

test('ignores missing subject without throwing', () => {
  const reservation = parseNaverReservationEmailFromParsed({
    subject: null,
    text: '?덉빟?? ?띻만??n?곕씫泥? 010-1234-5678\n?곹뭹: ?뚰삎\n?댁슜?? 2026-05-23',
  }, 1002);

  assert.equal(reservation, null);
});

test('normalizes direct parser values', () => {
  const reservation = parseNaverReservationEmail({
    reservation_id: 'r-1',
    customer_name: 'Kim',
    phone: '010 1111-2222',
    start_date: '2026/05/23',
  });

  assert.deepEqual(reservation, {
    reservation_id: 'r-1',
    customer_name: 'Kim',
    phone: '01011112222',
    service_name: '',
    start_date: '2026-05-23',
    end_date: '2026-05-23',
  });
});

test.after(() => {
  db.close();
});

````

## backend/test/smoke.test.js

````js
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.OTP_SECRET = 'test-otp-secret';
process.env.DB_PATH = path.join(os.tmpdir(), `shared-warehouse-smoke-${process.pid}.db`);

const { app, db, stopBackgroundJobs } = require('../server');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('server health, login flow, and warehouse list smoke test', async () => {
  await wait(200);

  const health = await request(app).get('/health').expect(200);
  assert.equal(health.body.status, 'ok');

  await request(app)
    .post('/api/register')
    .send({
      username: 'admin',
      email: 'admin@example.com',
      password: 'password123',
      phone: '01012345678',
    })
    .expect(201);

  const login = await request(app)
    .post('/api/login')
    .send({ username: 'admin', password: 'password123' })
    .expect(200);

  assert.ok(login.body.token);

  const warehouses = await request(app)
    .get('/api/warehouses')
    .set('Authorization', `Bearer ${login.body.token}`)
    .expect(200);

  assert.ok(Array.isArray(warehouses.body));
});

test.after(() => {
  stopBackgroundJobs();
  db.close();
});

````

## backend/docs/migration-guide.md

````markdown
# Database Connection and Migration Guide

## Current Connection Baseline

- `backend/src/db/index.js` is the shared SQLite connection module.
- `backend/db.js` remains as a compatibility shim and re-exports `backend/src/db`.
- `backend/server.js`, `backend/hardware.js`, and `backend/naver-sync.js` all import `./db`, so they now share the same connection path and `DB_PATH` behavior.
- `DB_PATH` controls the database file. If it is not set, the default is `backend/warehouse.db`.

## Target Layout

Keep application code dependent on `require('./db')` or, for new nested modules, `require('../db')`. Do not create independent `new sqlite3.Database(...)` connections in feature modules.

Recommended responsibilities:

- `src/db/index.js`: open the SQLite connection and expose shared helpers.
- `src/db/migrations.js`: discover and apply migration files.
- `migrations/*.sql`: one forward-only migration per file, named with an ordered prefix such as `001_add_auto_renew.sql`.
- `server.js`: call the migration runner during startup before registering runtime jobs.

## Migration Table

Introduce a metadata table:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT UNIQUE NOT NULL,
  checksum TEXT NOT NULL,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

The runner should:

1. Read `backend/migrations/*.sql` in lexical order.
2. Calculate a checksum for each file.
3. Skip files already present in `schema_migrations`.
4. Run each pending file inside a transaction.
5. Insert the filename and checksum after a successful transaction.
6. Fail startup on migration errors in production.

## Existing Inline DDL

`server.js` still contains legacy `CREATE TABLE IF NOT EXISTS` bootstrap DDL. Keep it until the migration runner fully owns the schema, then move each table definition into ordered migrations and leave `server.js` with only the migration call.

The current `ALTER TABLE contracts ADD COLUMN auto_renew` inline patch should be replaced by `migrations/001_add_auto_renew.sql` once the runner is active.

## Test Databases

Tests must set `DB_PATH` before requiring `server.js` or any module that imports `./db`. The smoke tests use a temporary SQLite file so local development data is not touched.

````

## backend/docs/operations.md

````markdown
# Operations Entrypoints

## Watchdog

Use the root watchdog as the only operational process supervisor:

```bash
node watchdog.js
```

`backend/watchdog.js` is intentionally deprecated and exits with an error to prevent two supervisors from managing the same backend process.

## Health Check

The backend exposes:

```text
GET /health
```

The root watchdog checks this endpoint every 15 seconds by default. On unhealthy status or timeout, it terminates the backend and restarts it with exponential backoff.

## Backoff Settings

Environment variables:

- `WATCHDOG_RESTART_DELAY_MS`: initial restart delay, default `5000`.
- `WATCHDOG_MAX_RESTART_DELAY_MS`: maximum restart delay, default `60000`.
- `WATCHDOG_CRASH_WINDOW_MS`: crash-loop accounting window, default `120000`.
- `WATCHDOG_HEALTH_INTERVAL_MS`: health probe interval, default `15000`.
- `WATCHDOG_HEALTH_TIMEOUT_MS`: health probe timeout, default `5000`.
- `WATCHDOG_LAUNCH_KIOSK=false`: disables Edge kiosk launch.

````

## backend/watchdog.js

````js
console.error('backend/watchdog.js is deprecated. Use the operational entrypoint at ../watchdog.js.');
process.exit(1);

````

## frontend/package.json

````json
{
  "name": "frontend",
  "version": "0.1.0",
  "private": true,
  "dependencies": {
    "@testing-library/dom": "^10.4.1",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^13.5.0",
    "axios": "^1.16.1",
    "react": "^19.2.6",
    "react-dom": "^19.2.6",
    "react-router-dom": "^7.15.1",
    "react-scripts": "5.0.1",
    "web-vitals": "^2.1.4"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "test:build": "npm run build",
    "eject": "react-scripts eject"
  },
  "eslintConfig": {
    "extends": [
      "react-app",
      "react-app/jest"
    ]
  },
  "browserslist": {
    "production": [
      ">0.2%",
      "not dead",
      "not op_mini all"
    ],
    "development": [
      "last 1 chrome version",
      "last 1 firefox version",
      "last 1 safari version"
    ]
  }
}

````

## watchdog.js

````js
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const CONFIG = {
  backendScript: path.join(__dirname, 'backend', 'server.js'),
  backendCwd: path.join(__dirname, 'backend'),
  backendUrl: process.env.BACKEND_URL || 'http://127.0.0.1:3001',
  healthPath: process.env.HEALTH_PATH || '/health',
  healthIntervalMs: parseInt(process.env.WATCHDOG_HEALTH_INTERVAL_MS, 10) || 15000,
  healthTimeoutMs: parseInt(process.env.WATCHDOG_HEALTH_TIMEOUT_MS, 10) || 5000,
  restartDelayMs: parseInt(process.env.WATCHDOG_RESTART_DELAY_MS, 10) || 5000,
  maxRestartDelayMs: parseInt(process.env.WATCHDOG_MAX_RESTART_DELAY_MS, 10) || 60000,
  crashLoopWindowMs: parseInt(process.env.WATCHDOG_CRASH_WINDOW_MS, 10) || 120000,
  logFile: path.join(__dirname, 'watchdog.log'),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  edgePath: process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  launchKiosk: process.env.WATCHDOG_LAUNCH_KIOSK !== 'false',
};

let backendProcess = null;
let frontendStarted = false;
let restartDelayMs = CONFIG.restartDelayMs;
let recentCrashes = [];
let healthTimer = null;
let restartTimer = null;
let stopping = false;

function log(message) {
  const entry = `[${new Date().toISOString()}] [WATCHDOG] ${message}`;
  console.log(entry);

  try {
    fs.appendFileSync(CONFIG.logFile, `${entry}\n`);
  } catch {
    // Best-effort local audit log.
  }
}

function scheduleRestart(reason) {
  if (stopping || restartTimer) return;

  const now = Date.now();
  recentCrashes = recentCrashes.filter((timestamp) => now - timestamp < CONFIG.crashLoopWindowMs);
  recentCrashes.push(now);

  if (recentCrashes.length > 1) {
    restartDelayMs = Math.min(restartDelayMs * 2, CONFIG.maxRestartDelayMs);
  }

  log(`Scheduling backend restart in ${restartDelayMs}ms (${reason}; recentCrashes=${recentCrashes.length})`);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    startBackend();
  }, restartDelayMs);
}

function checkHealth() {
  if (!backendProcess || backendProcess.killed) return;

  const req = http.get(`${CONFIG.backendUrl}${CONFIG.healthPath}`, { timeout: CONFIG.healthTimeoutMs }, (res) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      restartDelayMs = CONFIG.restartDelayMs;
      res.resume();
      return;
    }

    log(`Health check failed with status ${res.statusCode}`);
    backendProcess.kill('SIGTERM');
  });

  req.on('timeout', () => {
    log('Health check timed out');
    req.destroy();
    if (backendProcess) backendProcess.kill('SIGTERM');
  });

  req.on('error', (err) => {
    log(`Health check error: ${err.message}`);
  });
}

function startHealthMonitor() {
  if (healthTimer) clearInterval(healthTimer);
  healthTimer = setInterval(checkHealth, CONFIG.healthIntervalMs);
}

function startBackend() {
  if (stopping) return;

  log(`Starting backend: ${CONFIG.backendScript}`);
  backendProcess = spawn('node', [CONFIG.backendScript], {
    cwd: CONFIG.backendCwd,
    stdio: 'inherit',
    env: { ...process.env },
  });

  backendProcess.on('spawn', () => {
    log(`Backend started (pid=${backendProcess.pid})`);
    startHealthMonitor();
  });

  backendProcess.on('close', (code, signal) => {
    log(`Backend exited (code=${code}, signal=${signal})`);
    backendProcess = null;
    if (healthTimer) {
      clearInterval(healthTimer);
      healthTimer = null;
    }
    if (!stopping) scheduleRestart(`exit code=${code} signal=${signal}`);
  });

  backendProcess.on('error', (err) => {
    log(`Backend start error: ${err.message}`);
    scheduleRestart('spawn error');
  });
}

function startFrontendKiosk() {
  if (!CONFIG.launchKiosk || frontendStarted) return;
  frontendStarted = true;

  log(`Starting Edge kiosk (${CONFIG.frontendUrl})`);

  try {
    const edgeProcess = spawn(CONFIG.edgePath, [
      '--kiosk',
      `--app=${CONFIG.frontendUrl}`,
      '--disable-web-security',
      '--disable-features=TranslateUI',
      '--no-first-run',
      '--no-default-browser-check',
    ], { detached: true, windowsHide: true });

    edgeProcess.unref();
    log('Edge kiosk start requested');
  } catch (err) {
    log(`Edge kiosk start failed: ${err.message}`);
  }
}

function shutdown(signal) {
  stopping = true;
  log(`Stopping watchdog (${signal})`);
  if (restartTimer) clearTimeout(restartTimer);
  if (healthTimer) clearInterval(healthTimer);
  if (backendProcess) backendProcess.kill(signal);
  process.exit(0);
}

function main() {
  log('Watchdog starting');
  log(`Operational entrypoint: ${path.join(__dirname, 'watchdog.js')}`);
  startBackend();
  setTimeout(startFrontendKiosk, 3000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

if (require.main === module) {
  main();
}

module.exports = {
  main,
  startBackend,
  checkHealth,
  CONFIG,
};

````

