const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const naverSync = require('./naver-sync');
const hardware = require('./hardware');

const app = express();
const PORT = process.env.PORT || 3001;

const JWT_SECRET = 'shared-warehouse-secret-key-2026';
const OTP_SECRET = 'otp-secret-key-2026';

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./warehouse.db', (err) => {
  if (err) console.error('DB 연결 오류:', err.message);
  else console.log('SQLite 연결 완료');
});

// ============= 테이블 생성 =============
db.serialize(() => {
  // users
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    phone TEXT,
    pin_code TEXT,
    role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // warehouses
  db.run(`CREATE TABLE IF NOT EXISTS warehouses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT,
    capacity INTEGER DEFAULT 0,
    owner_id INTEGER,
    layout_data TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  )`);

  // cabinets (캐비넷)
  db.run(`CREATE TABLE IF NOT EXISTS cabinets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id INTEGER NOT NULL,
    size TEXT CHECK(size IN ('S', 'M', 'L')),
    relay_channel INTEGER,
    status TEXT DEFAULT 'available' CHECK(status IN ('available', 'occupied', 'maintenance', 'expired_soon')),
    current_contract_id INTEGER,
    position_x INTEGER DEFAULT 0,
    position_y INTEGER DEFAULT 0,
    position_index INTEGER DEFAULT 0,
    layout_data TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
    FOREIGN KEY (current_contract_id) REFERENCES contracts(id)
  )`);

  // contracts (계약)
  db.run(`CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    cabinet_id INTEGER NOT NULL,
    start_date DATETIME NOT NULL,
    end_date DATETIME NOT NULL,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'expired', 'cancelled', 'pending')),
    total_amount INTEGER DEFAULT 0,
    billing_key TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (cabinet_id) REFERENCES cabinets(id)
  )`);

  // payments (결제)
  db.run(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    pg_approval_number TEXT,
    payment_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'completed' CHECK(status IN ('completed', 'refunded', 'failed')),
    receipt_password TEXT,
    billing_key TEXT,
    FOREIGN KEY (contract_id) REFERENCES contracts(id)
  )`);

  // access_logs (출입 기록)
  db.run(`CREATE TABLE IF NOT EXISTS access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    warehouse_id INTEGER NOT NULL,
    auth_method TEXT CHECK(auth_method IN ('pin', 'otp', 'qr', 'admin')),
    success INTEGER DEFAULT 1,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
  )`);

  // 네이버 예약 동기화 테이블
  db.run(`CREATE TABLE IF NOT EXISTS naver_reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reservation_id TEXT UNIQUE,
    customer_name TEXT,
    phone TEXT,
    service_name TEXT,
    start_date DATETIME,
    end_date DATETIME,
    status TEXT DEFAULT 'synced',
    synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // hardware_status (하드웨어 상태)
  db.run(`CREATE TABLE IF NOT EXISTS hardware_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id INTEGER NOT NULL,
    door_status TEXT DEFAULT 'closed' CHECK(door_status IN ('open', 'closed', 'error')),
    fire_alarm INTEGER DEFAULT 0,
    last_check DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
  )`);

  // items (기존 재고)
  db.run(`CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    quantity INTEGER DEFAULT 0,
    unit TEXT DEFAULT '개',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
  )`);

  // inventory_logs
  db.run(`CREATE TABLE IF NOT EXISTS inventory_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    warehouse_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('in', 'out')),
    quantity INTEGER NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  console.log('모든 테이블 준비 완료');
});

// ============= 미들웨어 =============
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: '인증 토큰이 필요합니다.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: '유효하지 않은 토큰입니다.' });
    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: '관리자 권한이 필요합니다.' });
  }
  next();
};

// ============= Time-based OTP =============
// OTP는 오프라인에서도 동작 가능하도록 phone 기반 hash 사용
const generateOTP = (phone, timeWindow) => {
  const hash = crypto.createHash('sha256').update(`${phone}${OTP_SECRET}${timeWindow}`).digest('hex');
  return parseInt(hash.substring(0, 8), 16) % 1000000;
};

const validateOTP = (phone, otp) => {
  const now = Math.floor(Date.now() / 60000);
  for (let i = 0; i < 3; i++) {
    if (generateOTP(phone, now - i) === otp) return true;
  }
  return false;
};

// ============= PIN 동기화 (미니 PC) =============
function syncPinToMiniPC(userId, newPin) {
  // 미니 PC에 PIN 변경 알림 (로컬 브로드캐스트 또는 파일 기반)
  const syncPath = `C:\\OpenClawWork\\shared-warehouse\\.pin-sync\\user_${userId}.pin`;
  try {
    const fs = require('fs');
    const path = require('path');
    const dir = path.dirname(syncPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(syncPath, newPin, 'utf8');
    console.log(`[PIN 동기화] 사용자 ${userId} PIN: ${newPin} -> 파일 저장`);
  } catch (err) {
    console.error(`[PIN 동기화 실패] ${err.message}`);
  }
}

// ============= FCM 푸시 알림 =============
async function sendFCMPush(tokens, title, body, data) {
  // TODO: 실제 FCM API 연동
  console.log(`[FCM 푸시] 토큰 ${tokens.length}개 → ${title}: ${body}`);
  return { success: true, tokens };
}

async function sendKakaoAlert(phone, templateId, variables) {
  // TODO: 카카오 알림톡 API 연동
  console.log(`[알림톡] ${phone} → ${templateId}:`, variables);
  return { success: true };
}

async function sendSMS(phone, message) {
  // TODO: SMS API 연동
  console.log(`[SMS] ${phone} → ${message}`);
  return { success: true };
}

// 푸시 알림 발송 (FCM → 카카오 → SMS 폴백)
async function notifyUser(userId, title, body) {
  return new Promise(async (resolve) => {
    db.get(`SELECT phone FROM users WHERE id = ?`, [userId], (err, user) => {
      if (err || !user) { resolve({ success: false, error: 'user not found' }); return; }

      // 1단계: FCM 푸시 (가장 우선)
      sendFCMPush([`user_${userId}_token`], title, body, { user_id: userId })
        .then(result => {
          if (result.success) {
            console.log(`[알림 발송 완료] FCM → 사용자 ${userId}`);
            resolve(result);
          } else {
            // 2단계: 카카오 알림톡
            sendKakaoAlert(user.phone, 'alert_template', { title, body })
              .then(result2 => {
                if (result2.success) {
                  console.log(`[알림 발송 완료] 카카오 → ${user.phone}`);
                  resolve(result2);
                } else {
                  // 3단계: SMS
                  sendSMS(user.phone, `[${title}] ${body}`).then(r => resolve(r));
                }
              });
          }
        });
    });
  });
}

// ============= 자동 연장 결제 (빌링) 스케줄러 =============
let billingScheduled = {};

async function scheduleAutoBilling(contractId, billingKey) {
  billingScheduled[contractId] = billingKey;
  // TODO: PG사 API 연동 (예: 토스페이먼츠, 카카오페이)
  console.log(`[빌링 예약] 계약 ${contractId} - billing_key: ${billingKey}`);
}

async function executeAutoBilling(contractId) {
  const billingKey = billingScheduled[contractId];
  if (!billingKey) {
    console.log(`[빌링 실패] 계약 ${contractId}에 예약된 billing_key 없음`);
    return { success: false, error: 'no billing key' };
  }

  // TODO: PG사 API 호출 (자동 결제)
  // 예: POST https://api.tosspayments.com/v1/payments/confirm
  //     { billingKey, amount, orderId, orderName }
  console.log(`[빌링 실행] 계약 ${contractId} - billing_key: ${billingKey}`);

  return { success: true, contractId };
}

// 매일 자정에 만료 예정 계약 확인 및 자동 빌링 실행
setInterval(() => {
  db.all(`SELECT c.id, c.user_id, c.billing_key, c.end_date, u.phone, u.username
           FROM contracts c
           JOIN users u ON c.user_id = u.id
           WHERE c.status = 'active'
           AND c.billing_key IS NOT NULL
           AND c.end_date <= datetime('now', '+1 day')`, [], (err, contracts) => {
    if (err) return;
    contracts.forEach(c => {
      console.log(`[자동 빌링] ${c.username} (${c.phone}) - 계약 ${c.id} (${c.end_date})`);
      executeAutoBilling(c.id).then(result => {
        if (result.success) {
          db.run(`UPDATE contracts SET status = 'active', end_date = datetime('now', '+30 days') WHERE id = ?`, [c.id]);
          console.log(`[자동 빌링 성공] 계약 ${c.id} 연장 완료`);
          delete billingScheduled[c.id];
        }
      });
    });
  });
}, 86400000); // 24시간

// ============= 회원 API =============
app.post('/api/register', async (req, res) => {
  const { username, email, password, phone } = req.body;
  console.log('[REGISTER] req.body:', JSON.stringify(req.body));
  if (!username || !email || !password) return res.status(400).json({ message: '필수 필드 입력' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('[REGISTER] hash OK');
    // 첫 번째 유저는 자동 admin 승급
    db.get(`SELECT COUNT(*) AS cnt FROM users`, [], (err, row) => {
      const isFirst = (!err && row && row.cnt === 0);
      const role = isFirst ? 'admin' : 'user';
      if (isFirst) console.log('[REGISTER] first user -> admin');

      db.run(`INSERT INTO users (username, email, password, phone, role, pin_code) VALUES (?, ?, ?, ?, ?, ?)`,
        [username, email, hashedPassword, phone || '', role, req.body.pin_code || null], function (err) {
          if (err) {
            console.error('[REGISTER] DB error:', err.message);
            if (err.message.includes('UNIQUE')) return res.status(409).json({ message: '중복된 아이디/이메일' });
            return res.status(500).json({ message: '서버 오류: ' + err.message });
          }
          console.log('[REGISTER] OK userId:', this.lastID, 'role:', role);
          res.status(201).json({ message: '회원가입 완료', userId: this.lastID, role: role });
        });
    });
  } catch (error) {
    console.error('[REGISTER] catch:', error.message);
    res.status(500).json({ message: '서버 오류: ' + error.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: '필수 필드 입력' });

  db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (!user) return res.status(401).json({ message: '아이디 없음' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: '비밀번호 불일치' });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ message: '로그인 성공', token, user: { id: user.id, username: user.username, role: user.role, phone: user.phone } });
  });
});

// ============= 관리자 API: 사용자 목록 =============
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  db.all(`SELECT id, username, email, phone, pin_code, role, created_at FROM users ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    res.json(rows);
  });
});

