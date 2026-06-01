# 🏢 다점포 공유창고 무인 웹 자동화 시스템 PRD

---

## 목차

1. 개요
2. 3계층 역할·권한 체계 (RBAC)
3. 역할별 기능 매트릭스
4. 데이터 분리 규칙
5. API 권한 규칙
6. 핵심 기능
7. 화면 구조 (UI)
8. 기술 아키텍처
9. 예외 처리 및 장애 대응
10. 성공 지표 (KPI)
11. 데이터베이스 구조
12. 납품 조건
13. 리스크
14. FAQ / 가정
15. 부록: 구현 현황

---

## 1. 개요

### 1.1 배경

- **기존 유료 키오스크/관리 프로그램 대체**: 월 $100+ → $0
- 현장 대형 키오스크 및 실물 카드 단말기 없이 **고객의 스마트폰(Web 키오스크)**으로 무인 운영
- 다점포 확장이 가능한 중앙 집중형 시스템

### 1.2 핵심 방향

| 방향 | 설명 |
|------|------|
| **Zero Kiosk** | 현장 대형 키오스크 및 실물 카드 단말기 하드웨어 없이, 고객의 스마트폰을 웹 키오스크(BYOD)로 활용 |
| **Web-Based & PWA** | 별도 네이티브 앱 설치 없이 웹 브라우저 기반, 웹 푸시(Web Push/FCM) 알림 제공 |
| **Multi-Branch** | 하나의 중앙 서버에서 여러 지점 관리, 지점별 점주 권한 철저히 분리 |

### 1.3 핵심 흐름

1. **입구 QR 스캔** → 해당 지점 모바일 웹 접속
2. **전화번호 인증** (No OAuth) → 계정 생성/연동
3. **동적 도면**에서 빈 캐비먼트 선택 → 기간/요금 선택
4. **PG 결제 + 빌링키 등록** → 자동 연장 결제 동의
5. **Web Push/알림톡**으로 PIN 번호 및 캐비먼트 번호 수신
6. **QR/PIN**으로 캐비먼트 접근
7. **만료 D-7 알림 → D-1 자동 결제 → 연장 완료/실패**

### 1.4 범위

- 모바일 웹 기반 프론트엔드 (React 18, PWA)
- 중앙 백엔드 API 서버 (Express + SQLite)
- 지점별 Windows 미니 PC 키오스크 (하드웨어 제어)
- PG 결제 연동 (토스페이먼츠/포트원)
- Web Push/알림톡/SMS 알림 시스템
- 네이버 예약 연동 (IMAP 이메일 파싱 + Puppeteer 교차 검증)

---

## 2. 3계층 역할·권한 체계 (RBAC)

시스템에는 **딱 3개의 역할(Role)**만 존재한다. 모든 사용자는 이 중 하나의 역할을 가지며, 각 역할의 권한 범위는 **절대 겹치지 않는다**.

### 2.1 역할 정의

```
                           ┌───────────────────┐
                           │   Super Admin     │
                           │  (전체 운영자)     │
                           │  role: 'admin'    │
                           └────────┬──────────┘
                                    │ 전체 시스템 관리·통제
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
   ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
   │   Store Owner     │ │   Store Owner     │ │   Store Owner     │
   │   (점주 A)         │ │   (점주 B)         │ │   (점주 C)         │
   │ role:'store_owner'│ │ role:'store_owner'│ │ role:'store_owner'│
   └────────┬──────────┘ └────────┬──────────┘ └────────┬──────────┘
            │ 본인 창고만               │ 본인 창고만               │ 본인 창고만
   ┌────────┼──────────┐             │                       │
   ▼        ▼          ▼             ▼                       ▼
┌──────┐┌──────┐  ┌──────┐      ┌──────┐               ┌──────┐
│Customer│Customer│  │Customer│      │Customer│               │Customer│
│ (고객) │ (고객) │  │ (고객) │      │ (고객) │               │ (고객) │
│role:   │role:   │  │role:   │      │role:   │               │role:   │
│'user'  │'user'  │  │'user'  │      │'user'  │               │'user'  │
└──────┘└──────┘  └──────┘      └──────┘               └──────┘
  본인 계약만     본인 계약만       본인 계약만              본인 계약만
```

| 계층 | 역할 | DB role 값 | 설명 | 권한 범위 |
|------|------|-----------|------|-----------|
| **L1** | **Super Admin** | `admin` | 시스템 전체를 총괄하는 최고 관리자 | 모든 지점·점주·고객·결제·하드웨어 데이터 |
| **L2** | **Store Owner** | `store_owner` | 특정 창고(지점)의 운영·자산을 담당하는 로컬 운영자 | 본인 소유 창고 및 해당 창고의 캐비먼트·계약·고객·매출 데이터 |
| **L3** | **Customer** | `user` | 창고 서비스를 이용하는 최종 고객 | 본인의 계약·결제수단·PIN·출입 데이터 |

> ⚠️ `customer` role 값은 **사용하지 않는다**. Customer는 `role='user'`로 통일한다. (기존 테이블 CONSTRAINT 호환을 위해 `customer`는 `REQUIRED_USER_ROLES`에 포함될 수 있으나, 신규 생성 시에는 `user` 만 사용한다.)

