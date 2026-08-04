import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { useStore } from '../store/useStore';
import type { Bill } from '../types';
import { RefreshCw, AlertCircle, TrendingDown, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

export default function Bills() {
  const { getActiveAccount } = useStore();
  const account = getActiveAccount();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));

  const loadBills = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getBills(month);
      setBills(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [account, month]);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  // Calculate stats
  const totalOut = bills.filter((b) => b.amount < 0).reduce((sum, b) => sum + Math.abs(b.amount), 0);
  const totalIn = bills.filter((b) => b.amount > 0).reduce((sum, b) => sum + b.amount, 0);

  if (!account) {
    return <div className="flex items-center justify-center h-full text-gray-400">请先选择账号</div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">账单明细</h1>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={loadBills}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <TrendingDown size={16} className="text-red-400" />
            支出
          </div>
          <div className="text-xl font-bold text-red-600">¥{totalOut.toFixed(2)}</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <TrendingUp size={16} className="text-green-400" />
            收入
          </div>
          <div className="text-xl font-bold text-green-600">¥{totalIn.toFixed(2)}</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="text-sm text-gray-500 mb-1">当前余额</div>
          <div className="text-xl font-bold text-blue-600">¥{account.balance?.toFixed(2) || '0.00'}</div>
        </div>
      </div>

      {/* Bills Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">加载中...</div>
        ) : bills.length === 0 ? (
          <div className="p-12 text-center text-gray-400">暂无账单记录</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">时间</th>
                <th className="text-left px-4 py-2 font-medium">业务</th>
                <th className="text-left px-4 py-2 font-medium">操作</th>
                <th className="text-left px-4 py-2 font-medium">备注</th>
                <th className="text-right px-4 py-2 font-medium">金额</th>
                <th className="text-right px-4 py-2 font-medium">余额</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {bills.map((bill) => (
                <tr key={bill.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500 text-xs">{bill.addtime}</td>
                  <td className="px-4 py-2 text-gray-700">{bill.biz}</td>
                  <td className="px-4 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                      bill.op === '扣款' ? 'bg-red-100 text-red-600' :
                      bill.op === '充值' || bill.op === '解冻' ? 'bg-green-100 text-green-600' :
                      bill.op === '冻结' ? 'bg-orange-100 text-orange-600' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {bill.op}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{bill.memo}</td>
                  <td className={`px-4 py-2 text-right font-medium ${
                    bill.amount < 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {bill.amount < 0 ? '-' : '+'}¥{Math.abs(bill.amount).toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-500">¥{bill.balance.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
