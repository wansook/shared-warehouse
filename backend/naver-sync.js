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
  if (!subject.includes('예약') && !subject.toLowerCase().includes('naver') && !subject.includes('네이버')) {
    return null;
  }

  const body = [parsed?.text, parsed?.html].filter(Boolean).join('\n');
  const customerName = getFirstMatch(body, [
    /예약자\s*[:：]\s*(.+?)(?:\r?\n|$)/i,
    /이름\s*[:：]\s*(.+?)(?:\r?\n|$)/i,
    /name\s*[:：]\s*(.+?)(?:\r?\n|$)/i,
  ]);
  const phone = getFirstMatch(body, [
    /연락처\s*[:：]\s*([0-9\-\s]+)/i,
    /휴대폰\s*[:：]\s*([0-9\-\s]+)/i,
    /phone\s*[:：]\s*([0-9\-\s]+)/i,
  ]);
  const serviceName = getFirstMatch(body, [
    /상품\s*[:：]\s*(.+?)(?:\r?\n|$)/i,
    /서비스\s*[:：]\s*(.+?)(?:\r?\n|$)/i,
    /service\s*[:：]\s*(.+?)(?:\r?\n|$)/i,
  ]);
  const startDate = getFirstMatch(body, [
    /이용일\s*[:：]\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/i,
    /예약일\s*[:：]\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/i,
    /date\s*[:：]\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/i,
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
          console.log(`[네이버 동기화] 예약 저장됨: ${reservation.reservation_id}`);
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
        console.error('[네이버 동기화] 파싱 오류:', err.message);
        resolve(0);
      }
    });
  });
}

async function fetchEmails() {
  ensureNaverSyncTables();

  return new Promise((resolve, reject) => {
    if (!IMAP_CONFIG.user || !IMAP_CONFIG.password) {
      console.log('[네이버 동기화] EMAIL_USER 또는 EMAIL_PASSWORD가 설정되지 않아 이메일 동기화를 건너뜁니다');
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
      console.error('[네이버 동기화] IMAP 연결 오류:', err.message);
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
            console.error('[네이버 동기화] 가져오기 오류:', fetchErr.message);
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
  console.log(`[네이버 크롤러] ${eventType} 시도=${attempt || '-'} 성공=${success ? '예' : '아니오'} ${note}`);
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
      return text.includes('로그인 실패') || text.includes('비밀번호') || text.includes('잠금');
    });
    if (loginFailed) throw new Error('파트너 로그인 실패 또는 계정 잠금 경고가 감지되었습니다');

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
    console.log('[네이버 크롤러] NAVER_PARTNER_ID 또는 NAVER_PARTNER_PW가 설정되지 않아 크롤러 동기화를 건너뜁니다');
    auditCrawler('인증정보_누락으로_건너뜀', true, 0);
    return 0;
  }

  for (let attempt = 1; attempt <= CRAWLER_CONFIG.maxAttempts; attempt += 1) {
    try {
      auditCrawler('시도_시작', true, attempt);
      const count = await crawlNaverPartnerOnce();
      auditCrawler('시도_성공', true, attempt, `동기화=${count}`);
      return count;
    } catch (err) {
      auditCrawler('시도_실패', false, attempt, err.message);
      if (attempt === CRAWLER_CONFIG.maxAttempts) {
        console.error('[네이버 크롤러] 최대 시도 횟수에 도달하여 계정 잠금을 피하기 위해 중지합니다');
        return 0;
      }
      await sleep(CRAWLER_CONFIG.retryDelayMs);
    }
  }

  return 0;
}

function startSyncScheduler(intervalMs = 600000) {
  console.log(`[네이버 동기화] 스케줄러 시작: 이메일=${intervalMs}ms 크롤러=3600000ms`);

  const emailTimer = setInterval(async () => {
    try {
      const count = await fetchEmails();
      console.log(`[네이버 동기화] 이메일 처리됨: ${count}`);
    } catch (err) {
      console.error('[네이버 동기화] 이메일 오류:', err.message);
    }
  }, intervalMs);

  const crawlerTimer = setInterval(async () => {
    try {
      const count = await crawlNaverPartner();
      console.log(`[네이버 크롤러] 동기화됨: ${count}`);
    } catch (err) {
      console.error('[네이버 크롤러] 오류:', err.message);
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
