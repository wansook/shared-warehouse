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
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data: data }); }
      });
    });
    req.on('error', e => reject(e));
    if (postData) req.write(postData);
    req.end();
  });
}

async function test() {
  console.log('=== Final E2E Test ===\n');
  
  const login = await request('POST', '/api/login', { username: 'admin', password: 'admin1234' });
  console.log('[1] Login:', login.data.message, '✅');
  const token = login.data.token;
  const auth = { Authorization: 'Bearer ' + token };

  const warehouses = await request('GET', '/api/warehouses', null, auth);
  console.log('[2] Warehouses:', warehouses.data.length, '개 ✅');

  const cabinets = await request('GET', '/api/warehouses/2/cabinets', null, auth);
  const sizes = {};
  cabinets.data.forEach(c => { sizes[c.size] = (sizes[c.size] || 0) + 1; });
  console.log('[3] Cabinets:', cabinets.data.length, '개 ✅');
  Object.entries(sizes).forEach(([k, v]) => console.log('    ', k + ':', v));

  const layout = await request('GET', '/api/warehouses/2/layout', null, auth);
  console.log('[4] Layout:', layout.data.length, '개 ✅');

  const available = cabinets.data.find(c => c.status === 'available');
  const contract = await request('POST', '/api/contracts', {
    cabinet_id: available.id,
    start_date: new Date().toISOString().slice(0, 16),
    end_date: new Date(Date.now() + 2592000000).toISOString().slice(0, 16),
    total_amount: 150000
  }, auth);
  console.log('[5] Contract:', contract.data.message, '✅ ID:', contract.data.contractId);

  const payment = await request('POST', '/api/payments/mock', {
    contract_id: contract.data.contractId,
    amount: 150000
  }, auth);
  console.log('[6] Mock Payment:', payment.data.message, '✅ Key:', payment.data.paymentKey);

  const hw = await request('POST', '/api/hardware/open', { warehouse_id: 2 }, auth);
  console.log('[7] Hardware Open:', hw.data.message, '✅');

  const contracts = await request('GET', '/api/contracts', null, auth);
  console.log('[8] Contracts:', contracts.data.length, '개 ✅');

  console.log('\n=== All Tests Passed ===');
}

test().catch(e => console.error('FAIL:', e.message));
