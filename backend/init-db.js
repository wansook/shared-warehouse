const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.resolve(__dirname, 'warehouse.db');
const db = new sqlite3.Database(dbPath);

const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'admin1234';

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function ensureColumn(table, column, definition) {
  const columns = await all(`PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
    console.log(`Added ${table}.${column}`);
  }
}

async function createTables() {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    phone TEXT,
    pin_code TEXT,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS warehouses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER,
    name TEXT NOT NULL,
    location TEXT,
    capacity INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    layout_data TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS cabinets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id INTEGER NOT NULL,
    name TEXT,
    size TEXT CHECK(size IN ('S', 'M', 'L', 'XL', 'XXL')),
    relay_channel INTEGER,
    status TEXT DEFAULT 'available' CHECK(status IN ('available', 'occupied', 'maintenance', 'expired_soon', 'expired')),
    current_contract_id INTEGER,
    position_x INTEGER DEFAULT 0,
    position_y INTEGER DEFAULT 0,
    position_index INTEGER DEFAULT 0,
    layout_data TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
    FOREIGN KEY (current_contract_id) REFERENCES contracts(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    cabinet_id INTEGER NOT NULL,
    warehouse_id INTEGER NOT NULL,
    start_date DATETIME NOT NULL,
    end_date DATETIME NOT NULL,
    status TEXT DEFAULT 'active',
    total_amount INTEGER DEFAULT 0,
    billing_key TEXT,
    auto_renew INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (cabinet_id) REFERENCES cabinets(id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    contract_id INTEGER NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    payment_method TEXT,
    payment_key TEXT,
    pg_approval_number TEXT,
    receipt_password TEXT,
    billing_key TEXT,
    payment_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (contract_id) REFERENCES contracts(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    cabinet_id INTEGER,
    warehouse_id INTEGER,
    auth_method TEXT,
    success INTEGER DEFAULT 1,
    result TEXT,
    ip_address TEXT,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (cabinet_id) REFERENCES cabinets(id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS access_failures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cabinet_id INTEGER,
    phone TEXT,
    failure_count INTEGER DEFAULT 1,
    last_failure DATETIME,
    locked_until DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cabinet_id) REFERENCES cabinets(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS sms_otp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS layouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id INTEGER NOT NULL,
    cabinet_id INTEGER NOT NULL,
    position_x INTEGER DEFAULT 0,
    position_y INTEGER DEFAULT 0,
    position_index INTEGER DEFAULT 0,
    layout_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (cabinet_id) REFERENCES cabinets(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS naver_reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reservation_id TEXT UNIQUE,
    customer_name TEXT,
    phone TEXT,
    service_name TEXT,
    start_date DATETIME,
    end_date DATETIME,
    status TEXT DEFAULT 'synced',
    synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS hardware_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id INTEGER NOT NULL,
    door_status TEXT DEFAULT 'closed',
    fire_alarm INTEGER DEFAULT 0,
    last_check DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS hardware_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    warehouse_id INTEGER,
    event_type TEXT NOT NULL,
    success INTEGER DEFAULT 1,
    source_ip TEXT,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    quantity INTEGER DEFAULT 0,
    unit TEXT DEFAULT '개',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
  )`);

  await run(`CREATE TABLE IF NOT EXISTS inventory_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    warehouse_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
}

async function migrateColumns() {
  await ensureColumn('users', 'pin_code', 'pin_code TEXT');
  await ensureColumn('users', 'updated_at', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await ensureColumn('warehouses', 'layout_data', "layout_data TEXT DEFAULT '[]'");
  await ensureColumn('warehouses', 'updated_at', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await ensureColumn('cabinets', 'name', 'name TEXT');
  await ensureColumn('cabinets', 'current_contract_id', 'current_contract_id INTEGER');
  await ensureColumn('cabinets', 'position_index', 'position_index INTEGER DEFAULT 0');
  await ensureColumn('cabinets', 'layout_data', "layout_data TEXT DEFAULT '{}'");
  await ensureColumn('cabinets', 'updated_at', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await ensureColumn('contracts', 'warehouse_id', 'warehouse_id INTEGER');
  await ensureColumn('contracts', 'auto_renew', 'auto_renew INTEGER DEFAULT 0');
  await ensureColumn('contracts', 'billing_key', 'billing_key TEXT');
  await ensureColumn('contracts', 'updated_at', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await ensureColumn('payments', 'user_id', 'user_id INTEGER');
  await ensureColumn('payments', 'payment_method', 'payment_method TEXT');
  await ensureColumn('payments', 'payment_key', 'payment_key TEXT');
  await ensureColumn('payments', 'created_at', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await ensureColumn('payments', 'updated_at', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  await ensureColumn('access_logs', 'success', 'success INTEGER DEFAULT 1');
  await ensureColumn('access_logs', 'note', 'note TEXT');
}

async function createIndexes() {
  await run('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
  await run('CREATE INDEX IF NOT EXISTS idx_cabinets_warehouse_id ON cabinets(warehouse_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_contracts_user_id ON contracts(user_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_contracts_cabinet_id ON contracts(cabinet_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_contracts_warehouse_id ON contracts(warehouse_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status)');
}

async function setupAdmin() {
  const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
  const existing = await get('SELECT id FROM users WHERE username = ?', ['admin']);

  if (existing) {
    await run(
      `UPDATE users
       SET email = COALESCE(email, ?), password = ?, role = 'admin', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      ['admin@test.com', hashedPassword, existing.id],
    );
    console.log(`Admin password reset: admin / ${DEFAULT_ADMIN_PASSWORD}`);
    return existing.id;
  }

  const result = await run(
    `INSERT INTO users (username, email, password, phone, role)
     VALUES (?, ?, ?, ?, ?)`,
    ['admin', 'admin@test.com', hashedPassword, '', 'admin'],
  );
  console.log(`Admin created: admin / ${DEFAULT_ADMIN_PASSWORD}`);
  return result.lastID;
}

