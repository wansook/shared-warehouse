const http = require('http');

const BASE = {
  hostname: process.env.API_HOST || 'localhost',
  port: Number(process.env.API_PORT || 3001),
};

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined || body === null ? null : JSON.stringify(body);
    const options = {
      ...BASE,
      method,
      path,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    if (payload) {
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(options, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        let data = raw;
        try {
          data = raw ? JSON.parse(raw) : null;
        } catch (_) {
          // Keep raw text for non-JSON error pages.
        }
        resolve({ status: res.statusCode, headers: res.headers, data, raw });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function expectOk(step, response, allowed = [200, 201]) {
  const ok = allowed.includes(response.status);
  console.log(`${ok ? 'OK' : 'FAIL'} ${step}: HTTP ${response.status}`);
  if (!ok) {
    console.log('Response:', JSON.stringify(response.data, null, 2));
    throw new Error(`${step} failed with HTTP ${response.status}`);
  }
  return response.data;
}

function findCabinets(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.cabinets)) return payload.cabinets;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

async function main() {
  console.log(`Testing backend API at http://${BASE.hostname}:${BASE.port}`);

  const loginData = expectOk(
    'admin login',
    await request('POST', '/api/login', {
      username: process.env.ADMIN_USER || 'admin',
      password: process.env.ADMIN_PASS || 'admin1234',
    }),
  );

  const token = loginData && loginData.token;
  if (!token) {
    throw new Error('admin login did not return token');
  }

  const auth = { Authorization: `Bearer ${token}` };

  const cabinetsData = expectOk(
    'cabinet list warehouse_id=2',
    await request('GET', '/api/warehouses/2/cabinets', null, auth),
  );
  const cabinets = findCabinets(cabinetsData);
  console.log(`Cabinets returned: ${cabinets.length}`);

  const available = cabinets.find((cabinet) => cabinet.status === 'available');
  if (!available) {
    throw new Error('no available cabinet found in warehouse_id=2');
  }
  console.log(`Using cabinet id=${available.id}, size=${available.size}, relay_channel=${available.relay_channel}`);

  const now = new Date();
  const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const amount = Number(process.env.CONTRACT_AMOUNT || 150000);

  const contractData = expectOk(
    'create contract',
    await request(
      'POST',
      '/api/contracts',
      {
        cabinet_id: available.id,
        warehouse_id: 2,
        start_date: now.toISOString().slice(0, 16),
        end_date: end.toISOString().slice(0, 16),
        total_amount: amount,
        amount,
      },
      auth,
    ),
  );

  const contractId = contractData.contractId || contractData.id || contractData.contract_id;
  if (!contractId) {
    throw new Error('contract creation did not return contract id');
  }
  console.log(`Created contract id=${contractId}`);

  const paymentData = expectOk(
    'mock payment',
    await request(
      'POST',
      '/api/payments/mock',
      {
        contract_id: contractId,
        amount,
      },
      auth,
    ),
  );
  console.log('Payment response:', JSON.stringify(paymentData));

  const hardwareData = expectOk(
    'hardware open',
    await request(
      'POST',
      '/api/hardware/open',
      {
        warehouse_id: 2,
        cabinet_id: available.id,
        contract_id: contractId,
      },
      auth,
    ),
  );
  console.log('Hardware response:', JSON.stringify(hardwareData));

  console.log('All contract API steps completed.');
}

main().catch((err) => {
  console.error('Test failed:', err.message);
  process.exitCode = 1;
});
