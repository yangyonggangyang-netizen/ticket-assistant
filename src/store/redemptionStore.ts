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
}

const KEY = 'voucher_redemptions';

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
