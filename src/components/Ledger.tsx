import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Ticket, Banknote, TrendingUp, CalendarDays, Settings2, Save, Pencil, Check, X, Layers, Plus, Trash2, BadgeCheck } from 'lucide-react';
import { useStore } from '../store/useStore';
import { api } from '../api/client';
import { loadOverrides, saveOverride, clearOverride } from '../store/ledgerOverride';
import { loadRules, saveRules, PriceRule, loadBatches, saveBatches, loadOrders as loadBatchOrders, saveOrders as saveBatchOrders, refreshBatchStatuses, getRuleForDate } from '../store/batchStore';
import { loadRedemptions, saveRedemptions, addRedemption, deleteRedemption, genCodes, repairRedemptions, loadPendingVouchers, RedemptionRecord } from '../store/redemptionStore';
import BatchManager from './BatchManager';
import GoodsVoucherQuery from './GoodsVoucherQuery';
import { syncVoucherSnapshot } from '../utils/voucherSnapshot';

// 卖价统一使用「价格规则」（按日期多版本），不再有独立的固定卖价
function isJiahe(order: any): boolean {
  const name = String(order.cinema_name || order.cinemaName || '');
  return name.includes('嘉和');
}

// 订单成功状态判断：只有 status=7（send_state=1）算成功！
// 实测：status=7+send=1=成功；status=8+send=0=取消/未完成；status=9=退款
function isSuccessOrder(order: any): boolean {
  const status = Number(order.status ?? -1);
  return status === 7;
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
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [showPriceEdit, setShowPriceEdit] = useState(false);
  const [priceMsg, setPriceMsg] = useState('');
  // 视图切换：calendar=记账日历 / batches=活动批次 / goods=卖品券码
  const [view, setView] = useState<'calendar' | 'batches' | 'goods'>('calendar');
  const [priceRules, setPriceRules] = useState<PriceRule[]>(loadRules);
  // 待核对核销码（查不到核销时间）
  const [pendingVouchers, setPendingVouchers] = useState<any[]>(loadPendingVouchers);
  const [showPending, setShowPending] = useState(false);

  // 升级修复：一次性清理 v1.0.51/1.0.53 自动同步产生的错误统计（堆集在某天的超量记录）
  useEffect(() => {
    try {
      if (!localStorage.getItem('ledger_redemption_repaired')) {
        const r = repairRedemptions();
        if (r.fixed > 0 || r.removed > 0) {
          setRedemptions(loadRedemptions());
          setPriceMsg(`已修复核销码数据：修正 ${r.fixed} 条日期，清理 ${r.removed} 条错误统计（请刷新重新统计）`);
          setTimeout(() => setPriceMsg(''), 6000);
        }
        localStorage.setItem('ledger_redemption_repaired', '1');
      }
      // 待核对机制已废弃（v1.0.57 按快照对比记刷新当天），清空残留
      if (localStorage.getItem('voucher_pending')) {
        localStorage.removeItem('voucher_pending');
        setPendingVouchers([]);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [newRule, setNewRule] = useState<{ from: string; to: string; jinyiCost: number; jinyiSell: number; jinyiCode: number; jiaheCost: number; jiaheSell: number; jiaheCode: number; note: string }>({
    from: '', to: '', jinyiCost: 35, jinyiSell: 33, jinyiCode: 30, jiaheCost: 30, jiaheSell: 30, jiaheCode: 28, note: '',
  });
  const addRule = () => {
    if (!newRule.from) { setPriceMsg('请填写生效日期'); setTimeout(() => setPriceMsg(''), 3000); return; }
    const rule: PriceRule = {
      id: 'rule-' + Date.now(),
      effectiveFrom: newRule.from,
      effectiveTo: newRule.to || undefined,
      jinyiCost: newRule.jinyiCost, jinyiSell: newRule.jinyiSell, jinyiCode: newRule.jinyiCode,
      jiaheCost: newRule.jiaheCost, jiaheSell: newRule.jiaheSell, jiaheCode: newRule.jiaheCode,
      note: newRule.note || '自定义规则',
    };
    setPriceRules([...priceRules, rule]);
    setNewRule({ from: '', to: '', jinyiCost: 35, jinyiSell: 33, jinyiCode: 30, jiaheCost: 30, jiaheSell: 30, jiaheCode: 28, note: '' });
    setPriceMsg('规则已添加，点「保存规则」生效');
    setTimeout(() => setPriceMsg(''), 3000);
  };
  const deleteRule = (id: string) => {
    if (priceRules.length <= 1) return;
    setPriceRules(priceRules.filter((r) => r.id !== id));
  };
  // ===== 批次订单绑定 =====
  const [batches, setBatches] = useState<any[]>([]);
  const [batchOrders, setBatchOrders] = useState<any[]>([]);
  const [bindOrder, setBindOrder] = useState<{ order: any; tickets: number; cinema: 'jinyi' | 'jiahe' } | null>(null);
  const [bindBatchId, setBindBatchId] = useState('');
  const [bindCoupon, setBindCoupon] = useState(0);
  const [bindMsg, setBindMsg] = useState('');
  const [savingBind, setSavingBind] = useState(false);
  // 绑定类型：会员购票 / 核销码（核销码按核销码价记收入，成本默认 0=赠券）
  const [bindType, setBindType] = useState<'member' | 'code'>('member');
  const [bindCodeCost, setBindCodeCost] = useState(0);
  // ===== 核销码核销登记 =====
  const [redemptions, setRedemptions] = useState<RedemptionRecord[]>(loadRedemptions);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemCinema, setRedeemCinema] = useState<'jinyi' | 'jiahe'>('jinyi');
  const [redeemCount, setRedeemCount] = useState(1);
  const [redeemPrice, setRedeemPrice] = useState(30);
  const [redeemCodes, setRedeemCodes] = useState('');
  const [redeemBatchId, setRedeemBatchId] = useState('');
  const [redeemMsg, setRedeemMsg] = useState('');
  const [redeemSaving, setRedeemSaving] = useState(false);

  useEffect(() => {
    setBatches(refreshBatchStatuses(loadBatches()));
    setBatchOrders(loadBatchOrders());
  }, [view]);

  const orderIdKey = (o: any): string => {
    // 用订单号作为唯一标识（order_no / orderNo / id）
    return String(o.order_no || o.orderNo || o.id || `${o.type_name || ''}-${o.create_time || o.createTime || Date.now()}`);
  };

  const openBindBatch = (o: any, tickets: number, cinema: 'jinyi' | 'jiahe') => {
    setBindOrder({ order: o, tickets, cinema });
    setBindBatchId('');
    setBindCoupon(0);
    setBindType('member');
    setBindCodeCost(0);
    setBindMsg('');
  };

  // 绑定批次：自动计算成本/优惠/利润
  const doBind = async () => {
    if (!bindOrder || !bindBatchId) { setBindMsg('请选择活动批次'); return; }
    setSavingBind(true);
    setBindMsg('');
    try {
      const all = loadBatches();
      const b = all.find((x) => x.id === bindBatchId);
      if (!b) { setBindMsg('批次不存在'); setSavingBind(false); return; }
      if (b.status !== 'active') { setBindMsg('批次已用完或过期'); setSavingBind(false); return; }
      const { order, tickets, cinema } = bindOrder;
      // 价格规则（按订单日期）
      const date = orderDate(order);
      const rule = getRuleForDate(loadRules(), date);
      const isJ = cinema === 'jinyi';
      const isCode = bindType === 'code';
      // 成本：核销码默认 0（赠券无成本，可手动填成本/张）；会员票按会员成本
      const costNormal = isCode
        ? (Number(bindCodeCost) || 0) * tickets
        : (isJ ? rule.jinyiCost : rule.jiaheCost) * tickets;
      // 优惠抵扣：会员票可用优惠金；核销码不走优惠金
      const maxByTicket = tickets * (b.couponPerTicket || 0);
      const couponUsed = isCode ? 0 : Math.min(Number(bindCoupon) || 0, maxByTicket, b.couponLeft);
      const costActual = Math.max(0, costNormal - couponUsed);
      // 收入：核销码按核销码售价；会员票按客户售价
      const income = isCode
        ? (isJ ? rule.jinyiCode : rule.jiaheCode) * tickets
        : (isJ ? rule.jinyiSell : rule.jiaheSell) * tickets;
      const profit = income - costActual;
      // 保存批次订单
      const bo = {
        id: orderIdKey(order),
        time: date,
        batchId: b.id,
        accountId: order.memberId || '',
        cinema,
        type: (isCode ? 'code' : 'member') as 'member' | 'code',
        tickets,
        sellPrice: income,
        costNormal,
        couponUsed,
        costActual,
        fee: 0,
        voucherCode: String(order.take_code || order.takeCode || order.verify_code || ''),
        status: 'shipped' as const,
        profit,
        priceNote: rule.note || '默认规则',
      };
      // 扣减批次：核销码→扣赠券库存；会员票→扣余额/优惠金/赠券
      const newB = { ...b };
      if (isCode) {
        newB.giftVouchersLeft = Math.max(0, (newB.giftVouchersLeft || 0) - tickets);
      } else {
        newB.balanceLeft = Math.max(0, (newB.balanceLeft || 0) - costActual);
        if (newB.type === 'coupon') {
          newB.couponLeft = Math.max(0, (newB.couponLeft || 0) - couponUsed);
        } else if (newB.type === 'voucher') {
          newB.giftVouchersLeft = Math.max(0, (newB.giftVouchersLeft || 0) - tickets);
        }
      }
      saveBatches(all.map((x) => x.id === b.id ? newB : x));
      // 保存订单
      const orders = loadBatchOrders();
      orders.push(bo);
      saveBatchOrders(orders);
      // 刷新
      setBatches(refreshBatchStatuses(loadBatches()));
      setBatchOrders(loadBatchOrders());
      setBindOrder(null);
      setPriceMsg(`✅ 已绑定批次 ${b.id}，利润 ¥${profit.toFixed(2)}`);
      setTimeout(() => setPriceMsg(''), 4000);
    } catch (e: any) {
      setBindMsg('绑定失败：' + (e.message || String(e)));
    } finally {
      setSavingBind(false);
    }
  };

  // ===== 核销码核销登记：使用即记利润（成本默认 0，利润全额进当天） =====
  const doRedeem = () => {
    if (redeemSaving) return;
    const n = Math.max(1, Number(redeemCount) || 1);
    const price = Number(redeemPrice) || 0;
    if (price <= 0) { setRedeemMsg('请填写核销码单价'); return; }
    setRedeemSaving(true);
    setRedeemMsg('');
    try {
      const now = new Date();
      const pad = (x: number) => String(x).padStart(2, '0');
      const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      // 核销码号：填了用填的（按行/逗号分隔），没填自动编号
      const manual = redeemCodes.split(/[\n,，\s]+/).map((s) => s.trim()).filter(Boolean);
      let codes: string[];
      if (manual.length > 0) {
        codes = manual.slice(0, n);
        while (codes.length < n) codes.push(genCodes(date, 1, codes)[0]);
      } else {
        codes = genCodes(date, n, redemptions.flatMap((r) => r.codes));
      }
      const rec: RedemptionRecord = {
        id: 'RD' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        date,
        time,
        cinema: redeemCinema,
        count: n,
        codes,
        unitPrice: price,
        income: price * n,
        batchId: redeemBatchId,
        profit: price * n, // 成本默认 0（赠券无成本）
      };
      // 关联批次（voucher 类型）：自动扣赠券库存
      if (redeemBatchId) {
        const all = loadBatches();
        const b = all.find((x) => x.id === redeemBatchId);
        if (b && b.type === 'voucher') {
          const newB = { ...b, giftVouchersLeft: Math.max(0, (b.giftVouchersLeft || 0) - n) };
          saveBatches(all.map((x) => (x.id === b.id ? newB : x)));
          setBatches(refreshBatchStatuses(loadBatches()));
        }
      }
      const list = addRedemption(rec);
      setRedemptions(list);
      // 重置表单
      setRedeemCount(1);
      setRedeemCodes('');
      setRedeemBatchId('');
      setRedeemMsg('');
      setRedeemOpen(false);
    } catch (e: any) {
      setRedeemMsg('登记失败：' + (e.message || String(e)));
    } finally {
      setRedeemSaving(false);
    }
  };

  // 手动刷新：拉取所有已登录账号的【当月】订单（分页拉完，成功后缓存）
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
      // 当月前缀（老板要求：记账从当月开始，刷新只刷新当月）
      const prefix = `${viewDate.y}-${String(viewDate.m + 1).padStart(2, '0')}`;
      // 每个账号循环拉所有页，直到拉完 total 或返回空
      for (const acc of targetAccounts) {
        let page = 1;
        const pageSize = 100;
        let stalePages = 0; // 连续几页没有当月订单（说明后面的更早，提前停）
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
          // 只保留当月订单
          const monthOrders = list.filter((o: any) => orderDate(o).startsWith(prefix));
          all = all.concat(monthOrders);
          const oldCount = list.length - monthOrders.length;
          if (oldCount >= list.length) {
            stalePages += 1;
            if (stalePages >= 2) break; // 连续两页都是旧订单，后面的更早，停止
          } else {
            stalePages = 0;
          }
          const total = Number(data?.total ?? 0);
          if (total > 0 && page * pageSize >= total) break;
          page += 1;
          // 防止死循环，最多拉 20 页
          if (page > 20) break;
        }
      }
      // 合并缓存中的历史订单（历史固定显示，刷新只更新当月）
      let cachedOld: any[] = [];
      try {
        const raw = localStorage.getItem('ledger_orders_cache');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed?.orders)) {
            cachedOld = parsed.orders.filter((o: any) => !orderDate(o).startsWith(prefix));
          }
        }
      } catch {}
      const merged = [...cachedOld, ...all];
      // 按时间倒序排序（新的在前）
      merged.sort((a, b) => {
        const ta = Number(a.create_time ?? a.createTime ?? 0);
        const tb = Number(b.create_time ?? b.createTime ?? 0);
        return tb - ta;
      });
      setOrders(merged);
      // 缓存到 localStorage（历史 + 当月合并保存）
      try {
        localStorage.setItem('ledger_orders_cache', JSON.stringify({ savedAt: Date.now(), orders: merged }));
      } catch {}
      if (!hasError && merged.length > 0) {
        setError('');
      }
      // 刷新后联动核销码快照同步（检测已使用 → 自动记账，按实际核销时间归属）
      try {
        const r = await syncVoucherSnapshot(accounts);
        setRedemptions(loadRedemptions());
        if (r.used > 0 || r.added > 0) {
          setPriceMsg(r.msg);
          setTimeout(() => setPriceMsg(''), 5000);
        }
      } catch (e) {
        console.error('snapshot sync failed:', e);
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

  // 按日期聚合：电影票(张数/订单/实付/利润) + 充值(单数/金额) + 卖品(订单/金额/积分) + 核销码(张数/收入/利润)
  const daily = useMemo(() => {
    type DayStat = {
      tickets: number; income: number; count: number; profit: number; cost: number;
      rechargeCount: number; rechargeAmount: number;
      snackCount: number; snackPay: number; snackScore: number;
      redeemCount: number; redeemIncome: number;
    };
    const empty = (): DayStat => ({ tickets: 0, income: 0, count: 0, profit: 0, cost: 0, rechargeCount: 0, rechargeAmount: 0, snackCount: 0, snackPay: 0, snackScore: 0, redeemCount: 0, redeemIncome: 0 });
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
      // 卖价统一用价格规则（按订单日期取生效规则）
      const rule = getRuleForDate(loadRules(), d);
      const unitPrice = isJiahe(o) ? rule.jiaheSell : rule.jinyiSell;
      const saleIncome = unitPrice * n; // 卖票收入（客户付的钱）
      cur.tickets += n;
      cur.income += amount; // 收入 = 实付总和
      cur.cost += amount; // 实际支付成本
      cur.profit += saleIncome - amount; // 利润 = 卖价×张数 - 实付
      cur.count += 1;
      map.set(d, cur);
    });
    // 核销码核销记录：使用即记利润（成本默认 0，全额计入当天）
    redemptions.forEach((r) => {
      if (!r.date) return;
      const cur = map.get(r.date) || empty();
      cur.redeemCount += r.count;
      cur.redeemIncome += r.income;
      cur.profit += r.profit;
      map.set(r.date, cur);
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
  }, [orders, overrides, redemptions]);

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

  // 月统计（含充值/卖品/核销码）
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
    let redeemCount = 0;
    let redeemIncome = 0;
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
        redeemCount += v.redeemCount;
        redeemIncome += v.redeemIncome;
      }
    });
    return { tickets, income, count, profit, rechargeCount, rechargeAmount, snackCount, snackPay, snackScore, redeemCount, redeemIncome };
  }, [daily, viewDate]);

  // 年统计（含充值/卖品/核销码）
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
    let redeemCount = 0;
    let redeemIncome = 0;
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
        redeemCount += v.redeemCount;
        redeemIncome += v.redeemIncome;
      }
    });
    return { tickets, income, count, profit, rechargeCount, rechargeAmount, snackCount, snackPay, snackScore, redeemCount, redeemIncome };
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
            记账
          </h2>
          <p className="text-sm text-gray-500">
            {accounts.length > 0 ? `统计 ${accounts.length} 个账号 · 每日出票记录与利润` : '暂无账号'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowPriceEdit(true); }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600"
            title="配置金逸/嘉和的售价与成本（利润统计使用此价格）"
          >
            <Settings2 className="w-4 h-4" />
            价格规则：金逸¥{(getRuleForDate(priceRules, todayStr)).jinyiSell} / 嘉和¥{(getRuleForDate(priceRules, todayStr)).jiaheSell}
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

      {/* 视图切换 */}
      <div className="flex gap-2">
        <button
          onClick={() => setView('calendar')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg ${view === 'calendar' ? 'bg-pink-500 text-white' : 'bg-white border text-gray-500 hover:bg-gray-50'}`}
        >
          <CalendarDays className="w-4 h-4" /> 记账日历
        </button>
        <button
          onClick={() => setView('batches')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg ${view === 'batches' ? 'bg-pink-500 text-white' : 'bg-white border text-gray-500 hover:bg-gray-50'}`}
        >
          <Layers className="w-4 h-4" /> 活动批次
        </button>
        <button
          onClick={() => setView('goods')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg ${view === 'goods' ? 'bg-pink-500 text-white' : 'bg-white border text-gray-500 hover:bg-gray-50'}`}
        >
          <Ticket className="w-4 h-4" /> 卖品券码
        </button>
      </div>

      {/* 活动批次视图 */}
      {view === 'batches' && <BatchManager />}
      {/* 卖品券码查询视图 */}
      {view === 'goods' && <GoodsVoucherQuery />}

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

      {/* 月统计（当月数据） */}
      <div className="bg-green-50 rounded-lg border border-green-200 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-green-600 font-medium flex items-center gap-1">
            <CalendarDays className="w-3.5 h-3.5" /> {viewDate.y} 年 {viewDate.m + 1} 月统计
          </p>
          {/* 今天核销码使用数量 */}
          {(() => {
            const t = daily.get(todayStr);
            const n = t?.redeemCount || 0;
            const inc = t?.redeemIncome || 0;
            return (
              <span className="text-xs text-green-700 bg-white border border-green-200 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
                <BadgeCheck className="w-3.5 h-3.5 text-green-600" />
                今日核销码使用 <b className="text-green-700">{n}</b> 张
                {inc > 0 && <span className="text-green-500">· 利润 +¥{inc.toFixed(0)}</span>}
              </span>
            );
          })()}
        </div>
        <div className="grid grid-cols-4 gap-3 mt-3">
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
            <p className="text-xs text-gray-500">利润（含核销码）</p>
          </div>
          <div>
            <p className="text-xl font-bold text-purple-600">{monthStats.redeemCount}</p>
            <p className="text-xs text-purple-500">核销码使用（张）</p>
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
          <div>
            <p className="text-xl font-bold text-pink-600">¥{monthStats.redeemIncome.toFixed(0)}</p>
            <p className="text-xs text-pink-500">核销码收入</p>
          </div>
        </div>
      </div>

      {/* 待核对核销码（查不到核销时间，未计入任何一天） */}
      {pendingVouchers.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          <p className="flex items-center justify-between gap-2 flex-wrap">
            <span>⚠️ {pendingVouchers.length} 张核销码查不到核销时间，已放「待核对」，未计入任何一天</span>
            <button onClick={() => setShowPending(!showPending)} className="underline shrink-0">
              {showPending ? '收起' : '查看'}
            </button>
          </p>
          {showPending && (
            <div className="mt-2 max-h-40 overflow-auto space-y-1 bg-white/60 rounded-lg p-2">
              {pendingVouchers.map((p, i) => (
                <div key={i} className="flex justify-between gap-2 font-mono text-[11px]">
                  <span className="break-all">{p.code}</span>
                  <span className="shrink-0 text-amber-600">{p.cinema === 'jiahe' ? '嘉和' : '金逸'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 日历（当月 + 可翻看历史月份） */}
      <div className="bg-white rounded-lg border">
        <div className="flex items-center justify-between p-4 border-b flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100" title="上个月">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="px-2 py-1.5 text-base font-bold">
              {viewDate.y} 年 {viewDate.m + 1} 月
            </span>
            <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100" title="下个月">
              <ChevronRight className="w-5 h-5" />
            </button>
            <span className="text-[11px] text-gray-400">（历史月份固定显示，刷新只更新当月）</span>
          </div>
          <button
            onClick={() => setRedeemOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-500 hover:bg-purple-600 text-white rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            核销码登记
          </button>
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
            if (!cell) return <div key={`empty-${i}`} className="min-h-[136px]" />;
            const stat = daily.get(cell.date);
            const isToday = cell.date === todayStr;
            const isSelected = cell.date === selectedDay;
            const isOverridden = !!overrides[cell.date];
            return (
              <button
                key={cell.date}
                onClick={() => setSelectedDay(isSelected ? '' : cell.date)}
                className={`min-h-[136px] border-t border-r text-left p-1.5 transition-colors relative flex flex-col ${
                  isSelected ? 'bg-pink-50' : stat ? 'hover:bg-pink-50/40' : 'hover:bg-gray-50'
                } ${i % 7 === 6 ? 'border-r-0' : ''}`}
              >
                <span
                  className={`inline-flex w-6 h-6 shrink-0 items-center justify-center rounded-full text-xs ${
                    isToday ? 'bg-pink-500 text-white font-bold' : 'text-gray-700'
                  }`}
                >
                  {cell.day}
                </span>
                {stat && (
                  <div className="mt-1 space-y-1 min-h-0 flex-1 overflow-hidden">
                    {/* 左列：电影票 */}
                    <div className="space-y-0.5">
                      <p className="text-xs text-pink-600 font-semibold flex items-center gap-1">
                        <Ticket className="w-3 h-3 shrink-0" /> {stat.tickets} 张
                        {isOverridden && <span className="text-[9px] bg-pink-200 text-pink-700 rounded px-1">改</span>}
                      </p>
                      <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                        <Banknote className="w-3 h-3 shrink-0" /> ¥{stat.income.toFixed(0)}
                      </p>
                      <p className={`text-xs flex items-center gap-1 ${stat.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {stat.profit >= 0 ? '▲' : '▼'} {stat.profit >= 0 ? '+' : ''}¥{stat.profit.toFixed(0)}
                      </p>
                    </div>
                    {/* 右列：充值/卖品（换行显示，不挤一行） */}
                    {stat.rechargeCount > 0 && (
                      <p className="text-[11px] text-blue-600 font-medium leading-tight">💰 充值 ¥{stat.rechargeAmount.toFixed(0)}</p>
                    )}
                    {stat.snackCount > 0 && (
                      <div className="text-[11px] text-orange-500 leading-tight">
                        <p>🍿 卖品 {stat.snackCount} 单</p>
                        {stat.snackPay > 0 && <p>金额 ¥{stat.snackPay.toFixed(0)}</p>}
                        {stat.snackScore > 0 && <p>积分 {stat.snackScore}</p>}
                      </div>
                    )}
                    {stat.redeemCount > 0 && (
                      <p className="text-[11px] text-purple-600 font-medium leading-tight">
                        🎫 核销码 {stat.redeemCount} 张 · +¥{stat.redeemIncome.toFixed(0)}
                      </p>
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
                const rule2 = getRuleForDate(loadRules(), orderDate(o));
                const unitPrice = isJiahe(o) ? rule2.jiaheSell : rule2.jinyiSell;
                const saleIncome = unitPrice * n; // 卖票收入
                const cost = orderAmount(o); // 实际支付成本
                const profit = saleIncome - cost; // 每单利润
                const perTicket = n > 0 ? profit / n : 0;
                const boundOrder = batchOrders.find((bo) => bo.id === orderIdKey(o));
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
                      {boundOrder ? (
                        <p className="text-xs mt-0.5 text-purple-600">
                          📦 已绑定批次 {boundOrder.batchId}
                          {boundOrder.type === 'code' ? ' · 核销码' : ''}
                          {boundOrder.couponUsed > 0 ? ` · 优惠抵¥${boundOrder.couponUsed.toFixed(0)}` : ''}
                          {' · '}利润 ¥{boundOrder.profit.toFixed(0)}
                        </p>
                      ) : (
                        <p className={`text-xs mt-0.5 ${perTicket >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          每张 {perTicket >= 0 ? '+' : ''}¥{perTicket.toFixed(1)}
                          {perTicket < 0 && <span className="ml-1 text-red-500">亏损单</span>}
                        </p>
                      )}
                    </div>
                    <div className="text-right ml-3 flex items-center gap-2">
                      <div>
                        <p className={`font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {profit >= 0 ? '+' : ''}¥{profit.toFixed(0)}
                        </p>
                        <p className="text-[10px] text-gray-400">成本¥{cost.toFixed(0)}</p>
                      </div>
                      {!boundOrder && (
                        <button
                          onClick={() => openBindBatch(o, n, isJiahe(o) ? 'jiahe' : 'jinyi')}
                          className="px-2 py-1 text-[11px] bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 whitespace-nowrap"
                        >
                          绑定批次
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* 当天核销码使用记录（每张都有记录） */}
          {(() => {
            const list = redemptions.filter((r) => r.date === selectedDay);
            if (list.length === 0) return null;
            const total = list.reduce((s, r) => s + r.count, 0);
            return (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs font-medium text-purple-600 mb-2">
                  🎫 当天核销码使用（{total} 张 · 利润 +¥{list.reduce((s, r) => s + r.profit, 0).toFixed(0)}）
                </p>
                <div className="space-y-1.5 max-h-48 overflow-auto">
                  {list.map((r) => (
                    <div key={r.id} className="bg-purple-50 border border-purple-100 rounded-lg p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-700 font-medium">
                          {r.time} · {r.cinema === 'jinyi' ? '金逸' : '嘉和'} · {r.count} 张 · ¥{r.unitPrice}/张
                          {r.source === 'auto' && <span className="text-[9px] bg-purple-200 text-purple-700 rounded px-1 ml-1">自动</span>}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-purple-600 font-bold">+¥{r.profit.toFixed(0)}</span>
                          <button
                            onClick={() => {
                              if (confirm(`删除这条核销码记录？\n${r.cinema === 'jinyi' ? '金逸' : '嘉和'} ${r.count} 张，利润 +¥${r.profit.toFixed(0)}\n删除后可重新刷新统计`)) {
                                deleteRedemption(r.id);
                                setRedemptions(loadRedemptions());
                              }
                            }}
                            className="text-red-400 hover:text-red-600"
                            title="删除这条记录（重新统计用）"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      </div>
                      {r.useTime && <p className="text-gray-400 mt-0.5">实际核销时间：{r.useTime}</p>}
                      {r.batchId && <p className="text-gray-400 mt-0.5">批次：{r.batchId}</p>}
                      <p className="text-gray-400 font-mono mt-0.5 break-all">{r.codes.join('、')}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          {/* 当日利润构成（怎么算出来的一目了然） */}
          {(() => {
            const s = daily.get(selectedDay);
            if (!s || (s.tickets === 0 && s.redeemCount === 0)) return null;
            const movieProfit = s.profit - s.redeemIncome;
            return (
              <div className="mt-3 pt-3 border-t bg-gray-50 rounded-lg p-3 text-xs space-y-1">
                <p className="font-medium text-gray-700">💡 当日利润构成</p>
                {s.tickets > 0 && (
                  <p className="text-gray-600">
                    电影票：{s.tickets} 张 · 卖价收入 ¥{(s.cost + movieProfit).toFixed(0)}
                    {' − '}实付成本 ¥{s.cost.toFixed(0)} = <b className={movieProfit >= 0 ? 'text-green-600' : 'text-red-600'}>¥{movieProfit.toFixed(0)}</b>
                  </p>
                )}
                {s.redeemCount > 0 && (
                  <p className="text-gray-600">
                    核销码：{s.redeemCount} 张 · 收入 ¥{s.redeemIncome.toFixed(0)}（成本 0）= <b className="text-purple-600">+¥{s.redeemIncome.toFixed(0)}</b>
                  </p>
                )}
                <p className="font-bold text-gray-800">
                  当日总利润：{s.profit >= 0 ? '+' : ''}¥{s.profit.toFixed(0)}
                </p>
              </div>
            );
          })()}
        </div>
      )}
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

      {/* 绑定批次弹窗 */}
      {bindOrder && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setBindOrder(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium text-lg">绑定活动批次</h3>
            <div className="text-xs text-gray-500 space-y-1 bg-gray-50 rounded-lg p-3">
              <p>{bindOrder.cinema === 'jinyi' ? '金逸巨幕影城' : '嘉和影城'} · {bindOrder.tickets} 张</p>
              <p>订单日期：{orderDate(bindOrder.order)}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">订单类型</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBindType('member')}
                  className={`py-2 text-sm rounded-lg border transition-colors ${
                    bindType === 'member'
                      ? 'bg-purple-500 text-white border-purple-500'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                  }`}
                >
                  会员购票
                </button>
                <button
                  type="button"
                  onClick={() => setBindType('code')}
                  className={`py-2 text-sm rounded-lg border transition-colors ${
                    bindType === 'code'
                      ? 'bg-purple-500 text-white border-purple-500'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                  }`}
                >
                  核销码
                </button>
              </div>
              {bindType === 'code' && (
                <p className="text-[11px] text-gray-400 mt-1">核销码按核销码价记收入（金逸 30 / 嘉和 28），成本默认 0（赠券），利润全额计入</p>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">选择活动批次 *</label>
              <select
                value={bindBatchId}
                onChange={(e) => setBindBatchId(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-purple-400"
              >
                <option value="">选择批次</option>
                {batches.filter((b) => b.status === 'active').map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id} · {b.accountName} · {b.type === 'coupon' ? `优惠金¥${b.couponLeft}` : `赠券${b.giftVouchersLeft}张`}
                  </option>
                ))}
              </select>
              {batches.filter((b) => b.status === 'active').length === 0 && (
                <p className="text-[11px] text-amber-600 mt-1">暂无进行中的批次，请先到「活动批次」创建</p>
              )}
            </div>
            {bindType === 'code' ? (
              <div>
                <label className="text-xs text-gray-500 block mb-1">核销码成本（元/张，可选）</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={bindCodeCost}
                  onChange={(e) => setBindCodeCost(Number(e.target.value) || 0)}
                  placeholder="默认 0（充值活动赠送，无成本）"
                  className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-purple-400"
                />
              </div>
            ) : (
              <div>
                <label className="text-xs text-gray-500 block mb-1">本单优惠抵扣（元，可选）</label>
                <input
                  type="number"
                  value={bindCoupon}
                  onChange={(e) => setBindCoupon(Number(e.target.value) || 0)}
                  placeholder="如：40（自动限 ≤ 票数×上限、≤ 优惠金剩余）"
                  className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-purple-400"
                />
              </div>
            )}
            {/* 预计利润预览（亏损红色预警） */}
            {bindBatchId && bindOrder && (() => {
              const b = batches.find((x) => x.id === bindBatchId);
              const rule = getRuleForDate(loadRules(), orderDate(bindOrder.order));
              const isJ = bindOrder.cinema === 'jinyi';
              const isCode = bindType === 'code';
              const costNormal = isCode
                ? (Number(bindCodeCost) || 0) * bindOrder.tickets
                : (isJ ? rule.jinyiCost : rule.jiaheCost) * bindOrder.tickets;
              const maxByTicket = bindOrder.tickets * (b?.couponPerTicket || 0);
              const couponUsed = isCode ? 0 : Math.min(Number(bindCoupon) || 0, maxByTicket, b?.couponLeft ?? 0);
              const costActual = Math.max(0, costNormal - couponUsed);
              const income = isCode
                ? (isJ ? rule.jinyiCode : rule.jiaheCode) * bindOrder.tickets
                : (isJ ? rule.jinyiSell : rule.jiaheSell) * bindOrder.tickets;
              const estProfit = income - costActual;
              const isLoss = estProfit < 0;
              return (
                <div className={`rounded-lg p-3 text-xs space-y-0.5 ${isLoss ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-100'}`}>
                  {isCode ? (
                    <>
                      <p className="text-gray-500">核销码收入：¥{income.toFixed(2)}（{isJ ? rule.jinyiCode : rule.jiaheCode} × {bindOrder.tickets} 张）</p>
                      <p className="text-gray-500">核销码成本：¥{costActual.toFixed(2)}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-gray-500">正常成本：¥{costNormal.toFixed(2)} ｜ 本单优惠抵扣：¥{couponUsed.toFixed(2)}</p>
                      <p className="text-gray-500">实际成本：¥{costActual.toFixed(2)} ｜ 客户售价：¥{income.toFixed(2)}</p>
                    </>
                  )}
                  <p className={`font-bold ${isLoss ? 'text-red-600' : 'text-blue-600'}`}>
                    预计利润：{estProfit >= 0 ? '+' : ''}¥{estProfit.toFixed(2)}
                    {isLoss && ' ⚠️ 本单亏损'}
                  </p>
                  {isLoss && (
                    <p className="text-red-500 font-medium">红色预警：该订单绑定后为亏损单，请确认成本与售价无误！</p>
                  )}
                </div>
              );
            })()}
            {bindMsg && <p className="text-xs text-red-500">{bindMsg}</p>}
            <div className="flex gap-2">
              <button
                onClick={doBind}
                disabled={savingBind}
                className="flex-1 py-2 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
              >
                {savingBind ? '绑定中...' : '确认绑定'}
              </button>
              <button onClick={() => setBindOrder(null)} className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">取消</button>
            </div>
          </div>
        </div>
      )}

      {/* 核销码核销登记弹窗 */}
      {redeemOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setRedeemOpen(false)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-lg">核销码核销登记</h3>
              <button onClick={() => setRedeemOpen(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-400">
              核销码使用/售出即登记，利润自动计入当天（成本默认 0 = 充值赠送无成本）。每张核销码都有记录。
            </p>
            <div>
              <label className="text-xs text-gray-500 block mb-1">影院</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRedeemCinema('jinyi');
                    const rule = getRuleForDate(loadRules(), todayStr);
                    setRedeemPrice(rule.jinyiCode);
                  }}
                  className={`py-2 text-sm rounded-lg border transition-colors ${
                    redeemCinema === 'jinyi'
                      ? 'bg-purple-500 text-white border-purple-500'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                  }`}
                >
                  金逸巨幕
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRedeemCinema('jiahe');
                    const rule = getRuleForDate(loadRules(), todayStr);
                    setRedeemPrice(rule.jiaheCode);
                  }}
                  className={`py-2 text-sm rounded-lg border transition-colors ${
                    redeemCinema === 'jiahe'
                      ? 'bg-purple-500 text-white border-purple-500'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                  }`}
                >
                  嘉和
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">使用数量（张）</label>
                <input
                  type="number"
                  min={1}
                  value={redeemCount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || /^\d+$/.test(v)) setRedeemCount(Number(v) || 0);
                  }}
                  className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-purple-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">单价（元/张）</label>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={redeemPrice}
                  onChange={(e) => setRedeemPrice(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-purple-400"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">核销码号（可选，每行一个；不填自动编号）</label>
              <textarea
                value={redeemCodes}
                onChange={(e) => setRedeemCodes(e.target.value)}
                rows={3}
                placeholder={'每行一个核销码号\n如：KJ20260820-001'}
                className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-purple-400 font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">关联活动批次（可选，选后自动扣赠券库存）</label>
              <select
                value={redeemBatchId}
                onChange={(e) => setRedeemBatchId(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-purple-400"
              >
                <option value="">不关联批次</option>
                {batches.filter((b) => b.status === 'active' && b.type === 'voucher').map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id} · {b.accountName} · 赠券剩 {b.giftVouchersLeft} 张
                  </option>
                ))}
              </select>
            </div>
            {/* 利润预览（成本默认 0） */}
            <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 text-xs space-y-0.5">
              <p className="text-gray-500">
                核销码收入：¥{((Number(redeemPrice) || 0) * Math.max(1, Number(redeemCount) || 1)).toFixed(2)}
                （{(Number(redeemPrice) || 0).toFixed(0)} × {Math.max(1, Number(redeemCount) || 1)} 张）
              </p>
              <p className="text-gray-500">成本：¥0（赠券）</p>
              <p className="font-bold text-purple-600">
                利润：+¥{((Number(redeemPrice) || 0) * Math.max(1, Number(redeemCount) || 1)).toFixed(2)}
              </p>
            </div>
            {redeemMsg && <p className="text-xs text-red-500">{redeemMsg}</p>}
            <button
              onClick={doRedeem}
              disabled={redeemSaving}
              className="w-full py-2 text-sm bg-purple-500 hover:bg-purple-600 text-white rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {redeemSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> 登记中...
                </>
              ) : (
                <>
                  <BadgeCheck className="w-4 h-4" /> 确认登记（利润进当天）
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 价格规则设置弹窗（按日期多版本） */}
      {showPriceEdit && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowPriceEdit(false)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-md space-y-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium text-lg">价格规则设置</h3>
            <p className="text-xs text-gray-400">
              按生效日期配置多版本价格（节假日新建规则，不修改历史订单）。单票价格：会员购票成本 / 客户售价 / 核销码售价。
            </p>
            {/* 规则列表 */}
            <div className="space-y-2">
              {priceRules.map((r) => (
                <div key={r.id} className="border rounded-lg p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-700">
                      {r.note || '价格规则'} · 生效 {r.effectiveFrom}{r.effectiveTo ? ` ~ ${r.effectiveTo}` : ''}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => deleteRule(r.id)}
                        disabled={priceRules.length <= 1}
                        className="p-1 text-red-400 hover:text-red-600 disabled:opacity-30"
                        title="删除规则"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-gray-500">
                    <span>金逸：成本{r.jinyiCost} / 售{r.jinyiSell} / 码{r.jinyiCode}</span>
                    <span>嘉和：成本{r.jiaheCost} / 售{r.jiaheSell} / 码{r.jiaheCode}</span>
                    <span className="text-gray-300">按日期生效</span>
                  </div>
                </div>
              ))}
            </div>
            {/* 新增规则 */}
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-medium text-gray-600">新增规则（节假日等）</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">生效日期</label>
                  <input type="date" value={newRule.from} onChange={(e) => setNewRule({ ...newRule, from: e.target.value })} className="w-full px-2 py-1.5 text-sm border rounded-lg outline-none focus:border-purple-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">失效日期（可选）</label>
                  <input type="date" value={newRule.to} onChange={(e) => setNewRule({ ...newRule, to: e.target.value })} className="w-full px-2 py-1.5 text-sm border rounded-lg outline-none focus:border-purple-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">金逸成本</label>
                  <input type="number" value={newRule.jinyiCost} onChange={(e) => setNewRule({ ...newRule, jinyiCost: Number(e.target.value) || 0 })} className="w-full px-2 py-1.5 text-sm border rounded-lg outline-none focus:border-purple-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">金逸售价</label>
                  <input type="number" value={newRule.jinyiSell} onChange={(e) => setNewRule({ ...newRule, jinyiSell: Number(e.target.value) || 0 })} className="w-full px-2 py-1.5 text-sm border rounded-lg outline-none focus:border-purple-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">金逸核销码价</label>
                  <input type="number" value={newRule.jinyiCode} onChange={(e) => setNewRule({ ...newRule, jinyiCode: Number(e.target.value) || 0 })} className="w-full px-2 py-1.5 text-sm border rounded-lg outline-none focus:border-purple-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">嘉和成本</label>
                  <input type="number" value={newRule.jiaheCost} onChange={(e) => setNewRule({ ...newRule, jiaheCost: Number(e.target.value) || 0 })} className="w-full px-2 py-1.5 text-sm border rounded-lg outline-none focus:border-purple-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">嘉和售价</label>
                  <input type="number" value={newRule.jiaheSell} onChange={(e) => setNewRule({ ...newRule, jiaheSell: Number(e.target.value) || 0 })} className="w-full px-2 py-1.5 text-sm border rounded-lg outline-none focus:border-purple-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">嘉和核销码价</label>
                  <input type="number" value={newRule.jiaheCode} onChange={(e) => setNewRule({ ...newRule, jiaheCode: Number(e.target.value) || 0 })} className="w-full px-2 py-1.5 text-sm border rounded-lg outline-none focus:border-purple-400" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 block mb-0.5">备注（如：国庆节）</label>
                  <input value={newRule.note} onChange={(e) => setNewRule({ ...newRule, note: e.target.value })} className="w-full px-2 py-1.5 text-sm border rounded-lg outline-none focus:border-purple-400" />
                </div>
              </div>
              <button
                onClick={addRule}
                className="w-full py-2 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600"
              >
                添加规则
              </button>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { saveRules(priceRules); setPriceMsg('价格规则已保存'); setShowPriceEdit(false); setTimeout(() => setPriceMsg(''), 3000); }}
                className="flex-1 flex items-center justify-center gap-1 px-4 py-2 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600"
              >
                <Save className="w-4 h-4" />
                保存规则
              </button>
              <button
                onClick={() => { setShowPriceEdit(false); setPriceRules(loadRules()); }}
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
