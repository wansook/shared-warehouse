const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// JWT 비밀키 (실제 배포 시 환경변수로 설정)
const JWT_SECRET = 'shared-warehouse-secret-key-2026';

// 미들웨어
app.use(cors());
app.use(express.json());

// SQLite 데이터베이스 연결
const db = new sqlite3.Database('./warehouse.db', (err) => {
  if (err) {
    console.error('데이터베이스 연결 오류:', err.message);
  } else {
    console.log('SQLite 데이터베이스에 연결되었습니다.');
  }
});

// 테이블 생성
db.serialize(() => {
  // users 테이블
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('users 테이블 생성 오류:', err.message);
    else console.log('users 테이블이 준비되었습니다.');
  });

  // warehouses 테이블 (창고)
  db.run(`CREATE TABLE IF NOT EXISTS warehouses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT,
    capacity INTEGER DEFAULT 0,
    owner_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  )`, (err) => {
    if (err) console.error('warehouses 테이블 생성 오류:', err.message);
    else console.log('warehouses 테이블이 준비되었습니다.');
  });

  // items 테이블 (재고 항목)
  db.run(`CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    quantity INTEGER DEFAULT 0,
    unit TEXT DEFAULT '개',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
  )`, (err) => {
    if (err) console.error('items 테이블 생성 오류:', err.message);
    else console.log('items 테이블이 준비되었습니다.');
  });
});

// JWT 인증 미들웨어
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: '인증 토큰이 필요합니다.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: '유효하지 않은 토큰입니다.' });
    }
    req.user = user;
    next();
  });
};

// ==================== 회원 관련 API ====================

// 회원가입
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: '모든 필드를 입력해주세요.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`;
    
    db.run(sql, [username, email, hashedPassword], function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ message: '이미 사용 중인 아이디 또는 이메일입니다.' });
        }
        console.error('회원가입 오류:', err.message);
        return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
      }

      res.status(201).json({
        message: '회원가입이 완료되었습니다.',
        userId: this.lastID
      });
    });
  } catch (error) {
    console.error('회원가입 처리 중 오류:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// 로그인
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: '아이디와 비밀번호를 입력해주세요.' });
  }

  db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
    if (err) {
      console.error('로그인 오류:', err.message);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }

    if (!user) {
      return res.status(401).json({ message: '아이디를 찾을 수 없습니다.' });
    }

    try {
      const match = await bcrypt.compare(password, user.password);
      
      if (!match) {
        return res.status(401).json({ message: '비밀번호가 일치하지 않습니다.' });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, email: user.email },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        message: '로그인 성공',
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        }
      });
    } catch (error) {
      console.error('비밀번호 비교 오류:', error);
      res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
  });
});

// ==================== 창고 관련 API ====================

// 창고 목록 조회
app.get('/api/warehouses', authenticateToken, (req, res) => {
  const sql = `SELECT * FROM warehouses ORDER BY created_at DESC`;
  
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('창고 조회 오류:', err.message);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
    res.json(rows);
  });
});

// 창고 생성
app.post('/api/warehouses', authenticateToken, (req, res) => {
  const { name, location, capacity } = req.body;

  if (!name) {
    return res.status(400).json({ message: '창고 이름을 입력해주세요.' });
  }

  const sql = `INSERT INTO warehouses (name, location, capacity, owner_id) VALUES (?, ?, ?, ?)`;
  
  db.run(sql, [name, location || '', capacity || 0, req.user.id], function (err) {
    if (err) {
      console.error('창고 생성 오류:', err.message);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }

    res.status(201).json({
      message: '창고가 생성되었습니다.',
      warehouseId: this.lastID
    });
  });
});

// 창고 삭제
app.delete('/api/warehouses/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run(`DELETE FROM warehouses WHERE id = ?`, [id], function (err) {
    if (err) {
      console.error('창고 삭제 오류:', err.message);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ message: '창고를 찾을 수 없습니다.' });
    }

    res.json({ message: '창고가 삭제되었습니다.' });
  });
});

// ==================== 재고 관련 API ====================

// 창고의 재고 목록 조회
app.get('/api/warehouses/:warehouseId/items', authenticateToken, (req, res) => {
  const { warehouseId } = req.params;
  
  db.all(`SELECT * FROM items WHERE warehouse_id = ? ORDER BY name`, [warehouseId], (err, rows) => {
    if (err) {
      console.error('재고 조회 오류:', err.message);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
    res.json(rows);
  });
});

// 재고 항목 추가
app.post('/api/warehouses/:warehouseId/items', authenticateToken, (req, res) => {
  const { warehouseId } = req.params;
  const { name, description, quantity, unit } = req.body;

  if (!name) {
    return res.status(400).json({ message: '항목 이름을 입력해주세요.' });
  }

  const sql = `INSERT INTO items (warehouse_id, name, description, quantity, unit) VALUES (?, ?, ?, ?, ?)`;
  
  db.run(sql, [warehouseId, name, description || '', quantity || 0, unit || '개'], function (err) {
    if (err) {
      console.error('재고 추가 오류:', err.message);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }

    res.status(201).json({
      message: '재고 항목이 추가되었습니다.',
      itemId: this.lastID
    });
  });
});

// 재고 항목 수정
app.put('/api/items/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { name, description, quantity, unit } = req.body;

  const sql = `UPDATE items SET name = ?, description = ?, quantity = ?, unit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  
  db.run(sql, [name, description, quantity, unit, id], function (err) {
    if (err) {
      console.error('재고 수정 오류:', err.message);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ message: '항목을 찾을 수 없습니다.' });
    }

    res.json({ message: '재고 항목이 수정되었습니다.' });
  });
});

// 재고 항목 삭제
app.delete('/api/items/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run(`DELETE FROM items WHERE id = ?`, [id], function (err) {
    if (err) {
      console.error('재고 삭제 오류:', err.message);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ message: '항목을 찾을 수 없습니다.' });
    }

    res.json({ message: '재고 항목이 삭제되었습니다.' });
  });
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`백엔드 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
