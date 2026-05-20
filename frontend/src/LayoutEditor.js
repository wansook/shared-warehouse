/**
 * LayoutEditor - 창고 레이아웃 드래그앤드롭 편집기
 * GET/PUT /api/warehouses/:id/layout API 연동
 */
import React, { useState, useEffect, useRef } from 'react';
import './LayoutEditor.css';

const API_BASE = 'http://localhost:3001';

function LayoutEditor({ warehouseId, onBack }) {
  const [cabinets, setCabinets] = useState([]);
  const [layout, setLayout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [columns] = useState(4); // 4열 그리드

  const containerRef = useRef(null);

  // 1. 창고와 캐비넷 데이터 로드
  useEffect(() => {
    const load = async () => {
      try {
        // 창고 정보
        const token = localStorage.getItem('token');
        const whRes = await fetch(`${API_BASE}/api/warehouses`);
        const warehouses = await whRes.json();
        const warehouse = warehouses.find(w => w.id === warehouseId);
        if (!warehouse) { alert('창고를 찾을 수 없습니다.'); onBack(); return; }

        // 캐비넷 로드
        const cabRes = await fetch(`${API_BASE}/api/warehouses/${warehouseId}/cabinets`);
        const cabs = await cabRes.json();

        // 레이아웃 로드
        const layoutRes = await fetch(`${API_BASE}/api/warehouses/${warehouseId}/layout`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        let savedLayout = [];
        if (layoutRes.ok) {
          savedLayout = await layoutRes.json();
        }

        // 캐비넷 초기화
        const cabinetData = cabs.map((cab, idx) => ({
          id: cab.id,
          name: `${cab.size}#${cab.id}`,
          size: cab.size || 'M',
          status: cab.status || 'available',
          relay_channel: cab.relay_channel || 0,
          x: savedLayout[idx] ? savedLayout[idx].x : 0,
          y: savedLayout[idx] ? savedLayout[idx].y : Math.floor(idx / columns),
          index: savedLayout[idx] ? savedLayout[idx].index : idx
        }));

        setCabinets(cabinetData);
        setLayout(warehouse);
        setLoading(false);
      } catch (err) {
        console.error('로드 실패:', err);
        alert('데이터 로딩 실패');
        onBack();
      }
    };
    load();
  }, [warehouseId, onBack, columns]);

  // 드래그 앤 드롭
  const handleDragStart = (e, cabinet) => {
    setDragging(cabinet);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, x, y) => {
    e.preventDefault();
    if (!dragging) return;

    // 기존 위치에서 제거
    setCabinets(prev => prev.filter(c => c.id !== dragging.id));

    // 새 위치 계산
    const newX = Math.max(0, Math.min(x, columns - 1));
    const newY = Math.max(0, y);

    setCabinets(prev => [...prev, { ...dragging, x: newX, y: newY, index: prev.length }]);
    setDragging(null);
  };

  // 레이아웃 저장
  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const layoutData = cabinets.map(cab => ({
        cabinet_id: cab.id,
        size: cab.size,
        x: cab.x,
        y: cab.y,
        index: cab.index
      }));

      const res = await fetch(`${API_BASE}/api/warehouses/${warehouseId}/layout`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ layout: layoutData })
      });

      if (res.ok) {
        alert('레이아웃 저장 완료!');
      } else {
        alert('저장 실패');
      }
    } catch (err) {
      console.error('저장 실패:', err);
      alert('저장 실패: ' + err.message);
    }
    setSaving(false);
  };

  if (loading) return <div className="loading">로딩 중...</div>;
  if (!layout) return <div className="loading">창고 정보가 없습니다.</div>;

  // 그리드 크기 계산
  const gridW = columns * 120 + 40;
  const gridH = Math.ceil(cabinets.length / columns) * 80 + 40;

  return (
    <div className="layout-editor">
      <div className="editor-header">
        <button onClick={onBack} className="btn-back">← 돌아가기</button>
        <h2>{layout.name} - 레이아웃 편집기</h2>
        <button onClick={handleSave} disabled={saving} className="btn-save">
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>

      <div className="editor-body">
        {/* 캐비넷 속성 패널 */}
        <div className="prop-panel">
          <h3>캐비넷 속성</h3>
          {dragging && (
            <div className="prop-item">
              <p><strong>이름:</strong> {dragging.name}</p>
              <p><strong>크기:</strong> {dragging.size}</p>
              <p><strong>상태:</strong> {dragging.status}</p>
              <p><strong>릴레이 채널:</strong> {dragging.relay_channel}</p>
            </div>
          )}
          <div className="legend">
            <h4>범례</h4>
            <div className="legend-item"><span className="dot green"></span> 이용중</div>
            <div className="legend-item"><span className="dot blue"></span> 공석</div>
            <div className="legend-item"><span className="dot orange"></span> 정비중</div>
            <div className="legend-item"><span className="dot red"></span> 만료임박</div>
          </div>
        </div>

        {/* 그리드 레이아웃 */}
        <div className="grid-container" ref={containerRef}>
          <div
            className="grid-area"
            style={{ width: gridW, height: gridH }}
          >
            {Array.from({ length: columns }).map((_, col) =>
              Array.from({ length: Math.ceil(cabinets.length / columns) }).map((_, row) => (
                <div
                  key={`${col}-${row}`}
                  className="grid-cell"
                  onDragOver={(e) => handleDragOver(e, col, row)}
                ></div>
              ))
            )}

            {/* 캐비넷 그리드 위에 오버레이 */}
            {cabinets.map((cab) => (
              <div
                key={cab.id}
                className="cabinet-node"
                style={{
                  left: 20 + cab.x * 120,
                  top: 20 + cab.y * 80,
                  width: 110,
                  height: 70
                }}
                draggable
                onDragStart={(e) => handleDragStart(e, cab)}
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
