const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const CONFIG = {
  backendScript: path.join(__dirname, 'backend', 'server.js'),
  backendCwd: path.join(__dirname, 'backend'),
  backendUrl: process.env.BACKEND_URL || 'http://127.0.0.1:3001',
  healthPath: process.env.HEALTH_PATH || '/health',
  healthIntervalMs: parseInt(process.env.WATCHDOG_HEALTH_INTERVAL_MS, 10) || 15000,
  healthTimeoutMs: parseInt(process.env.WATCHDOG_HEALTH_TIMEOUT_MS, 10) || 5000,
  restartDelayMs: parseInt(process.env.WATCHDOG_RESTART_DELAY_MS, 10) || 5000,
  maxRestartDelayMs: parseInt(process.env.WATCHDOG_MAX_RESTART_DELAY_MS, 10) || 60000,
  crashLoopWindowMs: parseInt(process.env.WATCHDOG_CRASH_WINDOW_MS, 10) || 120000,
  logFile: path.join(__dirname, 'watchdog.log'),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  edgePath: process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  launchKiosk: process.env.WATCHDOG_LAUNCH_KIOSK !== 'false',
};

let backendProcess = null;
let frontendStarted = false;
let restartDelayMs = CONFIG.restartDelayMs;
let recentCrashes = [];
let healthTimer = null;
let restartTimer = null;
let stopping = false;

function log(message) {
  const entry = `[${new Date().toISOString()}] [WATCHDOG] ${message}`;
  console.log(entry);

  try {
    fs.appendFileSync(CONFIG.logFile, `${entry}\n`);
  } catch {
    // Best-effort local audit log.
  }
}

function scheduleRestart(reason) {
  if (stopping || restartTimer) return;

  const now = Date.now();
  recentCrashes = recentCrashes.filter((timestamp) => now - timestamp < CONFIG.crashLoopWindowMs);
  recentCrashes.push(now);

  if (recentCrashes.length > 1) {
    restartDelayMs = Math.min(restartDelayMs * 2, CONFIG.maxRestartDelayMs);
  }

  log(`Scheduling backend restart in ${restartDelayMs}ms (${reason}; recentCrashes=${recentCrashes.length})`);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    startBackend();
  }, restartDelayMs);
}

function checkHealth() {
  if (!backendProcess || backendProcess.killed) return;

  const req = http.get(`${CONFIG.backendUrl}${CONFIG.healthPath}`, { timeout: CONFIG.healthTimeoutMs }, (res) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      restartDelayMs = CONFIG.restartDelayMs;
      res.resume();
      return;
    }

    log(`Health check failed with status ${res.statusCode}`);
    backendProcess.kill('SIGTERM');
  });

  req.on('timeout', () => {
    log('Health check timed out');
    req.destroy();
    if (backendProcess) backendProcess.kill('SIGTERM');
  });

  req.on('error', (err) => {
    log(`Health check error: ${err.message}`);
  });
}

function startHealthMonitor() {
  if (healthTimer) clearInterval(healthTimer);
  healthTimer = setInterval(checkHealth, CONFIG.healthIntervalMs);
}

function startBackend() {
  if (stopping) return;

  log(`Starting backend: ${CONFIG.backendScript}`);
  backendProcess = spawn('node', [CONFIG.backendScript], {
    cwd: CONFIG.backendCwd,
    stdio: 'inherit',
    env: { ...process.env },
  });

  backendProcess.on('spawn', () => {
    log(`Backend started (pid=${backendProcess.pid})`);
    startHealthMonitor();
  });

  backendProcess.on('close', (code, signal) => {
    log(`Backend exited (code=${code}, signal=${signal})`);
    backendProcess = null;
    if (healthTimer) {
      clearInterval(healthTimer);
      healthTimer = null;
    }
    if (!stopping) scheduleRestart(`exit code=${code} signal=${signal}`);
  });

  backendProcess.on('error', (err) => {
    log(`Backend start error: ${err.message}`);
    scheduleRestart('spawn error');
  });
}

function startFrontendKiosk() {
  if (!CONFIG.launchKiosk || frontendStarted) return;
  frontendStarted = true;

  log(`Starting Edge kiosk (${CONFIG.frontendUrl})`);

  try {
    const edgeProcess = spawn(CONFIG.edgePath, [
      '--kiosk',
      `--app=${CONFIG.frontendUrl}`,
      '--disable-web-security',
      '--disable-features=TranslateUI',
      '--no-first-run',
      '--no-default-browser-check',
    ], { detached: true, windowsHide: true });

    edgeProcess.unref();
    log('Edge kiosk start requested');
  } catch (err) {
    log(`Edge kiosk start failed: ${err.message}`);
  }
}

function shutdown(signal) {
  stopping = true;
  log(`Stopping watchdog (${signal})`);
  if (restartTimer) clearTimeout(restartTimer);
  if (healthTimer) clearInterval(healthTimer);
  if (backendProcess) backendProcess.kill(signal);
  process.exit(0);
}

function main() {
  log('Watchdog starting');
  log(`Operational entrypoint: ${path.join(__dirname, 'watchdog.js')}`);
  startBackend();
  setTimeout(startFrontendKiosk, 3000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

if (require.main === module) {
  main();
}

module.exports = {
  main,
  startBackend,
  checkHealth,
  CONFIG,
};
