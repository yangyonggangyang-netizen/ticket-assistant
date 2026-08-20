// ===== 券码快照同步（Accounts 与 Ledger 共用） =====
// 统计所有账号电影票核销券码 → 对比旧快照 → 少了=已使用→自动记账（按实际核销时间归属）；多了=更新数量
import { api } from '../api/client';
import { loadRules, getRuleForDate } from '../store/batchStore';
import { addRedemption, RedemptionRecord } from '../store/redemptionStore';

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

export async function syncVoucherSnapshot(accounts: any[]): Promise<SnapResult> {
  // 1. 拉所有账号未使用电影票兑换券（翻页全量）
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
          const name = String(v.voucher_name || v.voucherName || v.name || '');
          if (!(name.includes('电影票兑换券') || name.includes('电影') || name.includes('观影券'))) continue;
          const code = String(v.voucher_no || v.voucherNo || '').trim();
          if (!code || seen.has(code)) continue;
          seen.add(code);
          const cinemaName = String(v.cinema_name || v.cinemaName || v.cinema || '');
          current.push({
            code,
            cinema: cinemaName.includes('嘉和') ? 'jiahe' : 'jinyi',
            name,
          });
        }
        const total = Number(data.total) || 0;
        if (current.length >= total || list.length < 200) break;
      }
    } catch (e) {
      console.error('snapshot fetch failed:', acc.name, e);
    }
  }
  // 2. 读旧快照
  const oldResp = await (window as any).electronAPI?.loadVoucherSnapshot?.();
  const oldList: SnapItem[] = (oldResp?.success ? oldResp.list : []) || [];
  // 3. 对比：少了 = 已使用；多了 = 新增
  const oldCodes = new Set(oldList.map((x) => x.code));
  const newCodes = new Set(current.map((x) => x.code));
  const usedList = oldList.filter((x) => !newCodes.has(x.code));
  const addedList = current.filter((x) => !oldCodes.has(x.code));
  // 4. 已使用 → 自动记账（按影院价；查实际核销时间并按实际日期归属）
  let usedProfit = 0;
  if (usedList.length > 0) {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const date = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const time = `${pad(today.getHours())}:${pad(today.getMinutes())}`;
    const rule = getRuleForDate(loadRules(), date);
    // 查券使用时间（并发限 3）
    const fetchUseTime = async (code: string): Promise<string> => {
      try {
        const resp = await api.getVoucherUseByNo(code);
        if (resp.success && resp.result) {
          const r = resp.result as any;
          const t = r.useTime ?? r.usedTime ?? r.use_time ?? r.verifyTime ?? r.updateTime ?? r.update_time ?? '';
          if (t) return String(t).substring(0, 19);
        }
      } catch (e) {
        console.error('useTime failed:', code, e);
      }
      return '';
    };
    const usedWithTime = await (async () => {
      const out: { item: SnapItem; useTime: string }[] = [];
      let idx = 0;
      const workers = Array.from({ length: Math.min(3, usedList.length) }, async () => {
        while (idx < usedList.length) {
          const item = usedList[idx++];
          const ut = await fetchUseTime(item.code);
          out.push({ item, useTime: ut });
        }
      });
      await Promise.all(workers);
      return out;
    })();
    const groups = new Map<'jinyi' | 'jiahe', { item: SnapItem; useTime: string }[]>();
    usedWithTime.forEach((x) => {
      const g = groups.get(x.item.cinema) || [];
      g.push(x);
      groups.set(x.item.cinema, g);
    });
    groups.forEach((list, cinema) => {
      const price = cinema === 'jiahe' ? rule.jiaheCode : rule.jinyiCode;
      const firstTime = list.map((x) => x.useTime).find(Boolean) || '';
      // 记账日期用实际核销时间（查得到按实际归属，查不到用当天）
      const useDate = firstTime ? firstTime.substring(0, 10) : date;
      const useClock = firstTime && firstTime.length >= 16 ? firstTime.substring(11, 16) : time;
      const rec: RedemptionRecord = {
        id: 'RD' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        date: useDate,
        time: useClock,
        cinema,
        count: list.length,
        codes: list.map((x) => x.item.code),
        unitPrice: price,
        income: price * list.length,
        batchId: '',
        profit: price * list.length,
        useTime: firstTime || undefined,
      };
      addRedemption(rec);
      usedProfit += rec.profit;
    });
  }
  // 5. 写新快照（去重，覆盖）
  await (window as any).electronAPI?.saveVoucherSnapshot?.(current);
  // 6. 返回结果
  let msg: string;
  if (usedList.length === 0 && addedList.length === 0) {
    msg = `券码快照已同步：共 ${current.length} 张，无变化`;
  } else {
    const parts: string[] = [];
    if (addedList.length > 0) parts.push(`新增 ${addedList.length} 张`);
    if (usedList.length > 0) parts.push(`已使用 ${usedList.length} 张，自动记账 +¥${usedProfit.toFixed(0)}`);
    msg = `券码快照同步：共 ${current.length} 张（${parts.join('，')}）`;
  }
  return { total: current.length, added: addedList.length, used: usedList.length, usedProfit, msg };
}
