# 공유창고 무인 통합 관리 시스템

윈도우 미니 PC 기반 공유창고 무인 키오스크 및 하드웨어 제어 시스템.

---

## 시스템 구조

```
shared-warehouse/
├── backend/
│   ├── server.js              # 메인 서버 (Express + SQLite)
│   ├── hardware.js            # 하드웨어 시리얼 통신 모듈
│   ├── naver-sync.js          # 네이버 예약 우회 연동 (IMAP + Puppeteer)
│   ├── watchdog.js            # 프로세스 감시 + 자동 재시작
│   ├── test-new-api.ps1       # API 테스트 스크립트
│   └── warehouse.db           # SQLite 데이터베이스
├── frontend/
│   ├── public/
│   └── src/
│       ├── App.js             # 라우팅/메인 컴포넌트
│       ├── Dashboard.js       # 대시보드 (캐비넷 배치도)
│       ├── LayoutEditor.js    # 레이아웃 드래그앤드롭 편집기
│       ├── Login.js           # 로그인
│       ├── Register.js        # 회원가입
│       ├── Profile.js         # 프로필/PIN 관리
│       └── *.css              # 스타일
├── KIOKS_GUIDE.md            # 키오스크 환경 설정 가이드
└── .gitignore
```

---

## 기술 스택

| 계층 | 기술 |
|------|------|
| 프론트엔드 | React 18, Create React App |
| 백엔드 | Node.js + Express 5 |
| 데이터베이스 | SQLite (파일 기반) |
| 인증 | JWT (JSON Web Token) |
| 해싱 | bcryptjs |
| 이메일 파싱 | mailparser + imap |
| 웹 크롤링 | puppeteer |
| 하드웨어 | @serialport/bindings-cpp |

---

## API 레퍼런스

### 인증
| METHOD | PATH | 설명 |
|--------|------|------|
| POST | `/api/register` | 회원가입 (첫 유저 = admin) |
| POST | `/api/login` | 로그인 (JWT 반환) |

### 관리자 (Require Admin)
| METHOD | PATH | 설명 |
|--------|------|------|
| GET | `/api/admin/users` | 전체 사용자 목록 (PIN 포함) |
| PUT | `/api/admin/users/:userId/pin` | PIN 수정 / 초기화 |
| PUT | `/api/warehouses/:id/layout` | 창고 레이아웃 저장 |
| GET | `/api/warehouses/:id/layout` | 창고 레이아웃 조회 |
| PUT | `/api/cabinets/:id/layout` | 캐비넷 위치 설정 |
| POST | `/api/admin/door/unlock` | 비상 문 열기 |
| POST | `/api/admin/relay/control` | 릴레이 제어 |
| GET | `/api/admin/hardware/status` | 하드웨어 상태 조회 |
| POST | `/api/admin/send-alert` | 알림톡 발송 |

### 창고/계약/결제
| METHOD | PATH | 설명 |
|--------|------|------|
| POST | `/api/warehouses` | 창고 생성 |
| GET | `/api/warehouses` | 창고 목록 |
| POST | `/api/warehouses/:id/cabinets` | 캐비넷 생성 |
| GET | `/api/warehouses/:id/cabinets` | 캐비넷 목록 |
| PUT | `/api/cabinets/:id` | 캐비넷 상태 변경 |
| POST | `/api/contracts` | 계약 생성 |
| GET | `/api/contracts` | 계약 목록 |
| POST | `/api/payments` | 결제 (billing_key 자동저장) |
| GET | `/api/payments/:id/receipt` | 영수증 |

### 출입/로그
| METHOD | PATH | 설명 |
|--------|------|------|
| POST | `/api/access/authenticate` | 출입 인증 |
| GET | `/api/warehouses/:id/access-logs` | 출입 기록 |
| GET | `/api/warehouses/:id/logs` | 전체 로그 |
| GET | `/api/warehouses/:id/stats` | 통계 |

### 아이템/재고
| METHOD | PATH | 설명 |
|--------|------|------|
| GET | `/api/warehouses/:id/items` | 재고 목록 |
| POST | `/api/warehouses/:id/items` | 재고 추가 |
| PUT | `/api/items/:id` | 재고 수정 |
| DELETE | `/api/items/:id` | 재고 삭제 |
| POST | `/api/items/:itemId/stock` | 재고 증감 |

