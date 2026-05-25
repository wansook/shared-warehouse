const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-core';
process.env.OTP_SECRET = 'test-otp-secret-for-core';
process.env.DB_PATH = path.join(os.tmpdir(), `shared-warehouse-core-${process.pid}-${Date.now()}.db`);

const { app, db, stopBackgroundJobs } = require('../server');

const state = {
  admin: {},
  user: {},
  warehouseId: null,
  cabinet1Id: null,
  cabinet2Id: null,
  contract1Id: null,
  userContractId: null,
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function generateOtp(phone) {
  const window = Math.floor(Date.now() / 60000);
  const hash = crypto
    .createHash('sha256')
    .update(`${phone}${process.env.OTP_SECRET}${window}`)
    .digest('hex');
  return String(parseInt(hash.substring(0, 8), 16) % 1000000);
}

function pickId(body, ...keys) {
  for (const key of keys) {
    if (body[key] !== undefined) return body[key];
  }
  return undefined;
}

test('core backend features T-001 through T-031', async (t) => {
  await wait(200);

  await t.test('T-001: first registered user becomes admin', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({
        username: 'admin_core',
        email: 'admin_core@example.com',
        password: 'pass1234',
        phone: '01011112222',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.role, 'admin');
    state.admin.id = res.body.userId;
  });

  await t.test('T-002: second registered user becomes normal user', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({
        username: 'user_core',
        email: 'user_core@example.com',
        password: 'pass1234',
        phone: '01033334444',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.role, 'user');
    state.user.id = res.body.userId;
  });

  await t.test('T-003: admin login succeeds', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'admin_core', password: 'pass1234' });

    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, 'admin');
    state.admin.token = res.body.token;
  });

  await t.test('T-004: user login succeeds', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'user_core', password: 'pass1234' });

    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, 'user');
    state.user.token = res.body.token;
  });

  await t.test('T-005: login fails with wrong password', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'admin_core', password: 'wrongpass' });

    assert.equal(res.status, 401);
    assert.match(res.body.message, /비밀번호/);
  });

  await t.test('T-006: valid JWT token allows protected route', async () => {
    const res = await request(app)
      .get('/api/warehouses')
      .set('Authorization', `Bearer ${state.admin.token}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  await t.test('T-007: expired JWT token is rejected', async () => {
    const expired = jwt.sign(
      { id: state.admin.id, username: 'admin_core', role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' },
    );

    const res = await request(app)
      .get('/api/warehouses')
      .set('Authorization', `Bearer ${expired}`);

    assert.equal(res.status, 403);
  });

  await t.test('T-008: stored PIN is a bcrypt hash', async () => {
    const res = await request(app)
      .put(`/api/admin/users/${state.admin.id}/pin`)
      .set('Authorization', `Bearer ${state.admin.token}`)
      .send({ new_pin: '1234' });

    assert.equal(res.status, 200);

    const user = await dbGet('SELECT pin_code FROM users WHERE id = ?', [state.admin.id]);
    assert.ok(user.pin_code.startsWith('$2'));
    assert.notEqual(user.pin_code, '1234');
  });

  await t.test('T-009: PIN verification succeeds', async () => {
    const res = await request(app)
      .post('/api/access/authenticate')
      .set('X-Device-Key', 'pin-success-device')
      .send({ warehouse_id: 1, auth_method: 'pin', auth_value: '1234' });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  await t.test('T-010: PIN verification fails for wrong PIN', async () => {
    const res = await request(app)
      .post('/api/access/authenticate')
      .set('X-Device-Key', 'pin-fail-device')
      .send({ warehouse_id: 1, auth_method: 'pin', auth_value: '9999' });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  await t.test('T-011: admin users response does not expose raw PIN', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${state.admin.token}`);

    assert.equal(res.status, 200);
    const admin = res.body.find((user) => user.id === state.admin.id);
    assert.ok(admin);
    assert.equal(Object.hasOwn(admin, 'pin_code'), false);
  });

  await t.test('T-012: admin can create warehouse', async () => {
    const res = await request(app)
      .post('/api/warehouses')
      .set('Authorization', `Bearer ${state.admin.token}`)
      .send({ name: 'Core Warehouse', location: 'Seoul', capacity: 10 });

    assert.equal(res.status, 201);
    state.warehouseId = pickId(res.body, 'id', 'warehouseId');
    assert.ok(state.warehouseId);
  });

  await t.test('T-013: normal user cannot create warehouse', async () => {
    const res = await request(app)
      .post('/api/warehouses')
      .set('Authorization', `Bearer ${state.user.token}`)
      .send({ name: 'Blocked Warehouse', location: 'Seoul', capacity: 10 });

    assert.equal(res.status, 403);
  });

  await t.test('T-014: warehouse list is readable with auth', async () => {
    const res = await request(app)
      .get('/api/warehouses')
      .set('Authorization', `Bearer ${state.admin.token}`);

    assert.equal(res.status, 200);
    assert.ok(res.body.some((warehouse) => warehouse.id === state.warehouseId));
  });

  await t.test('T-015: admin can create cabinets', async () => {
    const first = await request(app)
      .post(`/api/warehouses/${state.warehouseId}/cabinets`)
      .set('Authorization', `Bearer ${state.admin.token}`)
      .send({ size: 'M', relay_channel: 1 });

    assert.equal(first.status, 201);
    state.cabinet1Id = pickId(first.body, 'id', 'cabinetId');
    assert.ok(state.cabinet1Id);

    const second = await request(app)
      .post(`/api/warehouses/${state.warehouseId}/cabinets`)
      .set('Authorization', `Bearer ${state.admin.token}`)
      .send({ size: 'S', relay_channel: 2 });

    assert.equal(second.status, 201);
    state.cabinet2Id = pickId(second.body, 'id', 'cabinetId');
    assert.ok(state.cabinet2Id);
  });

  await t.test('T-015B: normal user can read cabinet status', async () => {
    const res = await request(app)
      .get(`/api/warehouses/${state.warehouseId}/cabinets`)
      .set('Authorization', `Bearer ${state.user.token}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.some((cabinet) => cabinet.id === state.cabinet1Id));
  });

  await t.test('T-016: admin can change cabinet status', async () => {
    const maintenance = await request(app)
      .put(`/api/cabinets/${state.cabinet2Id}/status`)
      .set('Authorization', `Bearer ${state.admin.token}`)
      .send({ status: 'maintenance' });

    assert.equal(maintenance.status, 200);

    const available = await request(app)
      .put(`/api/cabinets/${state.cabinet2Id}/status`)
      .set('Authorization', `Bearer ${state.admin.token}`)
      .send({ status: 'available' });

    assert.equal(available.status, 200);
  });

  await t.test('T-017: contract creation succeeds', async () => {
    const res = await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${state.admin.token}`)
      .send({
        user_id: state.admin.id,
        cabinet_id: state.cabinet1Id,
        start_date: '2026-06-01',
        end_date: '2026-07-01',
        total_amount: 50000,
      });

    assert.equal(res.status, 201);
    state.contract1Id = pickId(res.body, 'id', 'contractId');
    assert.ok(state.contract1Id);
  });

  await t.test('T-018: contract creation fails for unavailable cabinet', async () => {
    const res = await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${state.admin.token}`)
      .send({
        user_id: state.admin.id,
        cabinet_id: state.cabinet1Id,
        start_date: '2026-08-01',
        end_date: '2026-09-01',
        total_amount: 50000,
      });

    assert.equal(res.status, 400);
  });

  await t.test('T-019: contract creation fails when date period is invalid', async () => {
    const res = await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${state.admin.token}`)
      .send({
        user_id: state.admin.id,
        cabinet_id: state.cabinet2Id,
        start_date: '2026-09-01',
        end_date: '2026-08-01',
        total_amount: 50000,
      });

    assert.equal(res.status, 400);
  });

  await t.test('T-020: duplicate active contract is rejected', async () => {
    await dbRun('UPDATE cabinets SET status = ? WHERE id = ?', ['available', state.cabinet1Id]);

    const res = await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${state.admin.token}`)
      .send({
        user_id: state.admin.id,
        cabinet_id: state.cabinet1Id,
        start_date: '2026-08-01',
        end_date: '2026-09-01',
        total_amount: 50000,
      });

    assert.equal(res.status, 409);
    await dbRun('UPDATE cabinets SET status = ? WHERE id = ?', ['occupied', state.cabinet1Id]);
  });

  await t.test('T-021: contract creation fails for negative amount', async () => {
    const res = await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${state.admin.token}`)
      .send({
        user_id: state.admin.id,
        cabinet_id: state.cabinet2Id,
        start_date: '2026-08-01',
        end_date: '2026-09-01',
        total_amount: -100,
      });

    assert.equal(res.status, 400);
  });

  await t.test('T-022: normal user cannot forge another user_id', async () => {
    const res = await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${state.user.token}`)
      .send({
        user_id: state.admin.id,
        cabinet_id: state.cabinet2Id,
        start_date: '2026-08-01',
        end_date: '2026-09-01',
        total_amount: 50000,
      });

    assert.equal(res.status, 403);
  });

  await t.test('T-023: admin can cancel contract and free cabinet', async () => {
    const res = await request(app)
      .put(`/api/contracts/${state.contract1Id}/cancel`)
      .set('Authorization', `Bearer ${state.admin.token}`);

    assert.equal(res.status, 200);

    const contract = await dbGet('SELECT status FROM contracts WHERE id = ?', [state.contract1Id]);
    const cabinet = await dbGet('SELECT status, current_contract_id FROM cabinets WHERE id = ?', [state.cabinet1Id]);

    assert.equal(contract.status, 'cancelled');
    assert.equal(cabinet.status, 'available');
    assert.equal(cabinet.current_contract_id, null);
  });

  await t.test('T-024: contracts.auto_renew column exists', async () => {
    const columns = await dbAll('PRAGMA table_info(contracts)');
    assert.ok(columns.some((column) => column.name === 'auto_renew'));
  });

  await t.test('T-024B: expired cabinet states can be contracted again', async () => {
    await dbRun('UPDATE cabinets SET status = ?, current_contract_id = NULL WHERE id = ?', ['expired_soon', state.cabinet1Id]);

    const expiring = await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${state.admin.token}`)
      .send({
        user_id: state.user.id,
        cabinet_id: state.cabinet1Id,
        start_date: '2026-10-01',
        end_date: '2026-11-01',
        total_amount: 50000,
      });

    assert.equal(expiring.status, 201);
    const expiringContractId = pickId(expiring.body, 'id', 'contractId');

    await dbRun('UPDATE contracts SET status = ? WHERE id = ?', ['expired', expiringContractId]);
    await dbRun('UPDATE cabinets SET status = ?, current_contract_id = NULL WHERE id = ?', ['expired', state.cabinet1Id]);

    const expired = await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${state.admin.token}`)
      .send({
        user_id: state.user.id,
        cabinet_id: state.cabinet1Id,
        start_date: '2026-11-01',
        end_date: '2026-12-01',
        total_amount: 50000,
      });

    assert.equal(expired.status, 201);
    state.userContractId = pickId(expired.body, 'id', 'contractId');
  });

  await t.test('T-024C: payment list is filtered by role', async () => {
    const payment = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${state.user.token}`)
      .send({ contract_id: state.userContractId, amount: 50000 });

    assert.equal(payment.status, 201);

    const userPayments = await request(app)
      .get('/api/payments?limit=10')
      .set('Authorization', `Bearer ${state.user.token}`);

    assert.equal(userPayments.status, 200);
    assert.ok(userPayments.body.length >= 1);
    assert.ok(userPayments.body.every((row) => row.user_id === state.user.id));

    const adminPayments = await request(app)
      .get(`/api/payments?userId=${state.user.id}&limit=10`)
      .set('Authorization', `Bearer ${state.admin.token}`);

    assert.equal(adminPayments.status, 200);
    assert.ok(adminPayments.body.some((row) => row.contract_id === state.userContractId));

    await dbRun('UPDATE contracts SET status = ? WHERE id = ?', ['expired', state.userContractId]);
    await dbRun('UPDATE cabinets SET status = ?, current_contract_id = NULL WHERE id = ?', ['available', state.cabinet1Id]);
  });

  await t.test('T-025: PIN access authentication succeeds', async () => {
    const res = await request(app)
      .post('/api/access/authenticate')
      .set('X-Device-Key', 'pin-success-device-2')
      .send({ warehouse_id: state.warehouseId, auth_method: 'pin', auth_value: '1234' });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  await t.test('T-025B: emergency access PIN opens door and records audit log', async () => {
    process.env.NOTIFICATION_MOCK = 'true';
    process.env.EMERGENCY_ACCESS_PIN = '0000';

    const res = await request(app)
      .post('/api/access/emergency')
      .set('X-Device-Key', 'emergency-device')
      .send({ warehouse_id: state.warehouseId, pin: '0000' });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.emergency, true);

    const log = await dbGet(
      'SELECT * FROM access_logs WHERE warehouse_id = ? AND note LIKE ? ORDER BY id DESC',
      [state.warehouseId, '%Emergency access granted%'],
    );
    assert.ok(log);
    assert.equal(log.success, 1);
  });

  await t.test('T-026: OTP access authentication succeeds', async () => {
    const contract = await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${state.admin.token}`)
      .send({
        user_id: state.admin.id,
        cabinet_id: state.cabinet2Id,
        start_date: '2026-08-01',
        end_date: '2026-09-01',
        total_amount: 50000,
      });

    assert.equal(contract.status, 201);
    state.contract2Id = pickId(contract.body, 'id', 'contractId');

    const res = await request(app)
      .post('/api/access/authenticate')
      .set('X-Device-Key', 'otp-success-device')
      .send({
        warehouse_id: state.warehouseId,
        auth_method: 'otp',
        auth_value: generateOtp('01011112222'),
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  await t.test('T-027: QR access authentication succeeds', async () => {
    const res = await request(app)
      .post('/api/access/authenticate')
      .set('X-Device-Key', 'qr-success-device')
      .send({
        warehouse_id: state.warehouseId,
        auth_method: 'qr',
        auth_value: String(state.contract2Id),
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  await t.test('T-028: access logs are recorded', async () => {
    const res = await request(app)
      .get(`/api/warehouses/${state.warehouseId}/access-logs`)
      .set('Authorization', `Bearer ${state.admin.token}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 3);
    assert.ok(res.body.some((row) => row.auth_method === 'pin' && row.success === 1));
  });

  await t.test('T-028B: access log list is filtered by role', async () => {
    const adminLogs = await request(app)
      .get(`/api/access/logs?warehouseId=${state.warehouseId}&limit=10`)
      .set('Authorization', `Bearer ${state.admin.token}`);

    assert.equal(adminLogs.status, 200);
    assert.ok(adminLogs.body.length >= 3);

    const userLogs = await request(app)
      .get(`/api/access/logs?warehouseId=${state.warehouseId}&limit=10`)
      .set('Authorization', `Bearer ${state.user.token}`);

    assert.equal(userLogs.status, 200);
    assert.ok(userLogs.body.every((row) => row.user_id === state.user.id));
  });

  await t.test('T-028C: config and hardware spec paths are available', async () => {
    const config = await request(app).get('/api/config');
    assert.equal(config.status, 200);
    assert.equal(typeof config.body.mockPayment, 'boolean');
    assert.equal(typeof config.body.mockNotification, 'boolean');
    assert.equal(typeof config.body.emergencyPinSet, 'boolean');
    assert.equal(typeof config.body.featureFlags, 'object');

    const status = await request(app)
      .get('/api/hardware/status')
      .set('Authorization', `Bearer ${state.admin.token}`);
    assert.equal(status.status, 200);
    assert.ok(Array.isArray(status.body));

    const devices = await request(app)
      .get('/api/hardware/devices')
      .set('Authorization', `Bearer ${state.admin.token}`);
    assert.equal(devices.status, 200);
    assert.ok(devices.body.some((row) => row.id === state.cabinet1Id));
  });

  await t.test('T-029: access authentication is rate limited on 11th request within 60 seconds', async () => {
    const agent = request(app);
    let res;

    for (let i = 0; i < 11; i += 1) {
      res = await agent
        .post('/api/access/authenticate')
        .set('X-Device-Key', 'rate-limit-device')
        .send({
          warehouse_id: state.warehouseId,
          auth_method: 'unsupported',
          auth_value: 'same-rate-limit-value',
        });
    }

    assert.equal(res.status, 429);
  });

  await t.test('T-030: access authentication locks out after 10 failures', async () => {
    const agent = request(app);
    for (let i = 0; i < 10; i += 1) {
      const fail = await agent
        .post('/api/access/authenticate')
        .set('X-Device-Key', 'lockout-device')
        .send({
          warehouse_id: state.warehouseId,
          auth_method: 'pin',
          auth_value: '8888',
        });
      assert.equal(fail.status, 401);
    }

    const locked = await agent
      .post('/api/access/authenticate')
      .set('X-Device-Key', 'lockout-device')
      .send({
        warehouse_id: state.warehouseId,
        auth_method: 'pin',
        auth_value: '8888',
      });

    assert.equal(locked.status, 423);
  });

  await t.test('T-031: failed access attempts are logged', async () => {
    const rows = await dbAll(
      'SELECT * FROM access_logs WHERE warehouse_id = ? AND success = 0 ORDER BY id DESC',
      [state.warehouseId],
    );

    assert.ok(rows.length >= 10);
    assert.ok(rows.some((row) => row.auth_method === 'pin' && row.note.includes('PIN 인증 실패')));
  });
});

test.after(async () => {
  stopBackgroundJobs();
  await wait(3200);
  await new Promise((resolve) => db.close(resolve));
  fs.rmSync(process.env.DB_PATH, { force: true });
});
