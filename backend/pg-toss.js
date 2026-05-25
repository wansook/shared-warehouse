const https = require('https');
const crypto = require('crypto');

const TOSS_API_HOST = 'api.tosspayments.com';
const TOSS_API_BASE_PATH = '/v1';

function getSecretKey() {
  return process.env.TOSS_PG_SECRET_KEY || '';
}

function isPaymentMock() {
  return String(process.env.PAYMENT_MOCK || '').toLowerCase() === 'true';
}

function getClientBaseUrl() {
  return process.env.PUBLIC_CLIENT_URL || process.env.CLIENT_URL || 'http://localhost:3000';
}

function basicAuth(secretKey) {
  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
}

function normalizeError(payload, fallback) {
  return payload?.message || payload?.error || payload?.code || fallback;
}

function tossRequest(method, path, body, options = {}) {
  const secretKey = getSecretKey();
  return new Promise((resolve) => {
    if (!secretKey) {
      resolve({
        success: false,
        statusCode: 500,
        error: 'TOSS_PG_SECRET_KEY is not configured.',
      });
      return;
    }

    const payload = body ? JSON.stringify(body) : '';
    const req = https.request({
      hostname: TOSS_API_HOST,
      path: `${TOSS_API_BASE_PATH}${path}`,
      method,
      timeout: options.timeoutMs || 65000,
      headers: {
        Authorization: basicAuth(secretKey),
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
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
        resolve({
          success: res.statusCode >= 200 && res.statusCode < 300,
          statusCode: res.statusCode,
          ...parsed,
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Toss Payments request timed out.'));
    });
    req.on('error', (error) => {
      resolve({ success: false, statusCode: 502, error: error.message });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function buildOrderId(prefix = 'order') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

async function createPayment(orderId, orderName, amount, customerEmail, customerName, customerMobilePhone) {
  if (isPaymentMock()) {
    return {
      success: true,
      mock: true,
      paymentKey: `mock_${Date.now()}`,
      orderId: String(orderId || buildOrderId('contract')),
      orderName: String(orderName || 'Shared warehouse contract').slice(0, 100),
      amount: Number(amount),
      checkoutUrl: '',
      method: 'CARD',
    };
  }

  const clientBaseUrl = getClientBaseUrl();
  const body = {
    method: 'CARD',
    amount: Number(amount),
    currency: 'KRW',
    orderId: String(orderId || buildOrderId('contract')),
    orderName: String(orderName || 'Shared warehouse contract').slice(0, 100),
    successUrl: `${clientBaseUrl}/payment/success`,
    failUrl: `${clientBaseUrl}/payment/fail`,
    flowMode: 'DEFAULT',
  };

  if (customerEmail) body.customerEmail = customerEmail;
  if (customerName) body.customerName = customerName;
  if (customerMobilePhone) body.customerMobilePhone = String(customerMobilePhone).replace(/\D/g, '');

  const result = await tossRequest('POST', '/payments', body, {
    idempotencyKey: `payment-${body.orderId}`,
  });

  if (!result.success) {
    return { success: false, statusCode: result.statusCode, error: normalizeError(result, 'Failed to create Toss payment.') };
  }

  return {
    success: true,
    paymentKey: result.paymentKey,
    orderId: result.orderId,
    orderName: result.orderName,
    amount: result.totalAmount || result.amount || body.amount,
    checkoutUrl: result.checkout?.url || '',
    method: result.method,
    raw: result,
  };
}

async function confirmPayment(paymentKey, orderId, amount) {
  if (isPaymentMock()) {
    return {
      success: true,
      mock: true,
      paymentKey,
      orderId: String(orderId),
      amount: Number(amount),
      method: 'CARD',
      approvalNumber: `approve_${Date.now()}`,
    };
  }

  const result = await tossRequest('POST', '/payments/confirm', {
    paymentKey,
    orderId: String(orderId),
    amount: Number(amount),
  }, {
    idempotencyKey: `confirm-${orderId}-${paymentKey}`,
  });

  if (!result.success) {
    return { success: false, statusCode: result.statusCode, error: normalizeError(result, 'Failed to confirm Toss payment.') };
  }

  return {
    success: true,
    paymentKey: result.paymentKey,
    orderId: result.orderId,
    orderName: result.orderName,
    amount: result.totalAmount,
    method: result.method,
    approvedAt: result.approvedAt,
    receiptUrl: result.receipt?.url || '',
    raw: result,
  };
}

async function requestBillingKey(cardNumber, expiry, birth, phone, customerEmail, customerName, customerKey) {
  if (isPaymentMock()) {
    return {
      success: true,
      mock: true,
      billingKey: `mock_billing_${Date.now()}`,
      customerKey: customerKey || crypto.randomUUID(),
      card: { number: String(cardNumber || '').replace(/\D/g, '').slice(-4) },
    };
  }

  const normalizedExpiry = String(expiry || '').replace(/\D/g, '');
  const body = {
    customerKey: customerKey || crypto.randomUUID(),
    cardNumber: String(cardNumber || '').replace(/\D/g, ''),
    cardExpirationYear: normalizedExpiry.slice(0, 2),
    cardExpirationMonth: normalizedExpiry.slice(2, 4),
    customerIdentityNumber: String(birth || '').replace(/\D/g, ''),
  };

  if (phone) body.customerMobilePhone = String(phone).replace(/\D/g, '');
  if (customerEmail) body.customerEmail = customerEmail;
  if (customerName) body.customerName = customerName;

  const result = await tossRequest('POST', '/billing/authorizations/card', body, {
    idempotencyKey: `billing-auth-${body.customerKey}`,
  });

  if (!result.success) {
    return { success: false, statusCode: result.statusCode, error: normalizeError(result, 'Failed to issue billing key.') };
  }

  return {
    success: true,
    billingKey: result.billingKey,
    customerKey: body.customerKey,
    card: result.card,
    authenticatedAt: result.authenticatedAt,
    raw: result,
  };
}

async function autoPayFromBilling(billingKey, orderId, amount, orderName, customerEmail, customerName) {
  if (isPaymentMock()) {
    return {
      success: true,
      mock: true,
      billingKey,
      paymentKey: `mock_auto_${Date.now()}`,
      orderId: String(orderId || buildOrderId('renewal')),
      amount: Number(amount),
      receiptUrl: '',
    };
  }

  const body = {
    amount: Number(amount),
    orderId: String(orderId || buildOrderId('renewal')),
    orderName: String(orderName || 'Shared warehouse renewal').slice(0, 100),
    customerEmail,
    customerName,
  };

  Object.keys(body).forEach((key) => body[key] === undefined && delete body[key]);

  const result = await tossRequest('POST', `/billing/${encodeURIComponent(billingKey)}`, body, {
    timeoutMs: 65000,
    idempotencyKey: `billing-pay-${body.orderId}`,
  });

  if (!result.success) {
    return { success: false, statusCode: result.statusCode, error: normalizeError(result, 'Failed to approve billing payment.') };
  }

  return {
    success: true,
    billingKey,
    paymentKey: result.paymentKey,
    orderId: result.orderId,
    amount: result.totalAmount,
    approvedAt: result.approvedAt,
    receiptUrl: result.receipt?.url || '',
    card: result.card,
    raw: result,
  };
}

async function cancelPayment(paymentKey, cancelAmount, cancelReason = 'Requested by administrator') {
  if (isPaymentMock()) {
    return {
      success: true,
      mock: true,
      paymentKey,
      cancels: [{ cancelAmount: cancelAmount ? Number(cancelAmount) : undefined, cancelReason }],
      receiptUrl: '',
    };
  }

  const body = { cancelReason };
  if (cancelAmount) body.cancelAmount = Number(cancelAmount);

  const result = await tossRequest('POST', `/payments/${encodeURIComponent(paymentKey)}/cancel`, body, {
    idempotencyKey: `cancel-${paymentKey}-${Date.now()}`,
  });

  if (!result.success) {
    return { success: false, statusCode: result.statusCode, error: normalizeError(result, 'Failed to cancel Toss payment.') };
  }

  return {
    success: true,
    paymentKey: result.paymentKey,
    cancels: result.cancels || [],
    receiptUrl: result.receipt?.url || '',
    raw: result,
  };
}

module.exports = {
  createPayment,
  confirmPayment,
  requestBillingKey,
  autoPayFromBilling,
  cancelPayment,
};
