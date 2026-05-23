const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.OTP_SECRET = 'test-otp-secret';
process.env.DB_PATH = path.join(os.tmpdir(), `shared-warehouse-smoke-${process.pid}.db`);

const { app, db, stopBackgroundJobs } = require('../server');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('server health, login flow, and warehouse list smoke test', async () => {
  await wait(200);

  const health = await request(app).get('/health').expect(200);
  assert.equal(health.body.status, 'ok');

  await request(app)
    .post('/api/register')
    .send({
      username: 'admin',
      email: 'admin@example.com',
      password: 'password123',
      phone: '01012345678',
    })
    .expect(201);

  const login = await request(app)
    .post('/api/login')
    .send({ username: 'admin', password: 'password123' })
    .expect(200);

  assert.ok(login.body.token);

  const warehouses = await request(app)
    .get('/api/warehouses')
    .set('Authorization', `Bearer ${login.body.token}`)
    .expect(200);

  assert.ok(Array.isArray(warehouses.body));
});

test.after(() => {
  stopBackgroundJobs();
  db.close();
});
