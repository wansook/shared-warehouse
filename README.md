# 🏭 공유창고 무인 통합 관리 시스템

> 윈도우 미니 PC 기반 공유창고 무인 키오스크 및 하드웨어 제어 시스템

## 📋 시스템 개요

상주 인력 없이 24시간 운영 가능한 공유창고 관리 프로그램입니다. 현장 키오스크 결제, 하드웨어(출입문/캐비넷) 제어, 외부 플랫폼(네이버 예약) 데이터 우회 동기화를 통합합니다.

## 🏗️ 시스템 아키텍처

```
┌─────────────────────────────────────────────┐
│           Windows 10/11 미니 PC             │
│                                             │
│  ┌──────────────┐    ┌──────────────────┐   │
│  │  Watchdog    │────▶  Backend (Node.js) │   │
│  │ (모니터링)    │    │  :3001            │   │
│  └──────────────┘    └────────┬─────────┘   │
│                               │              │
│  ┌──────────────┐    ┌────────┴─────────┐   │
│  │  Edge 키오스크│◀───▶ Frontend (React) │   │
│  │  (풀스크린)   │    │  :3000           │   │
│  └──────────────┘    └──────────────────┘   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │        SQLite DB (warehouse.db)      │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ EM Lock  │  │ Relay    │  │ Fire     │  │
│  │ (출입문)  │  │ Board    │  │ Sensor   │  │
│  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────────────────────────────────┘
```

## 🚀 핵심 기능

### 1. 네이버 예약 우회 연동 (공식 API 미사용)
- **이메일 IMAP 파싱 (메인)**: 네이버 예약 확정 알림을 실시간 파싱
- **웹 크롤링 (서브)**: Puppeteer로 네이버 파트너센터 예약 리스트 동기화

### 2. 키오스크 UI 및 계약/결제 관리
- 직관적인 대화면 터치 UI
- 캐비넷 배치도 뷰어 (S/M/L 크기별 시각화)
- 현장 결제 연동 (IC 카드 리더기 SDK 연동 준비됨)
- 계약 상태 타임스탬프 기반 관리
- 만료 전 자동 알림톡 발송

### 3. 출입문 및 하드웨어 제어
- USB 시리얼 릴레이 보드 제어 (COM 포트)
- 인증 성공 시 릴레이 통제 → 전자락 전원 3~5초 차단 후 자동 잠금
- 인증 수단: QR 코드 스캔 / 고객 고유 PIN / Time-based OTP
- **오프라인 모드**: 인터넷 단절 시에도 기존 계약자 출입 가능
- 화재 수신기 신호 → 출입문 강제 개방
- 개폐 센서 모니터링 (문 열림 1분 이상 → 관리자 알림)
- 관리자 페이지 원격 문열기

### 4. Windows 무인 환경 최적화
- OS 부팅 시 키오스크 프로그램 자동 로그인 및 풀스크린 구동
- 사용자 조작 방지 (Alt+F4, Ctrl+Alt+Del 등)
- Watchdog 프로그램 (프로세스 다운 시 5초 내 자동 재시작)

## 📁 프로젝트 구조

```
shared-warehouse/
├── backend/
│   ├── server.js          # 메인 API 서버 (Express + SQLite)
│   ├── naver-sync.js      # 네이버 예약 우회 연동 모듈
│   ├── hardware.js        # 하드웨어 제어 모듈 (릴레이, 출입문)
│   ├── package.json
│   ├── .env.example       # 환경설정 템플릿
│   └── warehouse.db       # SQLite 데이터베이스
├── frontend/
│   ├── src/
│   │   ├── App.js         # 라우팅 설정
│   │   ├── Dashboard.js   # 메인 대시보드 (탭 UI, 배치도 뷰어)
│   │   ├── Login.js       # 로그인 페이지
│   │   ├── Register.js    # 회원가입 페이지
│   │   ├── Profile.js     # 프로필/설정 페이지
│   │   └── *.css
│   └── package.json
├── watchdog.js            # Watchdog 자동 재시작 프로그램
├── KIOSK-SETUP.md         # Windows Kiosk 모드 설정 가이드
├── README.md
└── .gitignore
```

