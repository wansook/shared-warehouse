import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Delete, Lock, X } from 'lucide-react';
import api from './api';

function EmergencyKeyPad({ onClose, onVerified, warehouseId }) {
  const location = useLocation();
  const queryWarehouseId = new URLSearchParams(location.search).get('warehouseId');
  const activeWarehouseId = warehouseId || queryWarehouseId || localStorage.getItem('selectedWarehouseId');
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [lockedUntil, setLockedUntil] = useState(null);
  const isLocked = lockedUntil && lockedUntil > Date.now();

  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    const preventEscape = (event) => {
      if (['F11', 'Escape'].includes(event.key)) event.preventDefault();
    };
    document.addEventListener('keydown', preventEscape);
    return () => document.removeEventListener('keydown', preventEscape);
  }, []);

  const appendDigit = (digit) => {
    if (isLocked || pin.length >= 4) return;
    setMessage('');
    setPin((value) => `${value}${digit}`);
  };

  const verify = async () => {
    if (pin.length !== 4) {
      setMessage('4자리 PIN을 입력하세요.');
      return;
    }
    if (!activeWarehouseId) {
      setMessage('먼저 창고를 선택하세요.');
      return;
    }

    try {
      const response = await api.openHardware({
        warehouse_id: activeWarehouseId,
        pin,
        duration: 3000,
      });
      onVerified?.(response);
    } catch (error) {
      try {
        const response = await api.post('/api/access/verify-local-pin', { pin });
        if (response.data.success) {
          onVerified?.(response.data);
          return;
        }
      } catch {
        // Keep the original online error message below.
      }
      setMessage(error.response?.data?.message || 'PIN 인증에 실패했습니다.');
      setPin('');
      setLockedUntil(Date.now() + 15000);
      setTimeout(() => setLockedUntil(null), 15000);
    }
  };

  const close = () => {
    document.exitFullscreen?.().catch(() => {});
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_top,#0d9488_0%,#0f766e_42%,#0f172a_100%)] px-4 text-white">
      <div className="absolute left-4 right-4 top-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white/70">
          <Lock className="h-5 w-5" />
          <span className="text-sm">비상 키패드</span>
        </div>
        <button type="button" onClick={close} className="min-h-11 rounded-md bg-white/10 p-2 hover:bg-white/20" aria-label="Close keypad">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold">PIN 입력</h1>
        <p className="mt-2 text-sm text-white/50">온라인 인증을 먼저 시도하고, 실패 시 오프라인 PIN으로 인증합니다.</p>
      </div>

      <div className="mb-8 flex gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/30 text-2xl">
            {index < pin.length ? '*' : ''}
          </div>
        ))}
      </div>

      {message && <div className="mb-4 rounded-md bg-red-500/20 px-4 py-2 text-sm text-red-100">{message}</div>}
      {isLocked && <div className="mb-4 text-sm text-white/50">잠시 잠겼습니다. 잠시 후 다시 시도하세요.</div>}

      <div className="grid w-full max-w-xs grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
          <button key={digit} type="button" disabled={isLocked} onClick={() => appendDigit(String(digit))} className="h-20 rounded-lg bg-white/10 text-2xl font-semibold shadow-sm ring-1 ring-white/10 hover:bg-white/20 disabled:opacity-30">{digit}</button>
        ))}
        <button type="button" disabled={isLocked} onClick={() => setPin((value) => value.slice(0, -1))} className="flex h-20 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-30">
          <Delete className="h-6 w-6" />
        </button>
        <button type="button" disabled={isLocked} onClick={() => appendDigit('0')} className="h-20 rounded-lg bg-white/10 text-2xl font-semibold ring-1 ring-white/10 hover:bg-white/20 disabled:opacity-30">0</button>
        <button type="button" disabled={isLocked || pin.length !== 4} onClick={verify} className="h-20 rounded-lg bg-primary font-semibold text-primary-foreground shadow-lg disabled:opacity-30">확인</button>
      </div>
    </div>
  );
}

export default EmergencyKeyPad;
