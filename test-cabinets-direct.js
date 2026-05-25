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
  console.log('[1] Login:', login.raw);
  const token = login.data.token;
  const auth = { Authorization: '***' + token };

  // Cabinets raw
  const cabinets = await request('GET', '/api/warehouses/2/cabinets', null, auth);
  console.log('\n[2] Cabinets:');
  console.log('    status:', cabinets.status);
  console.log('    raw:', cabinets.raw);
  console.log('    typeof data:', typeof cabinets.data);
  console.log('    isArray:', Array.isArray(cabinets.data));
  console.log('    length:', cabinets.data?.length);

  // Contracts raw
  const contracts = await request('GET', '/api/contracts', null, auth);
  console.log('\n[3] Contracts:');
  console.log('    status:', contracts.status);
  console.log('    raw:', contracts.raw);
  console.log('    typeof data:', typeof contracts.data);
  console.log('    isArray:', Array.isArray(contracts.data));
  console.log('    length:', contracts.data?.length);
}

test().catch(e => console.error('Error:', e.message));
