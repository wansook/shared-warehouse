# shared-warehouse 코드 분석 v2

분석 시각: 2026-05-23 16:35 GMT+9  
분석 위치: `C:\git\shared-warehouse`  
요청 범위: 프로젝트 구조, 핵심 코드 내용, 구현/누락 기능, 버그/보안 취약점, 개선 제안

## 1. 프로젝트 구조 및 파일 목록

하위 3단계 기준 구조:

```text
shared-warehouse/
├─ .git/
├─ backend/
│  ├─ .env.example
│  ├─ fix-admin.js
│  ├─ hardware.js
│  ├─ migrate.js
│  ├─ naver-sync.js
│  ├─ package-lock.json
│  ├─ package.json
│  ├─ patch.js
│  ├─ patch2.js
│  ├─ server.js
│  ├─ test-api.js
│  ├─ test-api.ps1
│  ├─ test-multi-warehouse.ps1
│  ├─ test-new-api.ps1
│  └─ watchdog.js
├─ frontend/
│  ├─ public/
│  │  ├─ favicon.ico
│  │  ├─ index.html
│  │  ├─ logo192.png
│  │  ├─ logo512.png
│  │  ├─ manifest.json
│  │  └─ robots.txt
│  ├─ src/
│  │  ├─ App.css
│  │  ├─ App.js
│  │  ├─ App.test.js
│  │  ├─ Auth.css
│  │  ├─ Dashboard.css
│  │  ├─ Dashboard.js
│  │  ├─ index.css
│  │  ├─ index.js
│  │  ├─ LayoutEditor.css
│  │  ├─ LayoutEditor.js
│  │  ├─ Login.js
│  │  ├─ logo.svg
│  │  ├─ Profile.css
│  │  ├─ Profile.js
│  │  ├─ Register.css
│  │  ├─ Register.js
│  │  ├─ reportWebVitals.js
│  │  └─ setupTests.js
│  ├─ .gitignore
│  ├─ package-lock.json
│  ├─ package.json
│  └─ README.md
├─ .github-repo-config.json
├─ .gitignore
├─ codex-analysis.md
├─ codex-analysis-v2.md
├─ KIOSK-SETUP.md
├─ README.md
├─ watchdog.js
├─ 작업지시서_공유창고.docx
└─ 작업지시서_공유창고.md
```

전체 분석 파일 목록:

| 파일 | 크기 | 라인 |
|---|---:|---:|
| `.github-repo-config.json` | 57 B | 4 |
| `.gitignore` | 211 B | 14 |
| `codex-analysis.md` | 22,652 B | 325 |
| `KIOSK-SETUP.md` | 6,736 B | 172 |
| `README.md` | 11,886 B | 339 |
| `watchdog.js` | 3,252 B | 91 |
| `작업지시서_공유창고.docx` | 17,326 B | 88 |
| `작업지시서_공유창고.md` | 6,800 B | 73 |
| `backend/.env.example` | 710 B | 22 |
| `backend/fix-admin.js` | 1,141 B | 28 |
| `backend/hardware.js` | 8,097 B | 203 |
| `backend/migrate.js` | 381 B | 12 |
| `backend/naver-sync.js` | 8,088 B | 211 |
| `backend/package-lock.json` | 127,503 B | 3,412 |
| `backend/package.json` | 578 B | 26 |
| `backend/patch.js` | 1,435 B | 16 |
| `backend/patch2.js` | 1,559 B | 6 |
| `backend/server.js` | 44,851 B | 약 883+ |
| `backend/test-api.js` | 11,287 B | 212 |
| `backend/test-api.ps1` | 8,270 B | 223 |
| `backend/test-multi-warehouse.ps1` | 11,455 B | 203 |
| `backend/test-new-api.ps1` | 915 B | 16 |
| `backend/watchdog.js` | 2,114 B | 71 |
| `frontend/.gitignore` | 333 B | 18 |
| `frontend/package-lock.json` | 675,013 B | 17,410 |
| `frontend/package.json` | 949 B | 41 |
| `frontend/README.md` | 3,429 B | 38 |
| `frontend/public/*` | React 기본 public assets | - |
| `frontend/src/App.js` | 962 B | 27 |
| `frontend/src/Login.js` | 2,450 B | 75 |
| `frontend/src/Register.js` | 2,790 B | 89 |
| `frontend/src/Dashboard.js` | 23,714 B | 472 |
| `frontend/src/LayoutEditor.js` | 6,974 B | 179 |
| `frontend/src/Profile.js` | 4,388 B | 115 |
| `frontend/src/*.css` | 화면별 스타일 | - |

