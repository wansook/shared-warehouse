/**
 * 하드웨어 제어 모듈
 * - USB 시리얼 릴레이 보드 제어 (COM 포트)
 * - 출입문 전자락 On/Off
 * - 화재 수신기 접점 신호 모니터링
 * - 개폐 센서 모니터링 (문 열림 지연 감지)
 */

const SerialPort = require('serialport').SerialPort;
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./warehouse.db');

// ============= 설정 =============
const HARDWARE_CONFIG = {
  serialPort: process.env.SERIAL_PORT || '/dev/ttyUSB0',
  baudRate: parseInt(process.env.BAUD_RATE) || 9600,
  relayDelay: parseInt(process.env.RELAY_DELAY) || 3000, // 릴레이 차단 시간 (ms)
  doorTimeout: parseInt(process.env.DOOR_TIMEOUT) || 60000, // 문 열림 최대 시간 (ms)
  fireAlarmPin: parseInt(process.env.FIRE_ALARM_PIN) || 0 // 화재 감지 핀
};

let port = null;
let doorTimers = new Map(); // warehouse_id → timer

// ============= 시리얼 포트 초기화 =============
function initSerialPort() {
  return new Promise((resolve, reject) => {
    try {
      port = new SerialPort({
        path: HARDWARE_CONFIG.serialPort,
        baudRate: HARDWARE_CONFIG.baudRate,
        autoOpen: false
      });

      port.on('open', () => {
        console.log(`[하드웨어] 시리얼 포트 열림: ${HARDWARE_CONFIG.serialPort}`);
        resolve();
      });

      port.on('error', (err) => {
        console.error('[하드웨어] 시리얼 포트 오류:', err.message);
        reject(err);
      });

      port.open();
    } catch (err) {
      // Windows 환경에서는 포트가 없을 수 있음 → 시뮬레이션 모드
      console.log('[하드웨어] 시리얼 포트 연결 실패 - 시뮬레이션 모드 시작');
      resolve();
    }
  });
}

// ============= 릴레이 제어 =============
function controlRelay(warehouseId, channel, action) {
  /**
   * 릴레이 On/Off 제어
   * @param {number} warehouseId - 창고 ID
   * @param {number} channel - 릴레이 채널 번호
   * @param {string} action - 'open' | 'close'
   */
  return new Promise((resolve, reject) => {
    // 캐비넷의 relay_channel 확인
    db.get(`SELECT relay_channel FROM cabinets WHERE id = ?`, [channel], (err, cabinet) => {
      if (err) return reject(err);
      if (!cabinet) return reject(new Error('캐비넷을 찾을 수 없습니다.'));

      const relayChannel = cabinet.relay_channel || channel;
      const hexCommand = action === 'open'
        ? `01 00 ${relayChannel.toString(16).padStart(2, '0')} FF`  // 릴레이 OFF (문 열림)
        : `01 00 ${relayChannel.toString(16).padStart(2, '0')} 00`; // 릴레이 ON (문 잠금)

      console.log(`[릴레이] 채널 ${relayChannel} → ${action} (${hexCommand})`);

      if (port && port.isOpen) {
        port.write(Buffer.from(hexCommand.replace(/ /g, ''), 'hex'), (err) => {
          if (err) {
            console.error('[릴레이] 명령 전송 실패:', err.message);
            return reject(err);
          }
          updateDoorStatus(warehouseId, action === 'open' ? 'open' : 'closed');
          resolve();
        });
      } else {
        // 시뮬레이션 모드
        console.log(`[릴레이 시뮬] 채널 ${relayChannel} → ${action}`);
        updateDoorStatus(warehouseId, action === 'open' ? 'open' : 'closed');
        resolve();
      }
    });
  });
}

function updateDoorStatus(warehouseId, status) {
  db.run(
    `UPDATE hardware_status SET door_status = ?, last_check = CURRENT_TIMESTAMP WHERE warehouse_id = ?`,
    [status, warehouseId]
  );
}

