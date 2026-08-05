// 出票记录手动覆盖数据（首页今日出票 与 记账日历 共用，一处编辑两处同步）
// localStorage key: ledger_override
// 结构: { "2026-08-05": { tickets: 6, income: 180 }, ... }

export interface LedgerOverride {
  tickets: number;
  income: number;
  profit?: number; // 利润可留空，不填则按自动值
}

const OVERRIDE_KEY = 'ledger_override';

export function loadOverrides(): Record<string, LedgerOverride> {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (raw) return JSON.parse(raw) || {};
  } catch {}
  return {};
}

export function saveOverride(date: string, data: LedgerOverride): Record<string, LedgerOverride> {
  const all = loadOverrides();
  all[date] = data;
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(all));
  return all;
}

export function clearOverride(date: string): Record<string, LedgerOverride> {
  const all = loadOverrides();
  delete all[date];
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(all));
  return all;
}
