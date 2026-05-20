// test-api.js - API 통합 테스트
const http = require('http');

const BASE = 'http://localhost:3001';

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('=== 공유창고 API 테스트 시작 ===\n');
  let passed = 0;
  let failed = 0;

  // 1. 회원가입
  console.log('--- 1. 회원가입 ---');
  try {
    const r1 = await api('POST', '/api/register', { username: 'testuser', email: 'test@test.com', password: 'test1234', phone: '01012345678' });
    console.log(r1.status === 201 ? `✅ 회원가입: ${JSON.stringify(r1.data)}` : `❌ 회원가입: ${r1.status} ${JSON.stringify(r1.data)}`);
    r1.status === 201 ? passed++ : failed++;
  } catch (e) { console.log(`❌ 회원가입 에러: ${e.message}`); failed++; }

  try {
    const r2 = await api('POST', '/api/register', { username: 'admin', email: 'admin@test.com', password: 'admin123', phone: '01098765432' });
    console.log(r2.status === 201 ? `✅ 회원가입 관리자: ${JSON.stringify(r2.data)}` : `❌ 회원가입 관리자: ${r2.status} ${JSON.stringify(r2.data)}`);
    r2.status === 201 ? passed++ : failed++;
  } catch (e) { console.log(`❌ 회원가입 에러: ${e.message}`); failed++; }

  // 중복 회원가입
  try {
    const r3 = await api('POST', '/api/register', { username: 'testuser', email: 'test@test.com', password: 'test1234', phone: '01012345678' });
    console.log(r3.status === 409 ? `✅ 중복 차단: ${JSON.stringify(r3.data)}` : `❌ 중복 차단 실패: ${r3.status} ${JSON.stringify(r3.data)}`);
    r3.status === 409 ? passed++ : failed++;
  } catch (e) { console.log(`❌ 중복 차단 에러: ${e.message}`); failed++; }

  // 2. 로그인
  console.log('\n--- 2. 로그인 ---');
  let adminToken, userToken;
  try {
    const r4 = await api('POST', '/api/login', { username: 'admin', password: 'admin123' });
    console.log(r4.status === 200 ? `✅ 관리자 로그인: ${r4.data.message}` : `❌ 관리자 로그인: ${r4.status}`);
    r4.status === 200 ? passed++ : failed++;
    adminToken = r4.data?.token;
  } catch (e) { console.log(`❌ 로그인 에러: ${e.message}`); failed++; }

  try {
    const r5 = await api('POST', '/api/login', { username: 'testuser', password: 'test1234' });
    console.log(r5.status === 200 ? `✅ 사용자 로그인: ${r5.data.message}` : `❌ 사용자 로그인: ${r5.status}`);
    r5.status === 200 ? passed++ : failed++;
    userToken = r5.data?.token;
  } catch (e) { console.log(`❌ 로그인 에러: ${e.message}`); failed++; }

  // 3. 창고 생성
  console.log('\n--- 3. 창고 생성 ---');
  let warehouseId;
  try {
    const r6 = await api('POST', '/api/warehouses', { name: '테스트 창고', location: '서울시', capacity: 20 }, { token: adminToken });
    console.log(r6.status === 201 ? `✅ 창고 생성: ${JSON.stringify(r6.data)}` : `❌ 창고 생성: ${r6.status} ${JSON.stringify(r6.data)}`);
    r6.status === 201 ? passed++ : failed++;
    warehouseId = r6.data?.warehouseId;
  } catch (e) { console.log(`❌ 창고 생성 에러: ${e.message}`); failed++; }

  // 4. 캐비넷 생성
  console.log('\n--- 4. 캐비넷 생성 ---');
  let cabinetId;
  if (warehouseId) {
    try {
      const r7 = await api('POST', `/api/warehouses/${warehouseId}/cabinets`, { size: 'S', relay_channel: 1 }, { token: adminToken });
      console.log(r7.status === 201 ? `✅ 캐비넷 S: ${JSON.stringify(r7.data)}` : `❌ 캐비넷: ${r7.status} ${JSON.stringify(r7.data)}`);
      r7.status === 201 ? passed++ : failed++;
      cabinetId = r7.data?.cabinetId;
    } catch (e) { console.log(`❌ 캐비넷 에러: ${e.message}`); failed++; }

    try {
      const r8 = await api('POST', `/api/warehouses/${warehouseId}/cabinets`, { size: 'M', relay_channel: 2 }, { token: adminToken });
      console.log(r8.status === 201 ? `✅ 캐비넷 M: ${JSON.stringify(r8.data)}` : `❌ 캐비넷: ${r8.status} ${JSON.stringify(r8.data)}`);
      r8.status === 201 ? passed++ : failed++;
    } catch (e) { console.log(`❌ 캐비넷 에러: ${e.message}`); failed++; }

    try {
      const r9 = await api('POST', `/api/warehouses/${warehouseId}/cabinets`, { size: 'L', relay_channel: 3 }, { token: adminToken });
      console.log(r9.status === 201 ? `✅ 캐비넷 L: ${JSON.stringify(r9.data)}` : `❌ 캐비넷: ${r9.status} ${JSON.stringify(r9.data)}`);
      r9.status === 201 ? passed++ : failed++;
    } catch (e) { console.log(`❌ 캐비넷 에러: ${e.message}`); failed++; }
  }

  // 5. 창고 목록 조회
  console.log('\n--- 5. 창고 목록 조회 ---');
  if (adminToken) {
    try {
      const r10 = await api('GET', '/api/warehouses', null, { token: adminToken });
      console.log(r10.status === 200 ? `✅ 창고 목록: ${r10.data.length}개` : `❌ 창고 목록: ${r10.status}`);
      r10.status === 200 ? passed++ : failed++;
    } catch (e) { console.log(`❌ 창고 목록 에러: ${e.message}`); failed++; }
  }

  // 6. 계약 생성
  console.log('\n--- 6. 계약 생성 ---');
  let contractId;
  if (cabinetId) {
    const now = new Date().toISOString();
    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const r11 = await api('POST', '/api/contracts', { cabinet_id: cabinetId, start_date: now, end_date: endDate, total_amount: 50000 }, { token: userToken });
      console.log(r11.status === 201 ? `✅ 계약 생성: ${JSON.stringify(r11.data)}` : `❌ 계약: ${r11.status} ${JSON.stringify(r11.data)}`);
      r11.status === 201 ? passed++ : failed++;
      contractId = r11.data?.contractId;
    } catch (e) { console.log(`❌ 계약 에러: ${e.message}`); failed++; }
  }

  // 7. 결제
  console.log('\n--- 7. 결제 ---');
  if (contractId) {
    try {
      const r12 = await api('POST', '/api/payments', { contract_id: contractId, amount: 50000, pg_approval_number: 'PG20260519001' }, { token: adminToken });
      console.log(r12.status === 201 ? `✅ 결제: ${JSON.stringify(r12.data)}` : `❌ 결제: ${r12.status} ${JSON.stringify(r12.data)}`);
      r12.status === 201 ? passed++ : failed++;
    } catch (e) { console.log(`❌ 결제 에러: ${e.message}`); failed++; }
  }

  // 8. 출입 인증 (PIN)
  console.log('\n--- 8. 출입 인증 ---');
  if (warehouseId) {
    try {
      const r13 = await api('POST', '/api/access/authenticate', { warehouse_id: warehouseId, auth_method: 'pin', auth_value: '0000' });
      console.log(`⚠️  PIN 인증 (미등록 PIN): ${r13.status} ${JSON.stringify(r13.data)}`);
    } catch (e) { console.log(`❌ 인증 에러: ${e.message}`); failed++; }
  }

  // 9. 하드웨어 상태 조회
  console.log('\n--- 9. 하드웨어 상태 ---');
  if (adminToken) {
    try {
      const r14 = await api('GET', '/api/admin/hardware/status', null, { token: adminToken });
      console.log(r14.status === 200 ? `✅ 하드웨어 상태: ${r14.data.length}개 창고` : `❌ 하드웨어: ${r14.status}`);
      r14.status === 200 ? passed++ : failed++;
    } catch (e) { console.log(`❌ 하드웨어 에러: ${e.message}`); failed++; }
  }

  // 10. 원격 문열기
  console.log('\n--- 10. 원격 문열기 ---');
  if (warehouseId && adminToken) {
    try {
      const r15 = await api('POST', '/api/admin/door/unlock', { warehouse_id: warehouseId }, { token: adminToken });
      console.log(r15.status === 200 ? `✅ 원격 문열기: ${JSON.stringify(r15.data)}` : `❌ 문열기: ${r15.status} ${JSON.stringify(r15.data)}`);
      r15.status === 200 ? passed++ : failed++;
    } catch (e) { console.log(`❌ 문열기 에러: ${e.message}`); failed++; }
  }

  // 11. 네이버 예약 동기화 (테스트 데이터)
  console.log('\n--- 11. 네이버 예약 동기화 ---');
  if (adminToken) {
    try {
      const testReservations = [
        { reservation_id: 'NAVER001', customer_name: '김테스트', phone: '01011112222', service_name: '소형 창고 1개월', start_date: '2026-05-20', end_date: '2026-06-20' },
        { reservation_id: 'NAVER002', customer_name: '박테스트', phone: '01033334444', service_name: '중형 창고 3개월', start_date: '2026-05-25', end_date: '2026-08-25' }
      ];
      const r16 = await api('POST', '/api/admin/sync-naver-reservations', { reservations: testReservations }, { token: adminToken });
      console.log(r16.status === 200 ? `✅ 네이버 동기화: ${JSON.stringify(r16.data)}` : `❌ 네이버: ${r16.status}`);
      r16.status === 200 ? passed++ : failed++;
    } catch (e) { console.log(`❌ 네이버 에러: ${e.message}`); failed++; }
  }

  // 12. 네이버 예약 조회
  console.log('\n--- 12. 네이버 예약 조회 ---');
  if (adminToken) {
    try {
      const r17 = await api('GET', '/api/admin/naver-reservations', null, { token: adminToken });
      console.log(r17.status === 200 ? `✅ 네이버 예약: ${r17.data.length}건` : `❌ 네이버 조회: ${r17.status}`);
      r17.status === 200 ? passed++ : failed++;
    } catch (e) { console.log(`❌ 네이버 조회 에러: ${e.message}`); failed++; }
  }

  // 결과 요약
  console.log(`\n=== 테스트 결과 ===`);
  console.log(`✅ 통과: ${passed}`);
  console.log(`❌ 실패: ${failed}`);
  console.log(`📊 총 ${passed + failed}개 테스트`);
}

// auth header 추가를 위한 api 함수 재정의
async function api(method, path, body, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (opts.token) options.headers['Authorization'] = `Bearer ${opts.token}`;
    if (body) options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

runTests().catch(console.error);