참고: 다수 한국어 문자열이 깨진 상태로 저장되어 있습니다. 백엔드는 `node --check`가 통과했지만, 프론트엔드 JSX 파일은 깨진 문자열과 닫힘 태그 때문에 빌드 가능성이 낮습니다.

## 2. 주요 파일 코드 내용

### `backend/server.js`

역할: Express + SQLite 기반 메인 API 서버입니다.

주요 구성:

```js
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const naverSync = require('./naver-sync');
const hardware = require('./hardware');

const JWT_SECRET = 'shared-warehouse-secret-key-2026';
const OTP_SECRET = 'otp-secret-key-2026';

app.use(cors());
app.use(express.json());
const db = new sqlite3.Database('./warehouse.db');
```

DB 테이블:

- `users`: 사용자, 이메일, bcrypt 비밀번호, 전화번호, PIN, role
- `warehouses`: 창고, 위치, 용량, 소유자, `layout_data`
- `cabinets`: 창고 캐비넷, 사이즈, 릴레이 채널, 상태, 위치
- `contracts`: 사용자-캐비넷 계약, 기간, 상태, 금액, `billing_key`
- `payments`: 결제, 승인번호, 영수증 비밀번호, 빌링키
- `access_logs`: 출입 로그
- `naver_reservations`: 네이버 예약 동기화 결과
- `hardware_status`: 문 상태, 화재 경보
- `items`, `inventory_logs`: 재고 및 입출고 로그

인증/권한:

```js
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
  if (req.user.role !== 'admin') return res.status(403).json({ message: '관리자 권한이 필요합니다.' });
  next();
};
```

구현 API 요약:

- `POST /api/register`: 회원가입. 첫 번째 사용자는 자동 admin.
- `POST /api/login`: 로그인, JWT 발급.
- `GET /api/admin/users`: 관리자 사용자 목록. PIN을 평문으로 반환.
- `PUT /api/admin/users/:userId/pin`: PIN 설정/초기화 후 파일 동기화.
- `GET/PUT /api/warehouses/:id/layout`: 창고 레이아웃 조회/저장.
- `PUT /api/cabinets/:id/layout`: 캐비넷 위치 저장.
- `GET/POST/DELETE /api/warehouses`: 창고 CRUD 일부.
- `GET/POST /api/warehouses/:warehouseId/cabinets`: 캐비넷 조회/생성.
- `PUT /api/cabinets/:id/status`: 캐비넷 상태 변경.
- `GET/POST /api/contracts`: 계약 목록/생성.
- `PUT /api/contracts/:id/cancel`: 계약 취소.
- `POST /api/payments`: 결제 기록 생성, 빌링키 저장.
- `GET /api/payments/:id/receipt`: 영수증 조회.
- `POST /api/access/authenticate`: PIN/OTP/QR 출입 인증. 토큰 없이 호출 가능.
- `GET /api/warehouses/:warehouseId/access-logs`: 출입 로그.
- `POST /api/admin/sync-naver-emails`: 네이버 예약 이메일 동기화.
- `POST /api/admin/sync-naver-crawler`: 네이버 예약 크롤러 동기화.
- `GET /api/admin/naver-reservations`: 동기화 예약 목록.
- `POST /api/admin/door/unlock`: 문 개방.
- `POST /api/admin/relay/control`: 릴레이 제어.
- `GET /api/admin/hardware/status`: 하드웨어 상태 조회.
- `POST /api/hardware/fire-alarm`: 화재 경보 수신.
- `GET/POST/PUT/DELETE /api/*items*`: 재고 CRUD 및 입출고.
- `GET/PUT /api/profile/:userId`: 프로필 조회/수정.
- `GET /api/search`: 재고 검색.

스케줄러:

