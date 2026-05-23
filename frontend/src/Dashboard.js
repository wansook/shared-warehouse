import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from './api';
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
  const [activeTab, setActiveTab] = useState('cabinets');
  const [syncLoading, setSyncLoading] = useState(false);
  const navigate = useNavigate();

  const isAdmin = user?.role === 'admin';
  const currentWarehouse = warehouses.find((w) => Number(w.id) === Number(selectedWarehouse));

  const handleAuthError = (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.clear();
      navigate('/login');
      return true;
    }
    return false;
  };

  const fetchWarehouses = async () => {
    try {
      const response = await api.get('/api/warehouses');
      setWarehouses(response.data);
    } catch (error) {
      handleAuthError(error);
    }
  };

  const fetchCabinets = async (warehouseId) => {
    const response = await api.get(`/api/warehouses/${warehouseId}/cabinets`);
    setCabinets(response.data);
  };

  const fetchContracts = async () => {
    const response = await api.get('/api/contracts');
    setContracts(response.data);
  };

  const fetchAccessLogs = async (warehouseId) => {
    const response = await api.get(`/api/warehouses/${warehouseId}/access-logs`);
    setAccessLogs(response.data);
  };

  const fetchHardwareStatus = async () => {
    try {
      const response = await api.get('/api/admin/hardware/status');
      setHardwareStatus(response.data);
    } catch (error) {
      if (error.response?.status !== 403) console.error(error);
    }
  };

  const fetchStats = async (warehouseId) => {
    const response = await api.get(`/api/warehouses/${warehouseId}/stats`);
    setStats(response.data);
  };

  const fetchNaverReservations = async () => {
    const response = await api.get('/api/admin/naver-reservations');
    setNavReservations(response.data);
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    setUser(userData);
    fetchWarehouses();
    if (userData?.role === 'admin') fetchHardwareStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const handleSearch = async (q) => {
    setSearchTerm(q);
    if (!q) {
      setSearchResults([]);
      return;
    }
    const response = await api.get(`/api/search?q=${encodeURIComponent(q)}`);
    setSearchResults(response.data);
  };

  const handleAddWarehouse = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/warehouses', newWarehouse);
      setMessage('Warehouse added.');
      setNewWarehouse({ name: '', location: '', capacity: 0 });
      setShowAddWarehouse(false);
      fetchWarehouses();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Failed to add warehouse.');
    }
  };

  const handleAddCabinet = async (e) => {
    e.preventDefault();
    if (!selectedWarehouse) return;
    try {
      await api.post(`/api/warehouses/${selectedWarehouse}/cabinets`, newCabinet);
      setMessage('Cabinet added.');
      setNewCabinet({ size: 'S', relay_channel: 1 });
      setShowAddCabinet(false);
      fetchCabinets(selectedWarehouse);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Failed to add cabinet.');
    }
  };

  const handleCreateContract = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/contracts', contractData);
      setMessage('Contract created.');
      setContractData({ cabinet_id: '', start_date: '', end_date: '', total_amount: 0 });
      setShowContractModal(false);
      fetchContracts();
      if (selectedWarehouse) fetchCabinets(selectedWarehouse);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Failed to create contract.');
    }
  };

  const handleAuthenticate = async (e) => {
    e.preventDefault();
    if (!selectedWarehouse) {
      setMessage('Select a warehouse first.');
      return;
    }

    try {
      const response = await api.post('/api/access/authenticate', {
        warehouse_id: selectedWarehouse,
        auth_method: authData.method,
        auth_value: authData.value,
      });
      setAuthResult(`Success: ${response.data.message}`);
      fetchAccessLogs(selectedWarehouse);
    } catch (error) {
      setAuthResult(`Failed: ${error.response?.data?.message || 'Authentication failed.'}`);
    }
  };

  const handleUnlockDoor = async (warehouseId) => {
    try {
      await api.post('/api/admin/door/unlock', { warehouse_id: warehouseId });
      setMessage('Door unlocked.');
      fetchHardwareStatus();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Failed to unlock door.');
    }
  };

  const handleSyncEmails = async () => {
    setSyncLoading(true);
    try {
      const response = await api.post('/api/admin/sync-naver-emails');
      setMessage(response.data.message);
      fetchNaverReservations();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Sync failed.');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleSyncCrawler = async () => {
    setSyncLoading(true);
    try {
      const response = await api.post('/api/admin/sync-naver-crawler');
      setMessage(response.data.message);
      fetchNaverReservations();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Sync failed.');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  const selectWarehouse = (warehouse) => {
    setSelectedWarehouse(warehouse.id);
    fetchCabinets(warehouse.id);
    fetchAccessLogs(warehouse.id);
    fetchStats(warehouse.id);
    fetchContracts();
  };

  const statusColors = {
    available: '#28a745',
    occupied: '#dc3545',
    maintenance: '#ffc107',
    expired_soon: '#fd7e14',
  };

  const statusLabels = {
    available: 'Available',
    occupied: 'Occupied',
    maintenance: 'Maintenance',
    expired_soon: 'Expiring soon',
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>Shared Warehouse Admin</h1>
        </div>
        <div className="header-center">
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="header-right">
          <span className="user-name">{user?.username} {isAdmin && <span className="admin-badge">Admin</span>}</span>
          <button className="profile-btn" onClick={() => navigate('/profile')}>Profile</button>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="warehouses-section">
          <div className="section-header">
            <h2>Warehouses</h2>
            {isAdmin && <button onClick={() => setShowAddWarehouse(true)}>+ Warehouse</button>}
          </div>

          {showAddWarehouse && (
            <form onSubmit={handleAddWarehouse} className="add-form">
              <div className="form-group">
                <input type="text" placeholder="Name" value={newWarehouse.name} onChange={(e) => setNewWarehouse({ ...newWarehouse, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <input type="text" placeholder="Location" value={newWarehouse.location} onChange={(e) => setNewWarehouse({ ...newWarehouse, location: e.target.value })} />
              </div>
              <div className="form-group">
                <input type="number" placeholder="Capacity" value={newWarehouse.capacity} onChange={(e) => setNewWarehouse({ ...newWarehouse, capacity: parseInt(e.target.value, 10) || 0 })} />
              </div>
              <div className="form-actions">
                <button type="submit">Save</button>
                <button type="button" onClick={() => setShowAddWarehouse(false)}>Cancel</button>
              </div>
            </form>
          )}

          <div className="warehouses-list">
            {warehouses.map((warehouse) => (
              <div key={warehouse.id} className={`warehouse-card ${Number(selectedWarehouse) === Number(warehouse.id) ? 'active' : ''}`} onClick={() => selectWarehouse(warehouse)}>
                <div className="warehouse-info">
                  <h3>{warehouse.name}</h3>
                  <p>Location: {warehouse.location || '-'}</p>
                  <p>Capacity: {warehouse.capacity}</p>
                </div>
              </div>
            ))}
          </div>

          {selectedWarehouse && (
            <div className="auth-section">
              <div className="section-header">
                <h2>Access Authentication</h2>
                <button onClick={() => setShowAuthPanel(!showAuthPanel)}>{showAuthPanel ? 'Close' : 'Test Auth'}</button>
              </div>

              {showAuthPanel && (
                <div className="auth-panel">
                  <form onSubmit={handleAuthenticate} className="auth-form">
                    <div className="form-group">
                      <select value={authData.method} onChange={(e) => setAuthData({ ...authData, method: e.target.value })}>
                        <option value="pin">PIN</option>
                        <option value="otp">OTP</option>
                        <option value="qr">QR</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <input type="text" placeholder="Auth value" value={authData.value} onChange={(e) => setAuthData({ ...authData, value: e.target.value })} required />
                    </div>
                    <button type="submit">Authenticate</button>
                  </form>
                  {authResult && <p className="auth-result">{authResult}</p>}
                </div>
              )}
            </div>
          )}

          {accessLogs.length > 0 && (
            <div className="logs-section">
              <h3>Access Logs</h3>
              <div className="logs-list">
                {accessLogs.map((log) => (
                  <div key={log.id} className={`log-item ${log.success ? 'success' : 'failed'}`}>
                    <span className="log-status">{log.success ? 'Success' : 'Failed'}</span>
                    <span>{log.username || 'Unknown'}</span>
                    <span>{log.auth_method}</span>
                    <span>{log.note || ''}</span>
                    <span className="log-time">{new Date(log.created_at).toLocaleString('ko-KR')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="right-panel">
          <div className="tab-nav">
            <button className={activeTab === 'cabinets' ? 'active' : ''} onClick={() => setActiveTab('cabinets')}>Cabinets</button>
            <button className={activeTab === 'contracts' ? 'active' : ''} onClick={() => setActiveTab('contracts')}>Contracts</button>
            {isAdmin && <button className={activeTab === 'hardware' ? 'active' : ''} onClick={() => { setActiveTab('hardware'); fetchHardwareStatus(); }}>Hardware</button>}
            {isAdmin && <button className={activeTab === 'naver' ? 'active' : ''} onClick={() => { setActiveTab('naver'); fetchNaverReservations(); }}>Naver</button>}
          </div>

          {stats && (
            <div className="stats-card">
              <h3>{currentWarehouse?.name} Stats</h3>
              <div className="stats-grid">
                <div className="stat-item"><span className="stat-label">Items</span><span className="stat-value">{stats.total_items}</span></div>
                <div className="stat-item"><span className="stat-label">Quantity</span><span className="stat-value">{stats.total_quantity}</span></div>
              </div>
            </div>
          )}

          {searchTerm && (
            <div className="search-results">
              <h3>Search Results ({searchResults.length})</h3>
              {searchResults.map((item) => (
                <div key={item.id} className="search-item">
                  <strong>{item.name}</strong>
                  <span>{item.warehouse_name}</span>
                  <span>{item.quantity}{item.unit}</span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'cabinets' && selectedWarehouse && (
            <div className="cabinets-section">
              <div className="section-header">
                <h2>Cabinet Layout</h2>
                <div>
                  {isAdmin && <button onClick={() => navigate('/layout-editor', { state: { warehouseId: selectedWarehouse } })}>Layout Editor</button>}
                  {isAdmin && <button onClick={() => setShowAddCabinet(true)}>+ Cabinet</button>}
                </div>
              </div>

              {showAddCabinet && (
                <form onSubmit={handleAddCabinet} className="add-form">
                  <div className="form-group">
                    <select value={newCabinet.size} onChange={(e) => setNewCabinet({ ...newCabinet, size: e.target.value })}>
                      <option value="S">S</option>
                      <option value="M">M</option>
                      <option value="L">L</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <input type="number" placeholder="Relay channel" value={newCabinet.relay_channel} onChange={(e) => setNewCabinet({ ...newCabinet, relay_channel: parseInt(e.target.value, 10) || 1 })} min="1" max="4" />
                  </div>
                  <div className="form-actions">
                    <button type="submit">Save</button>
                    <button type="button" onClick={() => setShowAddCabinet(false)}>Cancel</button>
                  </div>
                </form>
              )}

              <div className="layout-viewer">
                <div className="warehouse-floor">
                  <div className="floor-label">{currentWarehouse?.name || 'Warehouse'}</div>
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
                </div>
              </div>
            </div>
          )}

          {activeTab === 'contracts' && (
            <div className="contracts-section">
              <div className="section-header">
                <h2>Contracts</h2>
                <button onClick={() => setShowContractModal(true)}>+ Contract</button>
              </div>

              {showContractModal && (
                <form onSubmit={handleCreateContract} className="add-form">
                  <div className="form-group">
                    <select value={contractData.cabinet_id} onChange={(e) => setContractData({ ...contractData, cabinet_id: e.target.value })} required>
                      <option value="">Select cabinet</option>
                      {cabinets.filter((c) => c.status === 'available').map((c) => (
                        <option key={c.id} value={c.id}>#{c.id} ({c.size})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group"><input type="datetime-local" value={contractData.start_date} onChange={(e) => setContractData({ ...contractData, start_date: e.target.value })} required /></div>
                  <div className="form-group"><input type="datetime-local" value={contractData.end_date} onChange={(e) => setContractData({ ...contractData, end_date: e.target.value })} required /></div>
                  <div className="form-group"><input type="number" placeholder="Amount" value={contractData.total_amount} onChange={(e) => setContractData({ ...contractData, total_amount: parseInt(e.target.value, 10) || 0 })} /></div>
                  <div className="form-actions">
                    <button type="submit">Save</button>
                    <button type="button" onClick={() => setShowContractModal(false)}>Cancel</button>
                  </div>
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
                    <div className="contract-amount">{Number(contract.total_amount || 0).toLocaleString()} KRW</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'hardware' && isAdmin && (
            <div className="hardware-section">
              <h3>Hardware Status</h3>
              <div className="hardware-grid">
                {hardwareStatus.map((hw) => (
                  <div key={hw.id} className={`hardware-card ${hw.door_status}`}>
                    <div className="hardware-name">{hw.name}</div>
                    <div className="hardware-status">
                      <span className={`status-indicator ${hw.door_status}`}></span>
                      {hw.door_status}
                    </div>
                    {hw.fire_alarm && <div className="fire-alarm">Fire alarm</div>}
                    <button className="unlock-btn" onClick={() => handleUnlockDoor(hw.warehouse_id)}>Unlock Door</button>
                    <div className="hardware-time">Last check: {new Date(hw.last_check).toLocaleString('ko-KR')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'naver' && isAdmin && (
            <div className="naver-sync-section">
              <div className="section-header">
                <h2>Naver Reservation Sync</h2>
                <button onClick={() => setShowNaverSync(!showNaverSync)}>{showNaverSync ? 'Close' : 'Sync'}</button>
              </div>
              {showNaverSync && (
                <div className="sync-actions">
                  <button onClick={handleSyncEmails} disabled={syncLoading}>{syncLoading ? 'Processing...' : 'Parse Emails'}</button>
                  <button onClick={handleSyncCrawler} disabled={syncLoading}>{syncLoading ? 'Processing...' : 'Run Crawler'}</button>
                </div>
              )}
              <div className="reservation-list">
                {navReservations.length === 0 ? (
                  <p className="no-data">No reservation data.</p>
                ) : (
                  navReservations.map((r) => (
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
