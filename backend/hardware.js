const { SerialPort } = require('serialport');
const db = require('./db');

const HARDWARE_CONFIG = {
  serialPort: process.env.SERIAL_PORT || null,
  baudRate: parseInt(process.env.BAUD_RATE, 10) || 9600,
  relayDelay: parseInt(process.env.RELAY_DELAY, 10) || 3000,
  doorTimeout: parseInt(process.env.DOOR_TIMEOUT, 10) || 60000,
  fireAlarmPin: parseInt(process.env.FIRE_ALARM_PIN, 10) || 0,
};

let port = null;
const doorTimers = new Map();

function initSerialPort() {
  return new Promise((resolve) => {
    if (!HARDWARE_CONFIG.serialPort) {
      console.log('[하드웨어] SERIAL_PORT 미설정 - 시뮬레이션 모드');
      resolve();
      return;
    }

    try {
      port = new SerialPort({
        path: HARDWARE_CONFIG.serialPort,
        baudRate: HARDWARE_CONFIG.baudRate,
        autoOpen: false,
      });

      port.on('open', () => {
        console.log(`[하드웨어] 시리얼 포트 연결: ${HARDWARE_CONFIG.serialPort}`);
        resolve();
      });

      port.on('error', (err) => {
        console.error('[하드웨어] 시리얼 포트 오류:', err.message);
        port = null;
        resolve();
      });

      port.open();
    } catch (err) {
      console.log('[하드웨어] 시리얼 포트 연결 실패 - 시뮬레이션 모드');
      port = null;
      resolve();
    }
  });
}

function updateDoorStatus(warehouseId, status) {
  db.run(
    `UPDATE hardware_status SET door_status = ?, last_check = CURRENT_TIMESTAMP WHERE warehouse_id = ?`,
    [status, warehouseId],
  );
}

function controlRelay(warehouseId, channel, action) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT relay_channel FROM cabinets WHERE id = ?`, [channel], (err, cabinet) => {
      if (err) return reject(err);

      const relayChannel = cabinet?.relay_channel || channel;
      const hexCommand = action === 'open'
        ? `01 00 ${relayChannel.toString(16).padStart(2, '0')} FF`
        : `01 00 ${relayChannel.toString(16).padStart(2, '0')} 00`;

      console.log(`[릴레이] 채널 ${relayChannel} ${action} (${hexCommand})`);

      if (port && port.isOpen) {
        port.write(Buffer.from(hexCommand.replace(/ /g, ''), 'hex'), (writeErr) => {
          if (writeErr) return reject(writeErr);
          updateDoorStatus(warehouseId, action === 'open' ? 'open' : 'closed');
          resolve();
        });
      } else {
        updateDoorStatus(warehouseId, action === 'open' ? 'open' : 'closed');
        resolve();
      }
    });
  });
}

function unlockDoor(warehouseId, duration = HARDWARE_CONFIG.relayDelay) {
  if (doorTimers.has(warehouseId)) clearTimeout(doorTimers.get(warehouseId));

  db.get(`SELECT id FROM cabinets WHERE warehouse_id = ? LIMIT 1`, [warehouseId], (err, cabinet) => {
    if (err) {
      console.error('[도어] 캐비넷 조회 오류:', err.message);
      return;
    }

    if (cabinet) {
      controlRelay(warehouseId, cabinet.id, 'open').then(() => {
        const timer = setTimeout(() => {
          controlRelay(warehouseId, cabinet.id, 'close');
          doorTimers.delete(warehouseId);
        }, duration);
        doorTimers.set(warehouseId, timer);
      });
    } else {
      updateDoorStatus(warehouseId, 'open');
      const timer = setTimeout(() => {
        updateDoorStatus(warehouseId, 'closed');
        doorTimers.delete(warehouseId);
      }, duration);
      doorTimers.set(warehouseId, timer);
    }
  });
}

function handleFireAlarm(warehouseId) {
  console.log(`[화재 경보] 창고 ${warehouseId} 강제 개방`);
  db.run(`UPDATE hardware_status SET fire_alarm = 1, door_status = 'open' WHERE warehouse_id = ?`, [warehouseId]);

  db.all(`SELECT id FROM cabinets WHERE warehouse_id = ?`, [warehouseId], (err, cabinets) => {
    if (err) return;
    cabinets.forEach((cabinet) => controlRelay(warehouseId, cabinet.id, 'open'));
  });

  triggerAdminAlert(`화재 경보: 창고 ${warehouseId} 모든 문 강제 개방`);
}

function startDoorMonitor() {
  setInterval(() => {
    db.all(
      `SELECT hs.warehouse_id, hs.last_check, w.name
       FROM hardware_status hs
       JOIN warehouses w ON hs.warehouse_id = w.id
       WHERE hs.door_status = 'open' AND hs.fire_alarm = 0`,
      [],
      (err, rows) => {
        if (err) return;
        rows.forEach((row) => {
          const diff = Date.now() - new Date(row.last_check).getTime();
          if (diff > HARDWARE_CONFIG.doorTimeout) {
            triggerAdminAlert(`문 열림 지연: ${row.name} (${Math.floor(diff / 1000)}초)`);
          }
        });
      },
    );
  }, 30000);
}

function triggerAdminAlert(message) {
  console.log(`[알림] ${message}`);
}

function getHardwareStatus() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT hs.*, w.name FROM hardware_status hs JOIN warehouses w ON hs.warehouse_id = w.id`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      },
    );
  });
}

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
  HARDWARE_CONFIG,
};
