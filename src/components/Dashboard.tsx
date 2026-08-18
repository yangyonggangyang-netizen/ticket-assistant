import { useEffect, useState } from 'react';
import { Film, Ticket, Wallet, Star, AlertCircle, RefreshCw, User, CalendarDays, Banknote, Pencil, Check, X, TrendingUp, ClipboardList } from 'lucide-react';
import { useStore } from '../store/useStore';
import { api } from '../api/client';
import { loadOverrides, saveOverride } from '../store/ledgerOverride';
import type { Page } from '../App';

// 固定卖价（与记账日历一致，localStorage 持久化）
const PRICES_KEY = 'ledger_prices';
function loadPrices(): { jinyi: number; jiahe: number } {
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

export default function Dashboard({ setPage }: { setPage: (p: Page) => void }) {
  const { accounts, activeAccountId, cinemas, selectedCinemaId, refreshActiveAccount, loading } = useStore();
  const account = accounts.find((a) => a.id === activeAccountId);
  const [movies, setMovies] = useState<any[]>([]);
  const [movieCount, setMovieCount] = useState(0);
  const [loadingMovies, setLoadingMovies] = useState(false);
  const [todayStats, setTodayStats] = useState<{ count: number; orderCount: number; income: number; profit: number; loading: boolean }>({ count: 0, orderCount: 0, income: 0, profit: 0, loading: false });
  const [todayOverridden, setTodayOverridden] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTickets, setEditTickets] = useState('');
  const [editOrders, setEditOrders] = useState('');
  const [editIncome, setEditIncome] = useState('');
  const [editProfit, setEditProfit] = useState('');
  const [todayStr] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // 读取手动覆盖（与记账日历同步）
  const refreshOverride = () => {
    const ov = loadOverrides();
    if (ov[todayStr]) {
      setTodayStats((s) => ({ ...s, count: ov[todayStr].tickets, income: ov[todayStr].income, profit: ov[todayStr].profit ?? 0, loading: false }));
      setTodayOverridden(true);
    } else {
      setTodayOverridden(false);
    }
  };

  const loadMovies = async () => {
    setLoadingMovies(true);
    try {
      const resp = await api.getNowPlayMovies(selectedCinemaId, 1, 6);
      if (resp.success && resp.result) {
        setMovies(resp.result.records || []);
        setMovieCount(resp.result.total || 0);
      }
    } catch (e) {
      console.error('Failed to load movies:', e);
    }
    setLoadingMovies(false);
  };

  useEffect(() => {
    if (selectedCinemaId) {
      loadMovies();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCinemaId]);

  useEffect(() => {
    // 今日出票统计所有账号，切账号不重新加载（避免一直转圈），手动刷新按钮可重新拉
    if (accounts.length > 0) {
      loadTodayStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 取订单票数（真实票数在 message.num）
  const orderTickets = (o: any): number => {
    try {
      const msg = typeof o.message === 'string' ? JSON.parse(o.message) : o.message;
      if (Array.isArray(msg) && msg[0] && msg[0].num) {
        const n = Number(msg[0].num);
        if (n > 0) return n;
      }
      if (msg && typeof msg === 'object' && msg.num) {
        const n = Number(msg.num);
        if (n > 0) return n;
      }
    } catch {}
    const n = Number(o.buy_num ?? o.buyNum ?? o.ticketCount ?? 1);
    return n > 0 ? n : 1;
  };

  const loadTodayStats = async () => {
    // 若今天有手动覆盖值，直接显示（不覆盖用户编辑）
    const ov = loadOverrides();
    if (ov[todayStr]) {
      setTodayStats((s) => ({ ...s, count: ov[todayStr].tickets, income: ov[todayStr].income, loading: false }));
      setTodayOverridden(true);
      return;
    }
    setTodayStats((s) => ({ ...s, loading: true }));
    try {
      // 拉所有已登录账号的最近订单（每账号最多 5 页）
      let all: any[] = [];
      const targetAccounts = accounts.filter((a) => a.token && a.memberId);
      for (const acc of targetAccounts) {
        for (let page = 1; page <= 5; page++) {
          const resp = await api.getOrderListAs(acc.token, acc.memberId, page, 50);
          if (!resp.success) break;
          const data = resp.result as any;
          const list = Array.isArray(data) ? data : data?.records || [];
          if (list.length === 0) break;
          all = all.concat(list);
          const total = data?.total;
          if (total && all.length >= Number(total)) break;
        }
      }
      // 统计今日成功电影票订单：只算 type=1 + status=7 + 金额>=0（排除卖品/储值/退票/退款）
      // 出票张数 count / 订单数 orderCount / 买票收入 income=实付总和 / 利润 profit=固定卖价×票数-实付
      const prices = loadPrices();
      let count = 0;
      let orderCount = 0;
      let income = 0;
      let saleIncome = 0;
      all.forEach((o: any) => {
        // create_time 可能是毫秒时间戳（如 1772606552000）或日期字符串，统一转成 yyyy-mm-dd
        const raw = o.create_time ?? o.createTime ?? '';
        let dayStr = '';
        if (raw !== '' && raw != null) {
          if (typeof raw === 'number' || (typeof raw === 'string' && /^\d+$/.test(raw))) {
            const d = new Date(Number(raw));
            if (!isNaN(d.getTime())) {
              dayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            }
          } else {
            const s = String(raw);
            const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m) dayStr = `${m[1]}-${m[2]}-${m[3]}`;
          }
        }
        if (dayStr !== todayStr) return;
        // 只统计电影票（type=1），排除卖品(4)/储值(2)/会员扣费(12)
        const type = Number(o.type ?? o.order_type ?? 0);
        if (type !== 1) return;
        // 排除退票/取消（status=8）和待支付（0/-1）；只有 status=7 算成功
        const status = Number(o.status ?? -1);
        if (status !== 7) return;
        // 排除负金额（退款单）
        const payAmount = Number(o.pay_amount ?? o.payAmount ?? 0);
        if (payAmount < 0) return;
        const n = orderTickets(o);
        const unitPrice = isJiahe(o) ? prices.jiahe : prices.jinyi;
        count += n; // 出票张数
        orderCount += 1; // 订单数
        income += payAmount; // 买票收入 = 实付总和
        saleIncome += unitPrice * n; // 卖票收入（用于算利润）
      });
      const profit = saleIncome - income; // 利润 = 卖价×票数 - 实付
      setTodayStats({ count, orderCount, income, profit, loading: false });
      setTodayOverridden(false);
    } catch (e) {
      console.error('Failed to load today stats:', e);
      setTodayStats((s) => ({ ...s, loading: false }));
    }
  };

  // 手动编辑今日出票（与记账日历同步）
  const startEdit = () => {
    setEditTickets(String(todayStats.count));
    setEditOrders(String(todayStats.orderCount));
    setEditIncome(String(todayStats.income));
    setEditProfit(String(todayStats.profit));
    setEditing(true);
  };
  const saveEdit = () => {
    const tickets = Math.max(0, Number(editTickets) || 0);
    const income = Number(editIncome) || 0;
    const profit = Number(editProfit) || 0;
    saveOverride(todayStr, { tickets, income, profit });
    setTodayStats({ count: tickets, orderCount: Number(editOrders) || 0, income, profit, loading: false });
    setTodayOverridden(true);
    setEditing(false);
  };

  if (!account) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500 mb-3">请先添加账号</p>
          <button
            onClick={() => setPage('accounts')}
            className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600"
          >
            添加账号
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">控制台</h2>
          <p className="text-sm text-gray-500">大埔嘉逸影联 · 影院出票管理系统</p>
        </div>
        <button
          onClick={refreshActiveAccount}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* Token status warning */}
      {account.tokenValid === false && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">Token 已失效</p>
            <p className="text-xs text-red-600">请重新捕获 Token 或切换账号</p>
          </div>
          <button
            onClick={() => setPage('accounts')}
            className="px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600"
          >
            重新登录
          </button>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={Wallet}
          label="余额"
          value={account.balance != null ? `¥${Number(account.balance).toFixed(2)}` : '--'}
          color="bg-blue-50 text-blue-600"
        />
        <StatCard
          icon={Star}
          label="积分"
          value={account.score != null ? String(account.score) : '--'}
          color="bg-yellow-50 text-yellow-600"
        />
        <StatCard
          icon={Film}
          label="在映电影"
          value={String(movieCount)}
          color="bg-purple-50 text-purple-600"
        />
        <StatCard
          icon={Ticket}
          label="会员等级"
          value={account.levelDictText || account.level || '--'}
          color="bg-pink-50 text-pink-600"
        />
      </div>

      {/* 今日出票统计 */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-pink-500" />
            今日出票记录
            {todayOverridden && (
              <span className="text-[10px] bg-purple-100 text-purple-700 rounded px-1.5 py-0.5">已手动编辑</span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            {!editing && (
              <>
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1 text-xs text-purple-500 hover:text-purple-600"
                >
                  <Pencil className="w-3 h-3" />
                  编辑
                </button>
                <button
                  onClick={loadTodayStats}
                  disabled={todayStats.loading}
                  className="flex items-center gap-1 text-xs text-pink-500 hover:text-pink-600 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${todayStats.loading ? 'animate-spin' : ''}`} />
                  刷新
                </button>
              </>
            )}
            {editing && (
              <>
                <button
                  onClick={saveEdit}
                  className="flex items-center gap-1 text-xs bg-purple-500 text-white px-2 py-1 rounded hover:bg-purple-600"
                >
                  <Check className="w-3 h-3" />
                  保存
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                >
                  <X className="w-3 h-3" />
                  取消
                </button>
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-pink-50 rounded-lg p-4">
            <p className="text-xs text-pink-600 flex items-center gap-1">
              <Ticket className="w-3.5 h-3.5" />
              今日出票（张）
            </p>
            {editing ? (
              <input
                type="number"
                value={editTickets}
                onChange={(e) => setEditTickets(e.target.value)}
                className="mt-1 w-full px-2 py-1.5 text-xl font-bold text-pink-600 border rounded-lg outline-none focus:border-pink-400"
                autoFocus
              />
            ) : (
              <p className="text-2xl font-bold text-pink-600 mt-1">
                {todayStats.loading ? '...' : todayStats.count}
              </p>
            )}
          </div>
          <div className="bg-indigo-50 rounded-lg p-4">
            <p className="text-xs text-indigo-600 flex items-center gap-1">
              <ClipboardList className="w-3.5 h-3.5" />
              今日订单（笔）
            </p>
            {editing ? (
              <input
                type="number"
                value={editOrders}
                onChange={(e) => setEditOrders(e.target.value)}
                className="mt-1 w-full px-2 py-1.5 text-xl font-bold text-indigo-600 border rounded-lg outline-none focus:border-indigo-400"
              />
            ) : (
              <p className="text-2xl font-bold text-indigo-600 mt-1">
                {todayStats.loading ? '...' : todayStats.orderCount}
              </p>
            )}
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-xs text-green-600 flex items-center gap-1">
              <Banknote className="w-3.5 h-3.5" />
              今日电影票实付（元）
            </p>
            {editing ? (
              <input
                type="number"
                step="0.01"
                value={editIncome}
                onChange={(e) => setEditIncome(e.target.value)}
                className="mt-1 w-full px-2 py-1.5 text-xl font-bold text-green-600 border rounded-lg outline-none focus:border-green-400"
              />
            ) : (
              <p className="text-2xl font-bold text-green-600 mt-1">
                {todayStats.loading ? '...' : `¥${todayStats.income.toFixed(2)}`}
              </p>
            )}
          </div>
          <div className="bg-amber-50 rounded-lg p-4">
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              今日利润（元）
            </p>
            {editing ? (
              <input
                type="number"
                step="0.01"
                value={editProfit}
                onChange={(e) => setEditProfit(e.target.value)}
                className="mt-1 w-full px-2 py-1.5 text-xl font-bold text-amber-600 border rounded-lg outline-none focus:border-amber-400"
              />
            ) : (
              <p className={`text-2xl font-bold mt-1 ${todayStats.profit >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                {todayStats.loading ? '...' : `${todayStats.profit >= 0 ? '+' : ''}¥${todayStats.profit.toFixed(2)}`}
              </p>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          电影票实付 = 成功电影票订单实付金额总和；利润 = 固定卖价×票数（金逸¥{loadPrices().jinyi}/嘉和¥{loadPrices().jiahe}）− 实付；只统计成功订单，不含卖品/退票/储值；手动编辑后与记账日历同步
        </p>
      </div>

      {/* Cinema selector */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-medium mb-3">影院选择</h3>
        <div className="flex gap-2 flex-wrap">
          {cinemas.map((c: any) => (
            <button
              key={c.id}
              onClick={() => useStore.getState().setSelectedCinema(c.id)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                selectedCinemaId === c.id
                  ? 'bg-pink-500 text-white border-pink-500'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-pink-300'
              }`}
            >
              {c.cinemaName}
            </button>
          ))}
        </div>
      </div>

      {/* Movies list */}
      <div className="bg-white rounded-lg border">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-sm font-medium">正在上映</h3>
          <button
            onClick={() => setPage('movies')}
            className="text-xs text-pink-500 hover:text-pink-600"
          >
            查看全部 →
          </button>
        </div>
        <div className="p-4">
          {loadingMovies ? (
            <p className="text-sm text-gray-400">加载中...</p>
          ) : movies.length === 0 ? (
            <p className="text-sm text-gray-400">暂无在映电影</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {movies.slice(0, 6).map((m: any, i: number) => (
                <div key={i} className="border rounded-lg p-3 hover:shadow-sm">
                  <p className="font-medium text-sm truncate">
                    {m.name || m.filmName || `电影 ${m.code || i}`}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    {m.edition && <span>{m.edition}</span>}
                    {m.filmSchedule?.language && <span>{m.filmSchedule.language}</span>}
                    {m.filmSchedule?.startTime && (
                      <span className="text-pink-500">
                        {m.filmSchedule.startTime.substring(5, 16)}
                      </span>
                    )}
                  </div>
                  {m.originalPrice != null && (
                    <p className="text-xs text-gray-400 mt-1">原价: ¥{m.originalPrice}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-4">
        <QuickAction
          icon={Film}
          label="选座购票"
          desc="查看排期并选座"
          onClick={() => setPage('schedules')}
        />
        <QuickAction
          icon={Ticket}
          label="我的订单"
          desc="查看和管理订单"
          onClick={() => setPage('orders')}
        />
        <QuickAction
          icon={User}
          label="会员中心"
          desc="余额积分卡券"
          onClick={() => setPage('member')}
        />
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: any) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-xs text-gray-500 mt-3">{label}</p>
      <p className="text-lg font-bold mt-1">{value}</p>
    </div>
  );
}

function QuickAction({ icon: Icon, label, desc, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-lg border p-4 text-left hover:shadow-md transition-shadow"
    >
      <Icon className="w-6 h-6 text-pink-500" />
      <p className="font-medium text-sm mt-2">{label}</p>
      <p className="text-xs text-gray-400 mt-1">{desc}</p>
    </button>
  );
}
