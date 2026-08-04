import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Ticket, Banknote, TrendingUp, CalendarDays } from 'lucide-react';
import { useStore } from '../store/useStore';
import { api } from '../api/client';

// 判断订单是否是电影票
function isMovieOrder(order: any): boolean {
  const type = String(order.type || order.orderType || order.saleType || '').toLowerCase();
  if (type === '1' || type.includes('film') || type.includes('movie') || type.includes('ticket')) return true;
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

// 取订单日期 yyyy-mm-dd
function orderDate(order: any): string {
  const t = order.create_time || order.createTime || order.payTime || '';
  if (!t) return '';
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

// 取订单票数
function orderTickets(order: any): number {
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
  const [selectedDay, setSelectedDay] = useState<string>('');

  const loadOrders = async () => {
    if (!account) return;
    setLoading(true);
    setError('');
    try {
      let all: any[] = [];
      for (let page = 1; page <= 8; page++) {
        const resp = await api.getOrderList(page, 100);
        if (!resp.success) {
          setError(resp.message || '拉取订单失败');
          break;
        }
        const data = resp.result as any;
        const list = Array.isArray(data) ? data : data?.records || [];
        if (list.length === 0) break;
        all = all.concat(list);
        const total = data?.total;
        if (total && all.length >= Number(total)) break;
      }
      setOrders(all);
    } catch (e: any) {
      setError('加载失败：' + e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId]);

  // 按日期聚合电影票订单
  const daily = useMemo(() => {
    const map = new Map<string, { tickets: number; income: number; count: number }>();
    orders.forEach((o) => {
      if (!isMovieOrder(o)) return;
      const d = orderDate(o);
      if (!d) return;
      const cur = map.get(d) || { tickets: 0, income: 0, count: 0 };
      cur.tickets += orderTickets(o);
      cur.income += orderAmount(o);
      cur.count += 1;
      map.set(d, cur);
    });
    return map;
  }, [orders]);

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
    daily.forEach((v, d) => {
      if (d.startsWith(prefix)) {
        tickets += v.tickets;
        income += v.income;
        count += v.count;
      }
    });
    return { tickets, income, count };
  }, [daily, viewDate]);

  // 年统计
  const yearStats = useMemo(() => {
    const prefix = `${viewDate.y}-`;
    let tickets = 0;
    let income = 0;
    let count = 0;
    daily.forEach((v, d) => {
      if (d.startsWith(prefix)) {
        tickets += v.tickets;
        income += v.income;
        count += v.count;
      }
    });
    return { tickets, income, count };
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

  if (!account) {
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
          <p className="text-sm text-gray-500">{account.name} · 每日出票记录与收入</p>
        </div>
        <button
          onClick={loadOrders}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

      {/* 年统计 + 月统计 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-pink-50 rounded-lg border border-pink-200 p-4">
          <p className="text-xs text-pink-600 font-medium flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" /> {viewDate.y} 年统计
          </p>
          <div className="flex gap-6 mt-2">
            <div>
              <p className="text-2xl font-bold text-pink-600">{yearStats.tickets}</p>
              <p className="text-xs text-pink-500">出票（张）</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-pink-600">¥{yearStats.income.toFixed(2)}</p>
              <p className="text-xs text-pink-500">收入（元）</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-pink-600">{yearStats.count}</p>
              <p className="text-xs text-pink-500">订单（笔）</p>
            </div>
          </div>
        </div>
        <div className="bg-green-50 rounded-lg border border-green-200 p-4">
          <p className="text-xs text-green-600 font-medium flex items-center gap-1">
            <CalendarDays className="w-3.5 h-3.5" /> {viewDate.y} 年 {viewDate.m + 1} 月统计
          </p>
          <div className="flex gap-6 mt-2">
            <div>
              <p className="text-2xl font-bold text-green-600">{monthStats.tickets}</p>
              <p className="text-xs text-green-500">出票（张）</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">¥{monthStats.income.toFixed(2)}</p>
              <p className="text-xs text-green-500">收入（元）</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{monthStats.count}</p>
              <p className="text-xs text-green-500">订单（笔）</p>
            </div>
          </div>
        </div>
      </div>

      {/* 日历 */}
      <div className="bg-white rounded-lg border">
        <div className="flex items-center justify-between p-4 border-b">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h3 className="font-medium">
            {viewDate.y} 年 {viewDate.m + 1} 月
          </h3>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 border-b">
          {weekdays.map((w) => (
            <div key={w} className="text-center text-xs text-gray-400 py-2">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((cell, i) => {
            if (!cell) return <div key={`empty-${i}`} className="min-h-[76px]" />;
            const stat = daily.get(cell.date);
            const isToday = cell.date === todayStr;
            const isSelected = cell.date === selectedDay;
            return (
              <button
                key={cell.date}
                onClick={() => setSelectedDay(isSelected ? '' : cell.date)}
                className={`min-h-[76px] border-t border-r text-left p-1.5 transition-colors ${
                  isSelected ? 'bg-pink-50' : stat ? 'hover:bg-pink-50/40' : 'hover:bg-gray-50'
                } ${i % 7 === 6 ? 'border-r-0' : ''}`}
              >
                <span
                  className={`inline-flex w-6 h-6 items-center justify-center rounded-full text-xs ${
                    isToday ? 'bg-pink-500 text-white font-bold' : 'text-gray-600'
                  }`}
                >
                  {cell.day}
                </span>
                {stat && (
                  <div className="mt-1 space-y-0.5">
                    <p className="text-[10px] text-pink-600 font-medium flex items-center gap-0.5">
                      <Ticket className="w-3 h-3" /> {stat.tickets} 张
                    </p>
                    <p className="text-[10px] text-green-600 flex items-center gap-0.5">
                      <Banknote className="w-3 h-3" /> ¥{stat.income.toFixed(0)}
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
          <h3 className="text-sm font-medium mb-3">
            {selectedDay} 出票明细（{selectedOrders.length} 笔）
          </h3>
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
                return (
                  <div key={i} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg p-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{msg.filmName || msg.film_name || o.filmName || '电影票'}</p>
                      <p className="text-xs text-gray-400">
                        {orderDate(o)} {o.create_time?.toString().split(' ')[1]?.substring(0, 5) || ''}
                        {' · '}
                        {orderTickets(o)} 张
                        {msg.hallName || o.hallName ? ` · ${msg.hallName || o.hallName}` : ''}
                      </p>
                    </div>
                    <p className="font-bold text-green-600 ml-3">¥{orderAmount(o).toFixed(2)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
