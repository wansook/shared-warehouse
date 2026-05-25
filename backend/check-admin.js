const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const dbPath = path.resolve(__dirname, "warehouse.db");
const db = new sqlite3.Database(dbPath);

db.get(`SELECT id, username, role, created_at FROM users WHERE username = 'admin'`, [], (err, row) => {
  if (err) {
    console.error("에러:", err.message);
    db.close();
    return;
  }
  if (!row) {
    console.log("admin 계정이 없습니다.");
    db.close();
    return;
  }
  console.log("admin 계정 정보:", row);
  console.log("\npassword hash (일부):", row.password ? row.password.substring(0, 30) + "..." : "없음");
  db.close();
});
