# 공유창고 무인 키오스크 — 테스트 계획

## 1. 테스트 우선순위

| 우선순위 | 기준 | 설명 |
|---------|------|------|
| P0 | 운영 불가 | 반드시 통과해야 상용 운영 가능 |
| P1 | 하면 좋음 | 운영에는 가능하지만 안정성/보안 개선 |
| P2 | 나중에 해도 됨 | 장기 개선 항목 |

## 2. 테스트 범위 및 계획

### Phase 1: 핵심 기능 검증 (P0)

#### 1.1 사용자 인증 테스트

| 테스트 ID | 설명 | 검증 방법 | 예상 결과 |
|-----------|------|----------|----------|
| T-001 | 회원가입 (첫 번째 사용자 → 자동 admin) | POST /api/register `{username, email, password}` | status 200, role='admin' |
| T-002 | 회원가입 (두 번째 사용자 → 일반 user) | POST /api/register 동일 형식 | status 200, role='user' |
| T-003 | 로그인 성공 (admin) | POST /api/login `{username, password}` | status 200, JWT 반환, role=admin |
| T-004 | 로그인 성공 (user) | POST /api/login 동일 형식 | status 200, JWT 반환, role=user |
| T-005 | 로그인 실패 (잘못된 비밀번호) | POST /api/login `{username, wrong_password}` | status 401, message='비밀번호가 일치하지 않습니다' |
| T-006 | JWT 토큰 유효성 검증 | JWT decode | exp, user.id, role 포함 |
| T-007 | JWT 토큰 만료 처리 | 만료된 토큰으로 API 호출 | status 403, message='유효하지 않은 토큰입니다' |

#### 1.2 PIN 해시화 검증 (T06 관련)

| 테스트 ID | 설명 | 검증 방법 | 예상 결과 |
|-----------|------|----------|----------|
| T-008 | PIN 저장 시 bcrypt hash | DB 확인 (users.pin_code) | bcrypt hash 형태로 저장됨 |
| T-009 | PIN 검증 (올바른 PIN) | POST /api/access/authenticate `{method:'pin', value:'123456'}` | status 200, success=true |
| T-010 | PIN 검증 (잘못된 PIN) | POST /api/access/authenticate 동일 but 다른 PIN | status 400 또는 401, success=false |
| T-011 | admin users 응답에 PIN 원문 없음 | GET /api/admin/users | pin_code 컬럼 없음 또는 hash만 반환 |

#### 1.3 창고/캐비넷 CRUD 테스트

| 테스트 ID | 설명 | 검증 방법 | 예상 결과 |
|-----------|------|----------|----------|
| T-012 | 창고 생성 (admin) | POST /api/warehouses (admin JWT) | status 201, warehouse 생성 |
| T-013 | 창고 생성 (user) | POST /api/warehouses (user JWT) | status 403, message='관리자 권한이 필요합니다' |
| T-014 | 창고 목록 조회 | GET /api/warehouses | status 200, 배열 반환 |
| T-015 | 캐비넷 생성 | POST /api/warehouses/:id/cabinets | status 201, cabinet 생성 |
| T-016 | 캐비넷 상태 변경 | PUT /api/cabinets/:id/status | status 200, status 변경 |

#### 1.4 계약 관리 테스트

| 테스트 ID | 설명 | 검증 방법 | 예상 결과 |
|-----------|------|----------|----------|
| T-017 | 계약 생성 (정상) | POST /api/contracts `{user_id, cabinet_id, start_date, end_date, total_amount}` | status 201, contract 생성, cabinet status='occupied' |
| T-018 | 계약 생성 (available 아닌 cabinet) | POST /api/contracts cabinet status='occupied' | status 400, message='해당 캐비넷은 사용 중입니다' |
| T-019 | 계약 생성 (기간 순서 오류) | start_date > end_date | status 400, message='시작일은 종료일보다 이전이어야 합니다' |
| T-020 | 계약 생성 (중복 active 계약) | 같은 cabinet_id에 active 계약 존재 | status 409 또는 400, message='이미 active 계약이 존재합니다' |
| T-021 | 계약 생성 (금액 음수) | total_amount = -100 | status 400, message='금액은 양수여야 합니다' |
| T-022 | 계약 생성 (user_id 위조) | user가 다른 user_id로 계약 생성 | status 403 또는 해당 user의 계약만 생성 |
| T-023 | 계약 취소 | PUT /api/contracts/:id/cancel | status 200, cabinet status='available', contract status='cancelled' |
| T-024 | 자동 연장 스케줄러 | contracts.auto_renew=1인 계약 확인 | auto_renew 컬럼 정상 조회 가능 (에러 없음) |

