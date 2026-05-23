const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'warehouse.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('DB connection error:', err.message);
  else console.log(`SQLite connected: ${dbPath}`);
});

module.exports = db;
