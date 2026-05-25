const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'backend', 'warehouse.db');
const db = new sqlite3.Database(dbPath);

console.log('=== DB Schema Check ===\n');

// contracts 테이블
db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='contracts'", [], (err, row) => {
  if (err) { console.log('Error:', err.message); return; }
  console.log('contracts table:');
  console.log(row.sql);
  console.log('\n=== contracts columns ===');
  db.all("PRAGMA table_info(contracts)", [], (err, cols) => {
    if (err) { console.log('Error:', err.message); return; }
    cols.forEach(c => console.log(`  ${c.name} (${c.type}) default: ${c.dflt_value}`));
    db.close();
  });
});
