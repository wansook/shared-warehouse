import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, CalendarDays, DoorOpen, Edit3, LayoutGrid, LogOut, Plus, RefreshCw, Warehouse } from 'lucide-react';
import api from './api';
import DynamicLayoutViewer from './DynamicLayoutViewer';
import LayoutEditor from './LayoutEditor';
import ContractFlow from './ContractFlow';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { cn } from './lib/utils';

const fieldClass = 'app-input text-sm';

function Dashboard({ paymentResult }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [cabinets, setCabinets] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [hardwareStatus, setHardwareStatus] = useState([]);
  const [message, setMessage] = useState(paymentResult === 'success' ? '결제가 완료되었습니다.' : paymentResult === 'fail' ? '결제에 실패했습니다.' : '');
  const [activeTab, setActiveTab] = useState('layout');
  const [selectedCabinet, setSelectedCabinet] = useState(null);
  const [newWarehouse, setNewWarehouse] = useState({ name: '', location: '', capacity: 0 });
  const [newCabinet, setNewCabinet] = useState({ size: 'S', relay_channel: 1, position_x: 0, position_y: 0 });
  const [authForm, setAuthForm] = useState({ method: 'pin', value: '' });

  const isAdmin = user?.role === 'admin';
  const selectedWarehouse = useMemo(
    () => warehouses.find((warehouse) => Number(warehouse.id) === Number(selectedWarehouseId)),
    [warehouses, selectedWarehouseId]
  );

  const handleAuthError = (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.clear();
      navigate('/customer-login', { replace: true });
      return true;
    }
    return false;
  };

  const loadWarehouses = async () => {
    try {
      const warehouseData = await api.getWarehouses();
      setWarehouses(warehouseData);
      if (!selectedWarehouseId && warehouseData[0]) setSelectedWarehouseId(warehouseData[0].id);
    } catch (error) {
      handleAuthError(error);
    }
  };

  const loadCabinets = async (warehouseId) => {
    if (!warehouseId) return;
    try {
      localStorage.setItem('selectedWarehouseId', String(warehouseId));
      const cabinetData = await api.getCabinets(warehouseId);
      setCabinets(cabinetData);
    } catch (error) {
      if (!handleAuthError(error)) setMessage(error.response?.data?.message || error.message);
    }
  };

  const loadContracts = async () => {
    try {
      const response = await api.get('/api/contracts');
      setContracts(response.data);
    } catch (error) {
      if (!handleAuthError(error)) setMessage(error.response?.data?.message || error.message);
    }
  };

  const loadHardware = async () => {
    if (!isAdmin) return;
    try {
      const response = await api.get('/api/admin/hardware/status');
      setHardwareStatus(response.data);
    } catch (error) {
      if (error.response?.status !== 403) setMessage(error.response?.data?.message || error.message);
    }
  };

  useEffect(() => {
    const savedUser = JSON.parse(localStorage.getItem('user') || 'null');
    if (!savedUser) {
      navigate('/customer-login', { replace: true });
      return;
    }
    setUser(savedUser);
    loadWarehouses();
    loadContracts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  useEffect(() => {
    loadCabinets(selectedWarehouseId);
    setSelectedCabinet(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWarehouseId]);

  useEffect(() => {
    loadHardware();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const addWarehouse = async (event) => {
    event.preventDefault();
    try {
      await api.post('/api/warehouses', newWarehouse);
      setNewWarehouse({ name: '', location: '', capacity: 0 });
      setMessage('창고가 생성되었습니다.');
      loadWarehouses();
    } catch (error) {
      setMessage(error.response?.data?.message || error.message);
    }
  };

  const addCabinet = async (event) => {
    event.preventDefault();
    if (!selectedWarehouseId) return;
    try {
      await api.post(`/api/warehouses/${selectedWarehouseId}/cabinets`, newCabinet);
      setNewCabinet({ size: 'S', relay_channel: 1, position_x: 0, position_y: 0 });
      setMessage('캐비넷이 생성되었습니다.');
      loadCabinets(selectedWarehouseId);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message);
    }
  };

  const authenticateAccess = async (event) => {
    event.preventDefault();
    if (!selectedWarehouseId) return;
    try {
      const response = await api.post('/api/access/authenticate', {
        warehouse_id: selectedWarehouseId,
        auth_method: authForm.method,
        auth_value: authForm.value,
      });
      setMessage(response.data.message || '접근이 승인되었습니다.');
      setAuthForm({ ...authForm, value: '' });
    } catch (error) {
      setMessage(error.response?.data?.message || error.message);
    }
  };

  const unlockDoor = async () => {
    if (!selectedWarehouseId) return;
    try {
      await api.post('/api/admin/door/unlock', { warehouse_id: selectedWarehouseId });
      setMessage('문 열기가 요청되었습니다.');
      loadHardware();
    } catch (error) {
      setMessage(error.response?.data?.message || error.message);
    }
  };

  const refreshAll = () => {
    loadWarehouses();
    loadCabinets(selectedWarehouseId);
    loadContracts();
    loadHardware();
  };

  const logout = () => {
    localStorage.clear();
    navigate('/customer-login', { replace: true });
  };

  return (
    <div className="page-shell">
      <header className="teal-header">
        <div className="teal-header__inner flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-white/15 p-2 text-white ring-1 ring-white/20">
              <Warehouse className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">공유 창고</h1>
              <div className="breadcrumb mt-1">
                <span>대시보드</span>
                <span>/</span>
                <strong>{selectedWarehouse?.name || '창고'}</strong>
                <span>/</span>
                <span>{user?.username} ({user?.role})</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={refreshAll}><RefreshCw className="h-4 w-4" />새로고침</Button>
            <Button variant="secondary" onClick={() => navigate('/profile')}>프로필</Button>
            <Button variant="ghost" className="hover:bg-white/15" onClick={logout}><LogOut className="h-4 w-4" />로그아웃</Button>
          </div>
        </div>
      </header>

      <main className="page-main grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" />창고 목록</CardTitle>
              <CardDescription>관리할 지점을 선택하세요.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {warehouses.map((warehouse) => (
                <button
                  key={warehouse.id}
                  type="button"
                  onClick={() => setSelectedWarehouseId(warehouse.id)}
                  className={cn('w-full rounded-md border bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-primary hover:shadow-sm', Number(selectedWarehouseId) === Number(warehouse.id) && 'border-primary bg-primary/10 shadow-sm')}
                >
                  <div className="font-medium">{warehouse.name}</div>
                  <div className="text-sm text-muted-foreground">{warehouse.location || '위치 없음'} / {warehouse.capacity || 0}개</div>
                </button>
              ))}
              {warehouses.length === 0 && <p className="text-sm text-muted-foreground">아직 등록된 창고가 없습니다.</p>}
            </CardContent>
          </Card>

          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>창고 추가</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-2" onSubmit={addWarehouse}>
                  <Input placeholder="이름" value={newWarehouse.name} onChange={(e) => setNewWarehouse({ ...newWarehouse, name: e.target.value })} required />
                  <Input placeholder="위치" value={newWarehouse.location} onChange={(e) => setNewWarehouse({ ...newWarehouse, location: e.target.value })} />
                  <Input type="number" placeholder="수용량" value={newWarehouse.capacity} onChange={(e) => setNewWarehouse({ ...newWarehouse, capacity: Number(e.target.value) || 0 })} />
                  <Button type="submit" className="w-full"><Plus className="h-4 w-4" />추가</Button>
                </form>
              </CardContent>
            </Card>
          )}

          {selectedWarehouseId && (
            <Card>
              <CardHeader>
                <CardTitle>접근 테스트</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-2" onSubmit={authenticateAccess}>
                  <select className={fieldClass} value={authForm.method} onChange={(e) => setAuthForm({ ...authForm, method: e.target.value })}>
                    <option value="pin">PIN</option>
                    <option value="otp">OTP</option>
                    <option value="qr">QR</option>
                  </select>
                  <Input placeholder="인증 정보" value={authForm.value} onChange={(e) => setAuthForm({ ...authForm, value: e.target.value })} required />
                  <Button type="submit" className="w-full"><DoorOpen className="h-4 w-4" />인증</Button>
                </form>
              </CardContent>
            </Card>
          )}
        </aside>

        <section className="space-y-4">
          {message && <div className="rounded-md border bg-card px-4 py-3 text-sm shadow-sm">{message}</div>}

          <div className="flex flex-wrap gap-2 rounded-lg border bg-card p-2 shadow-sm">
            <Button variant={activeTab === 'layout' ? 'default' : 'ghost'} onClick={() => setActiveTab('layout')}><LayoutGrid className="h-4 w-4" />레이아웃</Button>
            {isAdmin && <Button variant={activeTab === 'layout-edit' ? 'default' : 'ghost'} onClick={() => setActiveTab('layout-edit')}><Edit3 className="h-4 w-4" />레이아웃 편집</Button>}
            <Button variant={activeTab === 'contracts' ? 'default' : 'ghost'} onClick={() => setActiveTab('contracts')}><CalendarDays className="h-4 w-4" />계약</Button>
            {isAdmin && <Button variant={activeTab === 'admin' ? 'default' : 'ghost'} onClick={() => setActiveTab('admin')}>관리자</Button>}
          </div>

          {activeTab === 'layout' && (
            <Card>
              <CardHeader>
                <CardTitle>{selectedWarehouse?.name || '레이아웃'}</CardTitle>
                <CardDescription>계약할 사용 가능한 캐비넷을 선택하세요.</CardDescription>
              </CardHeader>
              <CardContent>
                <DynamicLayoutViewer
                  warehouseId={selectedWarehouseId}
                  cabinets={cabinets}
                  selectedCabinetId={selectedCabinet?.id}
                  onSelectCabinet={setSelectedCabinet}
                />
              </CardContent>
            </Card>
          )}

          {activeTab === 'layout-edit' && isAdmin && (
            <LayoutEditor
              embedded
              warehouseId={selectedWarehouseId}
              onSaved={() => loadCabinets(selectedWarehouseId)}
            />
          )}

          {selectedCabinet && (
            <ContractFlow
              cabinet={selectedCabinet}
              warehouseName={selectedWarehouse?.name}
              onCancel={() => setSelectedCabinet(null)}
              onComplete={() => {
                setSelectedCabinet(null);
                loadCabinets(selectedWarehouseId);
                loadContracts();
                setMessage('계약이 완료되었습니다.');
              }}
            />
          )}

          {activeTab === 'contracts' && (
            <Card>
              <CardHeader>
                <CardTitle>계약</CardTitle>
                <CardDescription>{contracts.length}건의 계약</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {contracts.map((contract) => (
                  <div key={contract.id} className="grid gap-3 rounded-md border bg-white p-3 md:grid-cols-[1fr_220px_120px] md:items-center">
                    <div>
                      <div className="font-medium">{contract.username || `사용자 #${contract.user_id}`}</div>
                      <div className="text-sm text-muted-foreground">캐비넷 #{contract.cabinet_id} / {contract.size}</div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(contract.start_date).toLocaleDateString()} - {new Date(contract.end_date).toLocaleDateString()}
                    </div>
                    <span className={`status-badge ${contract.status || 'active'}`}>{contract.status}</span>
                  </div>
                ))}
                {contracts.length === 0 && <p className="text-sm text-muted-foreground">아직 계약이 없습니다.</p>}
              </CardContent>
            </Card>
          )}

          {activeTab === 'admin' && isAdmin && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>캐비넷 추가</CardTitle>
                  <CardDescription>{selectedWarehouse?.name || '먼저 창고를 선택하세요.'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="grid gap-2" onSubmit={addCabinet}>
                    <select className={fieldClass} value={newCabinet.size} onChange={(e) => setNewCabinet({ ...newCabinet, size: e.target.value })}>
                      <option value="S">소형</option>
                      <option value="M">중형</option>
                      <option value="L">대형</option>
                    </select>
                    <Input type="number" placeholder="릴레이 채널" value={newCabinet.relay_channel} onChange={(e) => setNewCabinet({ ...newCabinet, relay_channel: Number(e.target.value) || 1 })} />
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="number" placeholder="X" value={newCabinet.position_x} onChange={(e) => setNewCabinet({ ...newCabinet, position_x: Number(e.target.value) || 0 })} />
                      <Input type="number" placeholder="Y" value={newCabinet.position_y} onChange={(e) => setNewCabinet({ ...newCabinet, position_y: Number(e.target.value) || 0 })} />
                    </div>
                    <Button type="submit" disabled={!selectedWarehouseId}>캐비넷 추가</Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>하드웨어</CardTitle>
                  <CardDescription>문과 화재 경보 상태.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="outline" onClick={unlockDoor} disabled={!selectedWarehouseId}><DoorOpen className="h-4 w-4" />선택된 문 열기</Button>
                  {hardwareStatus.map((status) => (
                    <div key={status.id} className="rounded-md border bg-white p-3 text-sm">
                      <div className="font-medium">{status.name || `창고 #${status.warehouse_id}`}</div>
                      <div className="text-muted-foreground">문: {status.door_status} / 화재: {status.fire_alarm ? '경보' : '정상'}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default Dashboard;
