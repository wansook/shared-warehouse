# 🖥️ Windows Kiosk 모드 설정 가이드

## 1. 할당된 액세스 (Assigned Access) 설정

Windows 10/11 Pro 환경에서 키오스크 모드를 활성화하는 방법입니다.

### 1-1. 고정 앱 설정

1. **설정** → **계정** → **다른 액세스 방법** → **할당된 액세스 사용**
2. **새로 시작** 클릭
3. 사용할 앱을 선택 (Microsoft Edge 권장)
4. 사용자 계정 생성
5. 키오스크 URL 설정: `http://localhost:3000`

### 1-2. Edge 키오스크 모드

```powershell
# 단축속성 → 대상에 다음 추가:
--kiosk --app=http://localhost:3000 --disable-web-security
```

### 1-3. 자동 로그인 설정

```powershell
# Ctrl+R → netplwiz 실행
# 자동 로그인할 계정 체크 해제 → ID/PW 입력
```

또는 레지스트리 편집:

```reg
[HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon]
"AutoAdminLogon"="1"
"DefaultUsername"="kiosk_user"
"DefaultPassword"="your_password"
```

## 2. 사용자 조작 방지

### 2-1. 그룹 정책으로 키보드 단축어 제한

```powershell
gpedit.msc → 사용자 구성 → 관리 템플릿 → Windows 구성 요소 → Windows 탐색기
"Ctrl+Alt+Del에서 작업 관리자 메뉴 항목 제거" → 활성화
```

### 2-2. 레지스트리 제한

```reg
[HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Policies\System]
"DisableTaskMgr"=dword:00000001
"NoDispCPL"=dword:00000001
"NoLogOff"=dword:00000001
```

### 2-3. 그룹 정책으로 시작 메뉴/태스크바 제한

```powershell
gpedit.msc → 사용자 구성 → 관리 템플릿 → 시작 메뉴 및 작업 표시줄
"시작 메뉴에서 프로그램 고정 제거" → 활성화
"작업 표시줄에서 작업표시줄 잠금" → 활성화
```

## 3. Watchdog 프로그램

메인 애플리케이션이 다운되었을 때 자동 재시작하는 경량 모니터링 프로그램입니다.

### 3-1. watchdog.js (Node.js)

```javascript
/**
 * Watchdog - 키오스크 애플리케이션 자동 재시작
 * 메인 프로세스가 종료되면 5초 내 재시작
 */

const { spawn } = require('child_process');
const path = require('path');

const CONFIG = {
  // 백엔드 서버 경로
  backendScript: path.join(__dirname, '..', 'backend', 'server.js'),
  // 재시작 대기 시간 (ms)
  restartDelay: 5000,
  // 로그 파일
  logFile: path.join(__dirname, 'watchdog.log')
};

let backendProcess = null;
let frontendProcess = null;

function log(message) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${message}`;
  console.log(entry);

  try {
    const fs = require('fs');
    fs.appendFileSync(CONFIG.logFile, entry + '\n');
  } catch (err) {
    // 로그 파일 작성 실패 무시
  }
}

function startBackend() {
  log('백엔드 서버 시작');
  backendProcess = spawn('node', [CONFIG.backendScript], {
    detached: false,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  });

  backendProcess.on('close', (code, signal) => {
    log(`백엔드 서버 종료 (코드: ${code}, 신호: ${signal})`);
    log(`${CONFIG.restartDelay / 1000}초 후 재시작...`);
    setTimeout(startBackend, CONFIG.restartDelay);
  });

  backendProcess.on('error', (err) => {
    log(`백엔드 서버 오류: ${err.message}`);
    setTimeout(startBackend, CONFIG.restartDelay);
  });
}

function startFrontendKiosk() {
  // Edge 키오스크 모드 시작
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const kioskUrl = 'http://localhost:3000';

  try {
    frontendProcess = spawn(edgePath, [
      '--kiosk',
      `--app=${kioskUrl}`,
      '--disable-web-security',
      '--disable-features=TranslateUI',
      '--no-first-run',
      '--no-default-browser-check'
    ], { detached: true });

    frontendProcess.unref(); // 메인 프로세스와 독립
    log(`Edge 키오스크 시작 (${kioskUrl})`);
  } catch (err) {
    log(`Edge 시작 실패: ${err.message}`);
  }
}

function main() {
  log('===== Watchdog 시작 =====');

  // 백엔드 시작
  startBackend();

  // 백엔드가 시작될 때까지 기다린 후 프론트엔드 시작
  setTimeout(startFrontendKiosk, 3000);

  // Graceful shutdown
  process.on('SIGINT', () => {
    log('Watchdog 종료 중...');
    if (backendProcess) backendProcess.kill('SIGINT');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log('Watchdog 종료 중...');
    if (backendProcess) backendProcess.kill('SIGTERM');
    process.exit(0);
  });
}

main();
```

### 3-2. Windows 서비스로 등록

```powershell
# nssm (Non-Sucking Service Manager) 설치
# https://nssm.cc/download 다운로드 후 nssm.exe 복사

# 서비스 등록
nssm install KioskWatchdog "C:\Program Files\nodejs\node.exe" "C:\path\to\shared-warehouse\watchdog.js"

# 서비스 설정
nssm set KioskWatchobj AppDirectory "C:\path\to\shared-warehouse"
nssm set KioskWatchobj AppStdout "C:\path\to\shared-warehouse\watchdog-out.log"
nssm set KioskWatchobj AppStderr "C:\path\to\shared-warehouse\watchdog-err.log"

# 자동 시작
nssm set KioskWatchobj Start SERVICE_AUTO_START

# 서비스 시작
nssm start KioskWatchobj
```

### 3-3. Windows 작업 스케줄러 (대안)

```powershell
# 작업 스케줄러 PowerShell 스크립트
$action = New-ScheduledTaskAction -Execute "node" -Argument "C:\path\to\shared-warehouse\watchdog.js"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName "KioskWatchdog" -Action $action -Trigger $trigger -Principal $principal -Description "공유창고 키오스크 Watchdog"
```

## 4. 부팅 시 자동 실행

### 4-1. 시작 폴더에 단축어 생성

```
C:\Users\<user>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup
```

### 4-2. 레지스트리 런 키

```reg
[HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run]
"KioskWatchdog"="\"C:\\Program Files\\nodejs\\node.exe\" \"C:\\path\\to\\shared-warehouse\\watchdog.js\""
```

## 5. 테스트 체크리스트

- [ ] OS 부팅 후 자동 로그인 확인
- [ ] Watchdog가 백엔드/프론트엔드 자동 시작 확인
- [ ] 키오스크 모드에서 Alt+F4/Ctrl+Alt+Del 비활성화 확인
- [ ] 백엔드 프로세스 강제 종료 → 5초 내 재시작 확인
- [ ] 네트워크 단절 시 기존 계약자 출입 가능 확인
- [ ] 화재 경보 시 모든 문 강제 개방 확인