### 2.2 각 역할별 세부 설명

#### 2.2.1 Customer (고객) — role: `user`

창고 서비스를 실제로 이용하는 최종 사용자. 전화번호 인증으로 가입하며, 다중 계약이 가능하다.

**핵심 행위:**
- QR 스캔 → 전화번호 인증 → 가입/로그인
- 동적 도면에서 빈 캐비먼트 선택 → PG 결제
- 계약 현황(만료일, 결제수단) 확인
- PIN 관리 (직접 수정)
- QR/PIN으로 캐비먼트 출입

**절대 할 수 없는 것:**
- 타인의 계약/결제 데이터 열람
- 캐비먼트 상태 변경
- 창고 설정/요금 변경
- 매출/정산 데이터 조회

#### 2.2.2 Store Owner (점주) — role: `store_owner`

특정 창고(지점)의 운영 및 자산 관리를 담당한다. 소유한 창고의 범위 내에서만 모든 작업이 가능하다.

**핵심 행위:**
- 본인 창고의 매출·가동률 조회
- 캐비먼트 상태 관리 (available / maintenance / occupied)
- 요금 설정 (이용 기간별 금액)
- Layout Builder로 캐비먼트 배치도 편집
- 고객 CS: PIN 초기화, 계약 취소, 부분 환불
- 출입 로그 및 하드웨어 상태 모니터링

**절대 할 수 없는 것:**
- 다른 점주의 창고/데이터 열람
- 신규 지점(창고) 생성/삭제 (Super Admin 전용)
- 다른 점주 계정 발급
- 전역 시스템 설정 변경

#### 2.2.3 Super Admin (전체 운영자) — role: `admin`

시스템 전체를 총괄 관리하는 최고 권한자. 모든 지점, 점주, 고객, 결제 데이터에 접근할 수 있다.

**핵심 행위:**
- 전체 지점 통합 매출·통계 대시보드
- 신규 지점(창고) 생성/삭제, 점주 지정
- 점주 계정 발급 및 권한 부여 (`role = 'store_owner'`)
- 전체 회원·계약·결제 데이터 열람
- 하드웨어 전역 상태 모니터링
- 비상 문 열기, 릴레이 원격 제어
- 레이아웃 템플릿 관리

---

## 3. 역할별 기능 매트릭스

각 기능에 대해 **누가 접근 가능한지**를 명확히 구분한다.

✅ = 접근 가능 (본인 범위 내), ❌ = 접근 불가, 🔵 = 전역 접근 (모든 데이터)

### 3.1 계정·인증

| 기능 | Customer | Store Owner | Super Admin |
|------|:--------:|:-----------:|:-----------:|
| 전화번호 인증 가입 | ✅ | ✅ | ✅ |
| 로그인 (JWT 발급) | ✅ | ✅ | ✅ |
| 본인 프로필 조회 | ✅ | ✅ | ✅ |
| PIN 번호 조회/수정 | ✅ (본인) | ✅ (담당 고객) | 🔵 |
| PIN 초기화 (CS) | ❌ | ✅ (담당 고객) | 🔵 |

### 3.2 창고·지점 관리

| 기능 | Customer | Store Owner | Super Admin |
|------|:--------:|:-----------:|:-----------:|
| 창고 목록 조회 | ✅ (이용 가능) | ✅ (본인 소유만) | 🔵 |
| 창고 단건 조회 | ✅ | ✅ (본인 소유만) | 🔵 |
| 창고 생성/삭제 | ❌ | ❌ | 🔵 |
| 창고 설정 변경 (이름/위치) | ❌ | ❌ | 🔵 |
| 창고별 QR 코드 생성 | ❌ | ❌ | 🔵 |
| Layout Builder (캐비넷 배치 편집) | ❌ | ✅ (본인 창고) | 🔵 |

### 3.3 캐비먼트 관리

| 기능 | Customer | Store Owner | Super Admin |
|------|:--------:|:-----------:|:-----------:|
| 캐비먼트 목록 조회 | ✅ (창고별) | ✅ (본인 창고) | 🔵 |
| 캐비먼트 상태 변경 | ❌ | ✅ (본인 창고) | 🔵 |
| 캐비먼트 추가/삭제 | ❌ | ✅ (본인 창고) | 🔵 |
| 빈 캐비먼트 동적 도면 | ✅ | ✅ | 🔵 |

### 3.4 계약 관리

| 기능 | Customer | Store Owner | Super Admin |
|------|:--------:|:-----------:|:-----------:|
| 계약 생성 (캐비넷 선택 → 결제) | ✅ (본인) | ❌ | ✅ (지정 user_id) |
| 본인 계약 목록 조회 | ✅ | ❌ | — |
| 창고별 계약 목록 조회 | ❌ | ✅ (본인 창고) | 🔵 |
| 전체 계약 목록 조회 | ❌ | ❌ | 🔵 |
| 계약 취소 | ❌ | ✅ (본인 창고 내) | 🔵 |
| 자동 연장 (CRON) | 시스템 자동 | 시스템 자동 | 모니터링 |

