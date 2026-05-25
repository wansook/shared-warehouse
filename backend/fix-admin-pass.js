const bcryptjs = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function main() {
  const hashed = await bcryptjs.hash('admin1234', 10);
  const db = new sqlite3.Database(path.resolve(__dirname, 'warehouse.db'));
  db.run("UPDATE users SET password = ? WHERE username = 'admin'", [hashed], (err) => {
    if (err) console.error(err);
    else console.log('admin password updated');
    db.close();
  });
}
main();