- 24시간마다 자동 연장 결제 후보 확인.
- 1시간마다 계약 만료/만료 임박 캐비넷 상태 갱신.
- 24시간마다 만료 예정 알림 로그 출력.
- 서버 시작 시 `hardware.init()` 및 `naverSync.startSyncScheduler(600000)` 실행.

핵심 문제:

- `JWT_SECRET`, `OTP_SECRET`가 코드에 하드코딩되어 있습니다.
- `contracts` 테이블 생성 SQL에는 `auto_renew` 컬럼이 없는데, 자동 연장 쿼리는 `c.auto_renew`를 조회합니다.
- `/api/admin/door/unlock`, `/api/admin/relay/control`, `/api/admin/hardware/status`, `/api/hardware/fire-alarm`가 파일 하단에서 중복 등록되어 있습니다.
- `app.use` 전역 에러 핸들러가 중복 라우트보다 앞에 등록되어 Express 에러 핸들러 위치가 부적절합니다.
- 프로필 API는 `:userId`가 본인인지 확인하지 않아 다른 사용자의 프로필을 조회/수정할 수 있습니다.
- 영수증 API는 GET 요청에서 `req.body.password`를 읽습니다. 일반 GET 클라이언트에서는 body가 전달되지 않을 수 있습니다.
- 출입 인증은 인증 토큰 없이 가능하며, PIN에 속도 제한이 없습니다.

### `backend/hardware.js`

역할: 시리얼 포트 릴레이 보드 제어, 문 개방/잠금, 화재 경보 처리, 도어 모니터링입니다.

핵심 구성:

```js
const SerialPort = require('serialport').SerialPort;
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./warehouse.db');

const HARDWARE_CONFIG = {
  serialPort: process.env.SERIAL_PORT || null,
  baudRate: parseInt(process.env.BAUD_RATE) || 9600,
  relayDelay: parseInt(process.env.RELAY_DELAY) || 3000,
  doorTimeout: parseInt(process.env.DOOR_TIMEOUT) || 60000,
  fireAlarmPin: parseInt(process.env.FIRE_ALARM_PIN) || 0
};
```

주요 함수:

- `initSerialPort()`: `SERIAL_PORT`가 없으면 시뮬레이션 모드로 시작.
- `controlRelay(warehouseId, channel, action)`: 캐비넷 `relay_channel`을 조회해 hex 명령을 시리얼로 송신. 포트가 없으면 로그만 남기고 상태 업데이트.
- `unlockDoor(warehouseId, duration)`: 첫 캐비넷을 기준으로 문 열기 후 타이머로 자동 잠금.
- `handleFireAlarm(warehouseId)`: `fire_alarm=1`, `door_status=open`으로 변경하고 해당 창고 모든 캐비넷 릴레이를 open 처리.
- `startDoorMonitor()`: 30초마다 열린 문을 조회하고 `doorTimeout` 초과 시 관리자 알림 로그.
- `getHardwareStatus()`: `hardware_status`와 `warehouses` 조인 조회.
- `init()`: 시리얼 초기화 및 모니터 시작.

핵심 문제:

- DB 연결을 `server.js`와 별도로 열어 같은 SQLite 파일에 동시 접근합니다.
- 릴레이 명령 포맷이 특정 장비 가정에 묶여 있고 검증/설정 분리가 없습니다.
- `controlRelay`의 `channel` 인자를 캐비넷 ID로 사용합니다. API의 "channel" 의미와 실제 DB 조회 의미가 다릅니다.
- 하드웨어 제어 성공/실패가 영속 로그로 남지 않습니다.
- 화재 경보 엔드포인트는 인증 없이 호출 가능하며, 요청자 검증이 없습니다.

### `backend/naver-sync.js`

역할: 네이버 예약 이메일 IMAP 파싱 및 Puppeteer 크롤링 동기화입니다.

핵심 구성:

```js
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
```

주요 함수:

- `parseNaverReservationEmail(rawEmail)`: 현재는 raw 객체 필드를 그대로 매핑하는 스텁에 가깝습니다.
- `fetchEmails()`: IMAP `INBOX`에서 `UNSEEN` 메일을 가져와 예약 메일로 판단 후 `naver_reservations`에 저장.
- `saveReservation(reservation)`: `INSERT OR IGNORE`로 예약 저장.
- `crawlNaverPartner()`: Puppeteer로 파트너 URL 접속, 로그인 후 `.reservation-row`를 파싱.
- `startSyncScheduler(intervalMs)`: 이메일 파싱은 기본 10분마다, 크롤링은 1시간마다 실행.

