import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Grip, RotateCcw, Save } from 'lucide-react';
import api from './api';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { cn } from './lib/utils';

const COLUMNS = 5;
const ROWS = 5;

const statusLabels = {
  available: '사용 가능',
  occupied: '사용 중',
  maintenance: '점검 중',
  expired_soon: '만료 예정',
};

const statusClasses = {
  available: 'bg-green-100 text-green-800 ring-green-300',
  occupied: 'bg-red-100 text-red-800 ring-red-300',
  maintenance: 'bg-yellow-100 text-yellow-900 ring-yellow-300',
  expired_soon: 'bg-yellow-100 text-yellow-900 ring-yellow-300',
};

const sizeColors = {
  S: 'border-blue-500 bg-blue-50 text-blue-900',
  M: 'border-green-500 bg-green-50 text-green-900',
  L: 'border-purple-500 bg-purple-50 text-purple-900',
  XL: 'border-orange-500 bg-orange-50 text-orange-900',
  XXL: 'border-red-500 bg-red-50 text-red-900',
};

const sizeHex = {
  S: '#2563eb',
  M: '#16a34a',
  L: '#9333ea',
  XL: '#f97316',
  XXL: '#dc2626',
};

const sizeFootprints = {
  S: { width: 1, height: 1 },
  M: { width: 1, height: 2 },
  L: { width: 2, height: 2 },
  XL: { width: 2, height: 3 },
  XXL: { width: 3, height: 3 },
};

function getFootprint(size) {
  return sizeFootprints[size] || sizeFootprints.M;
}

function clampGrid(value, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(max, Math.max(0, parsed));
}

function getCabinetCells(cabinet, x = cabinet.x, y = cabinet.y) {
  const footprint = getFootprint(cabinet.size);
  const cells = [];
  for (let row = 0; row < footprint.height; row += 1) {
    for (let col = 0; col < footprint.width; col += 1) {
      cells.push(`${Number(x) + col}-${Number(y) + row}`);
    }
  }
  return cells;
}

function isPlacementValid(cabinets, cabinetId, x, y) {
  const moving = cabinets.find((cabinet) => Number(cabinet.id) === Number(cabinetId));
  if (!moving) return false;

  const footprint = getFootprint(moving.size);
  if (x < 0 || y < 0 || x + footprint.width > COLUMNS || y + footprint.height > ROWS) {
    return false;
  }

  const targetCells = new Set(getCabinetCells(moving, x, y));
  return cabinets.every((cabinet) => {
    if (Number(cabinet.id) === Number(cabinetId)) return true;
    return getCabinetCells(cabinet).every((cell) => !targetCells.has(cell));
  });
}

function normalizeCabinet(cabinet, saved, index) {
  const positionIndex = saved?.position_index ?? saved?.index ?? cabinet.position_index ?? index;
  const size = saved?.size || cabinet.size || 'M';
  const footprint = getFootprint(size);
  const x = clampGrid(saved?.x ?? saved?.position_x ?? cabinet.position_x ?? positionIndex % COLUMNS, COLUMNS - footprint.width);
  const y = clampGrid(saved?.y ?? saved?.position_y ?? cabinet.position_y ?? Math.floor(positionIndex / COLUMNS), ROWS - footprint.height);

  return {
    ...cabinet,
    size,
    name: saved?.name || cabinet.name || `${size}#${cabinet.id}`,
    x,
    y,
    position_x: x,
    position_y: y,
    position_index: y * COLUMNS + x,
    layout_data: saved || cabinet.layout_data,
  };
}

function cabinetToLayout(cabinet) {
  const footprint = getFootprint(cabinet.size);
  const x = clampGrid(cabinet.x ?? cabinet.position_x, COLUMNS - footprint.width);
  const y = clampGrid(cabinet.y ?? cabinet.position_y, ROWS - footprint.height);

  return {
    cabinet_id: cabinet.id,
    id: cabinet.id,
    name: cabinet.name || `${cabinet.size}#${cabinet.id}`,
    size: cabinet.size,
    color: sizeHex[cabinet.size] || sizeHex.M,
    x,
    y,
    row: y + 1,
    col: x + 1,
    position_x: x,
    position_y: y,
    position_index: y * COLUMNS + x,
    relay_channel: cabinet.relay_channel,
    footprint,
  };
}

