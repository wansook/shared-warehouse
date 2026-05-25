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
  console.log('=== Contract + Mock Payment Test ===\n');
  
  // Login
  const login = await request('POST', '/api/login', { username: 'admin', password: 'admin1234' });
  console.log('[1] Login:', login.message, 'OK');
  const token = login.token;
  const auth = { Authorization: 'Bearer ' + token };

  // Create Contract (cabinet_id=26 is S#1)
  const contract = await request('POST', '/api/contracts', {
    cabinet_id: 26,
    start_date: new Date().toISOString().slice(0, 16),
    end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    total_amount: 150000
  }, auth);
  console.log('[2] Create Contract:', contract.message, 'ID:', contract.contractId);

  // Mock Payment with the new contract
  const mockPayment = await request('POST', '/api/payments/mock', {
    contract_id: contract.contractId,
    amount: 150000
  }, auth);
  console.log('[3] Mock Payment:', mockPayment.message, mockPayment.paymentKey ? 'OK' : 'FAIL');

  // Verify Contracts
  const contracts = await request('GET', '/api/contracts', null, auth);
  console.log('[4] Contracts:', contracts.length, '개');

  // Verify Hardware
  const hw = await request('POST', '/api/hardware/open', { warehouse_id: 2 }, auth);
  console.log('[5] Hardware Open:', hw.message, 'OK');

  console.log('\n=== All Tests Passed ===');
}

test().catch(e => console.error('FAIL:', e.message));