핵심 문제:

- README에는 UID marker 파일 기반 중복 방지가 언급되지만 실제 구현은 `UNSEEN` + `markSeen`에 의존합니다.
- `fetchEmails()`는 비동기 `simpleParser` 완료 전에 fetch `end`에서 `resolve(count)`될 수 있어 카운트와 저장 완료 시점이 부정확합니다.
- `parsed.subject`가 없을 때 `includes` 호출로 예외가 날 수 있습니다.
- 이메일 정규식이 깨진 문자열 상태였던 흔적이 있고, 실제 네이버 메일 본문 포맷에 대한 견고한 파서가 아닙니다.
- Puppeteer URL, selector(`#id`, `#pw`, `#loginBtn`, `.reservation-row`)가 추정값이라 운영 가능성이 낮습니다.
- 크롤러 로그인 정보 보호, 실패 재시도, 계정 잠금 방지, 감사 로그가 없습니다.

### `frontend/src/App.js`

역할: React Router 라우팅과 토큰 기반 private route입니다.

```js
const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" />;
};

<Routes>
  <Route path="/login" element={<Login />} />
  <Route path="/register" element={<Register />} />
  <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
  <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
  <Route path="/" element={<Navigate to="/dashboard" />} />
</Routes>
```

문제:

- 토큰 만료 검증 없이 localStorage 존재 여부만 봅니다.
- `LayoutEditor` route가 없습니다. 파일은 존재하지만 앱에서 접근되지 않습니다.

### `frontend/src/Dashboard.js`

역할: 관리자/사용자 대시보드입니다. 창고 목록, 캐비넷, 계약, 출입 인증, 로그, 하드웨어 상태, 네이버 예약 동기화, 검색을 한 화면에서 처리합니다.

상태 및 API 구성:

```js
const [warehouses, setWarehouses] = useState([]);
const [selectedWarehouse, setSelectedWarehouse] = useState(null);
const [cabinets, setCabinets] = useState([]);
const [contracts, setContracts] = useState([]);
const [accessLogs, setAccessLogs] = useState([]);
const [hardwareStatus, setHardwareStatus] = useState([]);
const [navReservations, setNavReservations] = useState([]);

const api = axios.create({
  baseURL: 'http://localhost:3001',
  headers: { Authorization: `Bearer ${token}` }
});
```

구현된 동작:

- 로그인 사용자 localStorage 로드.
- 창고 목록/캐비넷/계약/출입 로그/통계 조회.
- 창고/캐비넷/계약 생성 폼.
- PIN/OTP/QR 출입 인증 테스트.
- 관리자 하드웨어 상태 조회 및 문 열기.
- 관리자 네이버 예약 이메일/크롤러 수동 동기화.
- 재고 검색.

심각한 코드 문제:

```js
const statusLabels = {
  available: '...',
  occupied: '?댁슜以?,
  maintenance: '?뺣퉬以?,
  expired_soon: '...'
};
```

위처럼 문자열 닫힘이 깨져 있습니다. JSX에도 닫는 태그가 `<h1>.../h1>`, `<button>.../button>` 형태로 깨진 곳이 다수 있습니다. 예:

```jsx
<h1>?룺 ... ?쒖뒪??/h1>
<button className="profile-btn">?꾨줈??/button>
<span className="log-status">{log.success ? '?? : '??}</span>
```

이 상태로는 프론트엔드 빌드가 정상 통과하기 어렵습니다.

추가 문제:

- `cabinetLayout()` 함수는 계산만 하고 렌더링에 사용되지 않습니다.
- 모든 API base URL이 `http://localhost:3001`로 하드코딩되어 배포 환경에 취약합니다.
- `handleSearch`에서 query string을 직접 보간하고 `encodeURIComponent`를 사용하지 않습니다.
- 일반 사용자도 `+ 창고` UI가 보입니다. 백엔드는 창고 생성에 `requireAdmin`이 없어 일반 사용자도 창고 생성이 가능합니다.

