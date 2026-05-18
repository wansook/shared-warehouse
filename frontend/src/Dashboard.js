import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [items, setItems] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [showAddWarehouse, setShowAddWarehouse] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [newWarehouse, setNewWarehouse] = useState({ name: '', location: '', capacity: 0 });
  const [newItem, setNewItem] = useState({ name: '', description: '', quantity: 0, unit: '개' });
  const [stockData, setStockData] = useState({ type: 'in', quantity: 1, note: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    const userData = JSON.parse(localStorage.getItem('user'));
    setUser(userData);
    fetchWarehouses();
  }, [token, navigate]);

  const api = axios.create({
    baseURL: 'http://localhost:3001',
    headers: { Authorization: `Bearer ${token}` }
  });

  const fetchWarehouses = async () => {
    try {
      const response = await api.get('/api/warehouses');
      setWarehouses(response.data);
    } catch (error) {
      if (error.response && error.response.status === 403) {
        localStorage.clear();
        navigate('/login');
      }
    }
  };

  const fetchItems = async (warehouseId) => {
    try {
      const response = await api.get(`/api/warehouses/${warehouseId}/items`);
      setItems(response.data);
    } catch (error) {
      console.error('재고 조회 오류:', error);
    }
  };

  const fetchLogs = async (warehouseId) => {
    try {
      const response = await api.get(`/api/warehouses/${warehouseId}/logs`);
      setLogs(response.data);
    } catch (error) {
      console.error('로그 조회 오류:', error);
    }
  };

  const fetchStats = async (warehouseId) => {
    try {
      const response = await api.get(`/api/warehouses/${warehouseId}/stats`);
      setStats(response.data);
    } catch (error) {
      console.error('통계 조회 오류:', error);
    }
  };

  const handleSearch = async (q) => {
    setSearchTerm(q);
    if (!q) {
      setSearchResults([]);
      return;
    }
    try {
      const response = await api.get(`/api/search?q=${q}`);
      setSearchResults(response.data);
    } catch (error) {
      console.error('검색 오류:', error);
    }
  };

  const handleAddWarehouse = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/warehouses', newWarehouse);
      setMessage('창고가 추가되었습니다.');
      setNewWarehouse({ name: '', location: '', capacity: 0 });
      setShowAddWarehouse(false);
      fetchWarehouses();
    } catch (error) {
      setMessage('창고 추가에 실패했습니다.');
    }
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!selectedWarehouse) return;
    try {
      await api.post(`/api/warehouses/${selectedWarehouse}/items`, newItem);
      setMessage('재고 항목이 추가되었습니다.');
      setNewItem({ name: '', description: '', quantity: 0, unit: '개' });
      setShowAddItem(false);
      fetchItems(selectedWarehouse);
      fetchStats(selectedWarehouse);
    } catch (error) {
      setMessage('재고 추가에 실패했습니다.');
    }
  };

  const handleUpdateItem = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/api/items/${editItem.id}`, editItem);
      setMessage('재고 항목이 수정되었습니다.');
      setEditItem(null);
      fetchItems(selectedWarehouse);
    } catch (error) {
      setMessage('수정에 실패했습니다.');
    }
  };

  const handleStock = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/api/items/${showStockModal}/stock`, stockData);
      setMessage(stockData.type === 'in' ? '입고 완료' : '출고 완료');
      setShowStockModal(false);
      setStockData({ type: 'in', quantity: 1, note: '' });
      fetchItems(selectedWarehouse);
      fetchLogs(selectedWarehouse);
      fetchStats(selectedWarehouse);
    } catch (error) {
      setMessage(error.response?.data?.message || '出入庫 실패');
    }
  };

  const handleDeleteWarehouse = async (id) => {
    if (window.confirm('창고를 정말 삭제하시겠습니까?')) {
      try {
        await api.delete(`/api/warehouses/${id}`);
        if (selectedWarehouse === id) {
          setSelectedWarehouse(null);
          setItems([]);
          setLogs([]);
          setStats(null);
        }
        fetchWarehouses();
      } catch (error) {
        setMessage('삭제 실패');
      }
    }
  };

  const handleDeleteItem = async (id) => {
    if (window.confirm('항목을 정말 삭제하시겠습니까?')) {
      try {
        await api.delete(`/api/items/${id}`);
        fetchItems(selectedWarehouse);
        fetchStats(selectedWarehouse);
      } catch (error) {
        setMessage('삭제 실패');
      }
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  const selectWarehouse = (warehouse) => {
    setSelectedWarehouse(warehouse.id);
    fetchItems(warehouse.id);
    fetchLogs(warehouse.id);
    fetchStats(warehouse.id);
  };

  const currentWarehouse = warehouses.find(w => w.id === selectedWarehouse);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>🏭 공유 창고 관리</h1>
        </div>
        <div className="header-center">
          <input
            type="text"
            placeholder="🔍 재고 검색..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="header-right">
          <span className="user-name">👤 {user?.username}</span>
          <button className="profile-btn" onClick={() => navigate('/profile')}>프로필</button>
          <button className="logout-btn" onClick={handleLogout}>로그아웃</button>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="warehouses-section">
          <div className="section-header">
            <h2>창고 목록</h2>
            <button onClick={() => setShowAddWarehouse(true)}>+ 창고</button>
          </div>

          {showAddWarehouse && (
            <form onSubmit={handleAddWarehouse} className="add-form">
              <div className="form-group">
                <input type="text" placeholder="창고 이름" value={newWarehouse.name} onChange={(e) => setNewWarehouse({ ...newWarehouse, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <input type="text" placeholder="위치" value={newWarehouse.location} onChange={(e) => setNewWarehouse({ ...newWarehouse, location: e.target.value })} />
              </div>
              <div className="form-group">
                <input type="number" placeholder="용량" value={newWarehouse.capacity} onChange={(e) => setNewWarehouse({ ...newWarehouse, capacity: parseInt(e.target.value) })} />
              </div>
              <div className="form-actions">
                <button type="submit">저장</button>
                <button type="button" onClick={() => setShowAddWarehouse(false)}>취소</button>
              </div>
            </form>
          )}

          <div className="warehouses-list">
            {warehouses.map((warehouse) => (
              <div key={warehouse.id} className={`warehouse-card ${selectedWarehouse === warehouse.id ? 'active' : ''}`} onClick={() => selectWarehouse(warehouse)}>
                <div className="warehouse-info">
                  <h3>{warehouse.name}</h3>
                  <p>📍 {warehouse.location || '미설정'}</p>
                  <p>📦 용량: {warehouse.capacity}</p>
                </div>
                <button className="delete-btn" onClick={(e) => { e.stopPropagation(); handleDeleteWarehouse(warehouse.id); }}>삭제</button>
              </div>
            ))}
          </div>
        </div>

        <div className="right-panel">
          {stats && (
            <div className="stats-card">
              <h3>📊 {currentWarehouse?.name} 통계</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-label">총 항목</span>
                  <span className="stat-value">{stats.total_items}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">총 수량</span>
                  <span className="stat-value">{stats.total_quantity}</span>
                </div>
              </div>
            </div>
          )}

          {searchTerm && (
            <div className="search-results">
              <h3>검색 결과 ({searchResults.length})</h3>
              {searchResults.map(item => (
                <div key={item.id} className="search-item">
                  <strong>{item.name}</strong>
                  <span>{item.warehouse_name}</span>
                  <span>📦 {item.quantity}{item.unit}</span>
                </div>
              ))}
            </div>
          )}

          <div className="items-section">
            <div className="section-header">
              <h2>{selectedWarehouse ? currentWarehouse?.name + ' - 재고' : '재고 목록'}</h2>
              {selectedWarehouse && <button onClick={() => setShowAddItem(true)}>+ 항목</button>}
            </div>

            {showAddItem && (
              <form onSubmit={handleAddItem} className="add-form">
                <div className="form-group"><input type="text" placeholder="이름" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} required /></div>
                <div className="form-group"><input type="text" placeholder="설명" value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} /></div>
                <div className="form-group"><input type="number" placeholder="수량" value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) })} required /></div>
                <div className="form-group">
                  <select value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}>
                    <option value="개">개</option>
                    <option value="box">박스</option>
                    <option value="kg">kg</option>
                    <option value="L">리터</option>
                    <option value="m">미터</option>
                  </select>
                </div>
                <div className="form-actions">
                  <button type="submit">저장</button>
                  <button type="button" onClick={() => setShowAddItem(false)}>취소</button>
                </div>
              </form>
            )}

            {editItem && (
              <form onSubmit={handleUpdateItem} className="add-form edit-form">
                <h4>✏️ 항목 수정</h4>
                <div className="form-group"><input type="text" value={editItem.name} onChange={(e) => setEditItem({ ...editItem, name: e.target.value })} required /></div>
                <div className="form-group"><input type="text" value={editItem.description} onChange={(e) => setEditItem({ ...editItem, description: e.target.value })} /></div>
                <div className="form-group"><input type="number" value={editItem.quantity} onChange={(e) => setEditItem({ ...editItem, quantity: parseInt(e.target.value) })} /></div>
                <div className="form-actions">
                  <button type="submit">저장</button>
                  <button type="button" onClick={() => setEditItem(null)}>취소</button>
                </div>
              </form>
            )}

            {showStockModal && (
              <form onSubmit={handleStock} className="add-form stock-form">
                <h4>📦 입고/출고</h4>
                <div className="form-group">
                  <select value={stockData.type} onChange={(e) => setStockData({ ...stockData, type: e.target.value })}>
                    <option value="in">입고 (+)</option>
                    <option value="out">출고 (-)</option>
                  </select>
                </div>
                <div className="form-group"><input type="number" value={stockData.quantity} onChange={(e) => setStockData({ ...stockData, quantity: parseInt(e.target.value) })} min="1" required /></div>
                <div className="form-group"><input type="text" placeholder="비고" value={stockData.note} onChange={(e) => setStockData({ ...stockData, note: e.target.value })} /></div>
                <div className="form-actions">
                  <button type="submit">확인</button>
                  <button type="button" onClick={() => setShowStockModal(false)}>취소</button>
                </div>
              </form>
            )}

            {selectedWarehouse ? (
              <div className="items-list">
                {items.length === 0 ? <p className="empty-message">항목이 없습니다.</p> : items.map((item) => (
                  <div key={item.id} className="item-card">
                    <div className="item-info">
                      <h3>{item.name}</h3>
                      <p>{item.description || '설명 없음'}</p>
                      <div className="item-stats"><span>📦 {item.quantity}{item.unit}</span></div>
                    </div>
                    <div className="item-actions">
                      <button className="action-btn stock-btn" onClick={() => setShowStockModal(item.id)}>出入庫</button>
                      <button className="action-btn edit-btn" onClick={() => setEditItem({ ...item })}>수정</button>
                      <button className="action-btn delete-btn" onClick={() => handleDeleteItem(item.id)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="empty-message">창고를 선택하세요.</p>}
          </div>

          {logs.length > 0 && (
            <div className="logs-section">
              <h3>📋出入庫 기록</h3>
              <div className="logs-list">
                {logs.map(log => (
                  <div key={log.id} className={`log-item ${log.type}`}>
                    <span className="log-type">{log.type === 'in' ? '📥 입고' : '📤 출고'}</span>
                    <span>{log.item_name}</span>
                    <span>{log.type === 'in' ? '+' : '-'}{log.quantity}</span>
                    <span className="log-note">{log.note || ''}</span>
                    <span className="log-meta">{log.username} · {new Date(log.created_at).toLocaleString('ko-KR')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {message && <p className="toast">{message}</p>}
    </div>
  );
};

export default Dashboard;
