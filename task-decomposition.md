# 공유창고 프로젝트 - 작업 분해

## 목표
- 공유창고 무인 관리 시스템의 프로토타입을 실제 운영 가능한 상태로 복구

## 작업 목록 (Todo List)

### Phase 1: 실행 가능 상태 복구

- [ ] T01: 프론트엔드 깨진 JSX/문자열 복구 (P0, 3~4h)  
  `Dashboard.js`, `Login.js`, `Register.js`, `Profile.js`, `LayoutEditor.js`의 깨진 문자열, 닫힘 태그, 삼항식, JSX 문법 오류를 수정한다.  
  검증: `frontend`에서 `npm ci` 후 `npm run build`가 문법 오류 없이 통과해야 한다.

- [ ] T02: 프론트 API 설정과 검색 인코딩 정리 (P1, 1~2h)  
  하드코딩된 `http://localhost:3001`을 공통 API client 또는 환경변수(`REACT_APP_API_BASE_URL`)로 분리하고, 검색 query에는 `encodeURIComponent`를 적용한다.  
  검증: 로그인/대시보드/검색 요청이 환경변수 base URL을 사용하고 특수문자 검색이 깨지지 않아야 한다.

- [ ] T03: LayoutEditor 라우팅 및 API 계약 수정 (P0, 2~3h)  
  `App.js`에 `/layout/:warehouseId` 또는 관리자용 레이아웃 경로를 연결한다. `LayoutEditor`의 창고/캐비넷 조회에 Authorization header를 추가하고, 저장 body를 백엔드 계약에 맞춰 `{ layout_data }`로 변경한다. `warehouseId` 비교 타입 문제도 수정한다.  
  검증: 인증된 사용자가 레이아웃 편집 화면에 접근하고, 드래그 후 저장/재조회 시 좌표가 유지되어야 한다.

- [ ] T04: LayoutEditor 드래그 상태 갱신 최적화 (P1, 1~2h)  
  `onDragOver`에서 빈번하게 상태를 변경하는 로직을 제거하고, `drop` 이벤트에서만 캐비넷 좌표를 갱신하도록 수정한다.  
  검증: 드래그 중 렌더링 폭주가 없고, 캐비넷 드롭 위치가 정상 저장되어야 한다.

### Phase 2: 치명 보안 수정

- [ ] T05: 하드코딩 secret 제거 및 환경변수 검증 추가 (P0, 1~2h)  
  `JWT_SECRET`, `OTP_SECRET`를 코드에서 제거하고 `.env`/환경변수에서만 읽도록 수정한다. 운영 모드에서 secret이 없거나 기본값이면 서버 시작을 실패시킨다. `.env.example`을 갱신한다.  
  검증: secret 미설정 시 서버가 명확한 에러로 종료되고, 설정 시 로그인/JWT 검증이 정상 동작해야 한다.

- [ ] T06: PIN 평문 저장/노출 제거 (P0, 3~4h)  
  `users.pin_code` 사용을 해시 기반으로 전환하고, `/api/admin/users` 응답에서 PIN 원문을 제거한다. PIN 설정/초기화 및 출입 인증은 해시 검증을 사용하도록 변경한다. `syncPinToMiniPC()`의 평문 파일 저장 방식은 제거하거나 최소 범위의 임시 토큰/해시 동기화로 대체한다.  
  검증: DB와 API 응답에 PIN 원문이 남지 않고, 올바른 PIN만 출입 인증에 성공해야 한다.

- [ ] T07: 출입 인증 rate limit, 실패 잠금, 감사 로그 추가 (P0, 2~4h)  
  `/api/access/authenticate`에 IP/device/user 기준 rate limit과 일정 횟수 실패 시 lockout을 적용한다. 실패/성공 로그에 시도 방식, 대상 창고, 요청 출처를 남긴다.  
  검증: 반복 실패 시 429 또는 잠금 응답이 발생하고, 정상 PIN은 제한 조건 내에서만 통과해야 한다.

- [ ] T08: 프로필 IDOR 및 사용자 권한 검사 수정 (P0, 1~2h)  
  `/api/profile/:userId` GET/PUT에서 요청자가 본인 또는 admin인지 검증한다. 일반 사용자가 다른 사용자 프로필을 조회/수정할 수 없게 한다.  
  검증: 타 사용자 `userId` 요청은 403, 본인/admin 요청은 성공해야 한다.

- [ ] T09: 하드웨어/화재 경보 엔드포인트 보호 (P0, 2~3h)  
  `/api/hardware/fire-alarm`에 kiosk/device secret, 내부 네트워크 allowlist, 서명 헤더 등 호출자 검증을 추가한다. 관리자 하드웨어 제어 API는 admin 인증을 일관 적용하고, 하드웨어 이벤트 감사 로그를 남긴다.  
  검증: 인증 없는 fire alarm 호출은 거부되고, 유효한 device credential 호출만 상태 변경을 수행해야 한다.

