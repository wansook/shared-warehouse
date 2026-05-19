/**
 * Watchdog - 키오스크 애플리케이션 자동 재시작
 * 메인 프로세스가 종료되면 5초 내 재시작
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const CONFIG = {
  backendScript: path.join(__dirname, 'backend', 'server.js'),
  restartDelay: 5000,
  logFile: path.join(__dirname, 'watchdog.log'),
  frontendUrl: 'http://localhost:3000',
  edgePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
};

let backendProcess = null;
let frontendStarted = false;

function log(message) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${message}`;
  console.log(entry);

  try {
    fs.appendFileSync(CONFIG.logFile, entry + '\n');
  } catch (err) {
    // 로그 파일 작성 실패 무시
  }
}

function startBackend() {
  log('▶ 백엔드 서버 시작');
  
  try {
    backendProcess = spawn('node', [CONFIG.backendScript], {
      cwd: path.join(__dirname, 'backend'),
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' }
    });

    backendProcess.on('close', (code, signal) => {
      log(`⏹ 백엔드 서버 종료 (코드: ${code}, 신호: ${signal})`);
      log(`⏳ ${CONFIG.restartDelay / 1000}초 후 재시작...`);
      setTimeout(startBackend, CONFIG.restartDelay);
    });

    backendProcess.on('error', (err) => {
      log(`❌ 백엔드 서버 오류: ${err.message}`);
      setTimeout(startBackend, CONFIG.restartDelay);
    });
  } catch (err) {
    log(`❌ 백엔드 시작 실패: ${err.message}`);
    setTimeout(startBackend, CONFIG.restartDelay);
  }
}

function startFrontendKiosk() {
  if (frontendStarted) return;
  frontendStarted = true;

  log(`▶ Edge 키오스크 시작 (${CONFIG.frontendUrl})`);

  try {
    const { spawn } = require('child_process');
    const edgeProcess = spawn(CONFIG.edgePath, [
      '--kiosk',
      `--app=${CONFIG.frontendUrl}`,
      '--disable-web-security',
      '--disable-features=TranslateUI',
      '--no-first-run',
      '--no-default-browser-check'
    ], { detached: true, windowsHide: true });

    edgeProcess.unref();
    log('✅ Edge 키오스크 시작 완료');
  } catch (err) {
    log(`❌ Edge 시작 실패: ${err.message}`);
    log('💡 수동으로 Edge를 키오스크 모드로 시작하세요.');
  }
}

function main() {
  log('════════════════════════════');
  log('🐕 Watchdog 시작');
  log('════════════════════════════');
  log(`백엔드: ${CONFIG.backendScript}`);
  log(`URL: ${CONFIG.frontendUrl}`);

  startBackend();

  // 백엔드가 시작될 때까지 기다린 후 프론트엔드 시작
  setTimeout(startFrontendKiosk, 3000);

  process.on('SIGINT', () => {
    log('⏹ Watchdog 종료 중...');
    if (backendProcess) backendProcess.kill('SIGINT');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log('⏹ Watchdog 종료 중...');
    if (backendProcess) backendProcess.kill('SIGTERM');
    process.exit(0);
  });
}

main();
