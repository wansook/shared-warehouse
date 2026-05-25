const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const dbPath = path.resolve(__dirname, "warehouse.db");
const db = new sqlite3.Database(dbPath);

// 누락된 컬럼 추가
const columns = [
  "ALTER TABLE contracts ADD COLUMN current_contract_id INTEGER",
  "ALTER TABLE contracts ADD COLUMN previous_billing_key TEXT",
];

db.serialize(() => {
  columns.forEach((sql, i) => {
    db.run(sql, function(err) {
      if (err) {
        console.log(`컬럼 ${i} 추가: ${err.message}`);
      } else {
        console.log(`✓ 컬럼 ${i} 추가 성공`);
      }
    });
  });
  
  console.log("모든 컬럼 추가 완료");
  db.close();
});