- [ ] T10: CORS 및 토큰 보관 위험 완화 (P1, 2~3h)  
  `app.use(cors())`를 환경변수 기반 origin allowlist로 변경한다. 프론트 localStorage JWT 사용은 최소한 만료 검증을 추가하고, 운영 전환 계획으로 httpOnly secure cookie 또는 access/refresh token 구조를 문서화한다.  
  검증: 허용되지 않은 origin 요청은 차단되고, 만료된 토큰으로 private route 접근이 차단되어야 한다.

### Phase 3: 스키마, 권한, 라우팅 정리

- [ ] T11: `contracts.auto_renew` 스키마 불일치 수정 (P0, 1~2h)  
  migration 또는 안전한 `ALTER TABLE`로 `contracts.auto_renew` 컬럼을 추가하거나, 자동 연장 쿼리에서 해당 조건을 제거한다. 기존 DB에도 적용 가능한 마이그레이션 경로를 만든다.  
  검증: 자동 연장 스케줄러가 `no such column: c.auto_renew` 없이 실행되어야 한다.

- [ ] T12: 중복 라우트와 Express 에러 핸들러 위치 정리 (P1, 1~2h)  
  `/api/admin/door/unlock`, `/api/admin/relay/control`, `/api/admin/hardware/status`, `/api/hardware/fire-alarm` 중복 정의를 제거하고 하나의 검증된 구현만 남긴다. 전역 에러 핸들러는 모든 라우트 등록 뒤로 이동한다.  
  검증: 각 라우트가 한 번만 등록되고, 라우트 내부 에러가 전역 에러 핸들러로 처리되어야 한다.

- [ ] T13: 창고/계약 권한 및 입력 검증 정리 (P0, 3~4h)  
  `POST /api/warehouses`에 `requireAdmin`을 적용하고, 프론트의 `+ 창고` UI를 admin에게만 표시한다. 계약 생성에는 사용자 범위, 캐비넷 상태, 기간 중복, 시작/종료 날짜 순서, 금액 검증을 추가한다.  
  검증: 일반 사용자는 창고 생성에 실패하고, 겹치는 기간 또는 잘못된 날짜/금액 계약은 거부되어야 한다.

- [ ] T14: 영수증 API 메서드와 결제 데이터 접근 제어 수정 (P1, 1~2h)  
  `GET /api/payments/:id/receipt`에서 body password를 읽는 구조를 POST 또는 query/header 기반으로 바꾸고, 요청자가 결제 소유자 또는 admin인지 확인한다.  
  검증: 일반 GET body 의존 없이 영수증 검증이 동작하고, 타 사용자 결제 영수증 접근은 차단되어야 한다.

### Phase 4: 운영 안정성과 검증 기반 마련

- [ ] T15: 네이버 동기화, DB 연결, 테스트/운영 스크립트 기본선 정리 (P2, 3~4h)  
  네이버 이메일 파싱의 `simpleParser` race condition과 subject null 예외를 수정하고, UID marker 또는 fixture 기반 중복 방지 테스트를 추가한다. `server.js`, `hardware.js`, `naver-sync.js`의 SQLite 연결 방식을 정리할 설계 문서를 작성하거나 공통 DB 모듈로 1차 통합한다. `npm test`가 최소 API smoke test와 프론트 build 검증을 실행하도록 연결하고, 루트/backend `watchdog.js` 중 운영 진입점을 하나로 정리한다.  
  검증: 네이버 파서 단위 테스트, 백엔드 smoke test, 프론트 build 검증이 `npm test` 또는 명시된 CI 명령으로 실행되어야 한다.

## 의존성

- T01 → T02, T03
- T03 → T04
- T05 → T06, T07, T10
- T06 → T07
- T08 → T13, T14
- T09 → T12
- T11 → T13
- T12 → T09 검증 완료
- T13 → T14
- T01, T05, T06, T08, T11, T13 → 운영 가능성 1차 판단
- T15는 T01, T05, T11 이후 병행 가능

## 우선순위

P0: 반드시 해야 함 (운영 불가)
- T01: 프론트엔드 깨진 JSX/문자열 복구
- T03: LayoutEditor 라우팅 및 API 계약 수정
- T05: 하드코딩 secret 제거 및 환경변수 검증 추가
- T06: PIN 평문 저장/노출 제거
- T07: 출입 인증 rate limit, 실패 잠금, 감사 로그 추가
- T08: 프로필 IDOR 및 사용자 권한 검사 수정
- T09: 하드웨어/화재 경보 엔드포인트 보호
- T11: `contracts.auto_renew` 스키마 불일치 수정
- T13: 창고/계약 권한 및 입력 검증 정리

P1: 하면 좋음
- T02: 프론트 API 설정과 검색 인코딩 정리
- T04: LayoutEditor 드래그 상태 갱신 최적화
- T10: CORS 및 토큰 보관 위험 완화
- T12: 중복 라우트와 Express 에러 핸들러 위치 정리
- T14: 영수증 API 메서드와 결제 데이터 접근 제어 수정

P2: 나중에 해도 됨
- T15: 네이버 동기화, DB 연결, 테스트/운영 스크립트 기본선 정리
