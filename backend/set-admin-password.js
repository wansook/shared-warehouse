const bcrypt = require('bcrypt');
const db = require('./db');

const password = 'admin1234';

bcrypt.hash(password, 10, (err, hash) => {
  if (err) { console.error(err); process.exit(1); }
  
  db.run("UPDATE users SET password = ? WHERE username = 'admin'", [hash], (err) => {
    if (err) { console.error(err); process.exit(1); }
    console.log('Password updated successfully!');
    console.log('Username: admin');
    console.log('Password: admin1234');
    db.close();
  });
});
