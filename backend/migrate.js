const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./warehouse.db");
db.serialize(() => {
  db.run("ALTER TABLE contracts ADD COLUMN auto_renew INTEGER DEFAULT 0", function(err) {
    if (err) {
      console.log("이미 있거나 에러:", err.message);
    } else {
      console.log("auto_renew 필드 추가 완료");
    }
    db.close();
  });
});
