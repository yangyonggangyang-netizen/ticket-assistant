// ===== 充值活动批次记账存储（localStorage） =====
// 核心原则：普通余额 / 赠送核销券 / 赠送优惠金 分开记录；每笔订单绑定活动批次

export interface ActivityBatch {
  id: string;                 // 批次编号，如 B20260819-001
  type: 'voucher' | 'coupon'; // 活动类型：voucher=充500送核销券 / coupon=充500送优惠金
  createdAt: string;          // 充值日期 yyyy-mm-dd
  accountId: string;          // 所属会员账号 id
  accountName: string;        // 账号名称（快照）
  rechargeAmount: number;     // 充值金额
  // 普通余额
  balanceInit: number;        // 初始
  balanceLeft: number;        // 剩余
  // 赠券（voucher 类型）
  giftVouchersInit: number;   // 赠券初始数量
  giftVouchersLeft: number;   // 赠券剩余
  giftVouchersExpire: string; // 赠券有效期 yyyy-mm-dd
  // 优惠金（coupon 类型）
  couponInit: number;         // 优惠金初始金额
  couponLeft: number;         // 优惠金剩余
  couponPerTicket: number;    // 每张票最高抵扣
  couponExpire: string;       // 优惠金有效期
  couponScope: string;        // 适用范围说明
  status: 'active' | 'exhausted' | 'expired';
  note?: string;
}

export interface PriceRule {
  id: string;
  effectiveFrom: string;      // 生效日期 yyyy-mm-dd
  effectiveTo?: string;       // 失效日期（可选）
  // 金逸巨幕影城
  jinyiCost: number;          // 会员购票成本
  jinyiSell: number;          // 客户售价
  jinyiCode: number;          // 核销码售价
  // 嘉和影城
  jiaheCost: number;
  jiaheSell: number;
  jiaheCode: number;
  note?: string;              // 如：国庆节假日
}

export interface BatchOrder {
  id: string;
  time: string;               // 订单时间
  batchId: string;            // 所属活动批次
  accountId: string;
  cinema: 'jinyi' | 'jiahe';
  type: 'member' | 'code';    // 会员购票 / 核销码
  tickets: number;
  sellPrice: number;          // 客户售价（总额）
  costNormal: number;         // 正常会员成本（总额）
  couponUsed: number;         // 本单实际优惠抵扣
  costActual: number;         // 实际扣款成本 = costNormal - couponUsed
  fee: number;                // 平台手续费
  voucherCode: string;        // 取票码/核销码
  status: 'shipped' | 'verified' | 'refunded';
  profit: number;             // 毛利/净利
  priceNote?: string;         // 使用价格规则说明
}

const BATCHES_KEY = 'activity_batches';
const RULES_KEY = 'price_rules';
const ORDERS_KEY = 'batch_orders';

// ===== 活动批次 =====
export function loadBatches(): ActivityBatch[] {
  try {
    const raw = localStorage.getItem(BATCHES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}
export function saveBatches(batches: ActivityBatch[]) {
  localStorage.setItem(BATCHES_KEY, JSON.stringify(batches));
}
export function nextBatchNo(): string {
  const now = new Date();
  const ymd = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
  const existing = loadBatches().filter((b) => b.id.includes(ymd));
  return `B${ymd}-${String(existing.length + 1).padStart(3, '0')}`;
}
export function isBatchExpired(b: ActivityBatch): boolean {
  const expire = b.type === 'voucher' ? b.giftVouchersExpire : b.couponExpire;
  if (!expire) return false;
  return new Date(expire) < new Date(new Date().toDateString());
}

// ===== 价格规则 =====
// 默认规则（当前基础价格）
const DEFAULT_RULES: PriceRule[] = [
  {
    id: 'default',
    effectiveFrom: '2026-01-01',
    jinyiCost: 35, jinyiSell: 33, jinyiCode: 30,
    jiaheCost: 30, jiaheSell: 30, jiaheCode: 28,
    note: '默认基础价格',
  },
];
export function loadRules(): PriceRule[] {
  try {
    const raw = localStorage.getItem(RULES_KEY);
    if (raw) {
      const rules = JSON.parse(raw);
      if (Array.isArray(rules) && rules.length > 0) return rules;
    }
  } catch {}
  return DEFAULT_RULES;
}
export function saveRules(rules: PriceRule[]) {
  localStorage.setItem(RULES_KEY, JSON.stringify(rules));
}
// 取某日期生效的价格规则（生效日期 <= 该日期的最近一条）
export function getRuleForDate(rules: PriceRule[], date: string): PriceRule {
  const day = date.substring(0, 10);
  const active = rules
    .filter((r) => r.effectiveFrom <= day && (!r.effectiveTo || r.effectiveTo >= day))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return active[0] || rules[0] || DEFAULT_RULES[0];
}

// ===== 订单（批次绑定） =====
export function loadOrders(): BatchOrder[] {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}
export function saveOrders(orders: BatchOrder[]) {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

// ===== 批次状态自动刷新 =====
export function refreshBatchStatuses(batches: ActivityBatch[]): ActivityBatch[] {
  const now = new Date(new Date().toDateString());
  return batches.map((b) => {
    if (b.status === 'expired') return b;
    // 优惠金/赠券用完 → 已用完
    const exhausted = b.type === 'voucher'
      ? b.giftVouchersLeft <= 0
      : b.couponLeft <= 0;
    // 到期
    const expire = b.type === 'voucher' ? b.giftVouchersExpire : b.couponExpire;
    const expired = expire ? new Date(expire) < now : false;
    return { ...b, status: expired ? 'expired' : exhausted ? 'exhausted' : 'active' };
  });
}

// ===== 批次利润 =====
// 未扣平台手续费前：利润 = -2×金逸会员票 + 30×金逸核销码 + 28×嘉和核销码 + 已使用优惠金
export function batchProfit(b: ActivityBatch, orders: BatchOrder[]): { realized: number; count: number } {
  const batchOrders = orders.filter((o) => o.batchId === b.id && o.status !== 'refunded');
  const realized = batchOrders.reduce((s, o) => s + o.profit, 0);
  return { realized, count: batchOrders.length };
}
