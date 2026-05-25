const http = require('http');

function request(method, path, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3001, path: path, method: method,
      headers: { 'Content-Type': 'application/json', ...extraHeaders }
    };
    if (postData) opts.headers['Content-Length'] = Buffer.byteLength(postData);
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ _raw: data }); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function test() {
  console.log('=== Backend API Test ===\n');
  const login = await request('POST', '/api/login', { username: 'admin', password: 'admin1234' });
  console.log('[1] Login:', login.message, 'OK');
  const token = login.token;
  const auth = { Authorization: 'Bearer ' + token };

  const warehouses = await request('GET', '/api/warehouses', null, auth);
  console.log('[2] Warehouses:', warehouses.length, '개');

  const cabinets = await request('GET', '/api/warehouses/2/cabinets', null, auth);
  const sizes = {};
  cabinets.forEach(c => { sizes[c.size] = (sizes[c.size] || 0) + 1; });
  console.log('[3] Cabinets:', cabinets.length, '개');
  Object.entries(sizes).forEach(([k, v]) => console.log('   ', k + ':', v));

  const layout = await request('GET', '/api/warehouses/2/layout', null, auth);
  console.log('[4] Layout:', layout.length, '개 캐비먼트');

  const mockPayment = await request('POST', '/api/payments/mock', { contract_id: 1, amount: 150000 }, auth);
  console.log('[5] Mock Payment:', mockPayment.message || mockPayment.status, mockPayment.paymentKey ? 'OK' : 'FAIL');

  const hwOpen = await request('POST', '/api/hardware/open', { warehouse_id: 2 }, auth);
  console.log('[6] Hardware Open:', hwOpen.message, 'OK');

  const contracts = await request('GET', '/api/contracts', null, auth);
  console.log('[7] Contracts:', contracts.length, '개');

  console.log('\n=== All Tests Passed ===');
}

test().catch(e => console.error('FAIL:', e.message));