## 🗄️ 데이터베이스 스키마

| 테이블 | 설명 |
|--------|------|
| `users` | 회원 정보 (이름, 전화번호, PIN 등) |
| `warehouses` | 창고 정보 |
| `cabinets` | 캐비넷 (ID, 규격, 릴레이 채널, 상태) |
| `contracts` | 계약 정보 (회원, 캐비넷, 기간, 상태) |
| `payments` | 결제 이력 (금액, PG 승인번호) |
| `access_logs` | 출입 기록 (일시, 인증 방식, 성공/실패) |
| `hardware_status` | 하드웨어 상태 (문 개폐, 화재 경보) |
| `naver_reservations` | 네이버 예약 동기화 데이터 |
| `items` | 창고 내 재고 품목 |
| `inventory_logs` | 재고 입출고 로그 |

## ⚙️ 설치 및 실행

### 사전 준비
- Node.js 18+
- Windows 10/11 Pro (키오스크용)

### 백엔드
```bash
cd backend
npm install
cp .env.example .env
# .env 파일에 실제 설정 입력
node server.js
```

### 프론트엔드
```bash
cd frontend
npm install
npm start
```

### Watchdog (자동 재시작)
```bash
node watchdog.js
```

## 🔧 API 엔드포인트

### 회원
- `POST /api/register` - 회원가입
- `POST /api/login` - 로그인 (JWT 토큰 발급)

### 창고/캐비넷
- `GET /api/warehouses` - 창고 목록
- `POST /api/warehouses` - 창고 생성
- `GET /api/warehouses/:id/cabinets` - 캐비넷 목록
- `POST /api/warehouses/:id/cabinets` - 캐비넷 추가

### 계약/결제
- `GET /api/contracts` - 계약 목록
- `POST /api/contracts` - 계약 생성
- `PUT /api/contracts/:id/cancel` - 계약 취소
- `POST /api/payments` - 결제
- `GET /api/payments/:id/receipt` - 영수증 조회

### 출입 인증
- `POST /api/access/authenticate` - 출입 인증 (PIN/OTP/QR)
- `GET /api/warehouses/:id/access-logs` - 출입 로그

### 하드웨어 (관리자)
- `POST /api/admin/door/unlock` - 원격 문열기
- `POST /api/admin/relay/control` - 릴레이 제어
- `GET /api/admin/hardware/status` - 하드웨어 상태
- `POST /api/hardware/fire-alarm` - 화재 경보

### 네이버 예약 동기화 (관리자)
- `POST /api/admin/sync-naver-emails` - 이메일 파싱
- `POST /api/admin/sync-naver-crawler` - 파트너센터 크롤링
- `GET /api/admin/naver-reservations` - 동기화 데이터 조회

### 알림 (관리자)
- `POST /api/admin/send-alert` - 알림톡 발송

## 🔐 환경설정 (.env)

```env
# 이메일 IMAP
EMAIL_IMAP_HOST=imap.naver.com
EMAIL_USER=your_email@naver.com
EMAIL_PASSWORD=your_app_password

# 네이버 파트너센터
NAVER_PARTNER_ID=your_id
NAVER_PARTNER_PW=your_password

# 시리얼 포트
SERIAL_PORT=COM3
BAUD_RATE=9600
RELAY_DELAY=3000

# 카카오 알림톡
KAKAO_TALK_API_KEY=your_key
KAKAO_ADMIN_PHONE=010XXXXXXXX

# 서버
PORT=3001
```

## 📖 더 보기

- [Windows Kiosk 모드 설정 가이드](./KIOSK-SETUP.md)

## 📝 개발 완료 후 테스트 항목

- [ ] 결제 → 문열기 시나리오
- [ ] 네트워크 단절 시 기존 계약자 출입 테스트
- [ ] 화재 경보 시 강제 개방 테스트
- [ ] Watchdog 재시작 테스트 (프로세스 강제 종료 후 5초 내 복구)
- [ ] 네이버 예약 이메일 파싱 테스트
- [ ] 카카오 알림톡 발송 테스트