#### 1.5 출입 인증 테스트 (T07 관련)

| 테스트 ID | 설명 | 검증 방법 | 예상 결과 |
|-----------|------|----------|----------|
| T-025 | PIN 인증 성공 | POST /api/access/authenticate `{method:'pin', value:'올바른_PIN'}` | status 200, success=true |
| T-026 | PIN 인증 실패 (5회 연속) | POST /api/access/authenticate 5회 연속 잘못된 PIN | status 423, message='잠금 처리되었습니다' |
| T-027 | rate limit 초과 | 60초 내 11회 POST /api/access/authenticate | status 429, message='요청이 너무 많습니다' |
| T-028 | lockout 해제 | 10분 후 다시 시도 | status 200 (정상 동작 재개) |
| T-029 | OTP 인증 | POST /api/access/authenticate `{method:'otp', value:'otp_value'}` | status 200, success=true (phone + OTP_SECRET 기반) |
| T-030 | QR 인증 | POST /api/access/authenticate `{method:'qr', value:'contract_id'}` | status 200, success=true (active contract 검증) |
| T-031 | 출입 로그 기록 | GET /api/warehouses/:id/access-logs | log에 method, warehouse_id, ip, device, userAgent 기록 |

### Phase 2: 보안 테스트 (P1)

#### 2.1 권한 검증 테스트

| 테스트 ID | 설명 | 검증 방법 | 예상 결과 |
|-----------|------|----------|----------|
| T-032 | 프로필 조회 (본인) | GET /api/profile/:me_id (본인 JWT) | status 200, 내 프로필 반환 |
| T-033 | 프로필 조회 (타인) | GET /api/profile/:other_id (본인 JWT) | status 403, message='접근 권한이 없습니다' |
| T-034 | 프로필 수정 (본인) | PUT /api/profile/:me_id | status 200, 내 프로필 수정 |
| T-035 | 프로필 수정 (타인) | PUT /api/profile/:other_id | status 403, message='접근 권한이 없습니다' |
| T-036 | 하드웨어 제어 (admin) | POST /api/admin/door/unlock (admin JWT) | status 200 |
| T-037 | 하드웨어 제어 (user) | POST /api/admin/door/unlock (user JWT) | status 403 |
| T-038 | 화재 경보 (localhost) | POST /api/hardware/fire-alarm (127.0.0.1) | status 200 |
| T-039 | 화재 경보 (x-hardware-secret) | POST /api/hardware/fire-alarm `{secret:'올바른_SECRET'}` | status 200 |
| T-040 | 화재 경보 (무인증, 외부 IP) | POST /api/hardware/fire-alarm | status 403, message='접근 권한이 없습니다' |
| T-041 | CORS origin 검증 | 다른 origin에서 요청 | status 403 또는 CORS 헤더 없음 |

#### 2.2 환경변수 검증 테스트

| 테스트 ID | 설명 | 검증 방법 | 예상 결과 |
|-----------|------|----------|----------|
| T-042 | production 모드 secret 미설정 | NODE_ENV=production JWT_SECRET 미설정 | 서버 시작 실패 (에러 메시지 출력) |
| T-043 | production 모드 기본값 사용 | NODE_ENV=production JWT_SECRET=기본값 | 서버 시작 실패 |
| T-044 | development 모드 정상 시작 | NODE_ENV=development JWT_SECRET 설정 | 서버 정상 시작 |
| T-045 | .env.example 모든 필수 변수 기재 | 파일 내용 확인 | JWT_SECRET, OTP_SECRET, CORS_ORIGINS, SERIAL_PORT, EMAIL 포함 |

