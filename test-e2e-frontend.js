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
        catch (e) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', e => reject(e));
    if (postData) req.write(postData);
    req.end();
  });
}

async function test() {
  console.log('=== Full E2E Integration Test ===\n');
  
  // 1. Login
  console.log('[1] Login...');
  const login = await request('POST', '/api/login', { username: 'admin', password: 'admin1234' });
  if (!login.data.token) { console.log('❌ Login failed:', login.data.message); process.exit(1); }
  console.log('✅ Login 성공 (token:', login.data.token.substring(0, 20) + '...)');
  
  const token = login.data.token;
  const auth = { Authorization: 'Bearer ' + token };

  // Verify token works
  const verify = await request('GET', '/api/config', null, auth);
  console.log('    Token verify:', verify.data.mockPayment);
  
  const auth2 = { Authorization: 'Bearer ' + token };

  // 2. Warehouses
  console.log('\n[2] Warehouses...');
  const warehouses = await request('GET', '/api/warehouses', null, auth);
  if (!Array.isArray(warehouses.data)) { console.log('❌ Warehouses failed'); process.exit(1); }
  console.log('✅ Warehouses:', warehouses.data.length, '개');

  // 3. Cabinets
  console.log('\n[3] Cabinets (warehouse 2)...');
  const cabinets = await request('GET', '/api/warehouses/2/cabinets', null, auth);
  if (!Array.isArray(cabinets.data)) { console.log('❌ Cabinets failed'); process.exit(1); }
  const sizes = {};
  cabinets.data.forEach(c => { sizes[c.size] = (sizes[c.size] || 0) + 1; });
  console.log('✅ Cabinets:', cabinets.data.length, '개');
  Object.entries(sizes).forEach(([k, v]) => console.log('    ', k + ':', v));

  // 4. Layout
  console.log('\n[4] Layout...');
  const layout = await request('GET', '/api/warehouses/2/layout', null, auth);
  if (!Array.isArray(layout.data)) { console.log('❌ Layout failed'); process.exit(1); }
  console.log('✅ Layout:', layout.data.length, '개 캐비먼트');

  // 5. Create Contract
  console.log('\n[5] Create Contract...');
  const available = cabinets.data.find(c => c.status === 'available');
  if (!available) { console.log('❌ No available cabinet'); process.exit(1); }
  console.log('    cabinet_id:', available.id, 'size:', available.size);
  
  const contract = await request('POST', '/api/contracts', {
    cabinet_id: available.id,
    start_date: new Date().toISOString().slice(0, 16),
    end_date: new Date(Date.now() + 2592000000).toISOString().slice(0, 16),
    total_amount: 150000
  }, auth);
  if (!contract.data.contractId) { 
    console.log('❌ Contract failed:', contract.data.message); 
    process.exit(1); 
  }
  console.log('✅ Contract 생성:', contract.data.message, 'ID:', contract.data.contractId);

  // 6. Mock Payment
  console.log('\n[6] Mock Payment...');
  const payment = await request('POST', '/api/payments/mock', {
    contract_id: contract.data.contractId,
    amount: 150000
  }, auth);
  if (!payment.data.paymentKey) { 
    console.log('❌ Payment failed:', payment.data.message); 
    process.exit(1); 
  }
  console.log('✅ Mock Payment:', payment.data.message);
  console.log('    paymentKey:', payment.data.paymentKey);

  // 7. Hardware Open
  console.log('\n[7] Hardware Open...');
  const hw = await request('POST', '/api/hardware/open', { warehouse_id: 2 }, auth);
  if (!hw.data.message || hw.data.message.includes('error')) {
    console.log('❌ Hardware failed:', hw.data.message);
    process.exit(1);
  }
  console.log('✅ Hardware Open:', hw.data.message);

  // 8. Contracts List
  console.log('\n[8] Contracts List...');
  const contracts = await request('GET', '/api/contracts', null, auth);
  if (!Array.isArray(contracts.data)) { console.log('❌ Contracts failed'); process.exit(1); }
  console.log('✅ Contracts:', contracts.data.length, '개');

  // 9. Access Logs
  console.log('\n[9] Access Logs...');
  const logs = await request('GET', '/api/access/logs', null, auth);
  if (!Array.isArray(logs.data)) { console.log('❌ Access logs failed'); process.exit(1); }
  console.log('✅ Access Logs:', logs.data.length, '개');

  // 10. Profile
  console.log('\n[10] Profile...');
  const profile = await request('GET', '/api/profile/1', null, auth);
  if (!profile.data || profile.data.id !== 1) { console.log('❌ Profile failed'); process.exit(1); }
  console.log('✅ Profile:', profile.data.username, '(', profile.data.role, ')');

  console.log('\n=== ✅ All E2E Tests Passed ===');
  console.log('Total: 10 tests, 0 failures');
}

test().catch(e => {
  console.error('\n❌ FATAL ERROR:', e.message);
  process.exit(1);
});
