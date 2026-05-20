const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const APP_PATH = path.join(__dirname, 'server.js');
const PID_FILE = path.join(__dirname, '.watchdog.pid');
const LOG_FILE = path.join(__dirname, 'watchdog.log');
const CHECK_INTERVAL = 5000; // 5 초마다 확인
const RESTART_DELAY = 5000;  // 5 초 후 재시작

function log(msg) {
  const line = [[new Date().toISOString()]] + ' [WATCHDOG] ' + msg + '\n';
  console.log(line.trim());
  fs.appendFileSync(LOG_FILE, line, 'utf8');
}

function isRunning() {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim());
    try {
      process.kill(pid, 0); // 프로세스 존재 여부 확인
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

function startApp() {
  log('서버 시작 중...');
  const child = spawn('node', [APP_PATH], {
    stdio: 'inherit',
    detached: false
  });

  child.on('error', (err) => {
    log('서버 시작 실패: ' + err.message);
  });

  child.on('exit', (code, signal) => {
    log('서버 종료됨 (code=' + code + ', signal=' + signal + ')');
    if (signal && signal !== 'SIGTERM') {
      // 비정상 종료인 경우 재시작
      setTimeout(() => {
        log('서버 재시작 시도...');
        startApp();
      }, RESTART_DELAY);
    }
  });

  // PID 파일 저장
  fs.writeFileSync(PID_FILE, String(child.pid), 'utf8');
  log('서버 실행 중 (PID: ' + child.pid + ')');
}

function stopApp() {
  if (isRunning()) {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim());
    process.kill(pid, 'SIGTERM');
    log('서버 중지 요청 (PID: ' + pid + ')');
    fs.unlinkSync(PID_FILE);
  }
}

// 프로그램 시작
log('Watchdog 시작 — 메인 서버 감시 중');
startApp();

// graceful shutdown
process.on('SIGINT', () => {
  log('Watchdog 중지');
  stopApp();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Watchdog 중지');
  stopApp();
  process.exit(0);
});
