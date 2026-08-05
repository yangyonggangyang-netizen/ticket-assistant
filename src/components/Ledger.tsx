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

// 订单成功状态判断：status=7 或 8 都算成功（电影票7、充值8），0/9/负数排除
function isSuccessOrder(order: any): boolean {
  const status = Number(order.status ?? -1);
  if (status === 7 || status === 8) return true;
  return false;
}

// 判断订单是否是「成功的电影票订单」
// 规则：type=1（电影票）+ 成功状态 + 实付金额 >= 0
function isMovieOrder(order: any): boolean {
  if (!isSuccessOrder(order)) return false;
  const pay = Number(order.pay_amount ?? order.payAmount ?? 0);
  if (pay < 0) return false;
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

// 判断订单是否是「成功的充值订单」（type=2，pay_amount = 充值金额）
function isRechargeOrder(order: any): boolean {
  if (!isSuccessOrder(order)) return false;
  const pay = Number(order.pay_amount ?? order.payAmount ?? 0);
  if (pay < 0) return false;
  const type = String(order.type ?? order.orderType ?? order.saleType ?? '').toLowerCase();
  if (type === '2' || type.includes('recharge') || type.includes('setmeal') || type.includes('stored')) {
    return true;
  }
  return false;
}

// 卖品订单解析：返回 { pay: 实付金额合计, score: 积分合计, count: 商品件数 }
// 规则：可乐类→算金额(实付)；爆米花类→算积分(details.jifen)；成功订单才统计
function parseSnackOrder(order: any): { pay: number; score: number; count: number } {
  const result = { pay: 0, score: 0, count: 0 };
  if (!isSuccessOrder(order)) return result;
  const pay = Number(order.pay_amount ?? order.payAmount ?? 0);
  if (pay < 0) return result;
  const type = String(order.type ?? order.orderType ?? order.saleType ?? '').toLowerCase();
  if (!(type === '4' || type.includes('goods') || type.includes('snack'))) return result;
  // 优先用 details（含 jifen 积分字段）
  const details = order.details || order.orderDetails || [];
  if (Array.isArray(details) && details.length > 0) {
    details.forEach((it: any) => {
      const name = String(it.goods_name || it.goodsName || it.planName || '');
      const jifen = Number(it.jifen ?? it.score ?? 0) || 0;
      const num = Number(it.take_num ?? it.amount ?? it.num ?? 1) || 1;
      const price = Number(it.price ?? 0) || 0;
      if (name.includes('可乐') || name.includes('雪碧') || name.includes('饮料') || name.includes('水')) {
        // 可乐类 → 金额（实付或单价×数量）
        result.pay += details.length === 1 && pay > 0 ? pay : price * num;
      } else if (jifen > 0) {
        // 爆米花等有积分的 → 积分（用订单里的 jifen 字段）
        result.score += jifen * num;
      } else {
        // 其他无积分卖品 → 金额
        result.pay += details.length === 1 && pay > 0 ? pay : price * num;
      }
      result.count += num;
    });
    return result;
  }
  // message 商品列表兜底
  let items: any[] = [];
  try {
    const msg = typeof order.message === 'string' ? JSON.parse(order.message) : order.message;
    if (Array.isArray(msg)) items = msg;
    else if (msg && Array.isArray(msg.items)) items = msg.items;
  } catch {}
  if (items.length === 0) {
    result.pay += pay;
    result.count += 1;
    return result;
  }
  items.forEach((it: any) => {
    const name = String(it.planName || it.goodsName || it.name || '');
    const num = Number(it.num ?? it.quantity ?? 1) || 1;
    const price = Number(it.price ?? 0) || 0;
    if (name.includes('可乐') || name.includes('雪碧') || name.includes('饮料') || name.includes('水')) {
      result.pay += items.length === 1 && pay > 0 ? pay : price * num;
    } else if (name.includes('爆米花')) {
      result.score += Math.round(price * num);
    }
    result.count += num;
  });
  return result;
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
    // 先读缓存立即显示（不转圈），再后台静默刷新一次
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
    // 不自动定时刷新；用户点「刷新」按钮时才重新拉取，数据保持
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

  // 按日期聚合：电影票(张数/订单/实付/利润) + 充值(单数/金额) + 卖品(订单/金额/积分)
  const daily = useMemo(() => {
    type DayStat = {
      tickets: number; income: number; count: number; profit: number; cost: number;
      rechargeCount: number; rechargeAmount: number;
      snackCount: number; snackPay: number; snackScore: number;
    };
    const empty = (): DayStat => ({ tickets: 0, income: 0, count: 0, profit: 0, cost: 0, rechargeCount: 0, rechargeAmount: 0, snackCount: 0, snackPay: 0, snackScore: 0 });
    const map = new Map<string, DayStat>();
    orders.forEach((o) => {
      const d = orderDate(o);
      if (!d) return;
      // 充值订单（独立统计，不混入电影票）
      if (isRechargeOrder(o)) {
        const cur = map.get(d) || empty();
        cur.rechargeCount += 1;
        cur.rechargeAmount += orderAmount(o);
        map.set(d, cur);
        return;
      }
      // 卖品订单（可乐→金额，爆米花→积分）
      const snack = parseSnackOrder(o);
      if (snack.count > 0) {
        const cur = map.get(d) || empty();
        cur.snackCount += 1;
        cur.snackPay += snack.pay;
        cur.snackScore += snack.score;
        map.set(d, cur);
        return;
      }
      // 电影票
      if (!isMovieOrder(o)) return;
      const cur = map.get(d) || empty();
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
        map.set(date, empty());
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

  // 月统计（含充值/卖品）
  const monthStats = useMemo(() => {
    const { y, m } = viewDate;
    const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
    let tickets = 0;
    let income = 0;
    let count = 0;
    let profit = 0;
    let rechargeCount = 0;
    let rechargeAmount = 0;
    let snackCount = 0;
    let snackPay = 0;
    let snackScore = 0;
    daily.forEach((v, d) => {
      if (d.startsWith(prefix)) {
        tickets += v.tickets;
        income += v.income;
        count += v.count;
        profit += v.profit;
        rechargeCount += v.rechargeCount;
        rechargeAmount += v.rechargeAmount;
        snackCount += v.snackCount;
        snackPay += v.snackPay;
        snackScore += v.snackScore;
      }
    });
    return { tickets, income, count, profit, rechargeCount, rechargeAmount, snackCount, snackPay, snackScore };
  }, [daily, viewDate]);

  // 年统计（含充值/卖品）
  const yearStats = useMemo(() => {
    const prefix = `${viewDate.y}-`;
    let tickets = 0;
    let income = 0;
    let count = 0;
    let profit = 0;
    let rechargeCount = 0;
    let rechargeAmount = 0;
    let snackCount = 0;
    let snackPay = 0;
    let snackScore = 0;
    daily.forEach((v, d) => {
      if (d.startsWith(prefix)) {
        tickets += v.tickets;
        income += v.income;
        count += v.count;
        profit += v.profit;
        rechargeCount += v.rechargeCount;
        rechargeAmount += v.rechargeAmount;
        snackCount += v.snackCount;
        snackPay += v.snackPay;
        snackScore += v.snackScore;
      }
    });
    return { tickets, income, count, profit, rechargeCount, rechargeAmount, snackCount, snackPay, snackScore };
  }, [daily, viewDate]);

  // 选中日期的全部订单（电影票 + 充值 + 卖品）
  const selectedOrders = useMemo(() => {
    if (!selectedDay) return [];
    return orders.filter((o) => orderDate(o) === selectedDay && (isMovieOrder(o) || isRechargeOrder(o) || parseSnackOrder(o).count > 0));
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
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div>
              <p className="text-xl font-bold text-pink-600">{yearStats.tickets}</p>
              <p className="text-xs text-pink-500">出票（张）</p>
            </div>
            <div>
              <p className="text-xl font-bold text-pink-600">¥{yearStats.income.toFixed(0)}</p>
              <p className="text-xs text-pink-500">电影票实付</p>
            </div>
            <div>
              <p className={`text-xl font-bold ${yearStats.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {yearStats.profit >= 0 ? '+' : ''}¥{yearStats.profit.toFixed(0)}
              </p>
              <p className="text-xs text-gray-500">利润</p>
            </div>
            <div>
              <p className="text-xl font-bold text-blue-600">¥{yearStats.rechargeAmount.toFixed(0)}</p>
              <p className="text-xs text-blue-500">充值总额</p>
            </div>
            <div>
              <p className="text-xl font-bold text-orange-500">¥{yearStats.snackPay.toFixed(0)}</p>
              <p className="text-xs text-orange-500">卖品金额</p>
            </div>
            <div>
              <p className="text-xl font-bold text-purple-600">{yearStats.snackScore}</p>
              <p className="text-xs text-purple-500">卖品积分</p>
            </div>
          </div>
        </div>
        <div className="bg-green-50 rounded-lg border border-green-200 p-4">
          <p className="text-xs text-green-600 font-medium flex items-center gap-1">
            <CalendarDays className="w-3.5 h-3.5" /> {viewDate.y} 年 {viewDate.m + 1} 月统计
          </p>
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div>
              <p className="text-xl font-bold text-green-600">{monthStats.tickets}</p>
              <p className="text-xs text-green-500">出票（张）</p>
            </div>
            <div>
              <p className="text-xl font-bold text-green-600">¥{monthStats.income.toFixed(0)}</p>
              <p className="text-xs text-green-500">电影票实付</p>
            </div>
            <div>
              <p className={`text-xl font-bold ${monthStats.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {monthStats.profit >= 0 ? '+' : ''}¥{monthStats.profit.toFixed(0)}
              </p>
              <p className="text-xs text-gray-500">利润</p>
            </div>
            <div>
              <p className="text-xl font-bold text-blue-600">¥{monthStats.rechargeAmount.toFixed(0)}</p>
              <p className="text-xs text-blue-500">充值总额</p>
            </div>
            <div>
              <p className="text-xl font-bold text-orange-500">¥{monthStats.snackPay.toFixed(0)}</p>
              <p className="text-xs text-orange-500">卖品金额</p>
            </div>
            <div>
              <p className="text-xl font-bold text-purple-600">{monthStats.snackScore}</p>
              <p className="text-xs text-purple-500">卖品积分</p>
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
                className={`min-h-[96px] border-t border-r text-left p-2 transition-colors relative ${
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
                  <div className="mt-1 space-y-1">
                    {/* 左列：电影票 */}
                    <div className="space-y-0.5">
                      <p className="text-sm text-pink-600 font-semibold flex items-center gap-1">
                        <Ticket className="w-4 h-4" /> {stat.tickets} 张
                        {isOverridden && <span className="text-[9px] bg-pink-200 text-pink-700 rounded px-1">改</span>}
                      </p>
                      <p className="text-sm text-green-600 font-medium flex items-center gap-1">
                        <Banknote className="w-4 h-4" /> ¥{stat.income.toFixed(0)}
                      </p>
                      <p className={`text-sm flex items-center gap-1 ${stat.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {stat.profit >= 0 ? '▲' : '▼'} {stat.profit >= 0 ? '+' : ''}¥{stat.profit.toFixed(0)}
                      </p>
                    </div>
                    {/* 右列：充值/卖品（换行显示，不挤一行） */}
                    {stat.rechargeCount > 0 && (
                      <p className="text-xs text-blue-600 font-medium">💰 充值 ¥{stat.rechargeAmount.toFixed(0)}</p>
                    )}
                    {stat.snackCount > 0 && (
                      <div className="text-xs text-orange-500">
                        <p>🍿 卖品 {stat.snackCount} 单</p>
                        {stat.snackPay > 0 && <p>金额 ¥{stat.snackPay.toFixed(0)}</p>}
                        {stat.snackScore > 0 && <p>积分 {stat.snackScore}</p>}
                      </div>
                    )}
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
                const type = String(o.type ?? '');
                // 充值订单
                if (isRechargeOrder(o)) {
                  const amt = orderAmount(o);
                  return (
                    <div key={i} className="flex items-center justify-between text-sm bg-blue-50 rounded-lg p-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium">充值/购买套餐</p>
                        <p className="text-xs text-gray-400">充值订单 · {o.type_name || '购买套餐'}</p>
                      </div>
                      <div className="text-right ml-3">
                        <p className="font-bold text-blue-600">¥{amt.toFixed(0)}</p>
                        <p className="text-[10px] text-gray-400">充值金额</p>
                      </div>
                    </div>
                  );
                }
                // 卖品订单
                const snack = parseSnackOrder(o);
                if (snack.count > 0) {
                  const names = (() => {
                    try {
                      const m = typeof o.message === 'string' ? JSON.parse(o.message) : o.message;
                      if (Array.isArray(m)) return m.map((x: any) => `${x.planName || x.goodsName || '卖品'}×${x.num || 1}`).join('、');
                    } catch {}
                    return '卖品';
                  })();
                  return (
                    <div key={i} className="flex items-center justify-between text-sm bg-orange-50 rounded-lg p-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium">{names}</p>
                        <p className="text-xs text-gray-400">
                          卖品订单
                          {snack.pay > 0 ? ` · 金额 ¥${snack.pay.toFixed(0)}` : ''}
                          {snack.score > 0 ? ` · 积分 ${snack.score}` : ''}
                        </p>
                      </div>
                      <div className="text-right ml-3">
                        {snack.pay > 0 && <p className="font-bold text-orange-500">¥{snack.pay.toFixed(0)}</p>}
                        {snack.score > 0 && <p className="font-bold text-purple-600">{snack.score}分</p>}
                      </div>
                    </div>
                  );
                }
                // 电影票订单
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