### 3.5 결제 관리

| 기능 | Customer | Store Owner | Super Admin |
|------|:--------:|:-----------:|:-----------:|
| 결제 실행 (PG) | ✅ (본인) | ❌ | ❌ (운영자 결제 불가) |
| 빌링키 등록 | ✅ (본인) | ❌ | ❌ |
| 본인 결제 내역 조회 | ✅ | ❌ | — |
| 창고별 결제 내역 조회 | ❌ | ✅ (본인 창고) | 🔵 |
| 전체 결제 내역 조회 | ❌ | ❌ | 🔵 |
| 결제 취소/부분 환불 | ❌ | ✅ (본인 창고) | 🔵 |
| 영수증 조회 | ✅ (본인) | ✅ (본인 창고) | 🔵 |
| 매출·정산 통계 | ❌ | ✅ (본인 창고) | 🔵 |

### 3.6 출입·하드웨어

| 기능 | Customer | Store Owner | Super Admin |
|------|:--------:|:-----------:|:-----------:|
| QR/PIN 출입 인증 | ✅ (본인) | ❌ | ❌ |
| 출입 로그 조회 | ✅ (본인) | ✅ (본인 창고) | 🔵 |
| 전자락 상태 조회 | ❌ | ✅ (본인 창고) | 🔵 |
| 화재 수신기 상태 조회 | ❌ | ✅ (본인 창고) | 🔵 |
| 비상 문 열기 | ❌ | ❌ | 🔵 |
| 릴레이 원격 제어 | ❌ | ❌ | 🔵 |

### 3.7 알림·연동

| 기능 | Customer | Store Owner | Super Admin |
|------|:--------:|:-----------:|:-----------:|
| Web Push 수신 | ✅ (본인) | ❌ | ❌ |
| 카카오 알림톡/SMS 수신 | ✅ (본인) | ❌ | ❌ |
| 네이버 예약 연동 조회 | ❌ | ✅ (본인 창고) | 🔵 |
| 네이버 예약 수동 동기화 | ❌ | ❌ | 🔵 |

### 3.8 점주 관리 (Super Admin 전용)

| 기능 | Customer | Store Owner | Super Admin |
|------|:--------:|:-----------:|:-----------:|
| 점주 계정 생성 (role 지정) | ❌ | ❌ | 🔵 |
| 점주-창고 연결 (owner_id 지정) | ❌ | ❌ | 🔵 |
| 점주 계정 비활성화 | ❌ | ❌ | 🔵 |
| 창고 점주 변경 | ❌ | ❌ | 🔵 |

---

## 4. 데이터 분리 규칙

### 4.1 기본 원칙

| 계층 | 데이터 접근 범위 | DB 필터링 키 |
|------|-----------------|-------------|
| **Customer** | 본인이 생성한 계약·결제·출입 데이터만 | `WHERE user_id = :currentUserId` |
| **Store Owner** | 본인이 소유한 창고(들)에 속한 모든 캐비넷·계약·결제·출입 데이터 | `WHERE warehouse.owner_id = :currentUserId` |
| **Super Admin** | 모든 데이터 (전역) | 필터 없음 또는 명시적 전체 조회 |

### 4.2 테이블별 분리 규칙

| 테이블 | Customer 접근 | Store Owner 접근 | Super Admin 접근 |
|--------|:------------:|:----------------:|:----------------:|
| `users` | 본인 row만 (`id = self`) | 본인 창고 이용 고객 (contracts JOIN) | 모든 row |
| `warehouses` | 이용 중인 창고만 (contracts JOIN) | `owner_id = self` 인 창고만 | 모든 row |
| `cabinets` | 이용 중인 캐비넷만 (contracts JOIN) | 본인 창고의 캐비넷만 | 모든 row |
| `contracts` | `user_id = self` | 본인 창고의 계약만 | 모든 row |
| `payments` | 본인 계약의 결제만 | 본인 창고의 결제만 | 모든 row |
| `access_logs` | `user_id = self` | 본인 창고의 로그만 | 모든 row |
| `hardware_status` | 접근 불가 | 본인 창고만 | 모든 row |
| `hardware_events` | 접근 불가 | 본인 창고만 | 모든 row |
| `layouts` | 읽기 전용 (도면 표시) | 본인 창고만 읽기/쓰기 | 모든 row |
| `items` / `inventory_logs` | 접근 불가 | 본인 창고만 | 모든 row |
| `naver_reservations` | 접근 불가 | 본인 창고만 | 모든 row |

### 4.3 데이터 무결성 규칙

1. **Store Owner 데이터 누설 방지**: 모든 점주 대상 API는 반드시 `warehouse.owner_id = req.user.id` 조건을 적용한다.
2. **Customer 데이터 누설 방지**: 모든 고객 대상 API는 반드시 `user_id = req.user.id` 조건을 적용한다.
3. **계약 생성 시 창고 소유권 무관**: Customer는 어떤 창고든 이용할 수 있으며, 계약 생성 시 창고의 owner_id와는 무관하게 동작한다.
4. **점주는 Customer 계약을 대리 생성할 수 없다**: 계약 생성은 Customer 본인 또는 Super Admin만 가능하다.