### `frontend/src/LayoutEditor.js`

역할: 창고 레이아웃 드래그 앤 드롭 편집기입니다.

구현 내용:

- 창고 목록 조회 후 `warehouseId`에 해당하는 창고 선택.
- 캐비넷 목록 조회.
- 저장된 `layout` 조회.
- HTML5 drag/drop으로 캐비넷 좌표 변경.
- 저장 버튼으로 레이아웃 저장.

핵심 코드:

```js
const whRes = await fetch(`${API_BASE}/api/warehouses`);
const cabRes = await fetch(`${API_BASE}/api/warehouses/${warehouseId}/cabinets`);
const layoutRes = await fetch(`${API_BASE}/api/warehouses/${warehouseId}/layout`, {
  headers: { Authorization: `Bearer ${token}` }
});

const res = await fetch(`${API_BASE}/api/warehouses/${warehouseId}/layout`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  },
  body: JSON.stringify({ layout: layoutData })
});
```

핵심 문제:

- 첫 두 fetch에는 Authorization header가 없어 백엔드 `authenticateToken`에서 401이 납니다.
- 저장 body가 `{ layout: layoutData }`인데 백엔드는 `{ layout_data }`를 요구합니다. 따라서 저장이 항상 400이 됩니다.
- `warehouseId` 타입이 문자열/숫자일 때 `warehouses.find(w => w.id === warehouseId)`가 실패할 수 있습니다.
- `onDragOver`에서 상태를 변경합니다. drag over 이벤트는 매우 자주 발생하므로 렌더링 폭주와 비정상 드롭이 생길 수 있습니다. drop 이벤트에서만 상태를 바꿔야 합니다.
- `LayoutEditor`는 `App.js` 라우팅에 연결되어 있지 않아 사용자가 접근할 수 없습니다.

### `frontend/src/Login.js`, `Register.js`, `Profile.js`

역할:

- `Login.js`: username/password 로그인, token/user localStorage 저장, dashboard 이동.
- `Register.js`: username/email/password 회원가입, login 이동.
- `Profile.js`: 프로필 조회/수정, localStorage user 갱신, 로그아웃.

공통 문제:

- 한국어/이모지 텍스트가 깨지면서 JSX 문자열/태그 일부가 문법적으로 깨져 있습니다.
- API base URL이 하드코딩되어 있습니다.
- localStorage에 JWT를 저장하므로 XSS 발생 시 토큰 탈취 위험이 큽니다.
- `Profile.js`는 전화번호/PIN UI가 없지만 백엔드 profile update는 `phone`, `pin_code`를 받을 수 있습니다.

### `backend/watchdog.js`, 루트 `watchdog.js`

역할: 서버 프로세스 감시 및 자동 재시작입니다.

구현:

- `child_process.spawn`으로 `server.js` 실행.
- 종료 시 일정 시간 뒤 재시작.
- SIGINT/SIGTERM 처리.

문제:

- 루트 `watchdog.js`와 `backend/watchdog.js`가 둘 다 존재해 운영 진입점이 혼동됩니다.
- 로그 rotation, crash loop backoff, health check endpoint 검증이 없습니다.

### `backend/test-*`

역할: API 테스트 스크립트입니다.

- `test-api.js`: Node 기반 API 테스트로 보입니다.
- `test-api.ps1`, `test-multi-warehouse.ps1`, `test-new-api.ps1`: PowerShell 테스트.

문제:

- `package.json`의 `npm test`는 실제 테스트를 실행하지 않고 실패합니다.
- CI와 연결된 테스트 스크립트가 없습니다.

## 3. 현재 구현된 기능

백엔드:

- 회원가입/로그인/JWT 인증.
- 첫 번째 가입자 자동 admin.
- 사용자 목록/PIN 수정/초기화.
- 창고 생성/목록/삭제.
- 캐비넷 생성/목록/상태 변경.
- 창고 및 캐비넷 레이아웃 저장 API.
- 계약 생성/목록/취소.
- 결제 기록 생성, 영수증 비밀번호, 빌링키 저장.
- PIN/OTP/QR 출입 인증.
- 출입 로그 저장/조회.
- 하드웨어 상태, 릴레이 제어, 문 열기, 화재 경보 처리.
- 네이버 예약 이메일/크롤러 동기화 스켈레톤.
- 재고 CRUD, 입출고, 검색, 통계.
- 프로필 조회/수정.
- 만료 임박/만료 계약 상태 스케줄러.
- 알림톡/FCM/SMS/PG API 연동 스텁.

