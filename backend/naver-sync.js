/**
 * 네이버 예약 우회 연동 모듈
 * - 이메일 IMAP 파싱 (메인)
 * - 웹 크롤링 (서브 - Puppeteer 기반)
 */

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./warehouse.db');

// ============= IMAP 이메일 파싱 =============
const Imap = require('imap');
const { simpleParser } = require('mailparser');

const IMAP_CONFIG = {
  host: process.env.EMAIL_IMAP_HOST || 'imap.naver.com',
  port: process.env.EMAIL_IMAP_PORT || 993,
  secure: true,
  user: process.env.EMAIL_USER || '',
  password: process.env.EMAIL_PASSWORD || '',
  boxsize: 10000000
};

let imap = null;

function parseNaverReservationEmail(rawEmail) {
  /**
   * 네이버 예약 확정 알림 이메일 파싱
   * 예약자명, 전화번호, 서비스명, 시작/종료일 추출
   */
  return {
    customer_name: rawEmail.customer_name || '',
    phone: rawEmail.phone || '',
    service_name: rawEmail.service_name || '',
    start_date: rawEmail.start_date || '',
    end_date: rawEmail.end_date || '',
    reservation_id: rawEmail.reservation_id || `naver_${Date.now()}`
  };
}

async function fetchEmails() {
  /**
   * IMAP 연결 → 새 예약 이메일 파싱 → DB 저장
   */
  return new Promise((resolve, reject) => {
    if (!IMAP_CONFIG.user) {
      console.log('[네이버 연동] 이메일 설정이 없습니다. 건너뜁니다.');
      return resolve(0);
    }

    imap = new Imap({
      host: IMAP_CONFIG.host,
      port: IMAP_CONFIG.port,
      secure: true,
      user: IMAP_CONFIG.user,
      password: IMAP_CONFIG.password
    });

    imap.once('error', (err) => {
      console.error('[네이버 연동] IMAP 연결 오류:', err.message);
      reject(err);
    });

    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err, box) => {
        if (err) return reject(err);

        imap.search([['UNSEEN']], (err, results) => {
          if (err || !results || results.length === 0) {
            imap.end();
            return resolve(0);
          }

          let count = 0;
          const fetch = imap.fetch(results);

          fetch.on('message', (msg) => {
            msg.on('body', (stream) => {
              simpleParser(stream, async (err, parsed) => {
                if (err) return;

                // 네이버 예약 알림인지 확인
                if (!parsed.subject.includes('예약') && !parsed.subject.includes('네이버')) {
                  return;
                }

                // 본문에서 예약 정보 추출 (정규식 기반)
                const body = parsed.text || '';
                const nameMatch = body.match(/예약자[:\s]*(.+?)(\n|$)/);
                const phoneMatch = body.match(/연락처[:\s]*(\d[-\s]*)/);
                const serviceMatch = body.match(/상품[:\s]*(.+?)(\n|$)/);
                const dateMatch = body.match(/이용일[:\s]*(\d{4}[\-\/]\d{2}[\-\/]\d{2})/);

                const reservation = {
                  reservation_id: parsed.messageId || `email_${Date.now()}_${count}`,
                  customer_name: nameMatch ? nameMatch[1].trim() : '',
                  phone: phoneMatch ? phoneMatch[1].replace(/[-\s]/g, '') : '',
                  service_name: serviceMatch ? serviceMatch[1].trim() : '',
                  start_date: dateMatch ? dateMatch[1].replace(/\//g, '-') : '',
                  end_date: dateMatch ? dateMatch[1].replace(/\//g, '-') : ''
                };

                if (reservation.customer_name && reservation.phone) {
                  saveReservation(reservation);
                  count++;
                }

                // 읽음 표시
                imap.markSeen(msg.attributes.uid);
              });
            });
          });

          fetch.on('error', (err) => {
            console.error('[네이버 연동] fetch 오류:', err);
          });

          fetch.on('end', () => {
            imap.end();
            resolve(count);
          });
        });
      });
    });

    imap.connect();
  });
}

function saveReservation(reservation) {
  db.run(
    `INSERT OR IGNORE INTO naver_reservations (reservation_id, customer_name, phone, service_name, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)`,
    [reservation.reservation_id, reservation.customer_name, reservation.phone, reservation.service_name, reservation.start_date, reservation.end_date],
    function (err) {
      if (!err && this.changes > 0) {
        console.log(`[네이버 연동] 예약 등록: ${reservation.customer_name} (${reservation.phone})`);
      }
    }
  );
}

// ============= Puppeteer 크롤링 (서브 동기화) =============
async function crawlNaverPartner() {
  /**
   * 네이버 파트너센터 로그인 → 예약 리스트 크롤링
   * 실제 사용 시 네이버 파트너센터 URL/선택자 조정 필요
   */
  const puppeteer = require('puppeteer');

  const NAVER_PARTNER_URL = 'https://partner.smtopia.com/reservation';
  const NAVER_ID = process.env.NAVER_PARTNER_ID || '';
  const NAVER_PW = process.env.NAVER_PARTNER_PW || '';

  if (!NAVER_ID || !NAVER_PW) {
    console.log('[네이버 크롤링] 계정 정보가 없습니다. 건너뜁니다.');
    return 0;
  }

  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // 로그인
    await page.goto(NAVER_PARTNER_URL, { waitUntil: 'networkidle2' });

    // 실제 선택자는 네이버 파트너센터 UI에 따라 조정 필요
    await page.type('#id', NAVER_ID);
    await page.type('#pw', NAVER_PW);
    await page.click('#loginBtn');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    // 예약 리스트 파싱
    const reservations = await page.evaluate(() => {
      const rows = document.querySelectorAll('.reservation-row');
      const results = [];
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 5) {
          results.push({
            reservation_id: cells[0].textContent.trim(),
            customer_name: cells[1].textContent.trim(),
            phone: cells[2].textContent.trim(),
            service_name: cells[3].textContent.trim(),
            start_date: cells[4].textContent.trim(),
            end_date: cells[4].textContent.trim()
          });
        }
      });
      return results;
    });

    await browser.close();

    let count = 0;
    reservations.forEach(r => {
      saveReservation(r);
      count++;
    });

    console.log(`[네이버 크롤링] ${count}건 동기화 완료`);
    return count;
  } catch (err) {
    console.error('[네이버 크롤링] 오류:', err.message);
    return 0;
  }
}

// ============= 자동 동기화 스케줄러 =============
function startSyncScheduler(intervalMs = 600000) {
  /**
   * 10분마다 이메일 파싱 실행
   * 매시간 웹 크롤링 1회
   */
  console.log(`[네이버 연동] 자동 동기화 시작 (이메일: ${intervalMs / 60000}분마다, 크롤링: 매시간)`);

  // 이메일 파싱
  setInterval(async () => {
    try {
      const count = await fetchEmails();
      console.log(`[네이버 연동] 이메일 파싱: ${count}건 처리`);
    } catch (err) {
      console.error('[네이버 연동] 파싱 오류:', err.message);
    }
  }, intervalMs);

  // 웹 크롤링 (매시간 1회)
  setInterval(async () => {
    try {
      const count = await crawlNaverPartner();
      console.log(`[네이버 크롤링] ${count}건 동기화`);
    } catch (err) {
      console.error('[네이버 크롤링] 오류:', err.message);
    }
  }, 3600000);
}

module.exports = {
  fetchEmails,
  crawlNaverPartner,
  saveReservation,
  startSyncScheduler,
  IMAP_CONFIG
};