---

## 5. API 권한 규칙

### 5.1 미들웨어 정의

```javascript
// JWT 인증 (모든 역할 공통)
authenticateToken → req.user = { id, username, role }

// 역할 검증 미들웨어
requireAdmin       → role === 'admin'
requireStoreOwner  → role === 'store_owner'
requireStaff       → role === 'admin' || role === 'store_owner'

// 데이터 소유권 검증
requireWarehouseOwner → warehouse.owner_id === req.user.id
requireSelfData       → resource.user_id === req.user.id
```

### 5.2 엔드포인트별 권한 매트릭스

| Endpoint | Method | auth | role 요구 | 추가 검증 |
|----------|--------|------|-----------|-----------|
| `/api/auth/register` | POST | ❌ | 없음 | 첫 유저 auto-admin |
| `/api/auth/login` | POST | ❌ | 없음 | JWT 발급 |
| `/api/auth/me` | GET | ✅ | 모든 role | — |
| `/api/admin/users` | GET | ✅ | `admin` | — |
| `/api/admin/users/:id/pin` | PUT | ✅ | `admin` or `store_owner` | store_owner: 본인 창고 고객인지 |
| `/api/warehouses` | GET | ✅ | 모든 role | role별 필터링 (admin=전체, store_owner=owner_id=self, customer=이용 중) |
| `/api/warehouses/:id` | GET | ✅ | 모든 role | store_owner: owner_id=self |
| `/api/warehouses` | POST | ✅ | `admin` | — |
| `/api/warehouses/:id` | DELETE | ✅ | `admin` | — |
| `/api/warehouses/:id/layout` | GET | ✅ | 모든 role | store_owner: owner_id=self |
| `/api/warehouses/:id/layout` | PUT | ✅ | `admin` or `store_owner` | store_owner: owner_id=self |
| `/api/warehouses/:id/qr-url` | GET | ✅ | `admin` | — |
| `/api/warehouses/:id/qr` | POST | ✅ | `admin` | — |
| `/api/warehouses/:wid/cabinets` | GET | ✅ | 모든 role | store_owner: owner_id=self |
| `/api/warehouses/:wid/cabinets` | POST | ✅ | `admin` or `store_owner` | store_owner: owner_id=self |
| `/api/cabinets/:id` | PUT | ✅ | `admin` or `store_owner` | store_owner: cabinet→warehouse→owner_id=self |
| `/api/cabinets/:id/status` | PUT | ✅ | `admin` or `store_owner` | store_owner: cabinet→warehouse→owner_id=self |
| `/api/contracts` | GET | ✅ | 모든 role | admin=전체, store_owner=본인창고, customer=본인 |
| `/api/contracts` | POST | ✅ | `user` or `admin` | user: user_id=self; admin: user_id 지정 가능 |
| `/api/contracts/:id/cancel` | PUT | ✅ | `admin` or `store_owner` | store_owner: contract→warehouse→owner_id=self |
| `/api/payments` | POST | ✅ | `admin` | (PG 연동 시 customer도 가능) |
| `/api/payments/:id/receipt` | POST | ✅ | 모든 role | admin=전체, store_owner=본인창고, customer=본인 |
| `/api/payments/stats` | GET | ✅ | `admin` or `store_owner` | store_owner: warehouse.owner_id=self |
| `/api/access/authenticate` | POST | ❌ | 없음 | Rate limit + lockout |
| `/api/access/logs` | GET | ✅ | 모든 role | admin=전체, store_owner=본인창고, customer=본인 |
| `/api/hardware/status/:wid` | GET | ✅ | `admin` or `store_owner` | store_owner: warehouse.owner_id=self |
| `/api/hardware/control` | POST | ✅ | `admin` | 하드웨어 API Secret |
| `/api/naver/reservations` | GET | ✅ | `admin` or `store_owner` | store_owner: 본인 창고 연동 데이터 |
| `/api/naver/sync` | POST | ✅ | `admin` | — |

### 5.3 권한 체크 코드 패턴

#### 패턴 1: Store Owner 창고 소유권 검증
```javascript
// Store Owner는 본인 창고인지 확인
if (req.user.role === 'store_owner') {
  const warehouse = await db.get(
    'SELECT owner_id FROM warehouses WHERE id = ?', [warehouseId]
  );
  if (!warehouse || warehouse.owner_id !== req.user.id) {
    return res.status(403).json({ message: '접근 권한이 없습니다.' });
  }
}
// Admin은 통과
```

#### 패턴 2: Customer 본인 데이터 검증
```javascript
// Customer는 본인 데이터만
if (req.user.role === 'user') {
  if (resource.user_id !== req.user.id) {
    return res.status(403).json({ message: '본인 데이터만 접근 가능합니다.' });
  }
}
```

