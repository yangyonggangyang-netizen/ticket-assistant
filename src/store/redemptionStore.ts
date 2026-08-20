// ===== 核销码核销登记存储（localStorage） =====
// 规则：核销码使用/售出即登记 → 利润 = 售价×张数（成本默认 0，赠券无成本）→ 计入当天记账
// 每张核销码都有记录（codes 数组，批量登记时自动编号，可展开查看）

export interface RedemptionRecord {
  id: string;
  date: string;          // yyyy-mm-dd
  time: string;          // 完整时间 HH:mm
  cinema: 'jinyi' | 'jiahe';
  count: number;         // 张数
  codes: string[];       // 核销码列表（未填自动编号）
  unitPrice: number;     // 单价
  income: number;        // 收入 = unitPrice × count
  batchId: string;       // 关联批次（可选）
  profit: number;        // 利润 = income（成本默认 0）
  useTime?: string;      // 核销码实际使用时间（快照同步时从接口查得）
  source?: 'auto' | 'manual'; // auto=快照同步自动记账 manual=手动登记
}

const KEY = 'voucher_redemptions';
const PENDING_KEY = 'voucher_pending'; // 查不到核销时间的券（待核对）

export function loadRedemptions(): RedemptionRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function saveRedemptions(list: RedemptionRecord[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function addRedemption(rec: RedemptionRecord): RedemptionRecord[] {
  const list = loadRedemptions();
  list.unshift(rec);
  saveRedemptions(list);
  return list;
}

export function deleteRedemption(id: string): RedemptionRecord[] {
  const list = loadRedemptions().filter((r) => r.id !== id);
  saveRedemptions(list);
  return list;
}

// ===== 待核对列表（查不到核销时间的已使用券） =====
export interface PendingVoucher {
  code: string;
  cinema: 'jinyi' | 'jiahe';
  name: string;
}
export function loadPendingVouchers(): PendingVoucher[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}
export function addPendingVouchers(items: PendingVoucher[]) {
  const seen = new Set(loadPendingVouchers().map((p) => p.code));
  const list = loadPendingVouchers().concat(items.filter((i) => !seen.has(i.code)));
  localStorage.setItem(PENDING_KEY, JSON.stringify(list));
}
export function clearPendingVouchers() {
  localStorage.setItem(PENDING_KEY, '[]');
}

// ===== 修复存量错误记录（v1.0.51/1.0.53 自动同步产生的错误统计） =====
// 规则：
//  1. useTime 存在且与记录日期不一致 → 修正日期为实际核销日期（v1.0.51 误记当天型）
//  2. 单条 count >= 30 且核销时间等于记录时间（v1.0.53 强记堆集型）→ 删除
//  3. 无 useTime 且单条 count >= 30（强记无时间型）→ 删除
// 返回 { fixed, removed }
export function repairRedemptions(): { fixed: number; removed: number } {
  const all = loadRedemptions();
  let fixed = 0;
  let removed = 0;
  const out: RedemptionRecord[] = [];
  all.forEach((r) => {
    const dateOfUse = r.useTime && /^\d{4}-\d{2}-\d{2}/.test(r.useTime) ? r.useTime.substring(0, 10) : '';
    if (dateOfUse && dateOfUse !== r.date) {
      // 修正到实际核销日期
      out.push({
        ...r,
        date: dateOfUse,
        time: r.useTime && r.useTime.length >= 16 ? r.useTime.substring(11, 16) : r.time,
      });
      fixed += 1;
    } else if (r.count >= 30 && (!r.useTime || dateOfUse === r.date)) {
      // 自动同步强记堆集：大量券挤在同一天且时间对不上 → 删除待重新统计
      removed += 1;
    } else {
      out.push(r);
    }
  });
  if (fixed > 0 || removed > 0) saveRedemptions(out);
  return { fixed, removed };
}

// 自动生成核销码编号：KJ-YYYYMMDD-序号
export function genCodes(date: string, count: number, existing: string[]): string[] {
  const ymd = date.replace(/-/g, '');
  const prefix = `KJ${ymd}`;
  const used = new Set(existing);
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    let n = 1;
    let code = `${prefix}-${String(n).padStart(2, '0')}`;
    while (used.has(code)) {
      n++;
      code = `${prefix}-${String(n).padStart(2, '0')}`;
    }
    used.add(code);
    codes.push(code);
  }
  return codes;
}