### Phase 3: 프론트엔드 테스트 (P1)

| 테스트 ID | 설명 | 검증 방법 | 예상 결과 |
|-----------|------|----------|----------|
| T-046 | JSX 빌드 통과 | npm run build | 에러 없이 빌드 성공 |
| T-047 | 로그인 페이지 렌더링 | 브라우저에서 /login | 정상 렌더링 |
| T-048 | 로그인 후 대시보드 이동 | 로그인 성공 | /dashboard로 리다이렉트 |
| T-049 | LayoutEditor 접근 (admin) | /layout-editor (admin JWT) | 정상 렌더링, 캐비넷 목록 표시 |
| T-050 | LayoutEditor 접근 (user) | /layout-editor (user JWT) | 접근 불가 또는 빈 화면 |
| T-051 | LayoutEditor 저장 | 캐비넷 이동 후 저장 | status 200, DB에 layout_data 저장 |
| T-052 | LayoutEditor 재조회 | 저장 후 재조회 | 드래그한 좌표 유지 |
| T-053 | 검색 특수문자 | query='test&name=' | 깨짐 없이 검색 |
| T-054 | API base URL 환경변수 | REACT_APP_API_BASE_URL 설정 | 해당 URL로 요청 |
| T-055 | + 창고 버튼 admin 전용 | user 로그인 시 UI 확인 | 버튼 숨김 |

### Phase 4: 데이터베이스 테스트 (P0)

| 테스트 ID | 설명 | 검증 방법 | 예상 결과 |
|-----------|------|----------|----------|
| T-056 | users 테이블 구조 | DESCRIBE users | id, username, email, password, phone, pin_code, role 컬럼 |
| T-057 | warehouses 테이블 구조 | DESCRIBE warehouses | id, name, location, capacity, owner_id, layout_data |
| T-058 | cabinets 테이블 구조 | DESCRIBE cabinets | id, warehouse_id, size, relay_channel, status, position_x, position_y |
| T-059 | contracts 테이블 auto_renov | DESCRIBE contracts | auto_renew INTEGER DEFAULT 0 포함 |
| T-060 | payments 테이블 구조 | DESCRIBE payments | id, contract_id, amount, pg_approval_number, receipt_password |
| T-061 | access_logs 테이블 구조 | DESCRIBE access_logs | id, user_id, warehouse_id, auth_method, success, note |
| T-062 | naver_reservations 테이블 | DESCRIBE naver_reservations | id, reservation_id, customer_name, phone, service_name |
| T-063 | hardware_status 테이블 | DESCRIBE hardware_status | id, warehouse_id, door_status, fire_alarm, last_check |

### Phase 5: 네이버 예약 동기화 테스트 (P2)

| 테스트 ID | 설명 | 검증 방법 | 예상 결과 |
|-----------|------|----------|----------|
| T-064 | 네이버 파서 단위 테스트 | npm test backend/test/naver-parser.test.js | 테스트 통과 |
| T-065 | 이메일 파싱 race condition | 동시 다중 요청 | race condition 없이 모든 메일 저장 |
| T-066 | subject null 방어 | parsed.subject가 null인 메일 | 에러 없이 처리 |
| T-067 | 크롤러 로그인 재시도 | 로그인 실패 3회 | 30초 간격으로 재시도 |

### Phase 6: smoke test (P0)

| 테스트 ID | 설명 | 검증 방법 | 예상 결과 |
|-----------|------|----------|----------|
| T-068 | 서버 시작 | npm start | status 200, 서버 로깅 |
| T-069 | 회원가입 → 로그인 → 창고 목록 | 시퀀스 API 호출 | status 201 → 200 → 200 |
| T-070 | 계약 생성 → 캐비넷 상태 확인 | API 호출 + DB 조회 | contract 201, cabinet status='occupied' |

