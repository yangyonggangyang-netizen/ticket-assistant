import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Ticket, Banknote, TrendingUp, CalendarDays, Settings2, Save, Pencil, Check, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { api } from '../api/client';
import { loadOverrides, saveOverride, clearOverride } from '../store/ledgerOverride';

// 固定卖价配置（localStorage 持久化，可编辑）
const PRICES_KEY = 'ledger_prices';
interface LedgerPrices {
  jinyi: number; // 金逸巨幕影城 卖价
  jiahe: number; // 嘉和影城 卖价
}
function loadPrices(): LedgerPrices {
  try {
    const raw = localStorage.getItem(PRICES_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { jinyi: Number(p.jinyi) || 30, jiahe: Number(p.jiahe) || 25 };
    }
  } catch {}
  return { jinyi: 30, jiahe: 25 };
}
function isJiahe(order: any): boolean {
  const name = String(order.cinema_name || order.cinemaName || '');
  return name.includes('嘉和');
}

// 判断订单是否是「已支付的电影票订单」
// 规则：type=1（电影票）+ status=7（已支付正常）+ 实付金额 >= 0
// 排除：卖品(type=4)、储值(type=2)、会员扣费(type=12)、退款单(type=7/负金额)、退票取消(status=8)
function isMovieOrder(order: any): boolean {
  // 排除退款/取消：status=8 是已退票/取消
  const status = Number(order.status ?? -1);
  if (status === 8 || status === 0 || status === -1) return false;
  // 排除负金额（退款单）
  const pay = Number(order.pay_amount ?? order.payAmount ?? 0);
  if (pay < 0) return false;
  // 必须是 type=1 电影票
  const type = String(order.type ?? order.orderType ?? order.saleType ?? '').toLowerCase();
  if (type === '1' || type.includes('film') || type.includes('movie') || type.includes('ticket')) {
    return true;
  }
  // 兜底：message 里有 filmName 且 type 不是卖品/储值
  try {
    const msg = typeof order.message === 'string' ? JSON.parse(order.message) : order.message;
    if (Array.isArray(msg)) {
      return !!(msg[0] && (msg[0].filmName || msg[0].film_name));
    }
    return !!(msg && (msg.filmName || msg.film_name));
  } catch {
    return false;
  }
}