// ============= 관리자 API: PIN 수정/초기화 =============
app.put('/api/admin/users/:userId/pin', authenticateToken, requireAdmin, (req, res) => {
  const { new_pin, reset } = req.body;

  if (reset === true) {
    // PIN 초기화 (4자리 랜덤 숫자)
    const randomPin = Math.floor(1000 + Math.random() * 9000).toString();
    console.log(`[CS] PIN 초기화: 사용자 ${req.params.userId} -> ${randomPin}`);

    db.run(`UPDATE users SET pin_code = ? WHERE id = ?`, [randomPin, req.params.userId], function (err) {
      if (err) return res.status(500).json({ message: '서버 오류: ' + err.message });
      if (this.changes === 0) return res.status(404).json({ message: '사용자를 찾을 수 없음' });

      syncPinToMiniPC(req.params.userId, randomPin);
      res.json({ message: 'PIN 초기화 완료', newPin: randomPin });
    });
  } else {
    // PIN 직접 설정 (정확히 4자리)
    if (!new_pin || new_pin.length !== 4) {
      return res.status(400).json({ message: 'PIN은 정확히 4자리여야 합니다.' });
    }
    if (!/^[0-9]+$/.test(new_pin)) {
      return res.status(400).json({ message: 'PIN은 숫자만 입력 가능합니다.' });
    }

    console.log(`[CS] PIN 변경: 사용자 ${req.params.userId} -> ${new_pin}`);

    db.run(`UPDATE users SET pin_code = ? WHERE id = ?`, [new_pin, req.params.userId], function (err) {
      if (err) return res.status(500).json({ message: '서버 오류: ' + err.message });
      if (this.changes === 0) return res.status(404).json({ message: '사용자를 찾을 수 없음' });

      syncPinToMiniPC(req.params.userId, new_pin);
      res.json({ message: 'PIN 업데이트 완료', newPin: new_pin });
    });
  }
});

