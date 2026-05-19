import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [cabinets, setCabinets] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [accessLogs, setAccessLogs] = useState([]);
  const [hardwareStatus, setHardwareStatus] = useState([]);
  const [stats, setStats] = useState(null);
  const [showAddWarehouse, setShowAddWarehouse] = useState(false);
  const [showAddCabinet, setShowAddCabinet] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [showAuthPanel, setShowAuthPanel] = useState(false);
  const [showNaverSync, setShowNaverSync] = useState(false);
  const [navReservations, setNavReservations] = useState([]);
  const [newWarehouse, setNewWarehouse] = useState({ name: '', location: '', capacity: 0 });
  const [newCabinet, setNewCabinet] = useState({ size: 'S', relay_channel: 1 });
  const [contractData, setContractData] = useState({ cabinet_id: '', start_date: '', end_date: '', total_amount: 0 });
  const [authData, setAuthData] = useState({ method: 'pin', value: '' });
  const [authResult, setAuthResult] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('cabinets'); // cabinets | contracts | hardware | naver
  const [syncLoading, setSyncLoading] = useState(false);
  const navigate = useNavigate();

  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) { navigate('/login'); return; }
    const userData = JSON.parse(localStorage.getItem('user'));
    setUser(userData);
    fetchWarehouses();
    if (userData?.role === 'admin') {
      fetchHardwareStatus();
    }
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
      if (error.response?.status === 403) { localStorage.clear(); navigate('/login'); }
    }
  };

  const fetchCabinets = async (warehouseId) => {
    try {
      const response = await api.get(`/api/warehouses/${warehouseId}/cabinets`);
      setCabinets(response.data);
    } catch (error) { console.error(error); }
  };

  const fetchContracts = async () => {
    try {
      const response = await api.get('/api/contracts');
      setContracts(response.data);
    } catch (error) { console.error(error); }
  };

  const fetchAccessLogs = async (warehouseId) => {
    try {
      const response = await api.get(`/api/warehouses/${warehouseId}/access-logs`);
      setAccessLogs(response.data);
    } catch (error) { console.error(error); }
  };

  const fetchHardwareStatus = async () => {
    try {
      const response = await api.get('/api/admin/hardware/status');
      setHardwareStatus(response.data);
    } catch (error) { console.error(error); }
  };

  const fetchStats = async (warehouseId) => {
    try {
      const response = await api.get(`/api/warehouses/${warehouseId}/stats`);
      setStats(response.data);
    } catch (error) { console.error(error); }
  };

  const fetchNaverReservations = async () => {
    try {
      const response = await api.get('/api/admin/naver-reservations');
      setNavReservations(response.data);
    } catch (error) { console.error(error); }
  };

  const handleSearch = async (q) => {
    setSearchTerm(q);
    if (!q) { setSearchResults([]); return; }
    try {
      const response = await api.get(`/api/search?q=${q}`);
      setSearchResults(response.data);
    } catch (error) { console.error(error); }
  };

  const handleAddWarehouse = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/warehouses', newWarehouse);
      setMessage('창고 추가 완료');
      setNewWarehouse({ name: '', location: '', capacity: 0 });
      setShowAddWarehouse(false);
      fetchWarehouses();
    } catch (error) { setMessage('추가 실패'); }
  };

  const handleAddCabinet = async (e) => {
    e.preventDefault();
    if (!selectedWarehouse) return;
    try {
      await api.post(`/api/warehouses/${selectedWarehouse}/cabinets`, newCabinet);
      setMessage('캐비넷 추가 완료');
      setNewCabinet({ size: 'S', relay_channel: 1 });
      setShowAddCabinet(false);
      fetchCabinets(selectedWarehouse);
    } catch (error) { setMessage('추가 실패'); }
  };

  const handleCreateContract = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/contracts', contractData);
      setMessage('계약 생성 완료');
      setContractData({ cabinet_id: '', start_date: '', end_date: '', total_amount: 0 });
      setShowContractModal(false);
      fetchContracts();
      if (selectedWarehouse) fetchCabinets(selectedWarehouse);
    } catch (error) { setMessage(error.response?.data?.message || '계약 실패'); }
  };

  const handleAuthenticate = async (e) => {
    e.preventDefault();
    if (!selectedWarehouse) { setMessage('창고 선택 필요'); return; }
    try {
      const response = await axios.post('http://localhost:3001/api/access/authenticate', {
        warehouse_id: selectedWarehouse,
        auth_method: authData.method,
        auth_value: authData.value
      });
      setAuthResult(`✅ ${response.data.message}`);
    } catch (error) {
      setAuthResult(`❌ ${error.response?.data?.message || '인증 실패'}`);
    }
  };

  const handleUnlockDoor = async (warehouseId) => {
    try {
      await api.post('/api/admin/door/unlock', { warehouse_id: warehouseId });
      setMessage('문 개방 완료 (3초 후 자동 잠금)');
      fetchHardwareStatus();
    } catch (error) { setMessage('실패'); }
  };

  const handleSyncEmails = async () => {
    setSyncLoading(true);
    try {
      const response = await api.post('/api/admin/sync-naver-emails');
      setMessage(response.data.message);
      fetchNaverReservations();
    } catch (error) {
      setMessage(error.response?.data?.message || '동기화 실패');
    }
    setSyncLoading(false);
  };

  const handleSyncCrawler = async () => {
    setSyncLoading(true);
    try {
      const response = await api.post('/api/admin/sync-naver-crawler');
      setMessage(response.data.message);
      fetchNaverReservations();
    } catch (error) {
      setMessage(error.response?.data?.message || '동기화 실패');
    }
    setSyncLoading(false);
  };

  const handleLogout = () => { localStorage.clear(); navigate('/login'); };

  const selectWarehouse = (warehouse) => {
    setSelectedWarehouse(warehouse.id);
    fetchCabinets(warehouse.id);
    fetchAccessLogs(warehouse.id);
    fetchStats(warehouse.id);
    fetchContracts();
  };

  const currentWarehouse = warehouses.find(w => w.id === selectedWarehouse);
  const isAdmin = user?.role === 'admin';

  const statusColors = {
    available: '#28a745',
    occupied: '#dc3545',
    maintenance: '#ffc107',
    expired_soon: '#fd7e14'
  };

  const statusLabels = {
    available: '공석',
    occupied: '이용중',
    maintenance: '정비중',
    expired_soon: '만료임박'
  };

  // 캐비넷 배치도 계산
  const cabinetLayout = () => {
    const grid = [];
    let row = 0;
    let col = 0;
    const maxCol = 6;

    cabinets.forEach(c => {
      if (col >= maxCol) { col = 0; row++; }
      grid.push({ ...c, row, col });
      col += c.size === 'L' ? 2 : c.size === 'M' ? 1.5 : 1;
    });

    return grid;
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>🏭 공유 창고 무인 관리 시스템</h1>
        </div>
        <div className="header-center">
          <input type="text" placeholder="🔍 검색..." value={searchTerm} onChange={(e) => handleSearch(e.target.value)} className="search-input" />
        </div>
        <div className="header-right">
          <span className="user-name">👤 {user?.username} {isAdmin && <span className="admin-badge">관리자</span>}</span>
          <button className="profile-btn" onClick={() => navigate('/profile')}>프로필</button>
          <button className="logout-btn" onClick={handleLogout}>로그아웃</button>
        </div>
      </header>

      <div className="dashboard-content">
        {/* 좌측 창고 목록 */}
        <div className="warehouses-section">
          <div className="section-header">
            <h2>창고 목록</h2>
            <button onClick={() => setShowAddWarehouse(true)}>+ 창고</button>
          </div>

          {showAddWarehouse && (
            <form onSubmit={handleAddWarehouse} className="add-form">
              <div className="form-group"><input type="text" placeholder="창고 이름" value={newWarehouse.name} onChange={(e) => setNewWarehouse({ ...newWarehouse, name: e.target.value })} required /></div>
              <div className="form-group"><input type="text" placeholder="위치" value={newWarehouse.location} onChange={(e) => setNewWarehouse({ ...newWarehouse, location: e.target.value })} /></div>
              <div className="form-group"><input type="number" placeholder="용량" value={newWarehouse.capacity} onChange={(e) => setNewWarehouse({ ...newWarehouse, capacity: parseInt(e.target.value) })} /></div>
              <div className="form-actions"><button type="submit">저장</button><button type="button" onClick={() => setShowAddWarehouse(false)}>취소</button></div>
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
              </div>
            ))}
          </div>

          {/* 출입 인증 패널 */}
          {selectedWarehouse && (
            <div className="auth-section">
              <div className="section-header">
                <h2>🔐 출입 인증</h2>
                <button onClick={() => setShowAuthPanel(!showAuthPanel)}>{showAuthPanel ? '접기' : '인증 테스트'}</button>
              </div>

              {showAuthPanel && (
                <div className="auth-panel">
                  <form onSubmit={handleAuthenticate} className="auth-form">
                    <div className="form-group">
                      <select value={authData.method} onChange={(e) => setAuthData({ ...authData, method: e.target.value })}>
                        <option value="pin">PIN 인증</option>
                        <option value="otp">OTP 인증</option>
                        <option value="qr">QR 인증</option>
                      </select>
                    </div>
                    <div className="form-group"><input type="text" placeholder="인증 값 입력" value={authData.value} onChange={(e) => setAuthData({ ...authData, value: e.target.value })} required /></div>
                    <button type="submit">인증 테스트</button>
                  </form>
                  {authResult && <p className="auth-result">{authResult}</p>}
                </div>
              )}
            </div>
          )}

          {/* 출입 로그 */}
          {accessLogs.length > 0 && (
            <div className="logs-section">
              <h3>📋 출입 기록</h3>
              <div className="logs-list">
                {accessLogs.map(log => (
                  <div key={log.id} className={`log-item ${log.success ? 'success' : 'failed'}`}>
                    <span className="log-status">{log.success ? '✅' : '❌'}</span>
                    <span>{log.username || '미인증'}</span>
                    <span>{log.auth_method}</span>
                    <span>{log.note || ''}</span>
                    <span className="log-time">{new Date(log.created_at).toLocaleString('ko-KR')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 우측 패널 */}
        <div className="right-panel">
          {/* 탭 네비게이션 */}
          <div className="tab-nav">
            <button className={activeTab === 'cabinets' ? 'active' : ''} onClick={() => setActiveTab('cabinets')}>📦 캐비넷</button>
            <button className={activeTab === 'contracts' ? 'active' : ''} onClick={() => setActiveTab('contracts')}>📝 계약</button>
            <button className={activeTab === 'hardware' ? 'active' : ''} onClick={() => setActiveTab('hardware')}>⚙️ 하드웨어</button>
            {isAdmin && (
              <button className={activeTab === 'naver' ? 'active' : ''} onClick={() => { setActiveTab('naver'); fetchNaverReservations(); }}>🔗 네이버 예약</button>
            )}
          </div>

          {/* 통계 */}
          {stats && (
            <div className="stats-card">
              <h3>📊 {currentWarehouse?.name} 통계</h3>
              <div className="stats-grid">
                <div className="stat-item"><span className="stat-label">총 항목</span><span className="stat-value">{stats.total_items}</span></div>
                <div className="stat-item"><span className="stat-label">총 수량</span><span className="stat-value">{stats.total_quantity}</span></div>
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

          {/* 캐비넷 탭 */}
          {activeTab === 'cabinets' && selectedWarehouse && (
            <div className="cabinets-section">
              <div className="section-header">
                <h2>캐비넷 배치도</h2>
                {isAdmin && <button onClick={() => setShowAddCabinet(true)}>+ 캐비넷</button>}
              </div>

              {showAddCabinet && (
                <form onSubmit={handleAddCabinet} className="add-form">
                  <div className="form-group">
                    <select value={newCabinet.size} onChange={(e) => setNewCabinet({ ...newCabinet, size: e.target.value })}>
                      <option value="S">S (작은)</option>
                      <option value="M">M (중간)</option>
                      <option value="L">L (큰)</option>
                    </select>
                  </div>
                  <div className="form-group"><input type="number" placeholder="릴레이 채널" value={newCabinet.relay_channel} onChange={(e) => setNewCabinet({ ...newCabinet, relay_channel: parseInt(e.target.value) })} min="1" max="4" /></div>
                  <div className="form-actions"><button type="submit">저장</button><button type="button" onClick={() => setShowAddCabinet(false)}>취소</button></div>
                </form>
              )}

              {/* 배치도 뷰어 */}
              <div className="layout-viewer">
                <div className="warehouse-floor">
                  <div className="floor-label">{currentWarehouse?.name || '창고'}</div>
                  <div className="cabinets-grid">
                    {cabinets.map((cabinet) => (
                      <div
                        key={cabinet.id}
                        className={`cabinet-cell ${cabinet.status} size-${cabinet.size.toLowerCase()}`}
                        style={{ borderLeft: `4px solid ${statusColors[cabinet.status]}` }}
                        title={`#${cabinet.id} (${cabinet.size}) - ${statusLabels[cabinet.status]}`}
                      >
                        <span className="cell-id">#{cabinet.id}</span>
                        <span className="cell-size">{cabinet.size}</span>
                        <span className="cell-status">{statusLabels[cabinet.status]}</span>
                      </div>
                    ))}
                  </div>
                  <div className="floor-legend">
                    <span><span className="legend-dot" style={{background:'#28a745'}}></span> 공석</span>
                    <span><span className="legend-dot" style={{background:'#dc3545'}}></span> 이용중</span>
                    <span><span className="legend-dot" style={{background:'#ffc107'}}></span> 정비중</span>
                    <span><span className="legend-dot" style={{background:'#fd7e14'}}></span> 만료임박</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 계약 탭 */}
          {activeTab === 'contracts' && (
            <div className="contracts-section">
              <div className="section-header">
                <h2>계약 관리</h2>
                <button onClick={() => setShowContractModal(true)}>+ 계약</button>
              </div>

              {showContractModal && (
                <form onSubmit={handleCreateContract} className="add-form">
                  <div className="form-group">
                    <select value={contractData.cabinet_id} onChange={(e) => setContractData({ ...contractData, cabinet_id: e.target.value })} required>
                      <option value="">캐비넷 선택</option>
                      {cabinets.filter(c => c.status === 'available').map(c => (
                        <option key={c.id} value={c.id}>#{c.id} ({c.size})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group"><input type="datetime-local" value={contractData.start_date} onChange={(e) => setContractData({ ...contractData, start_date: e.target.value })} required /></div>
                  <div className="form-group"><input type="datetime-local" value={contractData.end_date} onChange={(e) => setContractData({ ...contractData, end_date: e.target.value })} required /></div>
                  <div className="form-group"><input type="number" placeholder="금액" value={contractData.total_amount} onChange={(e) => setContractData({ ...contractData, total_amount: parseInt(e.target.value) })} /></div>
                  <div className="form-actions"><button type="submit">저장</button><button type="button" onClick={() => setShowContractModal(false)}>취소</button></div>
                </form>
              )}

              <div className="contracts-list">
                {contracts.map((contract) => (
                  <div key={contract.id} className={`contract-card ${contract.status}`}>
                    <div className="contract-info">
                      <strong>{contract.username}</strong>
                      <span>#{contract.cabinet_id} ({contract.size})</span>
                    </div>
                    <div className="contract-dates">
                      {new Date(contract.start_date).toLocaleDateString('ko-KR')} ~ {new Date(contract.end_date).toLocaleDateString('ko-KR')}
                    </div>
                    <div className={`contract-status-badge ${contract.status}`}>{contract.status}</div>
                    <div className="contract-amount">{contract.total_amount.toLocaleString()}원</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 하드웨어 탭 */}
          {activeTab === 'hardware' && isAdmin && hardwareStatus.length > 0 && (
            <div className="hardware-section">
              <h3>⚙️ 하드웨어 상태</h3>
              <div className="hardware-grid">
                {hardwareStatus.map(hw => (
                  <div key={hw.id} className={`hardware-card ${hw.door_status}`}>
                    <div className="hardware-name">{hw.name}</div>
                    <div className="hardware-status">
                      <span className={`status-indicator ${hw.door_status}`}></span>
                      {hw.door_status === 'open' ? '개방' : hw.door_status === 'closed' ? '폐쇄' : '오류'}
                    </div>
                    {hw.fire_alarm && <div className="fire-alarm">🔥 화재 경보</div>}
                    <button className="unlock-btn" onClick={() => handleUnlockDoor(hw.warehouse_id)}>🔓 원격 문열기</button>
                    <div className="hardware-time">최신: {new Date(hw.last_check).toLocaleString('ko-KR')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 네이버 예약 탭 */}
          {activeTab === 'naver' && isAdmin && (
            <div className="naver-sync-section">
              <div className="section-header">
                <h2>🔗 네이버 예약 동기화</h2>
                <div className="sync-actions">
                  <button onClick={handleSyncEmails} disabled={syncLoading}>
                    {syncLoading ? '⏳ 파싱 중...' : '📧 이메일 파싱'}
                  </button>
                  <button onClick={handleSyncCrawler} disabled={syncLoading}>
                    {syncLoading ? '⏳ 크롤링 중...' : '🌐 파트너센터 크롤링'}
                  </button>
                </div>
              </div>
              <p className="sync-info">이메일: 10분마다 자동 / 크롤링: 매시간 자동</p>
              <div className="reservation-list">
                {navReservations.length === 0 ? (
                  <p className="no-data">동기화된 예약 데이터가 없습니다.</p>
                ) : (
                  navReservations.map(r => (
                    <div key={r.id} className="reservation-card">
                      <div className="reservation-name">{r.customer_name}</div>
                      <div className="reservation-phone">{r.phone}</div>
                      <div className="reservation-service">{r.service_name}</div>
                      <div className="reservation-date">
                        {new Date(r.start_date).toLocaleDateString('ko-KR')} ~ {new Date(r.end_date).toLocaleDateString('ko-KR')}
                      </div>
                      <div className="reservation-status">{r.status}</div>
                    </div>
                  ))
                )}
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