async function setupWarehouse(adminId) {
  const existing = await get('SELECT id FROM warehouses ORDER BY id LIMIT 1');
  if (existing) return existing.id;

  const result = await run(
    'INSERT INTO warehouses (owner_id, name, location, capacity) VALUES (?, ?, ?, ?)',
    [adminId, '테스트 창고', '서울시 강남구', 30],
  );
  await run('INSERT INTO hardware_status (warehouse_id) VALUES (?)', [result.lastID]).catch(() => {});
  console.log(`Warehouse created: ${result.lastID}`);
  return result.lastID;
}

async function setupCabinets(warehouseId) {
  const row = await get('SELECT COUNT(*) AS count FROM cabinets WHERE warehouse_id = ?', [warehouseId]);
  if (row.count > 0) {
    console.log(`Cabinets already exist: ${row.count}`);
    return;
  }

  const sizes = ['S', 'S', 'S', 'S', 'S', 'M', 'M', 'M', 'M', 'M', 'L', 'L', 'L', 'L', 'L', 'XL', 'XL', 'XL', 'XL', 'XL', 'XXL', 'XXL', 'XXL', 'XXL', 'XXL'];
  for (let i = 0; i < sizes.length; i += 1) {
    await run(
      `INSERT INTO cabinets (warehouse_id, name, size, status, relay_channel, position_x, position_y, position_index)
       VALUES (?, ?, ?, 'available', ?, ?, ?, ?)`,
      [warehouseId, `${sizes[i]}-${i + 1}`, sizes[i], i + 1, i % 5, Math.floor(i / 5), i],
    );
  }
  console.log(`Cabinets created: ${sizes.length}`);
}

async function main() {
  await createTables();
  await migrateColumns();
  await createIndexes();
  const adminId = await setupAdmin();
  const warehouseId = await setupWarehouse(adminId);
  await setupCabinets(warehouseId);
  console.log('Database initialization complete');
}

main()
  .catch((err) => {
    console.error('Database initialization failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