// ============= 출입문 제어 (자동 잠금 포함) =============
function unlockDoor(warehouseId, duration = HARDWARE_CONFIG.relayDelay) {
  /**
   * 출입문 개방 → 지정 시간 후 자동 잠금
   */
  // 이미 열려 있는 경우 기존 타이머 취소
  if (doorTimers.has(warehouseId)) {
    clearTimeout(doorTimers.get(warehouseId));
  }

  db.get(`SELECT id FROM cabinets WHERE warehouse_id = ? LIMIT 1`, [warehouseId], (err, cabinet) => {
    if (err) {
      console.error('[도어] 캐비넷 조회 오류:', err.message);
      return;
    }

    if (cabinet) {
      controlRelay(warehouseId, cabinet.id, 'open').then(() => {
        // 자동 잠금 타이머
        const timer = setTimeout(() => {
          controlRelay(warehouseId, cabinet.id, 'close');
          doorTimers.delete(warehouseId);
          console.log(`[도어] 창고 ${warehouseId} 자동 잠금`);
        }, duration);
        doorTimers.set(warehouseId, timer);
      });
    } else {
      // 캐비넷이 없으면 창고 전체 도어 상태만 업데이트
      updateDoorStatus(warehouseId, 'open');
      const timer = setTimeout(() => {
        updateDoorStatus(warehouseId, 'closed');
        doorTimers.delete(warehouseId);
      }, duration);
      doorTimers.set(warehouseId, timer);
    }
  });
}

// ============= 화재 경보 처리 =============
function handleFireAlarm(warehouseId) {
  /**
   * 화재 수신기 신호 → 모든 문 강제 개방 + 알람
   */
  console.log(`[화재 경보] 창고 ${warehouseId} - 강제 개방 처리`);

  db.run(`UPDATE hardware_status SET fire_alarm = 1, door_status = 'open' WHERE warehouse_id = ?`, [warehouseId]);

  // 해당 창고의 모든 캐비넷 릴레이 제어
  db.all(`SELECT id, relay_channel FROM cabinets WHERE warehouse_id = ?`, [warehouseId], (err, cabinets) => {
    if (err) return;
    cabinets.forEach(cabinet => {
      controlRelay(warehouseId, cabinet.id, 'open');
    });
  });

  // 관리자 알림 (실제 구현 시 알림톡/SMS 발송)
  triggerAdminAlert(`🚨 화재 경보: 창고 ${warehouseId} 모든 문 강제 개방`);
}

// ============= 문 열림 지연 감지 =============
function startDoorMonitor() {
  /**
   * 1분 이상 문이 열린 상태를 감지 → 관리자 알림
   */
  setInterval(() => {
    db.all(`SELECT hs.id, hs.warehouse_id, w.name FROM hardware_status hs JOIN warehouses w ON hs.warehouse_id = w.id WHERE hs.door_status = 'open' AND hs.fire_alarm = 0`,
      [], (err, rows) => {
        if (err) return;
        rows.forEach(row => {
          db.get(`SELECT last_check FROM hardware_status WHERE warehouse_id = ?`, [row.warehouse_id], (err, status) => {
            if (err || !status) return;
            const lastCheck = new Date(status.last_check);
            const now = new Date();
            const diff = (now - lastCheck) / 1000; // 초

            if (diff > HARDWARE_CONFIG.doorTimeout / 1000) {
              triggerAdminAlert(`⚠️ 문 열림 지연: ${row.name} (${Math.floor(diff)}초)`);
            }
          });
        });
      });
  }, 30000); // 30초마다 확인
}

// ============= 관리자 알림 (시뮬레이션) =============
function triggerAdminAlert(message) {
  /**
   * 실제 구현 시 카카오 비즈알림/SMS API 연동
   */
  console.log(`[알림] ${message}`);

  // TODO: 카카오 알림톡 / SMS API 연동
  // 예시:
  // kakaotalkApi.sendAlert(adminPhoneNumber, message);
}

// ============= 상태 조회 =============
function getHardwareStatus() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT hs.*, w.name FROM hardware_status hs JOIN warehouses w ON hs.warehouse_id = w.id`,
      [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
  });
}

// ============= 초기화 =============
async function init() {
  await initSerialPort();
  startDoorMonitor();
  console.log('[하드웨어 모듈] 초기화 완료');
}

module.exports = {
  init,
  controlRelay,
  unlockDoor,
  handleFireAlarm,
  getHardwareStatus,
  HARDWARE_CONFIG
};
