/**
 * E2E RBAC (Role-Based Access Control) 테스트
 * 
 * 3개 역할(Customer/User, Store Owner, Super Admin) 관점에서
 * 공유창고 API의 권한 검증을 E2E로 테스트합니다.
 * 
 * 실행: node test/e2e-rbac.test.js
 * (백엔드 서버가 3001번 포트에서 실행 중이어야 함)
 */

const http = require('http');
const { execSync } = require('child_process');
const path = require('path');

const BASE = 'http://localhost:3001';
const BACKEND_DIR = path.resolve(__dirname, '..');

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;
let testNumber = 0;

function pass(msg) {
  passed++;
  console.log(`  ${GREEN}✅ PASS${RESET} ${msg}`);
}

function fail(msg, detail = '') {
  failed++;
  console.log(`  ${RED}❌ FAIL${RESET} ${msg}${detail ? `\n     ${YELLOW}→ ${detail}${RESET}` : ''}`);
}

function section(title) {
  testNumber = 0;
  console.log(`\n${CYAN}${BOLD}━━━ ${title} ━━━${RESET}\n`);
}

function testName(title) {
  testNumber++;
  return `[#${testNumber}] ${title}`;
}

function api(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + (url.search || ''),
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    if (body) options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, data: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function waitForServer(maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const r = await api('GET', '/health');
      if (r.status === 200) return true;
    } catch (e) {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

function checkOwnership(warehouses, expectedOwnerId) {
  if (!warehouses || !Array.isArray(warehouses)) return { ok: false, reason: 'not an array' };
  const wrong = warehouses.filter(w => w.owner_id !== expectedOwnerId);
  if (wrong.length > 0) {
    return { ok: false, reason: `Found ${wrong.length} warehouse(s) with wrong owner_id. IDs: ${wrong.map(w => w.id).join(', ')}` };
  }
  return { ok: true, count: warehouses.length };
}

async function main() {
  // ===== Phase 0: Initialize DB and start server =====
  console.log(`${BOLD}${YELLOW}⚡ Phase 0: 서버 준비 확인 중...${RESET}`);

  // Check if server is running
  const serverReady = await waitForServer(5);
  if (!serverReady) {
    console.log(`\n${RED}⚠️  서버가 3001번 포트에서 실행 중이지 않습니다.${RESET}`);
    console.log(`   서버를 먼저 시작해주세요:`);
    console.log(`   cd ${BACKEND_DIR} && node init-db.js && node server.js`);
    console.log(`   (서버는 3001번 포트로 실행됩니다)`);
    process.exit(1);
  }
  console.log(`  ${GREEN}✅ 서버 준비 완료${RESET}`);

  // ======================================================================
  // Phase 1: 사전 데이터 준비 - 회원가입 및 계정 생성
  // ======================================================================
  section('Phase 1: 테스트 계정 생성');

  const testAccounts = {};

  // 1-1. 관리자 로그인 (init-db.js에서 생성된 admin 계정)
  console.log(`  ${testName('관리자 로그인 (admin/admin1234)')}`);
  let r = await api('POST', '/api/login', { username: 'admin', password: 'admin1234' });
  if (r.status === 200 && r.data.token) {
    pass('관리자 로그인 성공');
    testAccounts.admin = { token: r.data.token, user: r.data.user };
    console.log(`     관리자 ID: ${r.data.user.id}, Role: ${r.data.user.role}`);
  } else {
    fail('관리자 로그인 실패', JSON.stringify(r.data));
    console.log(`  ${RED}⚠️  관리자 로그인 실패로 계속 진행 불가. init-db.js를 먼저 실행하세요.${RESET}`);
    process.exit(1);
  }

  // 1-2. Store Owner 1 생성
  console.log(`  ${testName('점주1 회원가입')}`);
  r = await api('POST', '/api/register', {
    username: 'owner1', email: 'owner1@test.com', password: 'owner1234', phone: '01011112222'
  });
  if (r.status === 201) {
    pass('점주1 회원가입 성공');
    // role을 store_owner로 변경 (admin만 가능한 API이므로 admin 계정으로 직접 DB 조작)
    // 대신 init-db에 store_owner 유저를 직접 등록
  } else if (r.status === 409) {
    pass('점주1 이미 가입됨 (중복 허용)');
  } else {
    fail('점주1 회원가입 실패', JSON.stringify(r.data));
  }

  // Store Owner 1 로그인 (일단 role이 'user'일 것이므로 admin이 role 변경 필요)
  console.log(`  ${testName('점주1 로그인')}`);
  r = await api('POST', '/api/login', { username: 'owner1', password: 'owner1234' });
  if (r.status === 200) {
    pass('점주1 로그인 성공');
    testAccounts.owner1 = { token: r.data.token, user: r.data.user };
    console.log(`     점주1 ID: ${r.data.user.id}, Role: ${r.data.user.role}`);
  } else {
    fail('점주1 로그인 실패', JSON.stringify(r.data));
  }

  // 1-3. Store Owner 2 생성
  console.log(`  ${testName('점주2 회원가입')}`);
  r = await api('POST', '/api/register', {
    username: 'owner2', email: 'owner2@test.com', password: 'owner1234', phone: '01033334444'
  });
  if (r.status === 201) {
    pass('점주2 회원가입 성공');
  } else if (r.status === 409) {
    pass('점주2 이미 가입됨');
  } else {
    fail('점주2 회원가입 실패', JSON.stringify(r.data));
  }

  console.log(`  ${testName('점주2 로그인')}`);
  r = await api('POST', '/api/login', { username: 'owner2', password: 'owner1234' });
  if (r.status === 200) {
    pass('점주2 로그인 성공');
    testAccounts.owner2 = { token: r.data.token, user: r.data.user };
    console.log(`     점주2 ID: ${r.data.user.id}, Role: ${r.data.user.role}`);
  } else {
    fail('점주2 로그인 실패', JSON.stringify(r.data));
  }

  // 1-4. 일반 고객(Customer) 생성
  console.log(`  ${testName('고객 회원가입')}`);
  r = await api('POST', '/api/register', {
    username: 'customer1', email: 'customer1@test.com', password: 'cust1234', phone: '01055556666'
  });
  if (r.status === 201) {
    pass('고객 회원가입 성공');
  } else if (r.status === 409) {
    pass('고객 이미 가입됨');
  } else {
    fail('고객 회원가입 실패', JSON.stringify(r.data));
  }

  console.log(`  ${testName('고객 로그인')}`);
  r = await api('POST', '/api/login', { username: 'customer1', password: 'cust1234' });
  if (r.status === 200) {
    pass('고객 로그인 성공');
    testAccounts.customer = { token: r.data.token, user: r.data.user };
    console.log(`     고객 ID: ${r.data.user.id}, Role: ${r.data.user.role}`);
  } else {
    fail('고객 로그인 실패', JSON.stringify(r.data));
  }

  // ======================================================================
  // Phase 1b: Role 업그레이드 (admin으로 store_owner 지정)
  // ======================================================================
  section('Phase 1b: Role 변경 (user → store_owner)');

  if (testAccounts.owner1 && testAccounts.owner1.user.role !== 'store_owner') {
    console.log(`  ${testName('점주1 role→store_owner 변경 (직접 DB)')}`);
    // 직접 DB를 업데이트해야 하므로 API가 없음 -> 임시로 직접 DB 조작
    // server.js에는 role 변경 API가 없음. admin API 목록 확인 결과 없음.
    // 대신 init-db.js에서 store_owner가 포함된 role check가 있으므로
    // 직접 SQL UPDATE가 필요하지만, API로는 불가능.
    // 대안: 관리자로 로그인해서 admin API를 통해... 없음. 직접 SQLite 업데이트가 필요.
    // 차선책: test에서 직접 db 모듈 사용
    try {
      const db = require(path.join(BACKEND_DIR, 'db'));
      await new Promise((resolve, reject) => {
        db.run(`UPDATE users SET role = 'store_owner' WHERE username = 'owner1'`, (err) => {
          if (err) reject(err); else resolve();
        });
      });
      await new Promise((resolve, reject) => {
        db.run(`UPDATE users SET role = 'store_owner' WHERE username = 'owner2'`, (err) => {
          if (err) reject(err); else resolve();
        });
      });
      pass('점주 role 변경 완료');
      
      // 다시 로그인해서 새로운 토큰 발급
      console.log(`  ${testName('점주1 재로그인 (store_owner role)')}`);
      r = await api('POST', '/api/login', { username: 'owner1', password: 'owner1234' });
      if (r.status === 200) {
        pass('점주1 재로그인 성공');
        testAccounts.owner1 = { token: r.data.token, user: r.data.user };
        console.log(`     점주1 ID: ${r.data.user.id}, Role: ${r.data.user.role}`);
      }
      
      console.log(`  ${testName('점주2 재로그인 (store_owner role)')}`);
      r = await api('POST', '/api/login', { username: 'owner2', password: 'owner1234' });
      if (r.status === 200) {
        pass('점주2 재로그인 성공');
        testAccounts.owner2 = { token: r.data.token, user: r.data.user };
        console.log(`     점주2 ID: ${r.data.user.id}, Role: ${r.data.user.role}`);
      }
    } catch (e) {
      fail('Role 변경 실패', e.message);
    }
  } else {
    console.log(`  ${YELLOW}⚠️  점주 계정 정보 부족으로 Role 변경 스킵${RESET}`);
  }

  // ======================================================================
  // Phase 1c: 창고 생성
  // ======================================================================
  section('Phase 1c: 테스트 데이터 생성');

  let warehouse1Id, warehouse2Id, cabinet1Id, cabinet2Id;

  // Admin이 창고1 생성 (본인 소유)
  console.log(`  ${testName('관리자 창고 생성 (owner_id 없음 = 본인 소유)')}`);
  r = await api('POST', '/api/warehouses', 
    { name: 'Admin 창고', location: '서울시 강남구', capacity: 30 },
    testAccounts.admin.token
  );
  if (r.status === 201) {
    pass('Admin 창고 생성 성공');
    warehouse1Id = r.data.warehouseId;
    console.log(`     창고1 ID: ${warehouse1Id}`);
  } else {
    fail('Admin 창고 생성 실패', JSON.stringify(r.data));
  }

  // Admin이 창고2 생성 (owner_id로 owner1 지정) - 핵심 테스트!
  console.log(`  ${testName('[핵심] 관리자가 owner_id로 다른 점주(owner1) 지정하여 창고 생성')}`);
  const owner1Id = testAccounts.owner1?.user?.id;
  if (owner1Id && testAccounts.admin) {
    r = await api('POST', '/api/warehouses',
      { name: '점주1의 창고', location: '서울시 서초구', capacity: 50, owner_id: owner1Id },
      testAccounts.admin.token
    );
    if (r.status === 201) {
      pass(`owner_id=${owner1Id}로 창고 생성 완료`);
      warehouse2Id = r.data.warehouseId;
      console.log(`     창고2 ID: ${warehouse2Id}, Owner: ${owner1Id}`);
    } else {
      fail('owner_id 지정 창고 생성 실패', JSON.stringify(r.data));
    }
  } else {
    fail('점주1 ID 또는 Admin 토큰 없음', `owner1Id=${owner1Id}, admin=${!!testAccounts.admin}`);
  }

  // 창고1에 캐비넷 생성
  if (warehouse1Id && testAccounts.admin) {
    console.log(`  ${testName('창고1에 캐비넷 생성')}`);
    r = await api('POST', `/api/warehouses/${warehouse1Id}/cabinets`,
      { name: 'S-1', size: 'S', relay_channel: 1, position_x: 0, position_y: 0, position_index: 0 },
      testAccounts.admin.token
    );
    if (r.status === 201) {
      pass('캐비넷 생성 성공');
      cabinet1Id = r.data.cabinetId;
      console.log(`     캐비넷1 ID: ${cabinet1Id}`);
      
      // 두 번째 캐비넷
      r = await api('POST', `/api/warehouses/${warehouse1Id}/cabinets`,
        { name: 'M-1', size: 'M', relay_channel: 2, position_x: 0, position_y: 1, position_index: 1 },
        testAccounts.admin.token
      );
      if (r.status === 201) pass('캐비넷2 생성 성공');
    } else {
      fail('캐비넷 생성 실패', JSON.stringify(r.data));
    }
  }

  // 창고2에 캐비넷 생성
  if (warehouse2Id && testAccounts.admin) {
    console.log(`  ${testName('창고2(점주1 소유)에 캐비넷 생성')}`);
    r = await api('POST', `/api/warehouses/${warehouse2Id}/cabinets`,
      { name: 'L-1', size: 'L', relay_channel: 3, position_x: 0, position_y: 0, position_index: 0 },
      testAccounts.admin.token
    );
    if (r.status === 201) {
      pass('캐비넷 생성 성공');
      cabinet2Id = r.data.cabinetId;
      console.log(`     캐비넷3 ID: ${cabinet2Id}`);
    } else {
      fail('캐비넷 생성 실패', JSON.stringify(r.data));
    }
  }

  // ======================================================================
  // Phase 2: 고객(Customer, role='user') 테스트
  // ======================================================================
  section('Phase 2: 고객(Customer) 권한 테스트');

  if (!testAccounts.customer) {
    console.log(`  ${RED}⚠️  고객 계정 없음, Phase 2 스킵${RESET}`);
  } else {
    const ct = testAccounts.customer.token;
    const cu = testAccounts.customer.user;

    // 2-1. 창고 목록 조회 (user는 모든 창고 보임)
    console.log(`  ${testName('고객 GET /api/warehouses → 모든 창고 조회 가능')}`);
    r = await api('GET', '/api/warehouses', null, ct);
    if (r.status === 200 && Array.isArray(r.data)) {
      pass(`창고 목록 조회 성공: ${r.data.length}개`);
    } else {
      fail('창고 목록 조회 실패', JSON.stringify(r.data));
    }

    // 2-2. 캐비넷 조회 (user는 창고 owner가 아니므로 403)
    if (warehouse1Id) {
      console.log(`  ${testName('고객 GET /api/warehouses/:id/cabinets → 403 (owner 아님)')}`);
      r = await api('GET', `/api/warehouses/${warehouse1Id}/cabinets`, null, ct);
      if (r.status === 403) {
        pass('캐비넷 접근 차단 (403)');
      } else {
        fail(`캐비넷 접근: 예상 403, 실제 ${r.status}`, JSON.stringify(r.data));
      }
    }

    // 2-3. 창고 레이아웃 조회 (user도 볼 수 있음 - 인증만 있으면 됨)
    if (warehouse1Id) {
      console.log(`  ${testName('고객 GET /api/warehouses/:id/layout → 조회 가능')}`);
      r = await api('GET', `/api/warehouses/${warehouse1Id}/layout`, null, ct);
      if (r.status === 200) {
        pass('레이아웃 조회 성공');
      } else {
        fail('레이아웃 조회 실패', JSON.stringify(r.data));
      }
    }

    // 2-4. 레이아웃 수정 시도 (user는 403)
    if (warehouse2Id) {
      console.log(`  ${testName('고객 PUT /api/warehouses/:id/layout → 403')}`);
      r = await api('PUT', `/api/warehouses/${warehouse2Id}/layout`,
        { layout_data: [{ x: 0, y: 0, cabinet_id: 1 }] }, ct
      );
      if (r.status === 403) {
        pass('레이아웃 수정 차단 (403)');
      } else {
        fail(`레이아웃 수정: 예상 403, 실제 ${r.status}`, JSON.stringify(r.data));
      }
    }

    // 2-5. 캐비넷 상태 변경 시도 (user는 403)
    if (cabinet1Id) {
      console.log(`  ${testName('고객 PUT /api/cabinets/:id/status → 403')}`);
      r = await api('PUT', `/api/cabinets/${cabinet1Id}/status`,
        { status: 'maintenance' }, ct
      );
      if (r.status === 403) {
        pass('캐비넷 상태 변경 차단 (403)');
      } else {
        fail(`캐비넷 상태 변경: 예상 403, 실제 ${r.status}`, JSON.stringify(r.data));
      }
    }

    // 2-6. 캐비넷 레이아웃 수정 시도 (user는 403)
    if (cabinet1Id) {
      console.log(`  ${testName('고객 PUT /api/cabinets/:id/layout → 403')}`);
      r = await api('PUT', `/api/cabinets/${cabinet1Id}/layout`,
        { position_x: 5, position_y: 5 }, ct
      );
      if (r.status === 403) {
        pass('캐비넷 레이아웃 수정 차단 (403)');
      } else {
        fail(`캐비넷 레이아웃 수정: 예상 403, 실제 ${r.status}`, JSON.stringify(r.data));
      }
    }

    // 2-7. 계약 조회 (본인만)
    console.log(`  ${testName('고객 GET /api/contracts → 본인 계약만 조회')}`);
    r = await api('GET', '/api/contracts', null, ct);
    if (r.status === 200 && Array.isArray(r.data)) {
      pass(`계약 조회 성공: ${r.data.length}개`);
    } else {
      fail('계약 조회 실패', JSON.stringify(r.data));
    }

    // 2-8. 프로필 조회 (본인)
    console.log(`  ${testName('고객 GET /api/profile/:id → 본인 프로필 조회')}`);
    r = await api('GET', `/api/profile/${cu.id}`, null, ct);
    if (r.status === 200) {
      pass('본인 프로필 조회 성공');
    } else {
      fail('프로필 조회 실패', JSON.stringify(r.data));
    }

    // 2-9. 타인 프로필 조회 시도 (403)
    const otherUserId = testAccounts.owner1?.user?.id || 999;
    console.log(`  ${testName('고객 GET /api/profile/:otherId → 403 (타인 프로필)')}`);
    r = await api('GET', `/api/profile/${otherUserId}`, null, ct);
    if (r.status === 403) {
      pass('타인 프로필 차단 (403)');
    } else {
      fail(`타인 프로필: 예상 403, 실제 ${r.status}`, JSON.stringify(r.data));
    }

    // 2-10. 관리자 전용 API 접근 시도 (403)
    console.log(`  ${testName('고객 GET /api/admin/users → 403')}`);
    r = await api('GET', '/api/admin/users', null, ct);
    if (r.status === 403) {
      pass('관리자 API 차단 (403)');
    } else {
      fail(`관리자 API: 예상 403, 실제 ${r.status}`, JSON.stringify(r.data));
    }
  }

  // ======================================================================
  // Phase 3: 점주(Store Owner) 테스트 - 핵심!
  // ======================================================================
  section('Phase 3: 점주(Store Owner) 권한 테스트 [핵심]');

  if (!testAccounts.owner1 || !testAccounts.owner2) {
    console.log(`  ${RED}⚠️  점주 계정 부족, Phase 3 스킵${RESET}`);
  } else {
    const o1t = testAccounts.owner1.token;
    const o1u = testAccounts.owner1.user;
    const o2t = testAccounts.owner2.token;

    // ===== 3-1. Store Owner가 GET /api/warehouses → 본인 창고만 보이는지 [핵심] =====
    console.log(`  ${BOLD}${YELLOW}[핵심-1]${RESET} ${testName('점주1 GET /api/warehouses → 본인 창고만 조회')}`);
    r = await api('GET', '/api/warehouses', null, o1t);
    if (r.status === 200 && Array.isArray(r.data)) {
      const check = checkOwnership(r.data, o1u.id);
      if (check.ok) {
        pass(`점주1 본인 창고만 조회 성공: ${check.count}개`);
      } else {
        fail('점주1 타인 창고 조회됨!', check.reason);
        console.log(`     ${RED}⚠️  조회된 창고들: ${JSON.stringify(r.data.map(w => ({id: w.id, name: w.name, owner_id: w.owner_id})))}${RESET}`);
      }
    } else {
      fail('점주1 창고 조회 실패', JSON.stringify(r.data));
    }

    console.log(`  ${BOLD}${YELLOW}[핵심-2]${RESET} ${testName('점주2 GET /api/warehouses → 본인 창고만 조회 (=빈 배열)')}`);
    r = await api('GET', '/api/warehouses', null, o2t);
    if (r.status === 200 && Array.isArray(r.data)) {
      if (r.data.length === 0) {
        pass('점주2 본인 창고만 조회 성공: 0개 (맞음)');
      } else {
        // 점주2의 창고가 있다면 owner_id가 점주2인지 확인
        const check = checkOwnership(r.data, testAccounts.owner2.user.id);
        if (check.ok) {
          pass(`점주2 본인 창고만 조회 성공: ${check.count}개`);
        } else {
          fail('점주2 타인 창고 조회됨!', check.reason);
        }
      }
    } else {
      fail('점주2 창고 조회 실패', JSON.stringify(r.data));
    }

    // ===== 3-2. Store Owner가 본인 창고의 캐비넷 상태 변경 [핵심] =====
    if (warehouse2Id && cabinet2Id && o1t) {
      console.log(`  ${BOLD}${YELLOW}[핵심-3]${RESET} ${testName('점주1이 본인 창고의 캐비넷 상태 변경 → 성공')}`);
      r = await api('PUT', `/api/cabinets/${cabinet2Id}/status`,
        { status: 'maintenance' }, o1t
      );
      if (r.status === 200) {
        pass('본인 창고 캐비넷 상태 변경 성공');
        // 원복
        await api('PUT', `/api/cabinets/${cabinet2Id}/status`,
          { status: 'available' }, o1t
        );
      } else {
        fail('본인 창고 캐비넷 상태 변경 실패', JSON.stringify(r.data));
      }
    } else {
      console.log(`  ${YELLOW}⚠️  창고2/캐비넷2/점주1 정보 없음${RESET}`);
    }

    // ===== 3-3. 다른 점주의 창고 캐비넷 변경 시도 → 403 [핵심] =====
    if (warehouse2Id && cabinet2Id && o2t) {
      console.log(`  ${BOLD}${YELLOW}[핵심-4]${RESET} ${testName('점주2가 점주1의 창고 캐비넷 status 변경 시도 → 403')}`);
      r = await api('PUT', `/api/cabinets/${cabinet2Id}/status`,
        { status: 'maintenance' }, o2t
      );
      if (r.status === 403) {
        pass('타인 창고 캐비넷 상태 변경 차단 (403)');
      } else {
        fail(`타인 창고 캐비넷 변경: 예상 403, 실제 ${r.status}`, JSON.stringify(r.data));
      }
    }

    // ===== 3-4. 본인 창고 캐비넷 이름 변경 → 성공 =====
    if (cabinet2Id && o1t) {
      console.log(`  ${testName('점주1이 본인 창고 캐비넷 이름 변경 → 성공')}`);
      r = await api('PUT', `/api/cabinets/${cabinet2Id}`,
        { name: 'L-Special' }, o1t
      );
      if (r.status === 200) {
        pass('본인 창고 캐비넷 이름 변경 성공');
        // 원복
        await api('PUT', `/api/cabinets/${cabinet2Id}`,
          { name: 'L-1' }, o1t
        );
      } else {
        fail('본인 창고 캐비넷 이름 변경 실패', JSON.stringify(r.data));
      }
    }

    // ===== 3-5. 타인 창고 캐비넷 이름 변경 시도 → 403 =====
    if (cabinet1Id && o1t) {
      console.log(`  ${testName('점주1이 Admin 창고의 캐비넷 이름 변경 시도 → 403')}`);
      r = await api('PUT', `/api/cabinets/${cabinet1Id}`,
        { name: 'Hacked' }, o1t
      );
      if (r.status === 403) {
        pass('타인 창고 캐비넷 이름 변경 차단 (403)');
      } else {
        fail(`타인 캐비넷 이름 변경: 예상 403, 실제 ${r.status}`, JSON.stringify(r.data));
      }
    }

    // ===== 3-6. 본인 창고 레이아웃 편집 [핵심] =====
    if (warehouse2Id && o1t) {
      console.log(`  ${BOLD}${YELLOW}[핵심-5]${RESET} ${testName('점주1이 본인 창고 레이아웃 편집 → 성공')}`);
      r = await api('PUT', `/api/warehouses/${warehouse2Id}/layout`,
        { layout_data: [{ cabinet_id: cabinet2Id, x: 2, y: 3 }] }, o1t
      );
      if (r.status === 200) {
        pass('본인 창고 레이아웃 편집 성공');
      } else {
        fail('본인 창고 레이아웃 편집 실패', JSON.stringify(r.data));
      }
    }

    // ===== 3-7. 타인 창고 레이아웃 편집 시도 → 403 [핵심] =====
    if (warehouse1Id && o1t) {
      console.log(`  ${BOLD}${YELLOW}[핵심-6]${RESET} ${testName('점주1이 Admin 창고 레이아웃 편집 시도 → 403')}`);
      r = await api('PUT', `/api/warehouses/${warehouse1Id}/layout`,
        { layout_data: [{ cabinet_id: cabinet1Id, x: 1, y: 1 }] }, o1t
      );
      if (r.status === 403) {
        pass('타인 창고 레이아웃 편집 차단 (403)');
      } else {
        fail(`타인 창고 레이아웃 편집: 예상 403, 실제 ${r.status}`, JSON.stringify(r.data));
      }
    }

    // ===== 3-8. 본인 창고의 캐비넷 레이아웃 수정 → 성공 =====
    if (cabinet2Id && o1t) {
      console.log(`  ${testName('점주1이 본인 창고 캐비넷 레이아웃 수정 → 성공')}`);
      r = await api('PUT', `/api/cabinets/${cabinet2Id}/layout`,
        { position_x: 3, position_y: 4, position_index: 1 }, o1t
      );
      if (r.status === 200) {
        pass('본인 창고 캐비넷 레이아웃 수정 성공');
      } else {
        fail('본인 창고 캐비넷 레이아웃 수정 실패', JSON.stringify(r.data));
      }
    }

    // ===== 3-9. 타인 창고의 캐비넷 레이아웃 수정 시도 → 403 =====
    if (cabinet1Id && o1t) {
      console.log(`  ${testName('점주1이 Admin 창고의 캐비넷 레이아웃 수정 시도 → 403')}`);
      r = await api('PUT', `/api/cabinets/${cabinet1Id}/layout`,
        { position_x: 9, position_y: 9 }, o1t
      );
      if (r.status === 403) {
        pass('타인 창고 캐비넷 레이아웃 수정 차단 (403)');
      } else {
        fail(`타인 캐비넷 레이아웃: 예상 403, 실제 ${r.status}`, JSON.stringify(r.data));
      }
    }

    // ===== 3-10. Store Owner가 본인 창고의 캐비넷 목록 조회 =====
    if (warehouse2Id && o1t) {
      console.log(`  ${testName('점주1이 본인 창고의 캐비넷 목록 조회 → 성공')}`);
      r = await api('GET', `/api/warehouses/${warehouse2Id}/cabinets`, null, o1t);
      if (r.status === 200) {
        pass(`본인 창고 캐비넷 조회 성공: ${r.data.length}개`);
      } else {
        fail('본인 창고 캐비넷 조회 실패', JSON.stringify(r.data));
      }
    }

    // ===== 3-11. Store Owner가 타인 창고의 캐비넷 목록 조회 → 403 =====
    if (warehouse1Id && o1t) {
      console.log(`  ${testName('점주1이 Admin 창고의 캐비넷 목록 조회 → 403')}`);
      r = await api('GET', `/api/warehouses/${warehouse1Id}/cabinets`, null, o1t);
      if (r.status === 403) {
        pass('타인 창고 캐비넷 목록 조회 차단 (403)');
      } else {
        fail(`타인 창고 캐비넷 목록: 예상 403, 실제 ${r.status}`, JSON.stringify(r.data));
      }
    }

    // ===== 3-12. Store Owner가 본인 창고에 새 캐비넷 추가 =====
    if (warehouse2Id && o1t) {
      console.log(`  ${testName('점주1이 본인 창고에 새 캐비넷 추가 → 성공')}`);
      r = await api('POST', `/api/warehouses/${warehouse2Id}/cabinets`,
        { name: 'XL-New', size: 'XL', relay_channel: 10 }, o1t
      );
      if (r.status === 201) {
        pass('본인 창고에 캐비넷 추가 성공');
      } else {
        fail('본인 창고 캐비넷 추가 실패', JSON.stringify(r.data));
      }
    }

    // ===== 3-13. Store Owner가 타인 창고에 새 캐비넷 추가 시도 → 403 =====
    if (warehouse1Id && o1t) {
      console.log(`  ${testName('점주1이 Admin 창고에 캐비넷 추가 시도 → 403')}`);
      r = await api('POST', `/api/warehouses/${warehouse1Id}/cabinets`,
        { name: 'S-Hack', size: 'S', relay_channel: 99 }, o1t
      );
      if (r.status === 403) {
        pass('타인 창고 캐비넷 추가 차단 (403)');
      } else {
        fail(`타인 창고 캐비넷 추가: 예상 403, 실제 ${r.status}`, JSON.stringify(r.data));
      }
    }

    // ===== 3-14. Store Owner가 관리자 전용 API → 403 =====
    console.log(`  ${testName('점주 GET /api/admin/users → 403')}`);
    r = await api('GET', '/api/admin/users', null, o1t);
    if (r.status === 403) {
      pass('관리자 API 차단 (403)');
    } else {
      fail(`관리자 API: 예상 403, 실제 ${r.status}`, JSON.stringify(r.data));
    }

    // ===== 3-15. Store Owner의 계약 조회 (본인 계약만) =====
    console.log(`  ${testName('점주 GET /api/contracts → 본인 계약만 조회')}`);
    r = await api('GET', '/api/contracts', null, o1t);
    if (r.status === 200) {
      pass(`계약 조회 성공: ${r.data.length}개`);
    } else {
      fail('계약 조회 실패', JSON.stringify(r.data));
    }
  }

  // ======================================================================
  // Phase 4: 관리자(Super Admin) 테스트
  // ======================================================================
  section('Phase 4: 관리자(Super Admin) 권한 테스트');

  if (!testAccounts.admin) {
    console.log(`  ${RED}⚠️  관리자 계정 없음, Phase 4 스킵${RESET}`);
  } else {
    const at = testAccounts.admin.token;
    const au = testAccounts.admin.user;

    // 4-1. 관리자 창고 목록 조회 → 모든 창고
    console.log(`  ${testName('관리자 GET /api/warehouses → 모든 창고 조회')}`);
    r = await api('GET', '/api/warehouses', null, at);
    if (r.status === 200 && Array.isArray(r.data)) {
      pass(`모든 창고 조회 성공: ${r.data.length}개`);
      console.log(`     창고 목록: ${r.data.map(w => `ID=${w.id} name=${w.name} owner=${w.owner_id}`).join(', ')}`);
    } else {
      fail('창고 목록 조회 실패', JSON.stringify(r.data));
    }

    // 4-2. 관리자가 owner_id 없이 창고 생성 (본인 소유)
    console.log(`  ${testName('관리자 창고 생성 (owner_id 없음 = 본인 소유)')}`);
    r = await api('POST', '/api/warehouses',
      { name: '관리자 신규 창고', location: '부산시 해운대구', capacity: 40 },
      at
    );
    if (r.status === 201) {
      pass('관리자 창고 생성 성공');
      const newWhId = r.data.warehouseId;
      
      // owner_id 확인을 위해 상세 조회
      r = await api('GET', `/api/warehouses/${newWhId}/cabinets`, null, at);
      if (r.status === 200) pass('신규 창고 접근 확인 완료');
    } else {
      fail('관리자 창고 생성 실패', JSON.stringify(r.data));
    }

    // ===== 4-3. 관리자가 owner_id로 다른 store_owner 지정하여 창고 생성 [핵심] =====
    const owner2Id = testAccounts.owner2?.user?.id;
    if (owner2Id) {
      console.log(`  ${BOLD}${YELLOW}[핵심-7]${RESET} ${testName('관리자가 owner_id로 점주2 지정하여 창고 생성')}`);
      r = await api('POST', '/api/warehouses',
        { name: '점주2에게 지정된 창고', location: '대전시 유성구', capacity: 25, owner_id: owner2Id },
        at
      );
      if (r.status === 201) {
        pass(`owner_id=${owner2Id} 지정 창고 생성 성공`);
        const whId = r.data.warehouseId;
        
        // 점주2가 이 창고를 조회할 수 있는지 확인
        console.log(`     → 점주2로 해당 창고 조회 확인`);
        r = await api('GET', '/api/warehouses', null, testAccounts.owner2.token);
        if (r.status === 200) {
          const found = r.data.find(w => w.id === whId);
          if (found) {
            pass(`점주2가 자신의 창고로 조회 성공`);
          } else {
            fail('점주2가 창고 조회 실패', '점주2 목록에 생성된 창고 없음');
          }
        }
      } else {
        fail('owner_id 지정 창고 생성 실패', JSON.stringify(r.data));
      }
    }

    // 4-4. 관리자가 store_owner인 척 요청 차단 확인 → role은 admin이므로 통과
    console.log(`  ${testName('관리자는 모든 캐비넷 접근 가능 (admin bypass)')}`);
    if (cabinet1Id) {
      r = await api('PUT', `/api/cabinets/${cabinet1Id}/status`,
        { status: 'maintenance' }, at
      );
      if (r.status === 200) {
        pass('관리자 캐비넷 상태 변경 성공 (admin bypass)');
        // 원복
        await api('PUT', `/api/cabinets/${cabinet1Id}/status`,
          { status: 'available' }, at
        );
      } else {
        fail('관리자 캐비넷 상태 변경 실패', JSON.stringify(r.data));
      }
    }

    // 4-5. 관리자 모든 창고 레이아웃 접근
    if (warehouse1Id) {
      console.log(`  ${testName('관리자 모든 창고 레이아웃 접근 가능')}`);
      r = await api('PUT', `/api/warehouses/${warehouse1Id}/layout`,
        { layout_data: [] }, at
      );
      if (r.status === 200) {
        pass('관리자 레이아웃 편집 성공');
      } else {
        fail('관리자 레이아웃 편집 실패', JSON.stringify(r.data));
      }
    }

    // 4-6. 관리자 전체 회원 조회
    console.log(`  ${testName('관리자 GET /api/admin/users → 전체 회원 조회')}`);
    r = await api('GET', '/api/admin/users', null, at);
    if (r.status === 200) {
      pass(`전체 회원 조회 성공: ${r.data.length}명`);
      console.log(`     회원 목록: ${r.data.map(u => `ID=${u.id} ${u.username} role=${u.role}`).join(', ')}`);
    } else {
      fail('전체 회원 조회 실패', JSON.stringify(r.data));
    }

    // 4-7. 관리자 전체 계약 조회
    console.log(`  ${testName('관리자 GET /api/contracts → 전체 계약 조회')}`);
    r = await api('GET', '/api/contracts', null, at);
    if (r.status === 200) {
      pass(`전체 계약 조회 성공: ${r.data.length}개`);
    } else {
      fail('전체 계약 조회 실패', JSON.stringify(r.data));
    }

    // 4-8. 관리자 타인 프로필 조회 가능
    const otherId = testAccounts.owner1?.user?.id || testAccounts.customer?.user?.id;
    if (otherId) {
      console.log(`  ${testName('관리자 타인 프로필 조회 가능 (admin bypass)')}`);
      r = await api('GET', `/api/profile/${otherId}`, null, at);
      if (r.status === 200) {
        pass('타인 프로필 조회 성공 (admin bypass)');
      } else {
        fail('타인 프로필 조회 실패', JSON.stringify(r.data));
      }
    }

    // 4-9. 인증 없이 API 호출 → 401
    console.log(`  ${testName('인증 없이 GET /api/warehouses → 401')}`);
    r = await api('GET', '/api/warehouses', null, null);
    if (r.status === 401) {
      pass('인증 없음 차단 (401)');
    } else {
      fail(`인증 없음: 예상 401, 실제 ${r.status}`, JSON.stringify(r.data));
    }

    // 4-10. 유효하지 않은 토큰 → 403
    console.log(`  ${testName('유효하지 않은 토큰 → 403')}`);
    r = await api('GET', '/api/warehouses', null, 'Bearer invalid_token_here');
    // Note: express-jwt returns 403, server.js returns 403 for invalid token
    if (r.status === 403 || r.status === 401) {
      pass('유효하지 않은 토큰 차단');
    } else {
      fail(`유효하지 않은 토큰: 예상 403, 실제 ${r.status}`, JSON.stringify(r.data));
    }
  }

  // ======================================================================
  // Phase 5: 결과 요약
  // ======================================================================
  const total = passed + failed;
  const pct = total > 0 ? Math.round(passed / total * 100) : 0;

  console.log(`\n${'='.repeat(50)}`);
  console.log(`${BOLD}📊 E2E RBAC 테스트 결과${RESET}`);
  console.log(`${'='.repeat(50)}`);
  console.log(`  ${GREEN}✅ 통과: ${passed}${RESET}`);
  console.log(`  ${RED}❌ 실패: ${failed}${RESET}`);
  console.log(`  ${CYAN}📋 전체: ${total}${RESET}`);
  console.log(`  ${pct >= 80 ? GREEN : YELLOW}🏆 합격률: ${pct}%${RESET}`);
  
  if (failed === 0) {
    console.log(`\n${GREEN}${BOLD}🎉 모든 테스트 통과! 권한 시스템이 정상 작동합니다.${RESET}\n`);
  } else {
    console.log(`\n${RED}${BOLD}⚠️  ${failed}개 테스트 실패. 상세 로그를 확인하세요.${RESET}\n`);
  }

  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(err => {
  console.error(`\n${RED}${BOLD}💥 테스트 실행 중 오류 발생:${RESET}`, err.message);
  console.error(err.stack);
  process.exitCode = 1;
});