### 프로필/검색
| METHOD | PATH | 설명 |
|--------|------|------|
| GET | `/api/profile/:userId` | 프로필 조회 |
| PUT | `/api/profile/:userId` | 프로필 수정 |
| GET | `/api/search?q=` | 전체 검색 |

### 하드웨어 백도어
| METHOD | PATH | 설명 |
|--------|------|------|
| POST | `/api/hardware/fire-alarm` | 화재 수신기 연동 |
| POST | `/api/admin/door/unlock` | 비상 문 열기 |
| POST | `/api/admin/relay/control` | 릴레이 제어 |

---

## 데이터베이스 스키마

### users
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 고유 ID |
| username | TEXT UNIQUE | 아이디 |
| email | TEXT UNIQUE | 이메일 |
| password | TEXT | bcrypt 해시 |
| phone | TEXT | 전화번호 |
| pin_code | TEXT | PIN (4자리) |
| role | TEXT | user/admin |
| created_at | DATETIME | 생성일 |

### warehouses
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 고유 ID |
| name | TEXT | 창고 이름 |
| location | TEXT | 위치 |
| capacity | INTEGER | 수용량 |
| owner_id | INTEGER | 소유자 |
| layout_data | TEXT | JSON 레이아웃 |
| created_at | DATETIME | 생성일 |

### cabinets
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 고유 ID |
| warehouse_id | INTEGER | 창고 FK |
| size | TEXT | S/M/L |
| relay_channel | INTEGER | 릴레이 채널 |
| status | TEXT | available/occupied/maintenance/expired_soon |
| current_contract_id | INTEGER | 현재 계약 FK |
| position_x | INTEGER | 레이아웃 X좌표 |
| position_y | INTEGER | 레이아웃 Y좌표 |
| position_index | INTEGER | 순서 |
| layout_data | TEXT | JSON |
| created_at | DATETIME | 생성일 |

### contracts
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 고유 ID |
| user_id | INTEGER | 사용자 FK |
| cabinet_id | INTEGER | 캐비넷 FK |
| start_date | DATETIME | 시작일 |
| end_date | DATETIME | 종료일 |
| status | TEXT | active/expired/cancelled/pending |
| total_amount | INTEGER | 금액 |
| billing_key | TEXT | 자동결제 키 |
| auto_renew | INTEGER | 자동연장 여부 (0/1) |
| created_at | DATETIME | 생성일 |

### payments
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 고유 ID |
| contract_id | INTEGER | 계약 FK |
| amount | INTEGER | 금액 |
| pg_approval_number | TEXT | PG 승인번호 |
| payment_time | DATETIME | 결제일 |
| status | TEXT | completed/refunded/failed |
| receipt_password | TEXT | 영수증 비밀번호 |
| billing_key | TEXT | billing_key |

### access_logs
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 고유 ID |
| user_id | INTEGER | 사용자 FK |
| warehouse_id | INTEGER | 창고 FK |
| auth_method | TEXT | pin/otp/qr/admin |
| success | INTEGER | 1/0 |
| note | TEXT | 비고 |
| created_at | DATETIME | 생성일 |

### naver_reservations
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 고유 ID |
| reservation_id | TEXT UNIQUE | 예약 ID |
| customer_name | TEXT | 예약자명 |
| phone | TEXT | 전화번호 |
| service_name | TEXT | 서비스명 |
| start_date | DATETIME | 시작일 |
| end_date | DATETIME | 종료일 |
| status | TEXT | synced |
| synced_at | DATETIME | 동기화일 |

### hardware_status
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 고유 ID |
| warehouse_id | INTEGER | 창고 FK |
| door_status | TEXT | open/closed/error |
| fire_alarm | INTEGER | 0/1 |
| last_check | DATETIME | 마지막 확인 |

### items
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 고유 ID |
| warehouse_id | INTEGER | 창고 FK |
| name | TEXT | 이름 |
| description | TEXT | 설명 |
| quantity | INTEGER | 수량 |
| unit | TEXT | 단위 |
| created_at | DATETIME | 생성일 |
| updated_at | DATETIME | 수정일 |

### inventory_logs
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 고유 ID |
| item_id | INTEGER | 아이템 FK |
| warehouse_id | INTEGER | 창고 FK |
| user_id | INTEGER | 사용자 FK |
| type | TEXT | in/out |
| quantity | INTEGER | 수량 |
| note | TEXT | 비고 |
| created_at | DATETIME | 생성일 |

