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

  assert.equal(reservation.customer_name, '홍길동');
  assert.equal(reservation.phone, '01012345678');
  assert.equal(reservation.service_name, '소형 창고 1개월');
  assert.equal(reservation.start_date, '2026-05-23');
  assert.equal(reservation.reservation_id, '<fixture-reservation-001@naver.test>');
});

test('ignores missing subject without throwing', () => {
  const reservation = parseNaverReservationEmailFromParsed({
    subject: null,
    text: '예약자: 홍길동\n연락처: 010-1234-5678\n상품: 소형\n이용일: 2026-05-23',
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
