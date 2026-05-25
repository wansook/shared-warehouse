const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const dbPath = './warehouse.db';

const password = '1234';

bcrypt.hash(password, 10, (err, hash) => {
  if (err) { console.error('bcrypt error:', err); process.exit(1); }
  
  const db = new sqlite3.Database(dbPath);
  db.run("UPDATE users SET password = ? WHERE username = 'admin'", [hash], (err) => {
    if (err) { console.error('Update error:', err); }
    else { console.log('✅ Password reset to: 1234'); }
    db.close();
  });
});