---

## 설치 및 실행

### 1. 환경 준비

```powershell
# Node.js 18+ 설치 (https://nodejs.org)
node -v   # v18 이상 확인

# 프로젝트 클론
git clone https://github.com/wansook/shared-warehouse.git
cd shared-warehouse
```

### 2. 백엔드 설치

```powershell
cd backend
npm install
```

### 3. 프론트엔드 설치

```powershell
cd ../frontend
npm install
```

### 4. 백엔드 실행

```powershell
cd ../backend
node server.js
# 서버: http://localhost:3001
```

### 5. 프론트엔드 실행

```powershell
cd ../frontend
npm start
# 프론트엔드: http://localhost:3000
```

### 6. Watchdog 실행 (프로세스 감시)

```powershell
cd ../backend
node watchdog.js
# server.js가 다운되면 5초 내 자동 재시작
```

---

## 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| PORT | 백엔드 포트 | 3001 |
| EMAIL_IMAP_HOST | IMAP 서버 | imap.naver.com |
| EMAIL_IMAP_PORT | IMAP 포트 | 993 |
| EMAIL_USER | 네이버 계정 | - |
| EMAIL_PASSWORD | 네이버 비밀번호 | - |
| EMAIL_PASSWORD_APP | 네이버 앱 비밀번호 | - |
| NAVER_PARTNER_ID | 파트너센터 ID | - |
| NAVER_PARTNER_PW | 파트너센터 PW | - |

---

## 키오스크 환경 설정

### 1. Windows Assigned Access

1. 설정 > 계정 > 다른 사용자 > 할당된 액세스
2. 키오스크 앱 선택 (Chrome 또는 Edge)
3. 로그인 계정 설정

### 2. 키 차단

- Alt+F4, Ctrl+Alt+Del, Windows 키 차단
- AutoHotkey 또는 Group Policy 사용
- 자세한 내용은 `KIOKS_GUIDE.md` 참고

### 3. 자동 실행

작업 스케줄러 또는 레지스트리 설정으로 OS 부팅 시 자동 실행

---

## 하드웨어 연동

### 출입문 전자락 배선

```
SMPS(12V/24V) → 릴레이 COM → 전자락 (+)
전자락 (-) → SMPS(-)
릴레이 NO → 전자락 (+) [자동 잠금]
```

### 화재 수신기

```
화재 수신기 접점 → Arduino/Digital Input Pin 2
인터럽트 발생 → doorUnlock() 호출
```

### 퇴실 버튼

```
퇴실 버튼 → 릴레이 채널 N → 전자락 전원 차단
버튼 누름 → 3초간 전원 차단 → 자동 복귀
```

---

## 네이버 예약 연동

### 이메일 파싱 (메인)
- IMAP 프로토콜로 네이버 예약 확정 이메일 파싱
- UID 기반 마커 파일 (`.naver-sync-marker.json`)으로 중복 방지
- 폴링 간격: 5분

### 웹 크롤링 (서브)
- Puppeteer로 네이버 파트너센터 로그인
- 예약 리스트 자동 추출
- 폴링 간격: 1시간

### 환경 설정
```
EMAIL_IMAP_HOST=imap.naver.com
EMAIL_IMAP_PORT=993
EMAIL_USER=your_naver_id
EMAIL_PASSWORD=your_app_password
NAVER_PARTNER_ID=partner_id
NAVER_PARTNER_PW=partner_password
```

---

## 테스트

```powershell
cd backend
.\test-new-api.ps1
# 22개 API 테스트 실행
# (DB 초기화 후 실행 권장)
```

---

## 디렉토리 구조

```
shared-warehouse/
├── backend/              # 백엔드
│   ├── server.js         # 메인 서버
│   ├── hardware.js       # 하드웨어 제어
│   ├── naver-sync.js     # 네이버 연동
│   ├── watchdog.js       # 프로세스 감시
│   └── warehouse.db      # 데이터베이스
├── frontend/             # 프론트엔드
│   ├── public/
│   └── src/
│       ├── App.js
│       ├── Dashboard.js
│       ├── LayoutEditor.js  # 레이아웃 편집기
│       ├── Login.js
│       ├── Register.js
│       └── Profile.js
├── KIOKS_GUIDE.md       # 키오스크 가이드
├── README.md            # 이 파일
└── .gitignore
```
