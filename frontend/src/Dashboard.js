import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [items, setItems] = useState([]);
  const [showAddWarehouse, setShowAddWarehouse] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newWarehouse, setNewWarehouse] = useState({ name: '', location: '', capacity: 0 });
  const [newItem, setNewItem] = useState({ name: '', description: '', quantity: 0, unit: '개' });
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
    headers: {
      Authorization: `Bearer ${token}`
    }
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
    } catch (error) {
      setMessage('재고 추가에 실패했습니다.');
    }
  };

  const handleDeleteWarehouse = async (id) => {
    if (window.confirm('창고를 정말 삭제하시겠습니까?')) {
      try {
        await api.delete(`/api/warehouses/${id}`);
        setMessage('창고가 삭제되었습니다.');
        if (selectedWarehouse === id) {
          setSelectedWarehouse(null);
          setItems([]);
        }
        fetchWarehouses();
      } catch (error) {
        setMessage('창고 삭제에 실패했습니다.');
      }
    }
  };

  const handleDeleteItem = async (id) => {
    if (window.confirm('재고 항목을 정말 삭제하시겠습니까?')) {
      try {
        await api.delete(`/api/items/${id}`);
        setMessage('재고 항목이 삭제되었습니다.');
        if (selectedWarehouse) {
          fetchItems(selectedWarehouse);
        }
      } catch (error) {
        setMessage('재고 삭제에 실패했습니다.');
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
  };

  const currentWarehouse = warehouses.find(w => w.id === selectedWarehouse);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>🏭 공유 창고 관리</h1>
        </div>
        <div className="header-right">
          <span className="user-name">👤 {user?.username}</span>
          <button className="logout-btn" onClick={handleLogout}>로그아웃</button>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="warehouses-section">
          <div className="section-header">
            <h2>창고 목록</h2>
            <button onClick={() => setShowAddWarehouse(true)}>+ 창고 추가</button>
          </div>

          {showAddWarehouse && (
            <form onSubmit={handleAddWarehouse} className="add-form">
              <div className="form-group">
                <input
                  type="text"
                  placeholder="창고 이름"
                  value={newWarehouse.name}
                  onChange={(e) => setNewWarehouse({ ...newWarehouse, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <input
                  type="text"
                  placeholder="위치"
                  value={newWarehouse.location}
                  onChange={(e) => setNewWarehouse({ ...newWarehouse, location: e.target.value })}
                />
              </div>
              <div className="form-group">
                <input
                  type="number"
                  placeholder="용량"
                  value={newWarehouse.capacity}
                  onChange={(e) => setNewWarehouse({ ...newWarehouse, capacity: parseInt(e.target.value) })}
                />
              </div>
              <div className="form-actions">
                <button type="submit">저장</button>
                <button type="button" onClick={() => setShowAddWarehouse(false)}>취소</button>
              </div>
            </form>
          )}

          <div className="warehouses-list">
            {warehouses.map((warehouse) => (
              <div
                key={warehouse.id}
                className={`warehouse-card ${selectedWarehouse === warehouse.id ? 'active' : ''}`}
                onClick={() => selectWarehouse(warehouse)}
              >
                <div className="warehouse-info">
                  <h3>{warehouse.name}</h3>
                  <p>📍 {warehouse.location || '위치 미설정'}</p>
                  <p>📦 용량: {warehouse.capacity}개</p>
                </div>
                <button
                  className="delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteWarehouse(warehouse.id);
                  }}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="items-section">
          <div className="section-header">
            <h2>
              {selectedWarehouse
                ? currentWarehouse?.name + ' - 재고 목록'
                : '재고 목록'}
            </h2>
            {selectedWarehouse && (
              <button onClick={() => setShowAddItem(true)}>+ 항목 추가</button>
            )}
          </div>

          {showAddItem && (
            <form onSubmit={handleAddItem} className="add-form">
              <div className="form-group">
                <input
                  type="text"
                  placeholder="항목 이름"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <input
                  type="text"
                  placeholder="설명"
                  value={newItem.description}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                />
              </div>
              <div className="form-group">
                <input
                  type="number"
                  placeholder="수량"
                  value={newItem.quantity}
                  onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) })}
                  required
                />
              </div>
              <div className="form-group">
                <select
                  value={newItem.unit}
                  onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                >
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

          {selectedWarehouse ? (
            <div className="items-list">
              {items.length === 0 ? (
                <p className="empty-message">재고 항목이 없습니다.</p>
              ) : (
                items.map((item) => (
                  <div key={item.id} className="item-card">
                    <div className="item-info">
                      <h3>{item.name}</h3>
                      <p>{item.description || '설명 없음'}</p>
                      <div className="item-stats">
                        <span>📦 수량: {item.quantity}{item.unit}</span>
                      </div>
                    </div>
                    <button
                      className="delete-btn"
                      onClick={() => handleDeleteItem(item.id)}
                    >
                      삭제
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
            <p className="empty-message">창고를 선택하시면 재고 목록을 볼 수 있습니다.</p>
          )}
        </div>
      </div>

      {message && <p className="toast">{message}</p>}
    </div>
  );
};

export default Dashboard;
