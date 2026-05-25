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
  // Login
  const login = await request('POST', '/api/login', { username: 'admin', password: 'admin1234' });
  const token = login.data.token;
  const auth = { Authorization: '***' + token };

  // Get cabinets
  const cabinets = await request('GET', '/api/warehouses/2/cabinets', null, auth);
  console.log('Available cabinets:');
  cabinets.data.filter(c => c.status === 'available').forEach(c => {
    console.log('  id:', c.id, '| size:', c.size, '| status:', c.status);
  });
  
  // Pick first available cabinet
  const available = cabinets.data.find(c => c.status === 'available');
  if (available) {
    console.log('\nCreating contract for cabinet_id:', available.id);
    
    // Create contract
    const contract = await request('POST', '/api/contracts', {
      cabinet_id: available.id,
      start_date: new Date().toISOString().slice(0, 16),
      end_date: new Date(Date.now() + 2592000000).toISOString().slice(0, 16),
      total_amount: 150000
    }, auth);
    console.log('Contract result:', contract.data.message, contract.data.contractId);
    
    // Mock payment
    if (contract.data.contractId) {
      const payment = await request('POST', '/api/payments/mock', {
        contract_id: contract.data.contractId,
        amount: 150000
      }, auth);
      console.log('Payment result:', payment.data.message, payment.data.paymentKey);
    }
  }
}

test().catch(e => console.error('Error:', e.message));