프론트엔드:

- 로그인/회원가입/프로필 화면.
- 대시보드 창고 선택.
- 창고/캐비넷/계약 생성 UI.
- 캐비넷 상태 시각화.
- 출입 인증 테스트 UI.
- 출입 로그 표시.
- 통계/검색 표시.
- 관리자 하드웨어 상태/문 열기 UI.
- 네이버 예약 수동 동기화 UI.
- 레이아웃 편집기 파일 존재.

## 4. 누락된 기능

- 실제 PG사 결제/자동 결제 API 연동.
- 실제 FCM/카카오 알림톡/SMS 연동.
- 실제 네이버 예약 파서와 검증된 파트너센터 크롤러.
- 예약 데이터를 계약/캐비넷 배정으로 전환하는 업무 흐름.
- 관리자용 사용자/계약/결제/예약 상세 관리 화면.
- 캐비넷 점유 기간 충돌 검증.
- 창고/캐비넷 수정 API 및 UI.
- 재고 관리 UI. 백엔드 API는 있지만 대시보드에 품목 CRUD 화면이 없습니다.
- 영수증 UI.
- 권한 모델: 창고 소유자, 관리자, 일반 사용자 권한이 일관되지 않습니다.
- 운영 설정: 환경별 API URL, HTTPS, 배포 설정, 로그/모니터링.
- DB migration 체계. 서버 시작 시 `CREATE TABLE IF NOT EXISTS`만 있고 스키마 변경 관리가 약합니다.
- 테스트 자동화와 CI.
- 하드웨어 이벤트 감사 로그.
- PIN/OTP 실패 잠금, rate limit, 알림.
- LayoutEditor 라우팅 연결 및 정상 저장.

## 5. 버그 및 취약점 리스트

### 치명/높음

1. 프론트엔드 JSX/문자열 깨짐으로 빌드 불가 가능성 높음
   - `Dashboard.js`, `Login.js`, `Register.js`, `Profile.js`, `LayoutEditor.js`에 깨진 문자열과 닫는 태그가 다수 있습니다.
   - 예: `Dashboard.js`의 `occupied: '?댁슜以?,`, `<h1>.../h1>`, `<button>.../button>`.

2. 비밀키 하드코딩
   - `server.js`: `JWT_SECRET`, `OTP_SECRET`가 코드에 고정되어 있습니다.
   - 저장소 유출 시 토큰 위조와 OTP 예측 위험이 있습니다.

3. PIN 평문 저장/노출
   - `users.pin_code`가 평문입니다.
   - `/api/admin/users`는 PIN을 그대로 반환합니다.
   - `syncPinToMiniPC()`는 PIN을 평문 파일로 씁니다.

4. 출입 인증 API에 rate limit/lockout 없음
   - `/api/access/authenticate`는 인증 토큰 없이 PIN brute force가 가능합니다.
   - 실패 횟수 제한, IP/device 제한, 감사 알림이 없습니다.

5. 프로필 IDOR
   - `/api/profile/:userId` GET/PUT은 인증된 사용자라면 다른 `userId`를 넣어 조회/수정할 수 있습니다.
   - admin 또는 본인인지 확인해야 합니다.

6. 스키마와 코드 불일치
   - `contracts` 테이블 생성에는 `auto_renew`가 없지만 자동 연장 쿼리는 `c.auto_renew`를 사용합니다.
   - SQLite에서 해당 스케줄러 실행 시 `no such column: c.auto_renew` 오류가 예상됩니다.

7. 하드웨어/화재 경보 엔드포인트 인증 부재
   - `/api/hardware/fire-alarm`은 공개 엔드포인트입니다.
   - 로컬 하드웨어에서만 호출된다는 보장이 없으면 문 강제 개방 기능이 외부 입력에 노출됩니다.

8. CORS 전체 허용
   - `app.use(cors())`로 모든 origin이 허용됩니다.
   - localStorage JWT와 결합하면 XSS/악성 사이트 호출 위험이 커집니다.