// 取订单日期 yyyy-mm-dd（create_time 可能是毫秒时间戳或日期字符串）
function orderDate(order: any): string {
  const t = order.create_time ?? order.createTime ?? order.payTime ?? '';
  if (t === '' || t == null) return '';
  // 毫秒时间戳（数字或纯数字字符串）
  if (typeof t === 'number' || (typeof t === 'string' && /^\d+$/.test(t))) {
    const d = new Date(Number(t));
    if (!isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    return '';
  }
  const s = String(t);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return '';
}

// 取订单票数（真实票数在 message.num，不在顶层 buy_num）
function orderTickets(order: any): number {
  // 优先从 message 里取 num
  try {
    const msg = typeof order.message === 'string' ? JSON.parse(order.message) : order.message;
    if (Array.isArray(msg) && msg[0] && msg[0].num) {
      const n = Number(msg[0].num);
      if (n > 0) return n;
    }
    if (msg && typeof msg === 'object' && msg.num) {
      const n = Number(msg.num);
      if (n > 0) return n;
    }
  } catch {}
  // 兜底：顶层字段
  const n = Number(order.buy_num ?? order.buyNum ?? order.ticketCount ?? order.quantity ?? 1);
  return n > 0 ? n : 1;
}

// 取订单实付金额
function orderAmount(order: any): number {
  return Number(order.pay_amount ?? order.payAmount ?? order.total_amount ?? order.totalAmount ?? 0) || 0;
}

export default function Ledger() {
  const { accounts, activeAccountId } = useStore();
  const account = accounts.find((a) => a.id === activeAccountId);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() }; // m: 0-11
  });
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [prices, setPrices] = useState<LedgerPrices>(loadPrices);
  const [priceEdit, setPriceEdit] = useState<LedgerPrices>(loadPrices);
  const [showPriceEdit, setShowPriceEdit] = useState(false);
  const [priceMsg, setPriceMsg] = useState('');

  const savePrices = () => {
    const p = {
      jinyi: Number(priceEdit.jinyi) || 0,
      jiahe: Number(priceEdit.jiahe) || 0,
    };
    localStorage.setItem(PRICES_KEY, JSON.stringify(p));
    setPrices(p);
    setShowPriceEdit(false);
    setPriceMsg('✅ 卖价已保存');
    setTimeout(() => setPriceMsg(''), 2000);
  };

  // 手动刷新：拉取所有已登录账号的【全部】订单（分页拉完，不遗漏深层订单；成功后缓存）
  const loadOrders = async () => {
    const targetAccounts = accounts.filter((a) => a.token && a.memberId);
    if (targetAccounts.length === 0) {
      setError('没有可用账号，请先在账号管理添加');
      return;
    }
    setLoading(true);
    setError('');
    try {
      let all: any[] = [];
      let hasError = false;
      // 每个账号循环拉所有页，直到拉完 total 或返回空
      for (const acc of targetAccounts) {
        let page = 1;
        const pageSize = 100;
        for (;;) {
          const resp = await api.getOrderListAs(acc.token, acc.memberId, page, pageSize);
          if (!resp.success) {
            setError((resp.message || '拉取订单失败') + `（账号：${acc.name || acc.phone}）`);
            hasError = true;
            break;
          }
          const data = resp.result as any;
          const list = Array.isArray(data) ? data : data?.records || [];
          if (list.length === 0) break;
          all = all.concat(list);
          const total = Number(data?.total ?? 0);
          if (total > 0 && all.length >= total) break;
          page += 1;
          // 防止死循环，最多拉 200 页
          if (page > 200) break;
        }
      }
      // 按时间倒序排序（新的在前）
      all.sort((a, b) => {
        const ta = Number(a.create_time ?? a.createTime ?? 0);
        const tb = Number(b.create_time ?? b.createTime ?? 0);
        return tb - ta;
      });
      setOrders(all);
      // 缓存到 localStorage（刷新/切换页面后仍保留，下次进入先用缓存显示）
      try {
        localStorage.setItem('ledger_orders_cache', JSON.stringify({ savedAt: Date.now(), orders: all }));
      } catch {}
      if (!hasError && all.length > 0) {
        setError('');
      }
    } catch (e: any) {
      setError('加载失败：' + e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    // 先读缓存立即显示（不转圈），再后台静默刷新更新数据
    try {
      const raw = localStorage.getItem('ledger_orders_cache');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.orders) && parsed.orders.length > 0) {
          setOrders(parsed.orders);
        }
      }
    } catch {}
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 手动覆盖数据（编辑过的日期，覆盖自动统计）
  const [overrides, setOverrides] = useState<Record<string, { tickets: number; income: number; profit?: number }>>(loadOverrides);
  // 正在编辑的日期
  const [editingDate, setEditingDate] = useState<string>('');
  const [editTickets, setEditTickets] = useState('');
  const [editIncome, setEditIncome] = useState('');
  const [editProfit, setEditProfit] = useState('');

  const startEdit = (date: string, cur: { tickets: number; income: number; profit: number }) => {
    setEditingDate(date);
    setEditTickets(String(cur.tickets));
    setEditIncome(String(cur.income));
    setEditProfit(String(cur.profit));
  };
  const saveEdit = (date: string) => {
    const tickets = Math.max(0, Number(editTickets) || 0);
    const income = Number(editIncome) || 0;
    const profit = Number(editProfit) || 0;
    // 保存覆盖：tickets/income 手动值 + profit 手动值（利润单独存，避免被重算）
    const all = loadOverrides();
    all[date] = { tickets, income, profit };
    localStorage.setItem('ledger_override', JSON.stringify(all));
    setOverrides(all);
    setEditingDate('');
  };
  const clearEdit = (date: string) => {
    const all = loadOverrides();
    delete all[date];
    localStorage.setItem('ledger_override', JSON.stringify(all));
    setOverrides(all);
    setEditingDate('');
  };

  // 按日期聚合电影票订单：收入=实付总和；利润=固定卖价×张数-实付
  const daily = useMemo(() => {
    const map = new Map<string, { tickets: number; income: number; count: number; profit: number; cost: number }>();
    orders.forEach((o) => {
      if (!isMovieOrder(o)) return;
      const d = orderDate(o);
      if (!d) return;
      const cur = map.get(d) || { tickets: 0, income: 0, count: 0, profit: 0, cost: 0 };
      const n = orderTickets(o);
      const amount = orderAmount(o);
      const unitPrice = isJiahe(o) ? prices.jiahe : prices.jinyi; // 卖价按影院
      const saleIncome = unitPrice * n; // 卖票收入（客户付的钱）
      cur.tickets += n;
      cur.income += amount; // 收入 = 实付总和
      cur.cost += amount; // 实际支付成本
      cur.profit += saleIncome - amount; // 利润 = 卖价×张数 - 实付
      cur.count += 1;
      map.set(d, cur);
    });
    // 应用手动覆盖（编辑过的日期用手动值）
    Object.entries(overrides).forEach(([date, ov]) => {
      if (!map.has(date)) {
        map.set(date, { tickets: 0, income: 0, count: 0, profit: 0, cost: 0 });
      }
      const cur = map.get(date)!;
      cur.tickets = ov.tickets;
      cur.income = ov.income;
      if (ov.profit != null) cur.profit = ov.profit;
    });
    return map;
  }, [orders, prices, overrides]);

  // 当月天数网格
  const days = useMemo(() => {
    const { y, m } = viewDate;
    const first = new Date(y, m, 1);
    const startWeek = first.getDay(); // 0=周日
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: ({ day: number; date: string } | null)[] = [];
    for (let i = 0; i < startWeek; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, date });
    }
    return cells;
  }, [viewDate]);

  // 月统计
  const monthStats = useMemo(() => {
    const { y, m } = viewDate;
    const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
    let tickets = 0;
    let income = 0;
    let count = 0;
    let profit = 0;
    daily.forEach((v, d) => {
      if (d.startsWith(prefix)) {
        tickets += v.tickets;
        income += v.income;
        count += v.count;
        profit += v.profit;
      }
    });
    return { tickets, income, count, profit };
  }, [daily, viewDate]);

  // 年统计
  const yearStats = useMemo(() => {
    const prefix = `${viewDate.y}-`;
    let tickets = 0;
    let income = 0;
    let count = 0;
    let profit = 0;
    daily.forEach((v, d) => {
      if (d.startsWith(prefix)) {
        tickets += v.tickets;
        income += v.income;
        count += v.count;
        profit += v.profit;
      }
    });
    return { tickets, income, count, profit };
  }, [daily, viewDate]);

  // 选中日期的订单明细
  const selectedOrders = useMemo(() => {
    if (!selectedDay) return [];
    return orders.filter((o) => isMovieOrder(o) && orderDate(o) === selectedDay);
  }, [orders, selectedDay]);

  const prevMonth = () => {
    setViewDate(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }));
    setSelectedDay('');
  };
  const nextMonth = () => {
    setViewDate(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }));
    setSelectedDay('');
  };

  if (!account && accounts.length === 0) {
    return <div className="p-6 text-center text-gray-400 py-12">请先添加账号</div>;
  }

  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-pink-500" />
            记账日历
          </h2>
          <p className="text-sm text-gray-500">
            {accounts.length > 0 ? `统计 ${accounts.length} 个账号 · 每日出票记录与利润` : '暂无账号'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setPriceEdit(prices); setShowPriceEdit(true); }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600"
            title="设置金逸/嘉和的固定卖价"
          >
            <Settings2 className="w-4 h-4" />
            固定卖价：金逸¥{prices.jinyi} / 嘉和¥{prices.jiahe}
          </button>
          <button
            onClick={loadOrders}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {priceMsg && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 text-sm text-green-700">{priceMsg}</div>
      )}

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

      {/* 首次未加载提示 */}
      {orders.length === 0 && !loading && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700 text-center">
          正在加载所有账号的出票记录，请稍候…（也可点右上角「刷新」重新拉取）
        </div>
      )}

      {/* 年统计 + 月统计 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-pink-50 rounded-lg border border-pink-200 p-4">
          <p className="text-xs text-pink-600 font-medium flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" /> {viewDate.y} 年统计
          </p>
          <div className="flex gap-5 mt-2">
            <div>
              <p className="text-2xl font-bold text-pink-600">{yearStats.tickets}</p>
              <p className="text-xs text-pink-500">出票（张）</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-pink-600">¥{yearStats.income.toFixed(0)}</p>
              <p className="text-xs text-pink-500">实付合计</p>
            </div>
            <div>
              <p className={`text-2xl font-bold ${yearStats.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {yearStats.profit >= 0 ? '+' : ''}¥{yearStats.profit.toFixed(0)}
              </p>
              <p className="text-xs text-gray-500">利润</p>
            </div>
          </div>
        </div>
        <div className="bg-green-50 rounded-lg border border-green-200 p-4">
          <p className="text-xs text-green-600 font-medium flex items-center gap-1">
            <CalendarDays className="w-3.5 h-3.5" /> {viewDate.y} 年 {viewDate.m + 1} 月统计
          </p>
          <div className="flex gap-5 mt-2">
            <div>
              <p className="text-2xl font-bold text-green-600">{monthStats.tickets}</p>
              <p className="text-xs text-green-500">出票（张）</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">¥{monthStats.income.toFixed(0)}</p>
              <p className="text-xs text-green-500">实付合计</p>
            </div>
            <div>
              <p className={`text-2xl font-bold ${monthStats.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {monthStats.profit >= 0 ? '+' : ''}¥{monthStats.profit.toFixed(0)}
              </p>
              <p className="text-xs text-gray-500">利润</p>
            </div>
          </div>
        </div>
      </div>

      {/* 日历 */}
      <div className="bg-white rounded-lg border">
        <div className="flex items-center justify-between p-4 border-b flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100" title="上个月">
              <ChevronLeft className="w-5 h-5" />
            </button>
            {/* 年份选择 */}
            <div className="relative">
              <button
                onClick={() => setYearPickerOpen(!yearPickerOpen)}
                className="px-3 py-1.5 text-base font-bold rounded-lg hover:bg-gray-100 border"
              >
                {viewDate.y} 年 ▾
              </button>
              {yearPickerOpen && (
                <div className="absolute z-30 mt-1 bg-white border rounded-lg shadow-lg p-2 w-32 grid grid-cols-3 gap-1 max-h-56 overflow-auto">
                  {Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                    <button
                      key={y}
                      onClick={() => {
                        setViewDate(({ m }) => ({ y, m }));
                        setYearPickerOpen(false);
                        setSelectedDay('');
                      }}
                      className={`px-2 py-1 text-sm rounded ${
                        y === viewDate.y ? 'bg-pink-500 text-white' : 'hover:bg-gray-100'
                      }`}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* 月份选择 */}
            <div className="flex gap-0.5">
              {Array.from({ length: 12 }, (_, i) => i).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setViewDate(({ y }) => ({ y, m }));
                    setSelectedDay('');
                  }}
                  className={`px-2 py-1.5 text-xs rounded-lg ${
                    m === viewDate.m ? 'bg-pink-500 text-white font-bold' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {m + 1}月
                </button>
              ))}
            </div>
            <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100" title="下个月">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <span className="text-sm text-gray-500">
            {viewDate.y} 年 {viewDate.m + 1} 月出票记录
          </span>
        </div>
        <div className="grid grid-cols-7 border-b bg-gray-50">
          {weekdays.map((w) => (
            <div key={w} className="text-center text-sm font-medium text-gray-500 py-2 border-r last:border-r-0">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((cell, i) => {
            if (!cell) return <div key={`empty-${i}`} className="min-h-[92px]" />;
            const stat = daily.get(cell.date);
            const isToday = cell.date === todayStr;
            const isSelected = cell.date === selectedDay;
            const isOverridden = !!overrides[cell.date];
            return (
              <button
                key={cell.date}
                onClick={() => setSelectedDay(isSelected ? '' : cell.date)}
                className={`min-h-[92px] border-t border-r text-left p-2 transition-colors relative ${
                  isSelected ? 'bg-pink-50' : stat ? 'hover:bg-pink-50/40' : 'hover:bg-gray-50'
                } ${i % 7 === 6 ? 'border-r-0' : ''}`}
              >
                <span
                  className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-sm ${
                    isToday ? 'bg-pink-500 text-white font-bold' : 'text-gray-700'
                  }`}
                >
                  {cell.day}
                </span>
                {stat && (
                  <div className="mt-1.5 space-y-1">
                    <p className="text-xs text-pink-600 font-semibold flex items-center gap-1">
                      <Ticket className="w-3.5 h-3.5" /> {stat.tickets} 张
                      {isOverridden && <span className="text-[9px] bg-pink-200 text-pink-700 rounded px-1">改</span>}
                    </p>
                    <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                      <Banknote className="w-3.5 h-3.5" /> ¥{stat.income.toFixed(0)}
                    </p>
                    <p className={`text-xs flex items-center gap-1 ${stat.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {stat.profit >= 0 ? '▲' : '▼'} {stat.profit >= 0 ? '+' : ''}¥{stat.profit.toFixed(0)}
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 选中日期的明细 */}
      {selectedDay && (
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">
              {selectedDay} 出票明细（{selectedOrders.length} 笔）
            </h3>
            <button
              onClick={() => {
                const cur = daily.get(selectedDay) || { tickets: 0, income: 0, profit: 0 };
                startEdit(selectedDay, cur);
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-purple-500 text-white rounded-lg hover:bg-purple-600"
            >
              <Pencil className="w-3 h-3" />
              编辑当天
            </button>
          </div>
          {selectedOrders.length === 0 ? (
            <p className="text-sm text-gray-400">当天无电影票订单</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-auto">
              {selectedOrders.map((o, i) => {
                const msg = (() => {
                  try {
                    const m = typeof o.message === 'string' ? JSON.parse(o.message) : o.message;
                    return Array.isArray(m) ? m[0] : m;
                  } catch {
                    return {};
                  }
                })();
                const n = orderTickets(o);
                const unitPrice = isJiahe(o) ? prices.jiahe : prices.jinyi;
                const saleIncome = unitPrice * n; // 卖票收入
                const cost = orderAmount(o); // 实际支付成本
                const profit = saleIncome - cost; // 每单利润
                const perTicket = n > 0 ? profit / n : 0;
                return (
                  <div key={i} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg p-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{msg.filmName || msg.film_name || o.filmName || '电影票'}</p>
                      <p className="text-xs text-gray-400">
                        {isJiahe(o) ? '嘉和' : '金逸'} · 卖¥{unitPrice}/{n}张 · 成本¥{cost.toFixed(0)}
                        {' · '}
                        {orderTickets(o)} 张
                        {msg.hallName || o.hallName ? ` · ${msg.hallName || o.hallName}` : ''}
                      </p>
                      <p className={`text-xs mt-0.5 ${perTicket >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        每张 {perTicket >= 0 ? '+' : ''}¥{perTicket.toFixed(1)}
                      </p>
                    </div>
                    <div className="text-right ml-3">
                      <p className={`font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {profit >= 0 ? '+' : ''}¥{profit.toFixed(0)}
                      </p>
                      <p className="text-[10px] text-gray-400">成本¥{cost.toFixed(0)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {/* 编辑当天数据弹窗 */}
      {editingDate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEditingDate('')}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium text-lg">编辑 {editingDate}</h3>
            <p className="text-xs text-gray-400">
              手动填写当天出票张数和收入（覆盖自动统计，与首页今日出票同步）。留空不填的项目保持自动值。
            </p>
            <div>
              <label className="text-xs text-gray-500 block mb-1">出票张数</label>
              <input
                type="number"
                value={editTickets}
                onChange={(e) => setEditTickets(e.target.value)}
                placeholder="自动统计的票数"
                className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-purple-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">收入（元）</label>
              <input
                type="number"
                step="0.01"
                value={editIncome}
                onChange={(e) => setEditIncome(e.target.value)}
                placeholder="自动统计的收入"
                className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-purple-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">利润（元，可留空）</label>
              <input
                type="number"
                step="0.01"
                value={editProfit}
                onChange={(e) => setEditProfit(e.target.value)}
                placeholder="自动统计的利润"
                className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-purple-400"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => saveEdit(editingDate)}
                className="flex-1 flex items-center justify-center gap-1 px-4 py-2 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600"
              >
                <Check className="w-4 h-4" />
                确认保存
              </button>
              {overrides[editingDate] && (
                <button
                  onClick={() => clearEdit(editingDate)}
                  className="px-4 py-2 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
                >
                  恢复自动
                </button>
              )}
              <button
                onClick={() => setEditingDate('')}
                className="flex items-center gap-1 px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                <X className="w-3.5 h-3.5" />
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 固定卖价设置弹窗 */}
      {showPriceEdit && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowPriceEdit(false)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium text-lg">固定卖价设置</h3>
            <p className="text-xs text-gray-400">
              利润 = 固定卖价 × 张数 - 订单实际支付金额（含观影金抵扣后的实付）。价格可随时修改。
            </p>
            <div>
              <label className="text-xs text-gray-500 block mb-1">金逸巨幕影城 · 卖价（元/张）</label>
              <input
                type="number"
                value={priceEdit.jinyi}
                onChange={(e) => setPriceEdit({ ...priceEdit, jinyi: Number(e.target.value) || 0 })}
                placeholder="如：30"
                className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-purple-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">嘉和影城 · 卖价（元/张）</label>
              <input
                type="number"
                value={priceEdit.jiahe}
                onChange={(e) => setPriceEdit({ ...priceEdit, jiahe: Number(e.target.value) || 0 })}
                placeholder="如：25"
                className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-purple-400"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={savePrices}
                className="flex-1 flex items-center justify-center gap-1 px-4 py-2 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600"
              >
                <Save className="w-4 h-4" />
                确认保存
              </button>
              <button
                onClick={() => setShowPriceEdit(false)}
                className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
