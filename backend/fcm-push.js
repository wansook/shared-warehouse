let admin = null;
let initialized = false;

function isNotificationMock() {
  return String(process.env.NOTIFICATION_MOCK || '').toLowerCase() === 'true';
}

function loadFirebaseAdmin() {
  if (admin) return admin;
  try {
    admin = require('firebase-admin');
    return admin;
  } catch {
    return null;
  }
}

function parseServiceAccount() {
  if (process.env.FCM_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON);
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return null;
  }
  return null;
}

function initializeFCM() {
  if (isNotificationMock()) {
    initialized = true;
    return { success: true, initialized: true, mock: true };
  }

  if (initialized) return { success: true, initialized: true };

  const firebaseAdmin = loadFirebaseAdmin();
  if (!firebaseAdmin) {
    return {
      success: false,
      initialized: false,
      error: 'firebase-admin package is not installed.',
    };
  }

  if (firebaseAdmin.apps.length > 0) {
    initialized = true;
    return { success: true, initialized: true };
  }

  const serviceAccount = parseServiceAccount();
  const credential = serviceAccount
    ? firebaseAdmin.credential.cert(serviceAccount)
    : firebaseAdmin.credential.applicationDefault();

  firebaseAdmin.initializeApp({
    credential,
    projectId: process.env.FCM_PROJECT_ID || serviceAccount?.project_id,
  });
  initialized = true;
  return { success: true, initialized: true };
}

async function sendFCMPush(tokens, title, body, data = {}) {
  const tokenList = Array.isArray(tokens) ? tokens.filter(Boolean) : [tokens].filter(Boolean);
  if (tokenList.length === 0) {
    return { success: false, error: 'No FCM registration token provided.' };
  }

  if (isNotificationMock()) {
    return {
      success: true,
      mock: true,
      successCount: tokenList.length,
      failureCount: 0,
      responses: tokenList.map(() => ({ success: true })),
    };
  }

  const init = initializeFCM();
  if (!init.success) return init;

  const firebaseAdmin = loadFirebaseAdmin();
  const response = await firebaseAdmin.messaging().sendEachForMulticast({
    tokens: tokenList,
    notification: { title, body },
    data: Object.fromEntries(Object.entries(data || {}).map(([key, value]) => [key, String(value)])),
  });

  return {
    success: response.failureCount === 0,
    successCount: response.successCount,
    failureCount: response.failureCount,
    responses: response.responses,
  };
}

module.exports = {
  initializeFCM,
  sendFCMPush,
};