#### 패턴 3: Store Owner + Admin 계층 검증
```javascript
function requireStaffOrSelfResource(getOwnerId) {
  return async (req, res, next) => {
    if (req.user.role === 'admin') return next();
    if (req.user.role === 'store_owner') {
      const ownerId = await getOwnerId(req);
      if (ownerId !== req.user.id) return res.status(403).json({ message: '권한 없음' });
      return next();
    }
    if (req.user.role === 'user') {
      const userId = await getUserId(req);
      if (userId !== req.user.id) return res.status(403).json({ message: '권한 없음' });
      return next();
    }
    res.status(403).json({ message: '권한 없음' });
  };
}
```

---

## 6. 핵심 기능

### 6.1 Customer 기능 (P0 우선순위)

| 번호 | 기능 | 설명 | 우선순위 |
|------|------|------|----------|
| C01 | QR 지점 접속 | 입구 QR → 지점별 모바일 웹 자동 접속 | P0 |
| C02 | 전화번호 인증 가입 | SMS/알림톡 인증. **OAuth 없음** | P0 |
| C03 | 로그인 | 전화번호/인증 기반 JWT | P0 |
| C04 | 동적 도면 뷰어 | 실시간 빈 캐비먼트 시각화, 지점별 커스텀 도면 | P0 |
| C05 | 캐비먼트 선택 | **단일 선택** (장바구니 없음) → 기간/요금 | P0 |
| C06 | PG 결제 | 토스페이먼츠/포트원 API 연동 | P0 |
| C07 | 빌링키 등록 | 최초 1회 카드 등록 → 자동 연장 | P0 |
| C08 | Web Push/알림톡 | PIN, 캐비먼트 번호, 결제/만료 알림 | P0 |
| C09 | 마이페이지 | 계약 현황, 만료일, 결제 수단 통합 | P0 |
| C10 | PIN 번호 관리 | 직접 수정 → 로컬 미니 PC 즉시 동기화 | P0 |
| C11 | 문 열기 버튼 | Web Push 기반 원격 출입 | P0 |
| C12 | 계약 관리 | 현황 조회, 상태(active/expired/cancelled) | P0 |
| C13 | 자동 연장 | 만료 D-1 빌링키 자동 결제 (CRON) | P0 |
| C14 | 네이버 예약 연동 | IMAP 파싱 → 0원 결제 처리 (P1) | P1 |
| C15 | 재고 관리 | 아이템 수량 관리 (P2) | P2 |

### 6.2 Store Owner 기능

| 번호 | 기능 | 설명 | 우선순위 |
|------|------|------|----------|
| S01 | 점주 대시보드 | 본인 창고 매출·가동률·계약자 통계 | P0 |
| S02 | 캐비먼트 상태 관리 | available / occupied / maintenance 변경 | P0 |
| S03 | 요금 설정 | 창고·캐비먼트별 이용 기간 및 요금 | P0 |
| S04 | Layout Builder | 캐비먼트 배치도 드래그앤드롭 편집 | P0 |
| S05 | 고객 PIN 초기화 | CS 대응: PIN 분실 시 초기화 | P0 |
| S06 | 계약 취소/환불 | 본인 창고 계약 취소 및 부분 환불 | P1 |
| S07 | 출입 로그 조회 | 고객별 출입 시각·인증 방식·성공여부 | P0 |
| S08 | 하드웨어 모니터링 | 전자락·화재 수신기 상태 (읽기 전용) | P0 |
| S09 | 매출·정산 조회 | 결제 내역, 환불 내역, 정산 예정/완료 | P0 |
| S10 | 계약자 리스트 | 창고 이용 고객·계약 상태 목록 | P0 |

### 6.3 Super Admin 기능

| 번호 | 기능 | 설명 | 우선순위 |
|------|------|------|----------|
| A01 | 전체 대시보드 | 전 지점 통합 매출·회원·계약·가동률 | P0 |
| A02 | 지점(창고) 관리 | 신규 창고 생성/삭제, 점주 지정 | P0 |
| A03 | 점주 계정 발급 | `role='store_owner'` 계정 생성 및 창고 연결 | P0 |
| A04 | 전체 회원 관리 | 모든 사용자 목록, 역할 변경, PIN 초기화 | P0 |
| A05 | 전체 계약/결제 조회 | 전 지점 계약·결제 통합 조회, 취소/환불 | P0 |
| A06 | 하드웨어 전역 모니터링 | 모든 지점 전자락·화재 수신기 상태 | P0 |
| A07 | 비상 문 열기 | 긴급 상황 시 원격 문 열기 | P1 |
| A08 | 릴레이 원격 제어 | 전자락 원격 개폐 | P1 |
| A09 | 네이버 예약 수동 동기화 | Puppeteer 교차 검증 트리거 | P2 |
| A10 | 시스템 설정 | JWT 시크릿, CORS, PG 설정 등 | P1 |

---

## 7. 화면 구조 (UI)

### 7.1 Customer (모바일 웹)

