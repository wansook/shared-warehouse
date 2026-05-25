import React, { useMemo, useState } from 'react';
import { CreditCard, X } from 'lucide-react';
import api from './api';
import { Button } from './components/ui/button';

const PRICING = {
  S: { 1: 15000, 3: 42000, 6: 84000, 12: 153000 },
  M: { 1: 30000, 3: 81000, 6: 156000, 12: 270000 },
  L: { 1: 50000, 3: 132000, 6: 252000, 12: 432000 },
  XL: { 1: 70000, 3: 189000, 6: 364000, 12: 630000 },
  XXL: { 1: 90000, 3: 243000, 6: 468000, 12: 810000 },
};

const SIZE_LABELS = {
  S: '소',
  M: '중',
  L: '대',
  XL: '특대',
  XXL: '특특대',
};

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + Number(months));
  return result;
}

function toDateTimeLocal(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function ContractFlow({ cabinet, warehouseName, onComplete, onCancel }) {
  const [months, setMonths] = useState(1);
  const [autoRenew, setAutoRenew] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const amount = useMemo(() => PRICING[cabinet?.size || 'S']?.[months] || 0, [cabinet, months]);

  const startDate = useMemo(() => new Date(), []);
  const endDate = useMemo(() => addMonths(startDate, months), [startDate, months]);

  const submit = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const contract = await api.createContract({
        cabinet_id: cabinet.id,
        start_date: toDateTimeLocal(startDate),
        end_date: toDateTimeLocal(endDate),
        total_amount: amount,
        billing_key: autoRenew ? undefined : null,
      });
      const payment = await api.createMockPayment({
        contract_id: contract.contractId,
        amount,
      });
      setResult(payment);
      if (payment.checkoutUrl) {
        window.location.href = payment.checkoutUrl;
        return;
      }
      onComplete?.(payment);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!cabinet) return null;

  return (
    <div className="rounded-lg border bg-card p-5 shadow-soft">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">새 계약</h2>
          <p className="text-sm text-muted-foreground">{warehouseName || '창고'} / 캐비넷 #{cabinet.id} / {SIZE_LABELS[cabinet.size] || cabinet.size}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onCancel} aria-label="Close contract flow">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="mb-5 grid gap-2 sm:grid-cols-3">
        {['기간 선택', '가격 확인', '결제'].map((label, index) => (
          <div key={label} className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</span>
            <span className="font-medium text-slate-700">{label}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[1, 3, 6, 12].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMonths(option)}
            className={`rounded-md border p-3 text-left transition hover:border-primary hover:shadow-sm ${months === option ? 'border-primary bg-primary/10 shadow-sm' : 'bg-background'}`}
          >
            <div className="font-semibold">{option}개월</div>
            <div className="mt-1 text-sm">{(PRICING[cabinet.size]?.[option] || 0).toLocaleString()}원</div>
          </button>
        ))}
      </div>

      <label className="mt-4 flex items-center gap-2 rounded-md border bg-white p-3 text-sm">
        <input className="h-5 w-5 accent-teal-600" type="checkbox" checked={autoRenew} onChange={(event) => setAutoRenew(event.target.checked)} />
        청구 키 등록 시 자동 갱신 활성화
      </label>

      <div className="mt-4 rounded-md border bg-muted/40 p-3 text-sm">
        <div className="flex justify-between"><span>시작일</span><strong>{startDate.toLocaleDateString()}</strong></div>
        <div className="flex justify-between"><span>종료일</span><strong>{endDate.toLocaleDateString()}</strong></div>
        <div className="mt-2 flex justify-between text-base"><span>합계</span><strong>{amount.toLocaleString()}원</strong></div>
      </div>

      {error && <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {result && !result.checkoutUrl && <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700">계약과 결제가 완료되었습니다.</div>}

      <Button type="button" className="mt-4 w-full" onClick={submit} disabled={loading}>
        <CreditCard className="h-4 w-4" />
        {loading ? '처리 중...' : '계약 생성 및 결제'}
      </Button>
    </div>
  );
}

export default ContractFlow;
export { PRICING, SIZE_LABELS };
