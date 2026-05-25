const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const dbPath = path.resolve(__dirname, "warehouse.db");
const db = new sqlite3.Database(dbPath);

console.log("=== cabinet size CHECK 제약 보정 시작 ===");

db.serialize(() => {
  db.run('PRAGMA foreign_keys = OFF');

  // 기존 cabinets_new가 있으면 삭제
  db.run("DROP TABLE IF EXISTS cabinets_new");

  // 새 테이블 생성 (XL/XXL 포함)
  db.run(`CREATE TABLE cabinets_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT, warehouse_id INTEGER NOT NULL,
    size TEXT CHECK(size IN ('S', 'M', 'L', 'XL', 'XXL')),
    relay_channel INTEGER,
    status TEXT DEFAULT 'available' CHECK(status IN ('available','occupied','maintenance','expired_soon','expired')),
    current_contract_id INTEGER,
    position_x INTEGER DEFAULT 0, position_y INTEGER DEFAULT 0,
    position_index INTEGER DEFAULT 0, layout_data TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
    FOREIGN KEY (current_contract_id) REFERENCES contracts(id))`,
  function(err) {
    if (err) { console.error("테이블 생성 실패:", err.message); return; }
    console.log("✓ 새 테이블 생성 완료");

    // 기존 데이터 복사
    db.run(`INSERT INTO cabinets_new
      (id, warehouse_id, size, relay_channel, status, current_contract_id, position_x, position_y, position_index, layout_data, created_at, updated_at)
      SELECT id, warehouse_id, size, relay_channel, status, current_contract_id, position_x, position_y, position_index, layout_data, created_at, updated_at FROM cabinets`,
    function(err) {
      if (err) { console.error("데이터 복사 실패:", err.message); return; }
      console.log(`✓ ${this.changes}개 cabinet 데이터 복사 완료`);

      // 기존 테이블 삭제
      db.run("DROP TABLE cabinets", function(err) {
        if (err) { console.error("기존 테이블 삭제 실패:", err.message); return; }
        console.log("✓ 기존 cabinets 테이블 삭제 완료");

        // 새 테이블로 이름 변경
        db.run("ALTER TABLE cabinets_new RENAME TO cabinets", function(err) {
          if (err) { console.error("테이블 이름 변경 실패:", err.message); return; }
          console.log("✓ cabinets_new → cabinets 이름 변경 완료");

          db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='cabinets'", [], (err, row) => {
            if (err) console.error("에러:", err.message);
            else {
              console.log("\n=== 새 cabinet 테이블 구조 ===");
              console.log(row.sql);
            }
          });

          db.run('PRAGMA foreign_keys = ON');
          db.close();
          console.log("\n✅ cabinet size 제약 보정 완료 (S/M/L/XL/XXL)");
        });
      });
    });
  });
});
