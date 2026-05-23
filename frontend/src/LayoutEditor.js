import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from './api';
import './LayoutEditor.css';

function LayoutEditor({ warehouseId: propWarehouseId, onBack }) {
  const location = useLocation();
  const navigate = useNavigate();
  const warehouseId = propWarehouseId || location.state?.warehouseId;
  const [cabinets, setCabinets] = useState([]);
  const [layout, setLayout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [columns] = useState(4);
  const containerRef = useRef(null);

  const goBack = () => {
    if (onBack) onBack();
    else navigate('/dashboard');
  };

  useEffect(() => {
    const load = async () => {
      if (!warehouseId) {
        alert('Select a warehouse to edit.');
        goBack();
        return;
      }

      try {
        const whRes = await api.get('/api/warehouses');
        const warehouse = whRes.data.find((w) => Number(w.id) === Number(warehouseId));
        if (!warehouse) {
          alert('Warehouse not found.');
          goBack();
          return;
        }

        const [cabRes, layoutRes] = await Promise.all([
          api.get(`/api/warehouses/${warehouseId}/cabinets`),
          api.get(`/api/warehouses/${warehouseId}/layout`),
        ]);
        const savedByCabinetId = new Map((layoutRes.data || []).map((item) => [Number(item.cabinet_id), item]));

        const cabinetData = cabRes.data.map((cab, idx) => {
          const saved = savedByCabinetId.get(Number(cab.id));
          return {
            id: cab.id,
            name: `${cab.size}#${cab.id}`,
            size: cab.size || 'M',
            status: cab.status || 'available',
            relay_channel: cab.relay_channel || 0,
            x: saved ? saved.x : (cab.position_x ?? idx % columns),
            y: saved ? saved.y : (cab.position_y ?? Math.floor(idx / columns)),
            index: saved ? saved.index : (cab.position_index ?? idx),
          };
        });

        setCabinets(cabinetData);
        setLayout(warehouse);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load layout:', err);
        alert('Failed to load layout data.');
        goBack();
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, columns]);

  const handleDragStart = (e, cabinet) => {
    setDragging(cabinet);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (x, y) => {
    if (!dragging) return;
    const nextX = Math.max(0, Math.min(x, columns - 1));
    const nextY = Math.max(0, y);

    setCabinets((prev) => prev.map((cab) => (
      Number(cab.id) === Number(dragging.id)
        ? { ...cab, x: nextX, y: nextY, index: nextY * columns + nextX }
        : cab
    )));
    setDragging(null);
  };

  const handleDragEnd = () => {
    setDragging(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const layoutData = cabinets
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((cab) => ({
          cabinet_id: cab.id,
          size: cab.size,
          x: cab.x,
          y: cab.y,
          index: cab.index,
        }));

      await api.put(`/api/warehouses/${warehouseId}/layout`, { layout_data: layoutData });

      await Promise.all(layoutData.map((item) => api.put(`/api/cabinets/${item.cabinet_id}/layout`, {
        position_x: item.x,
        position_y: item.y,
        position_index: item.index,
        layout_data: item,
      })));

      alert('Layout saved.');
    } catch (err) {
      console.error('Failed to save layout:', err);
      alert(`Failed to save layout: ${err.response?.data?.message || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (!layout) return <div className="loading">Warehouse data is missing.</div>;

  const rows = Math.max(1, Math.ceil(cabinets.length / columns));
  const gridW = columns * 120 + 40;
  const gridH = rows * 80 + 40;

  return (
    <div className="layout-editor">
      <div className="editor-header">
        <button onClick={goBack} className="btn-back">Back</button>
        <h2>{layout.name} - Layout Editor</h2>
        <button onClick={handleSave} disabled={saving} className="btn-save">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="editor-body">
        <div className="prop-panel">
          <h3>Cabinet Properties</h3>
          {dragging ? (
            <div className="prop-item">
              <p><strong>Name:</strong> {dragging.name}</p>
              <p><strong>Size:</strong> {dragging.size}</p>
              <p><strong>Status:</strong> {dragging.status}</p>
              <p><strong>Relay:</strong> {dragging.relay_channel}</p>
            </div>
          ) : (
            <p>Drag a cabinet and drop it on a grid cell.</p>
          )}
          <div className="legend">
            <h4>Legend</h4>
            <div className="legend-item"><span className="dot green"></span> Occupied</div>
            <div className="legend-item"><span className="dot blue"></span> Available</div>
            <div className="legend-item"><span className="dot orange"></span> Maintenance</div>
            <div className="legend-item"><span className="dot red"></span> Expiring soon</div>
          </div>
        </div>

        <div className="grid-container" ref={containerRef}>
          <div className="grid-area" style={{ width: gridW, height: gridH }}>
            {Array.from({ length: columns }).map((_, col) =>
              Array.from({ length: rows }).map((__, row) => (
                <div
                  key={`${col}-${row}`}
                  className="grid-cell"
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(col, row)}
                />
              ))
            )}

            {cabinets.map((cab) => (
              <div
                key={cab.id}
                className="cabinet-node"
                style={{
                  left: 20 + cab.x * 120,
                  top: 20 + cab.y * 80,
                  width: 110,
                  height: 70,
                }}
                draggable
                onDragStart={(e) => handleDragStart(e, cab)}
                onDragEnd={handleDragEnd}
              >
                <div className="cabinet-label">{cab.name}</div>
                <div className={`cabinet-status status-${cab.status}`}>{cab.status}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LayoutEditor;