## 3. 테스트 실행 순서

```
Phase 1 (핵심 기능 P0)
  ├── 1.1 사용자 인증 (T-001 ~ T-007)
  ├── 1.2 PIN 해시화 (T-008 ~ T-011)
  ├── 1.3 창고/캐비넷 (T-012 ~ T-016)
  ├── 1.4 계약 관리 (T-017 ~ T-024)
  └── 1.5 출입 인증 (T-025 ~ T-031)
       │
Phase 2 (보안 P1)
  ├── 2.1 권한 검증 (T-032 ~ T-041)
  └── 2.2 환경변수 (T-042 ~ T-045)
       │
Phase 3 (프론트엔드 P1)
  ├── 3.1 빌드/렌더링 (T-046 ~ T-051)
  └── 3.2 기능/UI (T-052 ~ T-055)
       │
Phase 4 (DB P0)
  └── 스키마 검증 (T-056 ~ T-063)
       │
Phase 5 (네이버 P2)
  └── 파싱/크롤링 (T-064 ~ T-067)
       │
Phase 6 (smoke test P0)
  └── 시퀀스 테스트 (T-068 ~ T-070)
```

## 4. 테스트 환경

| 항목 | 값 |
|------|-----|
| OS | Windows 11 Pro (NJOYGO-N100) |
| Node.js | v24.16.0 |
| 백엔드 | localhost:3001 |
| 프론트엔드 | localhost:3000 |
| DB | SQLite (./warehouse.db) |
| 테스트 도구 | Supertest (백엔드), Jest (프론트) |

## 5. 성공 기준

| 우선순위 | 통과 조건 |
|---------|-----------|
| P0 | **모든 테스트 통과 (100%)** |
| P1 | **통과 90% 이상** (실패 항목은 수동 검증 가능) |
| P2 | 통과 시 운영 안정성 향상 |

## 6. 테스트 실행 스크립트

### 백엔드 smoke test (backend/test/smoke.test.js)

```javascript
const request = require('supertest');
const { app, db } = require('../server');

describe('Smoke Tests', () => {
  beforeAll((done) => {
    // 테스트용 DB 초기화
    db.close();
    done();
  });

  afterAll((done) => {
    db.close();
    done();
  });

  test('POST /api/register', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ username: 'testuser', email: 'test@test.com', password: 'test1234' });
    expect(res.status).toBe(200);
  });

  test('POST /api/login', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'testuser', password: 'test1234' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('GET /api/warehouses', async () => {
    const res = await request(app).get('/api/warehouses');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('contracts.auto_renew 컬럼 존재', (done) => {
    db.get(`PRAGMA table_info(contracts)`, [], (err, rows) => {
      if (err) return done(err);
      const hasAutoRenew = rows.some(r => r.name === 'auto_renew');
      expect(hasAutoRenew).toBe(true);
      done();
    });
  });
});
```

### 테스트 실행 명령어

```powershell
# 백엔드 테스트
cd C:\git\shared-warehouse\backend
npm test

# 프론트엔드 빌드 검증
cd C:\git\shared-warehouse\frontend
npm run build

# 전체 테스트
cd C:\git\shared-warehouse
npm test
npm run build
```

## 7. 테스트 결과 기록

| 테스트 그룹 | 통과 | 실패 | 총계 | 비고 |
|------------|------|------|------|------|
| Phase 1: 핵심 기능 | _ | _ | 31 | |
| Phase 2: 보안 | _ | _ | 14 | |
| Phase 3: 프론트엔드 | _ | _ | 10 | |
| Phase 4: DB 스키마 | _ | _ | 8 | |
| Phase 5: 네이버 | _ | _ | 4 | |
| Phase 6: Smoke Test | _ | _ | 3 | |
| **합계** | **_** | **_** | **70** | |

---

*작성일: 2026-05-23*
*작성자: OpenClaw Agent*
