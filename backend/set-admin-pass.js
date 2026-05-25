const bcryptjs = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

async function main() {
  const hashed = await bcryptjs.hash('1234', 10);
  const db = new sqlite3.Database('./warehouse.db');
  
  db.run("UPDATE users SET password = ? WHERE username = 'screenshot_admin'", [hashed], function(err) {
    if (err) console.error(err);
    else {
      console.log('Password updated');
      db.get("SELECT id, username FROM users WHERE id = 1", [], (err, row) => {
        console.log('User:', JSON.stringify(row));
        db.close();
      });
    }
  });
}

main();