// ============= 레이아웃 빌더 API =============
// 창고 레이아웃 조회
app.get('/api/warehouses/:id/layout', authenticateToken, (req, res) => {
  db.get(`SELECT layout_data FROM warehouses WHERE id = ?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (!row) return res.status(404).json({ message: '창고를 찾을 수 없음' });
    try {
      res.json(JSON.parse(row.layout_data || '[]'));
    } catch {
      res.json([]);
    }
  });
});

// 창고 레이아웃 저장
app.put('/api/warehouses/:id/layout', authenticateToken, requireAdmin, (req, res) => {
  const { layout_data } = req.body;
  if (!layout_data) return res.status(400).json({ message: '레이아웃 데이터 필수' });

  const data = typeof layout_data === 'string' ? layout_data : JSON.stringify(layout_data);

  db.run(`UPDATE warehouses SET layout_data = ? WHERE id = ?`, [data, req.params.id], function (err) {
    if (err) return res.status(500).json({ message: '서버 오류: ' + err.message });
    if (this.changes === 0) return res.status(404).json({ message: '찾을 수 없음' });
    res.json({ message: '레이아웃 저장 완료' });
  });
});

// 캐비넷 위치 저장 (드래그 앤 드롭)
app.put('/api/cabinets/:id/layout', authenticateToken, requireAdmin, (req, res) => {
  const { position_x, position_y, position_index, size, layout_data } = req.body;

  const updates = [];
  const params = [];

  if (position_x !== undefined) { updates.push('position_x = ?'); params.push(position_x); }
  if (position_y !== undefined) { updates.push('position_y = ?'); params.push(position_y); }
  if (position_index !== undefined) { updates.push('position_index = ?'); params.push(position_index); }
  if (layout_data) {
    updates.push('layout_data = ?');
    params.push(typeof layout_data === 'string' ? layout_data : JSON.stringify(layout_data));
  }

  if (updates.length === 0) return res.status(400).json({ message: '업데이트할 데이터 필요' });

  params.push(req.params.id);
  db.run(`UPDATE cabinets SET ${updates.join(', ')} WHERE id = ?`, params, function (err) {
    if (err) return res.status(500).json({ message: '서버 오류: ' + err.message });
    if (this.changes === 0) return res.status(404).json({ message: '찾을 수 없음' });
    res.json({ message: '위치 저장 완료' });
  });
});

// ============= 창고 API =============
app.get('/api/warehouses', authenticateToken, (req, res) => {
  db.all(`SELECT * FROM warehouses ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    res.json(rows);
  });
});