### 중간

9. 중복 라우트 등록
   - `/api/admin/door/unlock`, `/api/admin/relay/control`, `/api/admin/hardware/status`, `/api/hardware/fire-alarm`가 두 번 정의되어 있습니다.
   - 앞쪽 구현이 응답을 끝내므로 뒤쪽 "backdoor API" 주석 라우트는 사실상 도달하지 않을 가능성이 높지만 유지보수 혼란과 보안 오해를 만듭니다.

10. Express 에러 핸들러 위치
   - 전역 에러 핸들러가 파일 하단 중복 라우트보다 앞에 있습니다.
   - 에러 핸들러는 모든 라우트 등록 이후에 위치해야 합니다.

11. LayoutEditor API 불일치
   - 백엔드: `layout_data` 요구.
   - 프론트: `{ layout: layoutData }` 전송.
   - 저장 실패가 예상됩니다.

12. LayoutEditor 인증 헤더 누락
   - 창고/캐비넷 조회 fetch에 Authorization header가 없습니다.

13. GET 영수증에서 body 사용
   - `GET /api/payments/:id/receipt`가 `req.body.password`를 읽습니다.
   - POST로 바꾸거나 query/header를 사용해야 합니다.

14. 네이버 이메일 파싱 race condition
   - `simpleParser` 비동기 저장이 끝나기 전에 `resolve(count)`될 수 있습니다.

15. 검색 query encoding 누락
   - `api.get(`/api/search?q=${q}`)`는 특수문자에서 깨질 수 있습니다.

16. 일반 사용자 창고 생성 가능
   - `POST /api/warehouses`에는 `requireAdmin`이 없습니다.
   - UI도 admin 여부와 관계없이 `+ 창고` 버튼을 표시합니다.

17. 계약 생성 권한/검증 부족
   - 일반 사용자가 자기 계정으로 어떤 available cabinet이든 계약 생성 가능.
   - 관리자만 타 사용자 계약을 생성해야 한다면 권한 분리가 필요합니다.
   - 기간 중복, 시작/종료 날짜 순서, 금액 검증 없음.

18. OTP 설계 취약
   - phone + 고정 secret + minute window 기반입니다.
   - 전화번호가 알려지고 secret이 유출되면 OTP 생성이 가능합니다.
   - 표준 TOTP secret per user/device가 아닙니다.

### 낮음/품질

19. 인코딩 깨짐
   - README, 프론트 UI, 일부 주석이 mojibake 상태입니다.
   - 사용자 경험과 유지보수성이 크게 떨어집니다.

20. DB 연결 분산
   - `server.js`, `hardware.js`, `naver-sync.js`가 각각 SQLite 연결을 생성합니다.
   - 트랜잭션/락 관리가 어렵습니다.

21. 테스트 스크립트 미연결
   - `npm test`는 실패하도록 되어 있습니다.

22. `node_modules` 없음
   - 현재 `backend/node_modules`, `frontend/node_modules`가 없습니다.
   - `frontend npm run build`는 `react-scripts` 미인식으로 실행 실패했습니다.

23. 하드코딩된 API URL
   - 프론트 전체가 `http://localhost:3001`에 묶여 있습니다.

24. 배포/운영 로그 부족
   - 구조화 로그, 감사 로그, request id, 에러 추적이 없습니다.

## 6. 개선 제안

우선순위 1: 실행 가능 상태 복구

- 프론트엔드 인코딩/JSX 깨짐을 먼저 복구합니다.
- `npm ci` 후 `npm run build`가 통과하도록 `Dashboard.js`, `Login.js`, `Register.js`, `Profile.js`, `LayoutEditor.js`를 수정합니다.
- UI 문자열을 UTF-8로 정상화하고 ESLint/Prettier를 적용합니다.

우선순위 2: 보안 기본선

- `JWT_SECRET`, `OTP_SECRET`를 `.env`로 이동하고 운영 secret rotate 절차를 둡니다.
- PIN은 bcrypt/argon2로 해시 저장하고, 관리자 목록에서 PIN 원문 반환을 제거합니다.
- 출입 인증에 rate limit, 실패 잠금, device key 또는 kiosk secret을 추가합니다.
- CORS origin allowlist를 설정합니다.
- localStorage JWT 대신 httpOnly secure cookie 또는 refresh/access token 구조를 검토합니다.
- profile API에 본인/admin 권한 검사를 추가합니다.