```
[지점 QR 스캔]
     ↓
[로그인/회원가입] ← 전화번호 + SMS 인증
     ↓
[동적 도면 뷰어]  ← 창고 레이아웃, 빈 캐비넷 표시
     ↓
[캐비넷 선택]     ← 크기(S/M/L/XL/XXL) + 기간(1개월/3개월)
     ↓
[결제 화면]       ← PG 간편결제 + 빌링키 등록 동의
     ↓
[계약 완료]       ← PIN 번호 + 캐비넷 번호 수신
     ↓
[마이페이지]      ← 계약 현황, 만료일, 결제수단, PIN 관리
     ├─ [내 계약]         ← 다중 계약 목록, 만료일, 자동연장 상태
     ├─ [내 결제]         ← 결제 내역, 영수증
     ├─ [PIN 관리]        ← PIN 변경
     ├─ [출입 기록]       ← 본인 출입 로그
     └─ [문 열기]         ← Web Push / QR / PIN
```

### 7.2 Store Owner (관리자 웹 대시보드)

```
[점주 대시보드]
├─ [대시보드 홈]         ← 선택된 창고 기준 매출·가동률 차트
├─ [캐비먼트 관리]       ← 상태 변경, 추가/삭제
│   └─ [Layout Builder]  ← 드래그앤드롭 배치 편집
├─ [요금 설정]            ← 기간별 요금, 크기별 요금
├─ [계약 관리]            ← 창고 내 계약 목록, 취소/환불
├─ [고객 관리]            ← 이용 고객 목록, PIN 초기화
├─ [출입 로그]            ← 시간·고객·인증방식·성공여부
├─ [결제·정산]            ← 매출 통계, 결제 내역, 정산 조회
└─ [하드웨어 상태]        ← 전자락, 화재 수신기 (읽기 전용)

* Store Owner 로그인 시 본인 소유 창고가 자동 선택됨
* 여러 창고 소유 시 상단 셀렉터로 전환
```

### 7.3 Super Admin (전체 관리자 대시보드)

```
[Super Admin 대시보드]
├─ [통합 대시보드]        ← 전 지점 KPI, 매출 비교, 가동률
├─ [지점 관리]            ← 창고 생성/삭제, 점주 지정
│   ├─ [창고 목록]        ← 전체 창고 + 점주명
│   ├─ [창고 생성]        ← 이름, 위치, 점주 선택
│   └─ [QR 코드 발급]     ← 지점별 QR 생성·출력
├─ [점주 계정 관리]       ← Store Owner 계정 CRUD
├─ [전체 회원 관리]        ← 모든 Customer/Store Owner 목록
├─ [전체 계약·결제]       ← 통합 조회, 취소, 환불
├─ [하드웨어 모니터링]    ← 전 지점 전자락·화재 수신기
│   ├─ [비상 문 열기]     ← 원격 강제 개방
│   └─ [릴레이 제어]      ← 채널별 On/Off
├─ [네이버 예약 연동]     ← 예약 목록, 수동 동기화
└─ [시스템 설정]          ← 환경변수, 보안 설정
```

---

## 8. 기술 아키텍처

### 8.1 전체 구조

```
[고객 스마트폰]
    ↓ QR 스캔 (지점 전용 QR)
[모바일 웹 (React PWA)]
    ↓ REST API / JWT
[중앙 백엔드 서버 (Express + SQLite)]
    │
    ├─ role='user' → Customer (본인 데이터만)
    ├─ role='store_owner' → Store Owner (본인 창고만)
    └─ role='admin' → Super Admin (전역)
    │
    ↓ WebSocket/폴링
+--- 지점 1 미니 PC ---+--- 지점 2 미니 PC ---+--- ...
       하드웨어 제어            하드웨어 제어
       (릴레이/전자락)        (릴레이/전자락)
```

### 8.2 기술 스택

| 계층 | 기술 |
|------|------|
| **Frontend** | React 18, Create React App, Tailwind CSS, PWA, Web Push (FCM) |
| **Backend** | Node.js 18+, Express 5, SQLite, Cron 스케줄러 |
| **인증** | JWT, bcryptjs, **전화번호 SMS/알림톡 인증** |
| **권한** | 3계층 RBAC (user / store_owner / admin), 미들웨어 기반 |
| **결제** | PG사 API (토스페이먼츠/포트원), **빌링키** |
| **알림** | Web Push (FCM) → **카카오 알림톡 → SMS (fallback)** |
| **네이버 연동** | mailparser, IMAP, **Puppeteer 교차 검증** |
| **하드웨어** | @serialport/bindings-cpp, 릴레이 제어 |
| **키오스크** | Windows Assigned Access (Chrome/Edge) |

---

## 9. 예외 처리 및 장애 대응 (필수 구현)

### 9.1 통신 장애 (Level 1)

| 현상 | 방어 로직 |
|------|-----------|
| 외부망 단절 → 모바일 웹 [문 열기] 불가 | **로컬 DB 동기화 기반 PIN 인증**<br/>미니 PC가 **5분 단위**로 활성 고객 PIN 리스트 로컬 DB 갱신<br/>출입문 **물리 숫자 패드** 입력 → 로컬 DB 대조 → 릴레이 개방 |

### 9.2 PC 장애 (Level 2)

| 현상 | 방어 로직 |
|------|-----------|
| 미니 PC 멈춤/다운 | **하드웨어 백도어**<br/>릴레이 전원에 직결된 **별도 비상 번호키 단말기**<br/>고객 CS 시 점주 마스터 비밀번호로 물리적 개방 |

