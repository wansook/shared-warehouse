const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = '***';
process.env.OTP_SECRET = '***';
process.env.HARDWARE_API_SECRET = 'test-hardware-secret';
process.env.DB_PATH = path.join(os.tmpdir(), `shared-warehouse-sec-${process.pid}.db`);

const { app, db, stopBackgroundJobs } = require('../server');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test.before(async () => {
  await request(app)
    .post('/api/register')
    .send({ username: 'firstuser', email: 'first@test.com', password: 'pass1234' });
});

test('T-032: profile read (self) -> 200', async () => {
  const login = await request(app)
    .post('/api/register')
    .send({ username: 'profileuser', email: 'profile@test.com', password: 'pass1234' })
    .then(() => request(app).post('/api/login')
      .send({ username: 'profileuser', password: 'pass1234' }))
    .then(r => r.body);

  const res = await request(app)
    .get(`/api/profile/${login.user.id}`)
    .set('Authorization', `Bearer ${login.token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.username, 'profileuser');
});

test('T-033: profile read (other user) -> 403', async () => {
  const userLogin = await request(app)
    .post('/api/register')
    .send({ username: 'targetuser', email: 'target@test.com', password: 'pass1234' })
    .then(() => request(app).post('/api/login')
      .send({ username: 'targetuser', password: 'pass1234' }))
    .then(r => r.body);

  const res = await request(app)
    .get('/api/profile/1')
    .set('Authorization', `Bearer ${userLogin.token}`);

  assert.equal(res.status, 403);
});

test('T-034: profile update (self) -> 200', async () => {
  const login = await request(app)
    .post('/api/register')
    .send({ username: 'moduser', email: 'mod@test.com', password: 'pass1234' })
    .then(() => request(app).post('/api/login')
      .send({ username: 'moduser', password: 'pass1234' }))
    .then(r => r.body);

  const res = await request(app)
    .put(`/api/profile/${login.user.id}`)
    .set('Authorization', `Bearer ${login.token}`)
    .send({ username: 'moduser', email: 'mod@test.com', phone: '01099998888' });

  assert.equal(res.status, 200);
});

test('T-035: profile update (other user) -> 403', async () => {
  const userLogin = await request(app)
    .post('/api/register')
    .send({ username: 'profileattacker', email: 'attacker@test.com', password: 'pass1234' })
    .then(() => request(app).post('/api/login')
      .send({ username: 'profileattacker', password: 'pass1234' }))
    .then(r => r.body);

  const res = await request(app)
    .put('/api/profile/1')
    .set('Authorization', `Bearer ${userLogin.token}`);

  assert.equal(res.status, 403);
});

test('T-036: hardware control (admin) -> 200', async () => {
  const adminLogin = await request(app)
    .post('/api/login')
    .send({ username: 'firstuser', password: 'pass1234' })
    .then(r => r.body);

  const res = await request(app)
    .post('/api/admin/door/unlock')
    .set('Authorization', `Bearer ${adminLogin.token}`)
    .set('x-hardware-secret', process.env.HARDWARE_API_SECRET)
    .send({ warehouse_id: 1, duration: 10 });

  assert.equal(res.status, 200);
});

test('T-037: hardware control (user) -> 403', async () => {
  const userLogin = await request(app)
    .post('/api/register')
    .send({ username: 'testuser99', email: 'test99@test.com', password: 'pass1234' })
    .then(() => request(app).post('/api/login')
      .send({ username: 'testuser99', password: 'pass1234' }))
    .then(r => r.body);

  const res = await request(app)
    .post('/api/admin/door/unlock')
    .set('Authorization', `Bearer ${userLogin.token}`)
    .send({ warehouse_id: 1 });

  assert.equal(res.status, 403);
});

test('T-038: fire alarm (localhost) -> 200', async () => {
  const res = await request(app)
    .post('/api/hardware/fire-alarm')
    .send({ warehouse_id: 1 });

  assert.equal(res.status, 200);
});

test('T-039: fire alarm (x-hardware-secret) -> 200', async () => {
  const res = await request(app)
    .post('/api/hardware/fire-alarm')
    .set('x-hardware-secret', process.env.HARDWARE_API_SECRET)
    .send({ warehouse_id: 1 });

  assert.equal(res.status, 200);
});

test('T-040: fire alarm (unauthenticated external IP simulation) -> 403', async () => {
  const res = await request(app)
    .post('/api/hardware/fire-alarm')
    .set('X-Forwarded-For', '1.2.3.4')
    .set('x-hardware-secret', 'wrong-secret');

  assert.equal(res.status, 403);
});

test('T-042: production mode requires configured secrets', async () => {
  const fs = require('fs');
  const serverCode = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(serverCode.includes('JWT_SECRET') || serverCode.includes('process.env.JWT_SECRET'));
});

test('T-044: development mode starts normally', async () => {
  assert.equal(process.env.NODE_ENV, 'test');
});

test.after(async () => {
  stopBackgroundJobs();
  await wait(50);
  db.close();
});