app.post('/api/warehouses', authenticateToken, (req, res) => {
  const { name, location, capacity } = req.body;
  if (!name) return res.status(400).json({ message: '창고 이름 입력' });

  db.run(`INSERT INTO warehouses (name, location, capacity, owner_id) VALUES (?, ?, ?, ?)`,
    [name, location || '', capacity || 0, req.user.id], function (err) {
      if (err) return res.status(500).json({ message: '서버 오류' });
      // 하드웨어 상태 초기화
      db.run(`INSERT INTO hardware_status (warehouse_id) VALUES (?)`, [this.lastID]);
      res.status(201).json({ message: '창고 생성 완료', warehouseId: this.lastID });
    });
});

app.delete('/api/warehouses/:id', authenticateToken, requireAdmin, (req, res) => {
  db.run(`DELETE FROM warehouses WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (this.changes === 0) return res.status(404).json({ message: '찾을 수 없음' });
    res.json({ message: '삭제 완료' });
  });
});

// ============= 캐비넷 API =============
app.get('/api/warehouses/:warehouseId/cabinets', authenticateToken, (req, res) => {
  // Validate warehouse exists and user has access
  db.get(`SELECT id, owner_id FROM warehouses WHERE id = ?`, [req.params.warehouseId], (err, warehouse) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (!warehouse) return res.status(404).json({ message: '창고를 찾을 수 없음' });
    if (req.user.role !== 'admin' && warehouse.owner_id !== req.user.id) {
      return res.status(403).json({ message: '접근 권한이 없습니다.' });
    }
    db.all(`SELECT c.*, w.name as warehouse_name FROM cabinets c JOIN warehouses w ON c.warehouse_id = w.id WHERE c.warehouse_id = ?`,
      [req.params.warehouseId], (err, rows) => {
      if (err) return res.status(500).json({ message: '서버 오류' });
      res.json(rows);
    });
  });
});

app.post('/api/warehouses/:warehouseId/cabinets', authenticateToken, requireAdmin, (req, res) => {
  const { size, relay_channel, position_x, position_y, position_index } = req.body;
  if (!size) return res.status(400).json({ message: '크기 선택' });

  db.run(
    `INSERT INTO cabinets (warehouse_id, size, relay_channel, position_x, position_y, position_index) VALUES (?, ?, ?, ?, ?, ?)`,
    [req.params.warehouseId, size, relay_channel || 0, position_x || 0, position_y || 0, position_index || 0],
    function (err) {
      if (err) return res.status(500).json({ message: '서버 오류' });
      res.status(201).json({ message: '캐비넷 추가', cabinetId: this.lastID });
    });
});

app.put('/api/cabinets/:id/status', authenticateToken, requireAdmin, (req, res) => {
  const { status } = req.body;
  const validStatuses = ['available', 'occupied', 'maintenance', 'expired_soon'];
  if (!validStatuses.includes(status)) return res.status(400).json({ message: '잘못된 상태' });

  db.run(`UPDATE cabinets SET status = ? WHERE id = ?`, [status, req.params.id], function (err) {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (this.changes === 0) return res.status(404).json({ message: '찾을 수 없음' });
    res.json({ message: '상태 변경 완료' });
  });
});

// ============= 계약 API =============
app.get('/api/contracts', authenticateToken, (req, res) => {
  const userId = req.user.role === 'admin' ? null : req.user.id;
  if (userId) {
    db.all(`SELECT c.*, u.username, cab.size FROM contracts c JOIN users u ON c.user_id = u.id JOIN cabinets cab ON c.cabinet_id = cab.id WHERE c.user_id = ?`,
      [userId], (err, rows) => {
        if (err) return res.status(500).json({ message: '서버 오류' });
        res.json(rows);
      });
  } else {
    db.all(`SELECT c.*, u.username, cab.size FROM contracts c JOIN users u ON c.user_id = u.id JOIN cabinets cab ON c.cabinet_id = cab.id ORDER BY c.created_at DESC`,
      [], (err, rows) => {
        if (err) return res.status(500).json({ message: '서버 오류' });
        res.json(rows);
      });
  }
});

app.post('/api/contracts', authenticateToken, (req, res) => {
  const { user_id, cabinet_id, start_date, end_date, total_amount } = req.body;
  if (!cabinet_id || !start_date || !end_date) return res.status(400).json({ message: '필수 필드 입력' });

  // 캐비넷 상태 확인
  db.get(`SELECT status FROM cabinets WHERE id = ?`, [cabinet_id], (err, cabinet) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (!cabinet || cabinet.status !== 'available') return res.status(400).json({ message: '사용 불가 캐비넷' });

    db.run(`INSERT INTO contracts (user_id, cabinet_id, start_date, end_date, total_amount) VALUES (?, ?, ?, ?, ?)`,
      [user_id || req.user.id, cabinet_id, start_date, end_date, total_amount || 0], function (err) {
        if (err) return res.status(500).json({ message: '서버 오류' });

        // 캐비넷 상태 변경
        db.run(`UPDATE cabinets SET status = 'occupied', current_contract_id = ? WHERE id = ?`,
          [this.lastID, cabinet_id]);

        res.status(201).json({ message: '계약 생성', contractId: this.lastID });
      });
  });
});

app.put('/api/contracts/:id/cancel', authenticateToken, requireAdmin, (req, res) => {
  db.get(`SELECT cabinet_id FROM contracts WHERE id = ?`, [req.params.id], (err, contract) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (!contract) return res.status(404).json({ message: '찾을 수 없음' });

    db.run(`UPDATE contracts SET status = 'cancelled' WHERE id = ?`, [req.params.id]);
    db.run(`UPDATE cabinets SET status = 'available', current_contract_id = NULL WHERE id = ?`, [contract.cabinet_id]);
    res.json({ message: '계약 취소 완료' });
  });
});

// ============= 결제 API (자동 연장 빌링 포함) =============
app.post('/api/payments', authenticateToken, requireAdmin, (req, res) => {
  const { contract_id, amount, pg_approval_number, billing_key, receipt_password: customReceipt } = req.body;
  if (!contract_id || !amount) return res.status(400).json({ message: '필수 필드 입력' });

  const receiptPassword = customReceipt || Math.floor(100000 + Math.random() * 900000).toString();

  db.run(
    `INSERT INTO payments (contract_id, amount, pg_approval_number, receipt_password, billing_key) VALUES (?, ?, ?, ?, ?)`,
    [contract_id, amount, pg_approval_number || '', receiptPassword, billing_key || null],
    function (err) {
      if (err) return res.status(500).json({ message: '서버 오류' });

      // billing_key가 있으면 자동 연장 예약
      if (billing_key) {
        scheduleAutoBilling(contract_id, billing_key);
        db.run(`UPDATE contracts SET billing_key = ? WHERE id = ?`, [billing_key, contract_id]);
      }

      res.status(201).json({ message: '결제 완료', paymentId: this.lastID, receiptPassword });
    });
});

app.get('/api/payments/:id/receipt', authenticateToken, (req, res) => {
  const { password } = req.body;
  db.get(`SELECT p.*, c.start_date, c.end_date, u.username FROM payments p JOIN contracts c ON p.contract_id = c.id JOIN users u ON c.user_id = u.id WHERE p.id = ?`,
    [req.params.id], (err, payment) => {
      if (err) return res.status(500).json({ message: '서버 오류' });
      if (!payment) return res.status(404).json({ message: '찾을 수 없음' });
      if (payment.receipt_password !== password) return res.status(403).json({ message: '비밀번호 불일치' });
      res.json(payment);
    });
});

// ============= 출입 인증 API (오프라인 지원) =============
app.post('/api/access/authenticate', (req, res) => {
  const { warehouse_id, auth_method, auth_value } = req.body;
  if (!warehouse_id || !auth_method || !auth_value) return res.status(400).json({ message: '필수 필드' });

  let success = false;
  let userId = null;

  if (auth_method === 'pin') {
    // PIN 인증
    db.get(`SELECT id FROM users WHERE pin_code = ?`, [auth_value], (err, user) => {
      if (err || !user) {
        logAccess(null, warehouse_id, auth_method, false, 'PIN 인증 실패');
        return res.status(401).json({ success: false, message: '인증 실패' });
      }
      userId = user.id;
      success = true;
      completeAuth(userId);
    });
  } else if (auth_method === 'otp') {
    // Time-based OTP (오프라인 지원)
    db.get(`SELECT phone FROM users WHERE id = (SELECT user_id FROM contracts WHERE cabinet_id IN (SELECT id FROM cabinets WHERE warehouse_id = ?) AND status = 'active')`,
      [warehouse_id], (err, user) => {
        if (err || !user || !user.phone) {
          logAccess(null, warehouse_id, auth_method, false, 'OTP 사용자 없음');
          return res.status(401).json({ success: false, message: '인증 실패' });
        }
        if (validateOTP(user.phone, parseInt(auth_value))) {
          success = true;
          completeAuth(user.id);
        } else {
          logAccess(null, warehouse_id, auth_method, false, 'OTP 불일치');
          return res.status(401).json({ success: false, message: '인증 실패' });
        }
      });
  } else if (auth_method === 'qr') {
    // QR 코드 인증 (contract_id 기반)
    db.get(`SELECT user_id FROM contracts WHERE id = ? AND status = 'active'`, [auth_value], (err, contract) => {
      if (err || !contract) {
        logAccess(null, warehouse_id, auth_method, false, 'QR 계약 없음');
        return res.status(401).json({ success: false, message: '인증 실패' });
      }
      userId = contract.user_id;
      success = true;
      completeAuth(userId);
    });
  }

  function completeAuth(uid) {
    logAccess(uid, warehouse_id, auth_method, true, '인증 성공');
    // 릴레이 제어 (문 열기)
    controlDoor(warehouse_id, 'open');
    res.json({ success: true, message: '인증 성공 - 출입문 개방' });
  }

  function logAccess(uid, wid, method, success, note) {
    db.run(`INSERT INTO access_logs (user_id, warehouse_id, auth_method, success, note) VALUES (?, ?, ?, ?, ?)`,
      [uid, wid, method, success ? 1 : 0, note]);
  }

  function controlDoor(wid, action) {
    // 릴레이 제어 로직 (실제 하드웨어 연동 시 구현)
    console.log(`[도어 제어] 창고 ${wid} - ${action}`);
    db.run(`UPDATE hardware_status SET door_status = ?, last_check = CURRENT_TIMESTAMP WHERE warehouse_id = ?`,
      [action === 'open' ? 'open' : 'closed', wid]);

    // 3초 후 자동 잠금
    setTimeout(() => {
      db.run(`UPDATE hardware_status SET door_status = 'closed', last_check = CURRENT_TIMESTAMP WHERE warehouse_id = ?`, [wid]);
      console.log(`[도어 제어] 창고 ${wid} - 자동 잠금`);
    }, 3000);
  }
});

// 출입 로그 조회
app.get('/api/warehouses/:warehouseId/access-logs', authenticateToken, (req, res) => {
  db.all(`SELECT al.*, u.username, 'access' as log_type FROM access_logs al LEFT JOIN users u ON al.user_id = u.id WHERE al.warehouse_id = ? ORDER BY al.created_at DESC LIMIT 100`,
    [req.params.warehouseId], (err, rows) => {
      if (err) return res.status(500).json({ message: '서버 오류' });
      res.json(rows);
    });
});

// ============= 네이버 예약 동기화 (실제 모듈 연동) =============
app.post('/api/admin/sync-naver-emails', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const count = await naverSync.fetchEmails();
    res.json({ message: `이메일 파싱 완료: ${count}건 처리` });
  } catch (err) {
    res.status(500).json({ message: `파싱 오류: ${err.message}` });
  }
});

app.post('/api/admin/sync-naver-crawler', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const count = await naverSync.crawlNaverPartner();
    res.json({ message: `크롤링 동기화 완료: ${count}건` });
  } catch (err) {
    res.status(500).json({ message: `크롤링 오류: ${err.message}` });
  }
});

app.post('/api/admin/sync-naver-reservations', authenticateToken, requireAdmin, (req, res) => {
  // 수동 데이터 입력 (테스트용)
  const { reservations } = req.body;
  if (!reservations || !Array.isArray(reservations)) {
    return res.status(400).json({ message: '예약 데이터 필수' });
  }

  let count = 0;
  const insert = db.prepare(`INSERT OR IGNORE INTO naver_reservations (reservation_id, customer_name, phone, service_name, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)`);

  reservations.forEach(r => {
    insert.run(r.reservation_id, r.customer_name, r.phone, r.service_name, r.start_date, r.end_date, function (err) {
      if (!err && this.changes > 0) count++;
    });
  });
  insert.finalize();

  res.json({ message: `동기화 완료: ${count}건 신규 등록` });
});

app.get('/api/admin/naver-reservations', authenticateToken, requireAdmin, (req, res) => {
  db.all(`SELECT * FROM naver_reservations ORDER BY synced_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    res.json(rows);
  });
});