function LayoutEditor({ warehouseId: propWarehouseId, onBack, onSaved, embedded = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const warehouseId = propWarehouseId || location.state?.warehouseId || localStorage.getItem('selectedWarehouseId');
  const [warehouse, setWarehouse] = useState(null);
  const [cabinets, setCabinets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [collisionTarget, setCollisionTarget] = useState(null);
  const draggingIdRef = useRef(null);
  const gridRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [message, setMessage] = useState('');

  const goBack = () => {
    if (onBack) onBack();
    else navigate('/dashboard');
  };

  const loadLayout = async () => {
    if (!warehouseId) {
      setMessage('먼저 창고를 선택하세요.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      const [warehouseData, cabinetData, layoutData] = await Promise.all([
        api.getWarehouses(),
        api.getCabinets(warehouseId),
        api.getWarehouseLayout(warehouseId).catch(() => []),
      ]);
      const selected = warehouseData.find((item) => Number(item.id) === Number(warehouseId));
      const savedByCabinetId = new Map((layoutData || []).map((item) => [Number(item.cabinet_id || item.id), item]));

      setWarehouse(selected || { id: warehouseId, name: `창고 #${warehouseId}` });
      setCabinets(cabinetData.map((cabinet, index) => {
        const saved = savedByCabinetId.get(Number(cabinet.id));
        return normalizeCabinet(cabinet, saved, index);
      }));
    } catch (error) {
      setMessage(error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId]);

  const selectedCabinet = useMemo(
    () => cabinets.find((cabinet) => Number(cabinet.id) === Number(selectedId)) || null,
    [cabinets, selectedId]
  );

  const occupiedCells = useMemo(() => {
    const cells = new Map();
    cabinets.forEach((cabinet) => {
      getCabinetCells(cabinet).forEach((cell) => cells.set(cell, cabinet));
    });
    return cells;
  }, [cabinets]);

  const moveCabinet = (cabinetId, x, y) => {
    const moving = cabinets.find((cabinet) => Number(cabinet.id) === Number(cabinetId));
    if (!moving) return false;

    const footprint = getFootprint(moving.size);
    const targetX = clampGrid(x, COLUMNS - footprint.width);
    const targetY = clampGrid(y, ROWS - footprint.height);

    if (!isPlacementValid(cabinets, cabinetId, targetX, targetY)) {
      setCollisionTarget({ id: Number(cabinetId), x: targetX, y: targetY });
      return false;
    }

    setCabinets((current) => {
      if (!isPlacementValid(current, cabinetId, targetX, targetY)) return current;

      return current.map((cabinet) => {
        if (Number(cabinet.id) === Number(cabinetId)) {
          return {
            ...cabinet,
            x: targetX,
            y: targetY,
            position_x: targetX,
            position_y: targetY,
            position_index: targetY * COLUMNS + targetX,
          };
        }
        return cabinet;
      });
    });
    setCollisionTarget(null);
    return true;
  };

  useEffect(() => {
    const finishPointerDrag = (event) => {
      const droppedId = draggingIdRef.current;
      const grid = gridRef.current;
      if (!droppedId || !grid) return;

      const rect = grid.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        endDrag();
        return;
      }

      const x = Math.floor(((event.clientX - rect.left) / rect.width) * COLUMNS);
      const y = Math.floor(((event.clientY - rect.top) / rect.height) * ROWS);
      if (moveCabinet(droppedId, x, y)) {
        setSelectedId(droppedId);
      } else {
        setMessage('캐비넷 크기 때문에 해당 위치에 배치할 수 없습니다.');
      }
      endDrag();
    };

    window.addEventListener('pointerup', finishPointerDrag, true);
    window.addEventListener('mouseup', finishPointerDrag, true);
    return () => {
      window.removeEventListener('pointerup', finishPointerDrag, true);
      window.removeEventListener('mouseup', finishPointerDrag, true);
    };
  });

  const handleDrop = (x, y, event) => {
    event?.preventDefault();
    const droppedId = event?.dataTransfer?.getData('text/plain') || draggingIdRef.current || dragging?.id;
    if (!droppedId) return;
    if (moveCabinet(droppedId, x, y)) {
      setSelectedId(droppedId);
    } else {
      setMessage('캐비넷 크기 때문에 해당 위치에 배치할 수 없습니다.');
    }
    draggingIdRef.current = null;
    setDragging(null);
  };

  const startDrag = (cabinet) => {
    draggingIdRef.current = cabinet.id;
    setDragging(cabinet);
    setSelectedId(cabinet.id);
  };

  const endDrag = () => {
    draggingIdRef.current = null;
    setDragging(null);
    setCollisionTarget(null);
  };

  const renameCabinet = (cabinetId, name) => {
    setCabinets((current) => current.map((cabinet) => (
      Number(cabinet.id) === Number(cabinetId) ? { ...cabinet, name } : cabinet
    )));
  };

  const handleSave = async () => {
    if (cabinets.some((cabinet) => !String(cabinet.name || '').trim())) {
      setMessage('캐비넷 이름을 입력하세요.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const layoutData = cabinets
        .map(cabinetToLayout)
        .sort((a, b) => a.position_index - b.position_index);

      await api.saveWarehouseLayout(warehouseId, layoutData);
      await Promise.all(layoutData.map((item) => api.saveCabinetLayout(item.cabinet_id, {
        position_x: item.x,
        position_y: item.y,
        position_index: item.position_index,
        layout_data: item,
      })));
      await Promise.all(cabinets.map((cabinet) => api.saveCabinetName(cabinet.id, String(cabinet.name).trim())));
      setMessage('저장되었습니다.');
      onSaved?.();
    } catch (error) {
      setMessage(error.response?.data?.message || error.message);
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <>
      {message && <div className="rounded-md border bg-card px-4 py-3 text-sm shadow-sm">{message}</div>}

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>캐비넷 상세</CardTitle>
            <CardDescription>캐비넷을 드래그하거나 선택한 뒤 좌표를 조정하세요.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {selectedCabinet ? (
              <div className="space-y-3 rounded-md border bg-muted/30 p-4 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <strong>{selectedCabinet.name}</strong>
                  <span className={cn('rounded-full px-2 py-1 text-xs font-semibold ring-1', statusClasses[selectedCabinet.status] || statusClasses.available)}>
                    {statusLabels[selectedCabinet.status] || selectedCabinet.status}
                  </span>
                </div>
                <label className="block text-xs font-medium">
                  이름
                  <input
                    className="app-input mt-1 text-sm"
                    type="text"
                    data-testid="layout-name-input"
                    value={selectedCabinet.name}
                    onChange={(event) => renameCabinet(selectedCabinet.id, event.target.value)}
                  />
                </label>
                <p>크기: {selectedCabinet.size} ({getFootprint(selectedCabinet.size).width}x{getFootprint(selectedCabinet.size).height})</p>
                <p>릴레이: {selectedCabinet.relay_channel || '-'}</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs font-medium">
                    X
                    <input
                      className="app-input mt-1 text-sm"
                      type="number"
                      data-testid="layout-x-input"
                      min="0"
                      max={COLUMNS - getFootprint(selectedCabinet.size).width}
                      value={selectedCabinet.x}
                      onChange={(event) => {
                        if (!moveCabinet(selectedCabinet.id, event.target.value, selectedCabinet.y)) {
                          setMessage('캐비넷 크기 때문에 해당 위치에 배치할 수 없습니다.');
                        }
                      }}
                    />
                  </label>
                  <label className="text-xs font-medium">
                    Y
                    <input
                      className="app-input mt-1 text-sm"
                      type="number"
                      data-testid="layout-y-input"
                      min="0"
                      max={ROWS - getFootprint(selectedCabinet.size).height}
                      value={selectedCabinet.y}
                      onChange={(event) => {
                        if (!moveCabinet(selectedCabinet.id, selectedCabinet.x, event.target.value)) {
                          setMessage('캐비넷 크기 때문에 해당 위치에 배치할 수 없습니다.');
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
                캐비넷을 선택하세요.
              </div>
            )}

            <div>
              <h3 className="mb-3 text-sm font-semibold">크기 색상</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(sizeColors).map(([size, className]) => (
                  <div key={size} className="flex items-center gap-2">
                    <span className={cn('h-3 w-3 rounded-full border', className)} />
                    {size}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold">상태</h3>
              <div className="space-y-2 text-xs">
                {Object.entries(statusLabels).slice(0, 3).map(([status, label]) => (
                  <span key={status} className={cn('mr-2 inline-flex rounded-full px-2 py-1 font-semibold ring-1', statusClasses[status])}>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>배치 그리드</CardTitle>
              <CardDescription>{COLUMNS}열 x {ROWS}행, 캐비넷 {cabinets.length}개</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={loadLayout} disabled={loading || saving}>
                <RotateCcw className="h-4 w-4" />
                초기화
              </Button>
              <Button onClick={handleSave} disabled={saving || !warehouseId}>
                <Save className="h-4 w-4" />
                {saving ? '저장 중...' : '저장'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-md border bg-slate-100 p-4 shadow-inner">
              <div
                ref={gridRef}
                className="grid min-w-[640px]"
                style={{
                  display: 'grid',
                  gap: 12,
                  gridTemplateColumns: `repeat(${COLUMNS}, minmax(104px, 1fr))`,
                  gridTemplateRows: `repeat(${ROWS}, minmax(112px, 1fr))`,
                }}
              >
                {Array.from({ length: COLUMNS * ROWS }).map((_, index) => {
                  const x = index % COLUMNS;
                  const y = Math.floor(index / COLUMNS);
                  const cabinet = occupiedCells.get(`${x}-${y}`);
                  const collision = collisionTarget && getCabinetCells(
                    cabinets.find((item) => Number(item.id) === Number(collisionTarget.id)) || { size: 'M', x, y },
                    collisionTarget.x,
                    collisionTarget.y
                  ).includes(`${x}-${y}`);

                  return (
                    <div
                      key={`${x}-${y}`}
                      data-testid={`layout-cell-${x}-${y}`}
                      className={cn(
                        'relative min-h-28 rounded-md border border-dashed p-2',
                        cabinet ? 'border-slate-300 bg-white/90' : 'border-slate-400 bg-slate-50',
                        dragging && !collision && 'border-primary/50 bg-primary/5',
                        collision && 'border-red-500 bg-red-50 ring-2 ring-red-200'
                      )}
                      style={{ minHeight: 112, gridColumn: x + 1, gridRow: y + 1 }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => handleDrop(x, y, event)}
                      onMouseEnter={() => {
                        if (draggingIdRef.current) moveCabinet(draggingIdRef.current, x, y);
                      }}
                    >
                      <span className="absolute left-2 top-1 text-[10px] font-medium text-slate-500">
                        {x},{y}
                      </span>
                    </div>
                  );
                })}
                {cabinets.map((cabinet) => {
                  const footprint = getFootprint(cabinet.size);

                  return (
                    <button
                      key={cabinet.id}
                      type="button"
                      data-testid={`layout-cabinet-${cabinet.id}`}
                      className={cn(
                        'z-10 flex min-h-28 cursor-grab select-none flex-col justify-between rounded-md border-2 p-3 text-left shadow-sm transition active:cursor-grabbing',
                        sizeColors[cabinet.size] || sizeColors.M,
                        Number(selectedId) === Number(cabinet.id) && 'ring-2 ring-primary',
                        dragging?.id === cabinet.id && 'opacity-60'
                      )}
                      style={{
                        gridColumn: `${Number(cabinet.x) + 1} / span ${footprint.width}`,
                        gridRow: `${Number(cabinet.y) + 1} / span ${footprint.height}`,
                        minHeight: '100%',
                      }}
                      draggable={false}
                      onClick={() => setSelectedId(cabinet.id)}
                      onMouseDown={() => startDrag(cabinet)}
                      onPointerDown={() => startDrag(cabinet)}
                      onPointerCancel={endDrag}
                      onDragStart={(event) => {
                        startDrag(cabinet);
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', String(cabinet.id));
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => handleDrop(cabinet.x, cabinet.y, event)}
                      onDragEnd={endDrag}
                    >
                      <div className="flex items-start justify-between gap-2 font-semibold">
                        <span>{cabinet.name}</span>
                        <Grip className="h-4 w-4 shrink-0 opacity-80" />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="w-fit rounded-full bg-white/70 px-2 py-1 text-xs font-semibold ring-1 ring-current">
                          {cabinet.size} {footprint.width}x{footprint.height}
                        </span>
                        <span className={cn('w-fit rounded-full px-2 py-1 text-xs font-semibold ring-1', statusClasses[cabinet.status] || statusClasses.available)}>
                          {statusLabels[cabinet.status] || cabinet.status}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );

  if (loading) {
    return (
      <main className={embedded ? '' : 'flex min-h-screen items-center justify-center bg-background'}>
        <Card className="w-full max-w-sm">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">레이아웃 로딩 중...</CardContent>
        </Card>
      </main>
    );
  }

  if (embedded) {
    return <div className="space-y-6">{content}</div>;
  }

  return (
    <main className="page-shell">
      <header className="teal-header">
        <div className="teal-header__inner flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="icon" onClick={goBack} aria-label="뒤로">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold">{warehouse?.name || '창고'} 레이아웃 편집</h1>
              <div className="breadcrumb mt-1"><span>대시보드</span><span>/</span><strong>레이아웃 편집</strong></div>
            </div>
          </div>
          <Button variant="secondary" onClick={handleSave} disabled={saving || !warehouseId}>
            <Save className="h-4 w-4" />
            {saving ? '저장 중...' : '저장'}
          </Button>
        </div>
      </header>

      <div className="page-main space-y-6">{content}</div>
    </main>
  );
}

export default LayoutEditor;
