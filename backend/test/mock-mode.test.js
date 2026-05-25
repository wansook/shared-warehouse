const assert = require('node:assert/strict');
const test = require('node:test');

test('PAYMENT_MOCK=true prevents Toss PG calls even with a secret key', async () => {
  process.env.PAYMENT_MOCK = 'true';
  process.env.TOSS_PG_SECRET_KEY = 'test_dummy_toss_pg_secret_key';

  const pgToss = require('../pg-toss');

  const created = await pgToss.createPayment('order_mock_1', 'Mock order', 1000);
  assert.equal(created.success, true);
  assert.equal(created.mock, true);
  assert.equal(created.orderId, 'order_mock_1');

  const confirmed = await pgToss.confirmPayment('payment_mock_1', 'order_mock_1', 1000);
  assert.equal(confirmed.success, true);
  assert.equal(confirmed.mock, true);
});

test('NOTIFICATION_MOCK=true prevents FCM/Kakao/SMS external calls', async () => {
  process.env.NOTIFICATION_MOCK = 'true';
  process.env.FCM_PROJECT_ID = 'test-dummy-fcm-project';
  process.env.FCM_SERVICE_ACCOUNT_JSON = '{"type":"service_account","project_id":"test-dummy-fcm-project","private_key_id":"dummy","private_key":"dummy","client_email":"dummy@example.com"}';
  process.env.KAKAO_ALIMTALK_API_URL = 'https://example.invalid/mock/alimtalk';
  process.env.KAKAO_ALIMTALK_API_KEY = 'test_dummy_kakao_alimtalk_api_key';
  process.env.KAKAO_ALIMTALK_SENDER_KEY = 'test_dummy_sender_key';
  process.env.SMS_API_URL = 'https://example.invalid/mock/sms';
  process.env.SMS_API_KEY = 'test_dummy_sms_api_key';
  process.env.SMS_SENDER_PHONE = '01000000000';

  const fcmPush = require('../fcm-push');
  const notificationApi = require('../kakao-alimtalk');

  const fcm = await fcmPush.sendFCMPush(['dummy-token'], 'title', 'body');
  assert.equal(fcm.success, true);
  assert.equal(fcm.mock, true);
  assert.equal(fcm.failureCount, 0);

  const kakao = await notificationApi.sendKakaoAlimtalk('01012345678', 'template_mock', { name: 'tester' });
  assert.equal(kakao.success, true);
  assert.equal(kakao.mock, true);

  const sms = await notificationApi.sendSMS('01012345678', 'mock sms');
  assert.equal(sms.success, true);
  assert.equal(sms.mock, true);
});
