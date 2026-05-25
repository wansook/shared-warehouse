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
  console.log('=== Debug Test ===\n');
  
  const login = await request('POST', '/api/login', { username: 'admin', password: 'admin1234' });
  console.log('[1] Login:', login.data.message);
  const token = login.data.token;
  const auth = { Authorization: '***' + token };

  // cabinet 확인
  const cabinets = await request('GET', '/api/warehouses/2/cabinets', null, auth);
  console.log('[2] Cabinets:', typeof cabinets.data, cabinets.data?.length);
  
  const available = cabinets.data?.find(c => c.status === 'available');
  console.log('[3] Available cabinet:', available ? `id=${available.id}, size=${available.size}, status=${available.status}` : 'None');

  // contract 생성
  if (available) {
    console.log('\n[4] Creating contract...');
    console.log('    body:', JSON.stringify({
      cabinet_id: available.id,
      start_date: new Date().toISOString().slice(0, 16),
      end_date: new Date(Date.now() + 2592000000).toISOString().slice(0, 16),
      total_amount: 150000
    }, null, 2));
    
    const contract = await request('POST', '/api/contracts', {
      cabinet_id: available.id,
      start_date: new Date().toISOString().slice(0, 16),
      end_date: new Date(Date.now() + 2592000000).toISOString().slice(0, 16),
      total_amount: 150000
    }, auth);
    console.log('[5] Contract status:', contract.status);
    console.log('[5] Contract data:', JSON.stringify(contract.data, null, 2));

    if (contract.data.contractId) {
      console.log('\n[6] Creating mock payment...');
      const payment = await request('POST', '/api/payments/mock', {
        contract_id: contract.data.contractId,
        amount: 150000
      }, auth);
      console.log('[6] Payment status:', payment.status);
      console.log('[6] Payment data:', JSON.stringify(payment.data, null, 2));
    }
  }
}

test().catch(e => console.error('Error:', e.message));
