import { useEffect, useState } from 'react';
import { Plus, X, Wallet, Ticket, BadgePercent, CalendarClock, TrendingUp, AlertTriangle, Package } from 'lucide-react';
import { useStore } from '../store/useStore';
import {
  ActivityBatch,
  loadBatches, saveBatches, loadOrders,
  nextBatchNo, refreshBatchStatuses, isBatchExpired, batchProfit,
} from '../store/batchStore';

// ===== 充值活动批次管理 + 账本统计 =====
export default function BatchManager() {
  const { accounts } = useStore();
  const [batches, setBatches] = useState<ActivityBatch[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [msg, setMsg] = useState('');

  // 创建表单
  const [type, setType] = useState<'voucher' | 'coupon'>('voucher');
  const [accountId, setAccountId] = useState('');
  const [recharge, setRecharge] = useState(500);
  const [vouchers, setVouchers] = useState(4);
  const [vouchersExpire, setVouchersExpire] = useState('');
  const [coupon, setCoupon] = useState(200);
  const [couponPerTicket, setCouponPerTicket] = useState(20);
  const [couponExpire, setCouponExpire] = useState('');
  const [note, setNote] = useState('');

  const reload = () => {
    setBatches(refreshBatchStatuses(loadBatches()));
    setOrders(loadOrders());
  };
  useEffect(() => { reload(); }, []);

  const createBatch = () => {
    if (!accountId) { setMsg('请选择所属会员账号'); return; }
    const acc = accounts.find((a) => a.id === accountId);
    const now = new Date();
    // 默认有效期：赠券/优惠金 90 天
    const defaultExpire = new Date(now.getTime() + 90 * 24 * 3600 * 1000).toISOString().substring(0, 10);
    const batch: ActivityBatch = {
      id: nextBatchNo(),
      type,
      createdAt: now.toISOString().substring(0, 10),
      accountId,
      accountName: acc?.name || acc?.phone || accountId,
      rechargeAmount: Number(recharge) || 500,
      balanceInit: Number(recharge) || 500,
      balanceLeft: Number(recharge) || 500,
      giftVouchersInit: type === 'voucher' ? Number(vouchers) || 4 : 0,
      giftVouchersLeft: type === 'voucher' ? Number(vouchers) || 4 : 0,
      giftVouchersExpire: type === 'voucher' ? (vouchersExpire || defaultExpire) : '',
      couponInit: type === 'coupon' ? Number(coupon) || 200 : 0,
      couponLeft: type === 'coupon' ? Number(coupon) || 200 : 0,
      couponPerTicket: type === 'coupon' ? Number(couponPerTicket) || 20 : 0,
      couponExpire: type === 'coupon' ? (couponExpire || defaultExpire) : '',
      couponScope: '电影票',
      status: 'active',
      note,
    };
    const all = loadBatches();
    all.push(batch);
    saveBatches(all);
    setShowCreate(false);
    setMsg(`✅ 批次 ${batch.id} 已创建（${batch.type === 'voucher' ? `充${recharge}送${vouchers}张核销券` : `充${recharge}送${coupon}元优惠金`}）`);
    reload();
    setTimeout(() => setMsg(''), 4000);
  };

  // 统计
  const stats = {
    totalBalance: batches.reduce((s, b) => s + b.balanceLeft, 0),
    totalVouchers: batches.reduce((s, b) => s + b.giftVouchersLeft, 0),
    totalCoupon: batches.reduce((s, b) => s + b.couponLeft, 0),
    expiringVouchers: batches.filter((b) => b.giftVouchersLeft > 0 && b.giftVouchersExpire && new Date(b.giftVouchersExpire).getTime() - Date.now() < 15 * 24 * 3600 * 1000).length,
    expiringCoupon: batches.filter((b) => b.couponLeft > 0 && b.couponExpire && new Date(b.couponExpire).getTime() - Date.now() < 15 * 24 * 3600 * 1000).length,
    totalProfit: batches.reduce((s, b) => s + batchProfit(b, orders).realized, 0),
    activeBatches: batches.filter((b) => b.status === 'active').length,
  };

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1"><Wallet className="w-3 h-3" /> 会员总余额</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">¥{stats.totalBalance.toFixed(2)}</p>
          <p className="text-[11px] text-gray-400">{stats.activeBatches} 个进行中批次</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
          <p className="text-[11px] text-purple-600 font-medium flex items-center gap-1"><Ticket className="w-3 h-3" /> 赠券库存</p>
          <p className="text-xl font-bold text-purple-600 mt-1">{stats.totalVouchers} 张</p>
          {stats.expiringVouchers > 0 && (
            <p className="text-[11px] text-amber-600 flex items-center gap-1"><CalendarClock className="w-3 h-3" /> {stats.expiringVouchers} 批将过期</p>
          )}
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
          <p className="text-[11px] text-orange-600 font-medium flex items-center gap-1"><BadgePercent className="w-3 h-3" /> 优惠金余额</p>
          <p className="text-xl font-bold text-orange-600 mt-1">¥{stats.totalCoupon.toFixed(2)}</p>
          {stats.expiringCoupon > 0 && (
            <p className="text-[11px] text-amber-600 flex items-center gap-1"><CalendarClock className="w-3 h-3" /> {stats.expiringCoupon} 批将过期</p>
          )}
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
          <p className="text-[11px] text-blue-600 font-medium flex items-center gap-1"><TrendingUp className="w-3 h-3" /> 批次已实现利润</p>
          <p className="text-xl font-bold text-blue-600 mt-1">¥{stats.totalProfit.toFixed(2)}</p>
          <p className="text-[11px] text-gray-400">已绑定 {orders.length} 笔订单</p>
        </div>
      </div>

      {/* 创建按钮 */}
      <button
        onClick={() => setShowCreate(!showCreate)}
        className="flex items-center gap-1.5 px-3 py-2 text-sm bg-pink-500 hover:bg-pink-600 text-white rounded-xl"
      >
        <Plus className="w-4 h-4" /> 新建充值活动批次
      </button>

      {/* 创建表单 */}
      {showCreate && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800">新建活动批次</h3>
            <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          {/* 活动类型 */}
          <div className="flex gap-2">
            <button
              onClick={() => setType('voucher')}
              className={`flex-1 py-2.5 text-sm rounded-xl border ${type === 'voucher' ? 'bg-purple-50 border-purple-400 text-purple-700' : 'border-gray-200 text-gray-500'}`}
            >
              充500送核销券
            </button>
            <button
              onClick={() => setType('coupon')}
              className={`flex-1 py-2.5 text-sm rounded-xl border ${type === 'coupon' ? 'bg-orange-50 border-orange-400 text-orange-700' : 'border-gray-200 text-gray-500'}`}
            >
              充500送优惠金
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">所属会员账号 *</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full px-2 py-2 text-sm border rounded-lg outline-none focus:border-pink-400"
              >
                <option value="">选择账号</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name || a.phone || a.memberId}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">充值金额（元）</label>
              <input type="number" value={recharge} onChange={(e) => setRecharge(Number(e.target.value))} className="w-full px-2 py-2 text-sm border rounded-lg outline-none focus:border-pink-400" />
            </div>
            {type === 'voucher' ? (
              <>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">赠送核销券数量（张）</label>
                  <input type="number" value={vouchers} onChange={(e) => setVouchers(Number(e.target.value))} className="w-full px-2 py-2 text-sm border rounded-lg outline-none focus:border-pink-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">赠券有效期</label>
                  <input type="date" value={vouchersExpire} onChange={(e) => setVouchersExpire(e.target.value)} className="w-full px-2 py-2 text-sm border rounded-lg outline-none focus:border-pink-400" />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">赠送优惠金（元）</label>
                  <input type="number" value={coupon} onChange={(e) => setCoupon(Number(e.target.value))} className="w-full px-2 py-2 text-sm border rounded-lg outline-none focus:border-pink-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">每张票最高抵扣（元）</label>
                  <input type="number" value={couponPerTicket} onChange={(e) => setCouponPerTicket(Number(e.target.value))} className="w-full px-2 py-2 text-sm border rounded-lg outline-none focus:border-pink-400" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 block mb-1">优惠金有效期</label>
                  <input type="date" value={couponExpire} onChange={(e) => setCouponExpire(e.target.value)} className="w-full px-2 py-2 text-sm border rounded-lg outline-none focus:border-pink-400" />
                </div>
              </>
            )}
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">备注（可选）</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="如：老客户续费活动" className="w-full px-2 py-2 text-sm border rounded-lg outline-none focus:border-pink-400" />
            </div>
          </div>
          <button onClick={createBatch} className="w-full py-2.5 text-sm bg-pink-500 hover:bg-pink-600 text-white rounded-xl">
            创建批次
          </button>
        </div>
      )}

      {msg && <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700">{msg}</div>}

      {/* 批次列表 */}
      <div className="space-y-2">
        {batches.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">暂无活动批次，点击上方按钮创建</p>
        ) : (
          batches.map((b) => {
            const profit = batchProfit(b, orders);
            const expired = isBatchExpired(b);
            return (
              <div key={b.id} className="bg-white rounded-xl border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-800">{b.id}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${b.type === 'voucher' ? 'bg-purple-50 text-purple-600' : 'bg-orange-50 text-orange-600'}`}>
                      {b.type === 'voucher' ? '送核销券' : '送优惠金'}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      b.status === 'active' ? 'bg-green-50 text-green-600'
                      : b.status === 'exhausted' ? 'bg-gray-100 text-gray-500'
                      : 'bg-red-50 text-red-500'
                    }`}>
                      {b.status === 'active' ? '使用中' : b.status === 'exhausted' ? '已用完' : '已过期'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{b.createdAt} · {b.accountName}</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-[10px] text-gray-400">余额</p>
                    <p className="text-sm font-bold text-emerald-600">¥{b.balanceLeft.toFixed(2)}</p>
                    <p className="text-[10px] text-gray-300">/ ¥{b.balanceInit.toFixed(2)}</p>
                  </div>
                  {b.type === 'voucher' ? (
                    <div className="bg-purple-50 rounded-lg p-2">
                      <p className="text-[10px] text-purple-400">赠券剩余</p>
                      <p className="text-sm font-bold text-purple-600">{b.giftVouchersLeft}</p>
                      <p className="text-[10px] text-gray-300">/ {b.giftVouchersInit} 张 · {b.giftVouchersExpire || '-'}到期</p>
                    </div>
                  ) : (
                    <div className="bg-orange-50 rounded-lg p-2">
                      <p className="text-[10px] text-orange-400">优惠金剩余</p>
                      <p className="text-sm font-bold text-orange-600">¥{b.couponLeft.toFixed(2)}</p>
                      <p className="text-[10px] text-gray-300">抵{b.couponPerTicket}/张 · {b.couponExpire || '-'}到期</p>
                    </div>
                  )}
                  <div className="bg-blue-50 rounded-lg p-2">
                    <p className="text-[10px] text-blue-400">已实现利润</p>
                    <p className="text-sm font-bold text-blue-600">¥{profit.realized.toFixed(2)}</p>
                    <p className="text-[10px] text-gray-300">{profit.count} 笔订单</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-[10px] text-gray-400">充值金额</p>
                    <p className="text-sm font-bold text-gray-700">¥{b.rechargeAmount.toFixed(2)}</p>
                    <p className="text-[10px] text-gray-300">{b.note || '无备注'}</p>
                  </div>
                </div>
                {expired && (
                  <p className="text-[11px] text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> 赠品已过期</p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