우선순위 3: 스키마/도메인 정리

- migration 도구를 도입합니다. 예: `knex`, `umzug`, `better-sqlite3` 기반 migration.
- `contracts.auto_renew` 컬럼을 실제로 추가하거나 자동 연장 코드를 제거합니다.
- 결제/계약/캐비넷 상태 변경은 트랜잭션으로 묶습니다.
- 창고 소유자/관리자/사용자 권한 정책을 명확히 하고 API 전체에 일관 적용합니다.

우선순위 4: 프론트 구조 개선

- API client를 `src/api.js`로 분리하고 base URL을 `REACT_APP_API_BASE_URL`로 설정합니다.
- Dashboard를 창고, 캐비넷, 계약, 하드웨어, 예약, 재고 컴포넌트로 분리합니다.
- LayoutEditor를 라우팅에 연결하고 백엔드 계약에 맞춰 `layout_data`로 저장합니다.
- 사용자 역할별 버튼 노출을 정리합니다.

우선순위 5: 운영 기능 완성

- 실제 PG, 알림톡/SMS/FCM 연동은 provider adapter 형태로 분리합니다.
- 네이버 예약 파서는 샘플 메일/HTML fixture 기반 테스트를 먼저 만들고 구현합니다.
- 하드웨어 제어는 명령 큐와 감사 로그를 도입합니다.
- watchdog은 crash loop backoff와 health endpoint 확인을 추가합니다.

우선순위 6: 테스트

- 백엔드: `supertest` 기반 API 테스트를 `npm test`에 연결합니다.
- 프론트: 최소 렌더링 테스트와 빌드 검증을 CI에 넣습니다.
- 네이버 파서: fixture 기반 단위 테스트.
- 계약/결제/만료 스케줄러: clock mocking 테스트.
- 보안: 인증/권한 회귀 테스트.

## 7. 검증 결과

실행한 확인:

```text
node --check backend/server.js
node --check backend/naver-sync.js
node --check backend/hardware.js
```

결과:

- 세 백엔드 파일은 Node 문법 검사에서 오류 출력 없이 통과했습니다.

```text
npm test (backend)
```

결과:

- 실패. `package.json`의 test script가 `"echo \"Error: no test specified\" && exit 1"`입니다.

```text
npm run build (frontend)
```

결과:

- 실패. 현재 `frontend/node_modules`가 없어 `react-scripts`를 찾지 못했습니다.
- 별도 설치 후에도 JSX/문자열 깨짐 때문에 빌드 실패 가능성이 높습니다.

현재 설치/산출물 상태:

```text
backend/node_modules: false
frontend/node_modules: false
backend/warehouse.db: false
frontend/build: false
```

## 8. 요약

이 프로젝트는 공유 창고 무인 관리 시스템의 PoC/프로토타입에 가까운 상태입니다. 백엔드는 API 범위가 넓고 도메인 대부분을 스케치했지만, 실제 운영에 필요한 보안, 권한, 스키마 일관성, 트랜잭션, 외부 연동 완성도가 부족합니다. 프론트엔드는 대시보드 중심 기능이 구현되어 있으나 현재 파일 인코딩/JSX 깨짐이 심각해 실행 가능 상태를 먼저 회복해야 합니다.

가장 먼저 처리할 항목은 다음 5개입니다.

1. 프론트엔드 깨진 JSX/문자열 복구 및 `npm run build` 통과.
2. 하드코딩 secret 제거와 PIN 해시화.
3. profile/access/hardware/fire-alarm 권한 및 rate limit 보강.
4. `contracts.auto_renew` 스키마 불일치와 중복 라우트 정리.
5. LayoutEditor API 계약 수정 및 라우팅 연결.

## 9. 사용량

- 토큰/비용 사용량은 현재 도구 환경에서 제공되지 않아 확인 불가.
- 수행한 로컬 확인: 파일 목록/라인 수 집계, 핵심 파일 읽기, 백엔드 `node --check`, 백엔드 `npm test`, 프론트 `npm run build`.