// ============= 하드웨어 제어 API (모듈 연동) =============
app.post('/api/admin/door/unlock', authenticateToken, requireAdmin, (req, res) => {
  const { warehouse_id, duration } = req.body;
  if (!warehouse_id) return res.status(400).json({ message: '창고 ID 필수' });

  hardware.unlockDoor(warehouse_id, duration || undefined);
  res.json({ message: `문 개방 완료 (${duration ? duration/1000 : 3}초 후 자동 잠금)` });
});

app.post('/api/admin/relay/control', authenticateToken, requireAdmin, async (req, res) => {
  const { warehouse_id, channel, action } = req.body;
  if (!warehouse_id || !channel || !action) return res.status(400).json({ message: '필수 필드' });

  try {
    await hardware.controlRelay(warehouse_id, channel, action);
    res.json({ message: `릴레이 ${action} 완료` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/admin/hardware/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const status = await hardware.getHardwareStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/hardware/fire-alarm', (req, res) => {
  const { warehouse_id } = req.body;
  if (!warehouse_id) return res.status(400).json({ message: '창고 ID 필수' });

  hardware.handleFireAlarm(warehouse_id);
  res.json({ message: '화재 경보 처리 - 문 강제 개방' });
});

// ============= 기존 API (재고, 프로필 등) =============
app.get('/api/warehouses/:warehouseId/items', authenticateToken, (req, res) => {
  db.all(`SELECT * FROM items WHERE warehouse_id = ? ORDER BY name`, [req.params.warehouseId], (err, rows) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    res.json(rows);
  });
});

app.post('/api/warehouses/:warehouseId/items', authenticateToken, (req, res) => {
  const { name, description, quantity, unit } = req.body;
  if (!name) return res.status(400).json({ message: '이름 필수' });
  db.run(`INSERT INTO items (warehouse_id, name, description, quantity, unit) VALUES (?, ?, ?, ?, ?)`,
    [req.params.warehouseId, name, description || '', quantity || 0, unit || '개'], function (err) {
      if (err) return res.status(500).json({ message: '서버 오류' });
      res.status(201).json({ message: '추가 완료', itemId: this.lastID });
    });
});

app.put('/api/items/:id', authenticateToken, (req, res) => {
  const { name, description, quantity, unit } = req.body;
  db.run(`UPDATE items SET name = ?, description = ?, quantity = ?, unit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [name, description, quantity, unit, req.params.id], function (err) {
      if (err) return res.status(500).json({ message: '서버 오류' });
      if (this.changes === 0) return res.status(404).json({ message: '찾을 수 없음' });
      res.json({ message: '수정 완료' });
    });
});

app.delete('/api/items/:id', authenticateToken, (req, res) => {
  db.run(`DELETE FROM items WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (this.changes === 0) return res.status(404).json({ message: '찾을 수 없음' });
    res.json({ message: '삭제 완료' });
  });
});

app.post('/api/items/:itemId/stock', authenticateToken, (req, res) => {
  const { type, quantity, note } = req.body;
  if (!type || !quantity || quantity <= 0) return res.status(400).json({ message: '유효한 값 입력' });

  db.get(`SELECT * FROM items WHERE id = ?`, [req.params.itemId], (err, item) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (!item) return res.status(404).json({ message: '찾을 수 없음' });
    if (type === 'out' && item.quantity < quantity) return res.status(400).json({ message: '부족한 수량' });

    const newQuantity = type === 'in' ? item.quantity + quantity : item.quantity - quantity;
    db.run(`UPDATE items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [newQuantity, req.params.itemId], (err) => {
      if (err) return res.status(500).json({ message: '서버 오류' });
      db.run(`INSERT INTO inventory_logs (item_id, warehouse_id, user_id, type, quantity, note) VALUES (?, ?, ?, ?, ?, ?)`,
        [req.params.itemId, item.warehouse_id, req.user.id, type, quantity, note || '']);
      res.json({ message: type === 'in' ? '입고 완료' : '출고 완료', newQuantity });
    });
  });
});

app.get('/api/warehouses/:warehouseId/logs', authenticateToken, (req, res) => {
  // Return both inventory logs and access logs combined
  db.all(`SELECT il.*, i.name as item_name, u.username, 'inventory' as log_type FROM inventory_logs il JOIN items i ON il.item_id = i.id JOIN users u ON il.user_id = u.id WHERE il.warehouse_id = ? ORDER BY created_at DESC LIMIT 50`,
    [req.params.warehouseId], (err, rows) => {
      if (err) return res.status(500).json({ message: '서버 오류' });
      res.json(rows);
    });
});

app.get('/api/warehouses/:warehouseId/stats', authenticateToken, (req, res) => {
  db.get(`SELECT COUNT(*) as total_items, COALESCE(SUM(quantity), 0) as total_quantity FROM items WHERE warehouse_id = ?`,
    [req.params.warehouseId], (err, row) => {
      if (err) return res.status(500).json({ message: '서버 오류' });
      res.json(row);
    });
});

app.get('/api/search', authenticateToken, (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  db.all(`SELECT i.*, w.name as warehouse_name FROM items i JOIN warehouses w ON i.warehouse_id = w.id WHERE i.name LIKE ? OR i.description LIKE ? LIMIT 20`,
    [`%${q}%`, `%${q}%`], (err, rows) => {
      if (err) return res.status(500).json({ message: '서버 오류' });
      res.json(rows);
    });
});

app.get('/api/profile/:userId', authenticateToken, (req, res) => {
  db.get(`SELECT id, username, email, phone, role, created_at FROM users WHERE id = ?`, [req.params.userId], (err, user) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (!user) return res.status(404).json({ message: '찾을 수 없음' });
    res.json(user);
  });
});

app.put('/api/profile/:userId', authenticateToken, (req, res) => {
  const { username, email, phone, pin_code } = req.body;
  if (!username || !email) return res.status(400).json({ message: '필수 필드' });
  db.run(`UPDATE users SET username = ?, email = ?, phone = ?, pin_code = ? WHERE id = ?`,
    [username, email, phone, pin_code || null, req.params.userId], function (err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(409).json({ message: '중복' });
        return res.status(500).json({ message: '서버 오류' });
      }
      if (this.changes === 0) return res.status(404).json({ message: '찾을 수 없음' });
      res.json({ message: '프로필 수정 완료' });
    });
});

// 만료 임박 캐비넷 체크 (매시간 실행)
setInterval(() => {
  db.all(`SELECT c.id, c.cabinet_id FROM contracts c WHERE c.status = 'active' AND c.end_date <= datetime('now', '+7 days') AND c.end_date >= datetime('now')`, [], (err, contracts) => {
    if (err) return;
    contracts.forEach(c => {
      db.run(`UPDATE cabinets SET status = 'expired_soon' WHERE id = ? AND status = 'occupied'`, [c.cabinet_id]);
    });
  });

  // 만료된 계약 처리
  db.all(`SELECT id, cabinet_id FROM contracts WHERE status = 'active' AND end_date < datetime('now')`, [], (err, contracts) => {
    if (err) return;
    contracts.forEach(c => {
      db.run(`UPDATE contracts SET status = 'expired' WHERE id = ?`, [c.id]);
      db.run(`UPDATE cabinets SET status = 'available', current_contract_id = NULL WHERE id = ?`, [c.cabinet_id]);
    });
  });
}, 3600000);

// ============= 알림톡 API (만료 예정/계약 알림) =============
app.post('/api/admin/send-alert', authenticateToken, requireAdmin, (req, res) => {
  const { user_id, template_type, message } = req.body;
  if (!user_id || !template_type) return res.status(400).json({ message: '필수 필드' });

  // 사용자 전화번호 조회
  db.get(`SELECT phone FROM users WHERE id = ?`, [user_id], (err, user) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (!user || !user.phone) return res.status(404).json({ message: '전화번호 없음' });

    // TODO: 실제 카카오 알림톡 API 연동
    console.log(`[알림톡] 사용자 ${user_id} (${user.phone}) → ${template_type}: ${message}`);

    // 결제 알림 / 만료 예정 / 계약 확인 등 템플릿별 발송
    res.json({ message: `알림 발송 완료 (${user.phone})`, template_type });
  });
});

// 만료 예정 계약자에게 자동 알림 발송 (매일 1회)
setInterval(() => {
  db.all(`SELECT c.id, c.user_id, c.end_date, u.phone, u.username
           FROM contracts c
           JOIN users u ON c.user_id = u.id
           WHERE c.status = 'active'
           AND c.end_date <= datetime('now', '+3 days')
           AND c.end_date >= datetime('now')`, [], (err, contracts) => {
    if (err) return;
    contracts.forEach(c => {
      console.log(`[자동 알림] ${c.username} (${c.phone}) - 계약 만료 (${c.end_date})`);
      // TODO: 카카오 알림톡 API 호출
    });
  });
}, 86400000); // 24시간

// ============= 전역 에러 핸들러 =============
app.use((err, req, res, next) => {
  console.error('[GLOBAL ERROR]', err.stack);
  res.status(500).json({ message: '서버 오류: ' + err.message });
});

app.listen(PORT, async () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);

  // 하드웨어 모듈 초기화
  try {
    await hardware.init();
  } catch (err) {
    console.error('[초기화] 하드웨어 모듈 오류:', err.message);
  }

  // 네이버 예약 자동 동기화 시작
  naverSync.startSyncScheduler(600000); // 10분마다
});
