// ===== 券码快照同步（Accounts 与 Ledger 共用） =====
// ①快照对比：统计所有账号电影票核销券码 → 对比旧快照 → 少了=已使用→自动记账（按实际核销时间归属）；多了=更新数量
// ②补充同步：直接拉已使用券（state=2），只补记「核销时间明确在当月」的券；查不到时间的进待核对，不计入当天
import { api } from '../api/client';
import { loadRules, getRuleForDate } from '../store/batchStore';
import {
  loadRedemptions,
  addRedemption,
  addPendingVouchers,
  RedemptionRecord,
} from '../store/redemptionStore';

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

// 查单张券详情（指定账号 token 查，避免用错账号导致查不到）
async function fetchVoucherDetail(code: string, token?: string): Promise<any> {
  try {
    const resp = token
      ? await api.getVoucherUseByNoAs(token, code)
      : await api.getVoucherUseByNo(code);
    if (resp.success && resp.result) return resp.result as any;
  } catch (e) {
    console.error('voucher detail failed:', code, e);
  }
  return null;
}

// 用所有账号 token 依次尝试（旧快照的券不知道归属账号）
async function fetchVoucherDetailMulti(code: string, accounts: any[]): Promise<any> {
  for (const acc of accounts) {
    if (!acc.token) continue;
    const r = await fetchVoucherDetail(code, acc.token);
    if (r) return r;
  }
  return null;
}