### 9.3 결제 실패

| 현상 | 대응 |
|------|------|
| 빌링키 자동결제 실패 (잔액 부족 등) | 결제 수단 변경 요청 알림 발송 + 출입 권한 만료 처리 |

### 9.4 iOS 푸시 제한

| 현상 | 대응 |
|------|------|
| Safari Web Push 제한 | **알림톡/SMS fallback 필수** |

### 9.5 권한 관련 장애

| 현상 | 대응 |
|------|------|
| Store Owner가 타 지점 데이터 열람 시도 | 403 Forbidden + `access_logs`에 시도 기록 (감사) |
| Customer가 타인 PIN/계약 접근 시도 | 403 Forbidden + Rate limit |
| JWT 토큰 만료 | 401 Unauthorized → 재로그인 유도 |

---

## 10. 성공 지표 (KPI)

- **회원 전환율:** 방문 → 가입 ≥ 30%
- **계약 완료율:** 계약 시작 → 결제 완료 ≥ 70%
- **무인 접근 성공률:** QR/PIN 시도 → 성공 ≥ 95%
- **시스템 가동률:** 99.5% 이상
- **결제 자동화율:** 자동 연장 성공 ≥ 85%
- **설치 시간:** 신규 지점 ≤ 2시간
- **권한 오류율:** 잘못된 권한 부여로 인한 데이터 노출 0건

---

## 11. 데이터베이스 구조

### 11.1 핵심 관계

```
users (id, username, phone, role, pin_code, ...)
  │
  ├── role='admin'          → Super Admin (전체 접근)
  ├── role='store_owner'    → Store Owner (owner_id로 창고 소유)
  └── role='user'           → Customer (본인 계약만)
       │
       │ 1:N
       ▼
contracts (id, user_id, cabinet_id, warehouse_id, start_date, end_date, status, billing_key, ...)
  │
  │ 1:1 (active 상태에서)
  ▼
cabinets (id, warehouse_id, size, relay_channel, status, current_contract_id, ...)
  │
  │ N:1
  ▼
warehouses (id, owner_id, name, location, capacity, status, layout_data, ...)
  │
  │ owner_id → users(id) [Store Owner]
  │
  ├── hardware_status (warehouse_id, door_status, fire_alarm, ...)
  ├── layouts (warehouse_id, cabinet_id, position_x, position_y, ...)
  └── items (warehouse_id, name, quantity, ...)

payments (id, contract_id, user_id, amount, status, payment_method, billing_key, ...)
  │
  └── contract_id → contracts(id)

access_logs (id, user_id, cabinet_id, warehouse_id, auth_method, success, ...)
  │
  ├── user_id → users(id)
  └── warehouse_id → warehouses(id)

naver_reservations (id, reservation_id, customer_name, phone, ...)
sms_otp (id, phone, code, expires_at, ...)
access_failures (id, cabinet_id, phone, failure_count, locked_until, ...)
hardware_events (id, user_id, warehouse_id, event_type, ...)
inventory_logs (id, item_id, warehouse_id, user_id, type, quantity, ...)
```

### 11.2 권한 검증을 위한 핵심 인덱스

```sql
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_warehouses_owner_id ON warehouses(owner_id);
CREATE INDEX idx_contracts_user_id ON contracts(user_id);
CREATE INDEX idx_contracts_warehouse_id ON contracts(warehouse_id);
CREATE INDEX idx_cabinets_warehouse_id ON cabinets(warehouse_id);
CREATE INDEX idx_access_logs_warehouse_id ON access_logs(warehouse_id);
CREATE INDEX idx_access_logs_user_id ON access_logs(user_id);
```

---

## 12. 납품 조건 (개발사 필수 체크리스트)

| # | 체크항목 | 설명 |
|---|---------|------|
| 1 | **결제 트랜잭션 무결성** | 결제 중 이탈/네트워크 끊김 → 롤백 처리 + PG사 Webhook 검증 |
| 2 | **DB 구조** | 전화번호 Key 기반 User(1) : Contracts(N) |
| 3 | **3계층 RBAC** | Customer(`user`) / Store Owner(`store_owner`) / Super Admin(`admin`) 권한 완전 분리 |
| 4 | **데이터 분리** | Store Owner는 본인 창고 데이터만, Customer는 본인 데이터만 접근 (API 레벨 검증) |
| 5 | **Watchdog** | 미니 PC 릴레이 제어 프로그램 ↓ 시 **5초 내 자동 재실행** 데몬 |
| 6 | **반응형 도면 편집기** | 모바일 해상도 깨짐 없이 확대/축소 가능한 **SVG/CSS Grid** 기반 |
| 7 | **권한 감사 로그** | 403 Forbidden 발생 시 `access_logs` 또는 `hardware_events`에 시도 기록 |
| 8 | **산출물** | 소스코드 일체 (**GitHub 완전 이전**) + 하드웨어 결선도 |

---

