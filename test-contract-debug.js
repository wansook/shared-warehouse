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
        try { resolve({ status: res.statusCode, raw: data, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, raw: data, data: null }); }
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
  const auth = { Authorization: 'Bearer ' + token };

  // Get all cabinets with details
  const cabinets = await request('GET', '/api/warehouses/2/cabinets', null, auth);
  console.log('=== Cabinet Details ===');
  console.log('Total:', cabinets.data.length);
  console.log('\nCabinet 26:');
  const c26 = cabinets.data.find(c => c.id === 26);
  if (c26) {
    console.log('  id:', c26.id);
    console.log('  warehouse_id:', c26.warehouse_id);
    console.log('  size:', c26.size);
    console.log('  status:', c26.status);
    console.log('  current_contract_id:', c26.current_contract_id);
  } else {
    console.log('  Cabinet 26 NOT FOUND');
  }

  // Find all available cabinets
  console.log('\nAvailable cabinets:');
  cabinets.data.filter(c => c.status === 'available').forEach(c => {
    console.log('  id:', c.id, '| size:', c.size, '| warehouse_id:', c.warehouse_id);
  });

  // Try to get cabinet 26 directly
  console.log('\n=== Direct Cabinet Query ===');
  const directCabinet = await request('GET', '/api/warehouses/2/cabinets', null, auth);
  console.log('Status:', directCabinet.status);
  console.log('Cabinets found:', directCabinet.data?.length);

  // Check if contracts table has the right schema
  console.log('\n=== Creating Contract with detailed error ===');
  const testCabinet = cabinets.data.find(c => c.status === 'available');
  if (!testCabinet) { console.log('No available cabinet!'); return; }
  
  const contractBody = {
    cabinet_id: testCabinet.id,
    start_date: new Date().toISOString().slice(0, 16),
    end_date: new Date(Date.now() + 2592000000).toISOString().slice(0, 16),
    total_amount: 150000
  };
  console.log('Request body:', JSON.stringify(contractBody));
  
  const contract = await request('POST', '/api/contracts', contractBody, auth);
  console.log('Response status:', contract.status);
  console.log('Response raw:', contract.raw);
  console.log('Response data:', JSON.stringify(contract.data, null, 2));
}

test().catch(e => console.error('Error:', e.message));