// 从券详情/券列表取使用时间（覆盖常见字段名）
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

  // ===== 1. 快照对比：拉未使用券（state=1） =====
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
  // 读旧快照
  const oldResp = await (window as any).electronAPI?.loadVoucherSnapshot?.();
  const oldList: SnapItem[] = (oldResp?.success ? oldResp.list : []) || [];
  // 对比：少了 = 已使用；多了 = 新增
  const oldCodes = new Set(oldList.map((x) => x.code));
  const newCodes = new Set(current.map((x) => x.code));
  const usedList = oldList.filter((x) => !newCodes.has(x.code));
  const addedList = current.filter((x) => !oldCodes.has(x.code));

  // ===== 2. 已使用（快照对比）→ 自动记账 =====
  // 只记「核销时间明确」的券（按实际日期归属）；查不到时间的进待核对，不算到当天
  let usedProfit = 0;
  let pendingCount = 0;
  const pendingItems: { code: string; cinema: 'jinyi' | 'jiahe'; name: string }[] = [];
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const time = `${pad(today.getHours())}:${pad(today.getMinutes())}`;
  const rule = getRuleForDate(loadRules(), date);
  const monthPrefix = date.substring(0, 7);

  // 按影院分组记账（公共）
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
    // 查使用时间（并发 3，用所有账号 token 依次尝试——旧快照券不知归属账号）
    const usedWithTime = await mapLimit(
      usedList.map((x) => ({ ...x, useTime: '' })),
      3,
      async (item) => {
        const detail = await fetchVoucherDetailMulti(item.code, accounts);
        return { ...item, useTime: pickUseTime(detail) };
      }
    );
    // 有核销时间的 → 按实际日期记账；查不到时间的 → 进待核对（不算当天）
    const withTime = usedWithTime.filter((x) => x.useTime);
    const withoutTime = usedWithTime.filter((x) => !x.useTime);
    if (withTime.length > 0) {
      const byDay = new Map<string, { code: string; cinema: 'jinyi' | 'jiahe'; useTime: string }[]>();
      withTime.forEach((x) => {
        const d = x.useTime.substring(0, 10);
        const g = byDay.get(d) || [];
        g.push({ code: x.code, cinema: x.cinema, useTime: x.useTime });
        byDay.set(d, g);
      });
      byDay.forEach((list, d) => {
        const t2 = list[0].useTime.length >= 16 ? list[0].useTime.substring(11, 16) : time;
        usedProfit += addRedemptionGroup(list, d, t2);
      });
    }
    if (withoutTime.length > 0) {
      withoutTime.forEach((x) => {
        if (!recordedCodes.has(x.code)) {
          pendingItems.push({ code: x.code, cinema: x.cinema, name: x.name });
          recordedCodes.add(x.code); // 待核对的不再重复处理
        }
      });
      pendingCount += withoutTime.length;
    }
  }

  // ===== 3. 补充同步：直接拉已使用券（state=2），当月未记账的补记 =====
  let extraUsed = 0;
  try {
    const monthUsed: { code: string; cinema: 'jinyi' | 'jiahe'; name: string; useTime: string; token: string }[] = [];
    for (const acc of accounts) {
      if (!acc.token || !acc.memberId) continue;
      try {
        for (let page = 1; page <= 10; page++) {
          const resp = await api.getMemberVouchersAs(acc.token, acc.memberId, 2, page, 200);
          if (!resp.success || !resp.result) break;
          const data = resp.result as any;
          const list: any[] = Array.isArray(data) ? data : data.records || [];
          if (list.length === 0) break;
          for (const v of list) {
            if (!isMovieVoucher(v)) continue;
            const code = String(v.voucher_no || v.voucherNo || '').trim();
            if (!code || recordedCodes.has(code)) continue; // 已记账跳过
            const t = String(v.useTime ?? v.usedTime ?? v.use_time ?? v.useDate ?? v.usedDate ?? v.updateTime ?? '');
            monthUsed.push({
              code,
              cinema: cinemaOf(v),
              name: String(v.voucher_name || v.voucherName || v.name || ''),
              useTime: t ? t.substring(0, 19) : '',
              token: acc.token, // 记录归属账号，查详情用对 token
            });
          }
          if (list.length < 200) break;
        }
      } catch (e) {
        console.error('fetch used vouchers failed:', acc.name, e);
      }
    }
    if (monthUsed.length > 0) {
      // 按券码去重（多账号可能返回同一张券）
      const dedup = new Set<string>();
      const uniq = monthUsed.filter((x) => {
        if (dedup.has(x.code)) return false;
        dedup.add(x.code);
        return true;
      });
      // 缺时间的查详情（并发 5，用券归属账号的 token）
      const filled = await mapLimit(uniq, 5, async (item) => {
        if (item.useTime) return item;
        const detail = await fetchVoucherDetail(item.code, item.token);
        const t = pickUseTime(detail);
        return t ? { ...item, useTime: t } : item;
      });
      // 只补记「核销时间明确在本月」的券（正确口径：按实际核销时间归属）
      const inMonth = filled.filter((x) => x.useTime && x.useTime.substring(0, 7) === monthPrefix && !recordedCodes.has(x.code));
      if (inMonth.length > 0) {
        const byDay = new Map<string, { code: string; cinema: 'jinyi' | 'jiahe'; useTime: string }[]>();
        inMonth.forEach((x) => {
          const d = x.useTime.substring(0, 10);
          const g = byDay.get(d) || [];
          g.push({ code: x.code, cinema: x.cinema, useTime: x.useTime });
          byDay.set(d, g);
        });
        byDay.forEach((list, d) => {
          const t2 = list[0].useTime.length >= 16 ? list[0].useTime.substring(11, 16) : time;
          usedProfit += addRedemptionGroup(list, d, t2);
        });
        extraUsed += inMonth.length;
      }
      // 查不到核销时间的 → 进待核对（不算进任何一天）
      const noTime = filled.filter((x) => !x.useTime && !recordedCodes.has(x.code));
      if (noTime.length > 0) {
        noTime.forEach((x) => {
          pendingItems.push({ code: x.code, cinema: x.cinema, name: x.name });
          recordedCodes.add(x.code);
        });
        pendingCount += noTime.length;
      }
    }
  } catch (e) {
    console.error('supplement sync failed:', e);
  }

  // ===== 4. 待核对列表保存 =====
  if (pendingItems.length > 0) {
    addPendingVouchers(pendingItems);
  }

  // ===== 5. 写新快照（去重，覆盖） =====
  await (window as any).electronAPI?.saveVoucherSnapshot?.(current);

  // ===== 6. 返回结果 =====
  const total = current.length;
  const usedTotal = usedList.length + extraUsed;
  let msg: string;
  const parts: string[] = [];
  if (addedList.length > 0) parts.push(`新增 ${addedList.length} 张`);
  if (usedTotal > 0) parts.push(`已使用 ${usedTotal} 张，自动记账 +¥${usedProfit.toFixed(0)}`);
  if (pendingCount > 0) parts.push(`${pendingCount} 张查不到核销时间，已放待核对`);
  if (parts.length === 0) {
    msg = `券码快照已同步：共 ${total} 张，无变化`;
  } else {
    msg = `券码快照同步：共 ${total} 张（${parts.join('，')}）`;
  }
  return { total, added: addedList.length, used: usedTotal, usedProfit, msg };
}