## 13. 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| SQLite 동시 접속 | 데이터 무결성 | WAL 모드, 연결 풀링 |
| PG사 API 변경 | 결제 불가 | 다중 PG 지원, fallback |
| iOS 푸시 제한 | 알림 실패 | 알림톡/SMS fallback |
| 네이버 API 변경 | 예약 연동 중단 | Puppeteer fallback, 공식 API 전환 |
| 키오스크 다운 | 물리적 접근 불가 | watchdog 자동 재시작 |
| 하드웨어 오류 | 캐비먼트 개폐 실패 | 비상 수동 해제, 원격 제어 |
| 통신 단절 | 모바일 웹 문 열기 불가 | 로컬 DB PIN 인증 (Level 1) |
| PC 전체 장애 | 모든 제어 불가 | 하드웨어 백도어 (Level 2) |
| **권한 오설정** | **타 점주 데이터 노출** | API 미들웨어 이중 검증 + 감사 로그 |
| **점주 계정 탈취** | **창고 전체 제어권 상실** | JWT 만료 24h, IP 기반 이상 탐지 |

---

## 14. FAQ / 가정

| 질문 | 답변 |
|------|------|
| 전화번호 인증은 어떻게 구현하나? | SMS 발송 API 또는 알림톡 API 연동 필요 |
| QR 코드는 어떻게 생성하나? | 지점 ID + 시크릿 기반 URL (`shared-warehouse.com?branch=xxx`) |
| PIN은 어디서 관리하나? | 관리자(Store Owner/Super Admin)가 웹 대시보드에서 수정 → 로컬 미니 PC **5분 간격 동기화** |
| 다점포 지원은 어떻게 하나? | DB에 지점(warehouse) ID 구분 → 지점별 owner_id(점주) 격리 |
| 키오스크 하드웨어는? | 미니 PC, 전자락, 릴레이, 화재 수신기, **물리 숫자 패드**, **비상 번호키** |
| Store Owner와 Super Admin의 차이는? | Store Owner는 **지정된 창고만** 관리. Super Admin은 **모든 창고·점주·시스템 설정** 관리 |
| Store Owner가 여러 창고를 소유할 수 있나? | 가능. `warehouses.owner_id`가 같은 user_id를 가리키는 모든 창고가 해당 점주의 관리 범위 |
| Customer가 점주가 될 수 있나? | 역할은 하나만 가질 수 있다. 필요 시 별도 계정 생성 |
| 점주가 고객의 PIN을 볼 수 있나? | PIN은 bcrypt 해시 저장이므로 평문 확인 불가. **초기화(리셋)만 가능** |

---

## 15. 부록: 현재 구현 현황 (server.js 기준)

| 기능 | 상태 | 비고 |
|------|------|------|
| 회원가입/로그인 | ✅ 완료 | username/email 기반 (전화번호 인증 미구현) |
| JWT 인증 | ✅ 완료 | 24시간 만료 |
| 3계층 RBAC | ⚠️ 부분 | `admin` 역할 검증만 구현. `store_owner` 체크는 일부만 (cabinets GET) |
| 캐비먼트 CRUD | ✅ 완료 | 위치/상태 관리 |
| 계약 생성/조회 | ✅ 완료 | billing_key 저장 가능 |
| 결제 API | ✅ 완료 | billing_key 자동 연장 예약 |
| 자동 연장 CRON | ✅ 완료 | 매일 자정 실행 |
| 출입 인증 (PIN/OTP/QR) | ✅ 완료 | 릴레이 제어 연동 |
| Layout Builder API | ✅ 완료 | 드래그앤드롭 저장 |
| PIN 수정/초기화 (CS) | ✅ 완료 | Super Admin 전용 (Store Owner 확장 필요) |
| 하드웨어 상태 모니터링 | ✅ 완료 | 전자락, 화재 수신기 |
| Store Owner 창고 소유권 검증 | ⚠️ 일부 | cabinets GET만 구현. 다른 엔드포인트 확장 필요 |
| 네이버 예약 연동 | ✅ 완료 | IMAP 파싱 + Puppeteer 교차 검증 |
| Watchdog | ✅ 완료 | 5초 내 자동 재시작 |
| PG 결제 API 연동 | ⏳ 미구현 | 토스페이먼츠/포트원 연동 필요 |
| Web Push (FCM) | ⏳ 미구현 | FCM API 연동 필요 |
| 알림톡/SMS 연동 | ⏳ 미구현 | API 연동 필요 |
| 전화번호 인증 (SMS) | ⏳ 미구현 | 현재 username/password 방식 |
| 다점포 지원 | ⏳ 미구현 | 현재 단일 창고 기반 |
| Store Owner 대시보드 | ⏳ 미구현 | 프론트엔드 구현 필요 |
| 동적 도면 뷰어 | ⏳ 미구현 | 프론트엔드 구현 필요 |
| PIN 로컬 DB 동기화 | ⏳ 미구현 | Level 1 예외 처리 |
| 비상 번호키 백도어 | ⏳ 미구현 | Level 2 예외 처리 |
| 반응형 도면 편집기 | ⏳ 미구현 | SVG/CSS Grid 기반 |
| 권한 감사 로그 | ⏳ 미구현 | 403 시도 기록 |

---

*문서 버전: v2.0 | 마지막 수정: 2026-06-01 | 3계층 RBAC 재작성*
