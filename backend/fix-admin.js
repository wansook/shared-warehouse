const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./warehouse.db');

// 현재 사용자 확인
db.all('SELECT id, username, role FROM users', [], (err, rows) => {
  if (err) { console.error('Error:', err); return; }
  console.log('Current users:', JSON.stringify(rows));
});

// admin 사용자 role 변경
db.run("UPDATE users SET role = 'admin' WHERE username = 'admin'", (err) => {
  if (err) console.error('Update error:', err);
  else console.log('Admin role updated');
  
  // 확인
  db.get("SELECT id, username, role FROM users WHERE username = 'admin'", [], (err, row) => {
    console.log('Admin user:', JSON.stringify(row));
    
    // testuser에게 PIN 설정
    db.run("UPDATE users SET pin_code = '1234' WHERE username = 'testuser'", (err) => {
      if (err) console.error('PIN update error:', err);
      else console.log('Test user PIN set to 1234');
      
      db.all('SELECT id, username, role, pin_code FROM users', [], (err, rows) => {
        console.log('All users after update:', JSON.stringify(rows));
        db.close();
      });
    });
  });
});
