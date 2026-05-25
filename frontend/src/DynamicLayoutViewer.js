import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Grid3X3, Wrench, XCircle } from 'lucide-react';
import api from './api';
import { cn } from './lib/utils';

const COLUMNS = 5;
const ROWS = 5;

const STATUS = {
  available: { label: '사용가능', icon: CheckCircle2, badge: 'bg-green-100 text-green-800 ring-green-300' },
  occupied: { label: '사용중', icon: XCircle, badge: 'bg-red-100 text-red-800 ring-red-300' },
  maintenance: { label: '점검중', icon: Wrench, badge: 'bg-yellow-100 text-yellow-900 ring-yellow-300' },
  expired_soon: { label: '만료예정', icon: XCircle, badge: 'bg-yellow-100 text-yellow-900 ring-yellow-300' },
};

const SIZE_COLORS = {
  S: 'border-blue-500 bg-blue-50 text-blue-900',
  M: 'border-green-500 bg-green-50 text-green-900',
  L: 'border-purple-500 bg-purple-50 text-purple-900',
  XL: 'border-orange-500 bg-orange-50 text-orange-900',
  XXL: 'border-red-500 bg-red-50 text-red-900',
};

function clampGrid(value, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(max, Math.max(0, parsed));
}

function normalizeCabinet(cabinet, saved, index) {
  const positionIndex = saved?.position_index ?? saved?.index ?? cabinet.position_index ?? index;
  const x = clampGrid(saved?.x ?? saved?.position_x ?? cabinet.position_x ?? positionIndex % COLUMNS, COLUMNS - 1);
  const y = clampGrid(saved?.y ?? saved?.position_y ?? cabinet.position_y ?? Math.floor(positionIndex / COLUMNS), ROWS - 1);

  return {
    ...cabinet,
    name: saved?.name || cabinet.name || `${cabinet.size}#${cabinet.id}`,
    position_x: x,
    position_y: y,
    position_index: y * COLUMNS + x,
  };
}

function DynamicLayoutViewer({ warehouseId, cabinets: providedCabinets, onSelectCabinet, selectedCabinetId }) {
  const [cabinets, setCabinets] = useState(providedCabinets || []);
  const [layout, setLayout] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!warehouseId) {
      if (providedCabinets) setCabinets(providedCabinets);
      setLayout([]);
      return;
    }

    setLoading(true);
    setError('');
    Promise.all([
      providedCabinets ? Promise.resolve(providedCabinets) : api.getCabinets(warehouseId),
      api.getWarehouseLayout(warehouseId).catch(() => []),
    ])
      .then(([cabinetData, layoutData]) => {
        setCabinets(cabinetData);
        setLayout(Array.isArray(layoutData) ? layoutData : []);
      })
      .catch((err) => setError(err.response?.data?.message || err.message))
      .finally(() => setLoading(false));
  }, [providedCabinets, warehouseId]);

  const positionedCabinets = useMemo(() => {
    const byCabinetId = new Map(layout.map((item) => [Number(item.cabinet_id || item.id), item]));
    return cabinets.map((cabinet, index) => normalizeCabinet(cabinet, byCabinetId.get(Number(cabinet.id)), index));
  }, [cabinets, layout]);

  const cells = useMemo(() => {
    const byCell = new Map();
    positionedCabinets.forEach((cabinet) => {
      byCell.set(`${cabinet.position_x}-${cabinet.position_y}`, cabinet);
    });
    return byCell;
  }, [positionedCabinets]);

  if (!warehouseId && !providedCabinets) {
    return <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">레이아웃을 보려면 창고를 선택하세요.</div>;
  }

  if (loading) return <div className="rounded-md border p-6 text-sm text-muted-foreground">레이아웃 로딩 중...</div>;
  if (error) return <div className="rounded-md border border-destructive/30 p-6 text-sm text-destructive">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Grid3X3 className="h-4 w-4" />
          실시간 캐비넷 현황
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(SIZE_COLORS).map(([size, className]) => (
            <span key={size} className={cn('rounded-full border px-2 py-1 font-semibold', className)}>{size}</span>
          ))}
        </div>
      </div>

      <div className="overflow-auto rounded-md border bg-slate-100 p-4 shadow-inner">
        <div
          className="grid min-w-[640px] gap-3"
          style={{ display: 'grid', gap: 12, gridTemplateColumns: `repeat(${COLUMNS}, minmax(104px, 1fr))` }}
        >
          {Array.from({ length: COLUMNS * ROWS }).map((_, index) => {
            const x = index % COLUMNS;
            const y = Math.floor(index / COLUMNS);
            const cabinet = cells.get(`${x}-${y}`);

            if (!cabinet) {
              return (
                <div key={`${x}-${y}`} className="relative min-h-28 rounded-md border border-dashed bg-white/70" style={{ minHeight: 112 }}>
                  <span className="absolute left-2 top-1 text-[10px] font-medium text-muted-foreground">{x},{y}</span>
                </div>
              );
            }

            const status = STATUS[cabinet.status] || STATUS.available;
            const Icon = status.icon;
            const selectable = cabinet.status === 'available' && onSelectCabinet;
            const sizeClass = SIZE_COLORS[cabinet.size] || SIZE_COLORS.M;

            return (
              <button
                key={cabinet.id}
                data-testid={`layout-cabinet-${cabinet.id}`}
                type="button"
                disabled={!selectable}
                onClick={() => onSelectCabinet?.(cabinet)}
                className={cn(
                  'relative flex min-h-28 flex-col justify-between rounded-md border-2 p-3 pt-5 text-left shadow-sm transition',
                  sizeClass,
                  cabinet.status === 'occupied' && 'opacity-80',
                  selectable && 'hover:-translate-y-0.5 hover:shadow-md',
                  Number(selectedCabinetId) === Number(cabinet.id) && 'ring-2 ring-primary'
                )}
                style={{ minHeight: 112, display: 'flex' }}
              >
                <span className="absolute left-2 top-1 text-[10px] font-medium text-muted-foreground">{x},{y}</span>
                <div className="flex items-center justify-between gap-2">
                  <strong>{cabinet.name}</strong>
                  <span className="rounded bg-background/70 px-2 py-0.5 text-xs font-semibold">{cabinet.size}</span>
                </div>
                <div className={cn('mt-3 flex w-fit items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ring-1', status.badge)}>
                  <Icon className="h-3.5 w-3.5" />
                  {status.label}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default DynamicLayoutViewer;
