// ===== 券码快照同步（Accounts 与 Ledger 共用） =====
// 老板口径（2026-08-21 定）：按快照对比算——当前未使用券 N 张，下次刷新少了 = 核销了 → 自动记账 +码价（金逸30/嘉和28）
// 有核销时间的按实际日期归属；查不到的按刷新当天记（不纠结核销时间）
import { api } from '../api/client';
import { loadRules, getRuleForDate } from '../store/batchStore';
import { loadRedemptions, addRedemption, RedemptionRecord } from '../store/redemptionStore';

interface SnapItem {
  code: string;
  cinema: 'jinyi' | 'jiahe';
  name: string;
}

export interface SnapResult {
  total: number;
  added: number;
  used: number;
  usedProfit: number;
  msg: string;
}

// 并发限制工具
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<T>): Promise<T[]> {
  const results: T[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// 查单张券详情（用所有账号 token 依次尝试，取核销时间——取不到也不影响记账）
async function fetchVoucherDetailMulti(code: string, accounts: any[]): Promise<any> {
  for (const acc of accounts) {
    if (!acc.token) continue;
    try {
      const resp = await api.getVoucherUseByNoAs(acc.token, code);
      if (resp.success && resp.result) return resp.result as any;
    } catch (e) {
      // 继续尝试下一个账号
    }
  }
  return null;
}

// 从券详情/券列表取使用时间（覆盖常见字段名，取不到返回空串）
function pickUseTime(r: any): string {
  if (!r) return '';
  const t =
    r?.useTime ??
    r?.usedTime ??
    r?.use_time ??
    r?.used_time ??
    r?.useTimeStr ??
    r?.useDate ??
    r?.usedDate ??
    r?.use_date ??
    r?.used_date ??
    r?.verifyTime ??
    r?.verify_time ??
    r?.verifyDate ??
    r?.checkTime ??
    r?.check_time ??
    r?.usedAt ??
    r?.consumedTime ??
    r?.completeTime ??
    r?.finishTime ??
    r?.updateTime ??
    r?.update_time ??
    '';
  return t ? String(t).substring(0, 19) : '';
}

// 是否电影票兑换券（核销码）
function isMovieVoucher(v: any): boolean {
  const name = String(v.voucher_name || v.voucherName || v.name || '');
  return name.includes('电影票兑换券') || name.includes('电影') || name.includes('观影券');
}

// 判断影院（嘉和 vs 金逸）
function cinemaOf(v: any): 'jinyi' | 'jiahe' {
  const cinemaName = String(v.cinema_name || v.cinemaName || v.cinema || '');
  return cinemaName.includes('嘉和') ? 'jiahe' : 'jinyi';
}

export async function syncVoucherSnapshot(accounts: any[]): Promise<SnapResult> {
  // 已记账的券码集合（避免重复记账）
  const recordedCodes = new Set(loadRedemptions().flatMap((r) => r.codes));

  // ===== 1. 拉当前未使用券（state=1，翻页全量） =====
  const current: SnapItem[] = [];
  const seen = new Set<string>();
  for (const acc of accounts) {
    if (!acc.token || !acc.memberId) continue;
    try {
      for (let page = 1; page <= 10; page++) {
        const resp = await api.getMemberVouchersAs(acc.token, acc.memberId, 1, page, 200);
        if (!resp.success || !resp.result) break;
        const data = resp.result as any;
        const list: any[] = Array.isArray(data) ? data : data.records || [];
        if (list.length === 0) break;
        for (const v of list) {
          if (!isMovieVoucher(v)) continue;
          const code = String(v.voucher_no || v.voucherNo || '').trim();
          if (!code || seen.has(code)) continue;
          seen.add(code);
          current.push({ code, cinema: cinemaOf(v), name: String(v.voucher_name || v.voucherName || v.name || '') });
        }
        const total = Number(data.total) || 0;
        if (current.length >= total || list.length < 200) break;
      }
    } catch (e) {
      console.error('snapshot fetch failed:', acc.name, e);
    }
  }

  // ===== 2. 读旧快照，对比：少了 = 已核销；多了 = 新增 =====
  const oldResp = await (window as any).electronAPI?.loadVoucherSnapshot?.();
  const oldList: SnapItem[] = (oldResp?.success ? oldResp.list : []) || [];
  const oldCodes = new Set(oldList.map((x) => x.code));
  const newCodes = new Set(current.map((x) => x.code));
  const usedList = oldList.filter((x) => !newCodes.has(x.code)); // 少了 = 核销了
  const addedList = current.filter((x) => !oldCodes.has(x.code));

  // ===== 3. 已核销 → 自动记账 =====
  // 有核销时间的按实际日期归属；查不到的按刷新当天记（+码价）
  let usedProfit = 0;
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const time = `${pad(today.getHours())}:${pad(today.getMinutes())}`;
  const rule = getRuleForDate(loadRules(), date);

  const addRedemptionGroup = (
    list: { code: string; cinema: 'jinyi' | 'jiahe'; useTime: string }[],
    targetDate: string,
    targetTime: string
  ) => {
    const groups = new Map<'jinyi' | 'jiahe', { code: string; useTime: string }[]>();
    list.forEach((x) => {
      const g = groups.get(x.cinema) || [];
      g.push({ code: x.code, useTime: x.useTime });
      groups.set(x.cinema, g);
    });
    let profit = 0;
    groups.forEach((gList, cinema) => {
      const price = cinema === 'jiahe' ? rule.jiaheCode : rule.jinyiCode;
      const firstTime = gList.map((x) => x.useTime).find(Boolean) || '';
      const rec: RedemptionRecord = {
        id: 'RD' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        date: targetDate,
        time: targetTime,
        cinema,
        count: gList.length,
        codes: gList.map((x) => x.code),
        unitPrice: price,
        income: price * gList.length,
        batchId: '',
        profit: price * gList.length,
        useTime: firstTime || undefined,
        source: 'auto',
      };
      addRedemption(rec);
      gList.forEach((x) => recordedCodes.add(x.code));
      profit += rec.profit;
    });
    return profit;
  };

  if (usedList.length > 0) {
    // 尽量查核销时间（并发 3，多账号尝试）；查不到就按刷新当天
    const usedWithTime = await mapLimit(usedList, 3, async (item) => {
      const detail = await fetchVoucherDetailMulti(item.code, accounts);
      return { ...item, useTime: pickUseTime(detail) };
    });
    // 按日期分组：有时间的按实际核销日期，没时间的按刷新当天
    const byDay = new Map<string, { code: string; cinema: 'jinyi' | 'jiahe'; useTime: string }[]>();
    usedWithTime.forEach((x) => {
      const d = x.useTime ? x.useTime.substring(0, 10) : date;
      const g = byDay.get(d) || [];
      g.push({ code: x.code, cinema: x.cinema, useTime: x.useTime });
      byDay.set(d, g);
    });
    byDay.forEach((list, d) => {
      const t2 = list[0].useTime && list[0].useTime.length >= 16 ? list[0].useTime.substring(11, 16) : time;
      usedProfit += addRedemptionGroup(list, d, t2);
    });
  }

  // ===== 4. 写新快照（去重，覆盖） =====
  await (window as any).electronAPI?.saveVoucherSnapshot?.(current);

  // ===== 5. 返回结果 =====
  const total = current.length;
  const parts: string[] = [];
  if (addedList.length > 0) parts.push(`新增 ${addedList.length} 张`);
  if (usedList.length > 0) parts.push(`核销 ${usedList.length} 张，自动记账 +¥${usedProfit.toFixed(0)}`);
  let msg: string;
  if (parts.length === 0) {
    msg = `券码快照已同步：当前共 ${total} 张未使用核销码，无变化`;
  } else {
    msg = `券码快照同步：当前共 ${total} 张未使用核销码（${parts.join('，')}）`;
  }
  return { total, added: addedList.length, used: usedList.length, usedProfit, msg };
}
