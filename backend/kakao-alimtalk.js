const https = require('https');

function isNotificationMock() {
  return String(process.env.NOTIFICATION_MOCK || '').toLowerCase() === 'true';
}

function postJson(urlString, body, headers = {}) {
  return new Promise((resolve) => {
    const url = new URL(urlString);
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = {};
        try {
          parsed = data ? JSON.parse(data) : {};
        } catch {
          parsed = { raw: data };
        }
        resolve({ success: res.statusCode >= 200 && res.statusCode < 300, statusCode: res.statusCode, ...parsed });
      });
    });

    req.on('timeout', () => req.destroy(new Error('Notification request timed out.')));
    req.on('error', (error) => resolve({ success: false, error: error.message }));
    req.write(payload);
    req.end();
  });
}

function renderTemplateVariables(message, variables = {}) {
  return Object.entries(variables).reduce(
    (text, [key, value]) => text.replaceAll(`#{${key}}`, String(value)),
    message || ''
  );
}

async function sendKakaoAlimtalk(phone, templateId, variables = {}) {
  if (isNotificationMock()) {
    return {
      success: true,
      mock: true,
      recipient: String(phone).replace(/\D/g, ''),
      templateId,
      variables,
    };
  }

  const apiUrl = process.env.KAKAO_ALIMTALK_API_URL;
  const apiKey = process.env.KAKAO_ALIMTALK_API_KEY || process.env.KAKAO_TALK_API_KEY;
  const senderKey = process.env.KAKAO_ALIMTALK_SENDER_KEY;
  const senderPhone = process.env.KAKAO_ALIMTALK_SENDER_PHONE || process.env.KAKAO_ADMIN_PHONE;

  if (!apiUrl || !apiKey || !senderKey) {
    return {
      success: false,
      error: 'Kakao Alimtalk is not configured. Set KAKAO_ALIMTALK_API_URL, KAKAO_ALIMTALK_API_KEY, and KAKAO_ALIMTALK_SENDER_KEY.',
    };
  }

  return postJson(apiUrl, {
    senderKey,
    senderPhone,
    recipient: String(phone).replace(/\D/g, ''),
    templateId,
    variables,
  }, {
    Authorization: `Bearer ${apiKey}`,
  });
}

async function sendSMS(phone, message) {
  if (isNotificationMock()) {
    return {
      success: true,
      mock: true,
      recipient: String(phone).replace(/\D/g, ''),
      message,
    };
  }

  const apiUrl = process.env.SMS_API_URL;
  const apiKey = process.env.SMS_API_KEY;
  const senderPhone = process.env.SMS_SENDER_PHONE || process.env.KAKAO_ADMIN_PHONE;

  if (!apiUrl || !apiKey || !senderPhone) {
    return {
      success: false,
      error: 'SMS is not configured. Set SMS_API_URL, SMS_API_KEY, and SMS_SENDER_PHONE.',
    };
  }

  return postJson(apiUrl, {
    from: senderPhone,
    to: String(phone).replace(/\D/g, ''),
    text: message,
  }, {
    Authorization: `Bearer ${apiKey}`,
  });
}

async function sendNotificationWithFallback(phone, templateId, variables = {}, fallbackMessage = '') {
  const alimtalk = await sendKakaoAlimtalk(phone, templateId, variables);
  if (alimtalk.success) return { channel: 'alimtalk', ...alimtalk };

  const smsText = fallbackMessage || renderTemplateVariables(variables.message || '', variables);
  const sms = await sendSMS(phone, smsText);
  return { channel: 'sms', alimtalkError: alimtalk.error || alimtalk.message, ...sms };
}

module.exports = {
  sendKakaoAlimtalk,
  sendSMS,
  sendNotificationWithFallback,
};
