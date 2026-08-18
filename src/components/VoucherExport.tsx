import { useState } from 'react';
import {
  Link2,
  Copy,
  ExternalLink,
  Loader,
  RefreshCw,
  Undo2,
  History,
  X,
  CheckCircle,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { api } from '../api/client';
import { VOUCHER_TEMPLATE } from '../template_voucher';

// ===== 兑换券链接导出（输入数量 → 生成 → 只给链接；导出记录独立窗口） =====
export default function VoucherExport() {
  const { accounts, refreshActiveAccount } = useStore();
  const [count, setCount] = useState(5);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{ url: string; count: number; phones: string[] } | null>(null);
  const [error, setError] = useState('');
  // 导出记录窗口
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  // 拉取某账号的未使用未导出电影票兑换券（翻页拉全量，不限200）
  const fetchUnusedVouchers = async (acc: any, excludeCodes: Set<string>): Promise<any[]> => {
    try {
      const all: any[] = [];
      for (let page = 1; page <= 10; page++) {
        const resp = await api.getMemberVouchersAs(acc.token, acc.memberId, 1, page, 200);
        if (!resp.success || !resp.result) break;
        const data = resp.result as any;
        const list: any[] = Array.isArray(data) ? data : data.records || [];
        if (list.length === 0) break;
        all.push(...list);
        // 已拉满则停止
        const total = Number(data.total) || 0;
        if (all.length >= total || list.length < 200) break;
      }
      return all.filter((v: any) => {
        const code = String(v.voucher_no || v.voucherNo || '');
        if (!code || excludeCodes.has(code)) return false;
        if (String(v.status) !== '1') return false;
        const name = String(v.voucher_name || v.voucherName || v.name || '');
        return name.includes('电影票兑换券') || name.includes('电影') || name.includes('观影券');
      });
    } catch (e) {
      console.error('fetch vouchers failed:', acc.name, e);
      return [];
    }
  };

  // 生成券详情（注意事项，不展示给用户）
  const buildDetail = async (acc: any, code: string) => {
    try {
      const resp = await api.getVoucherUseByNo(code);
      if (resp.success && resp.result) {
        const r = resp.result as any;
        return {
          code,
          notes: r.voucherShow || '本券可兑换电影票一张，需到前台出示兑换码，核销选座。',
          validEnd: String(r.schEndDate || '').substring(0, 10),
        };
      }
    } catch (e) {
      console.error('detail failed:', code, e);
    }
    return { code, notes: '本券可兑换电影票一张，需到前台出示兑换码，核销选座。', validEnd: '' };
  };

  // 生成：输入数量 → 内部自动选券（优先券够的账号，不够混合）→ 部署 → 给链接
  const doExport = async () => {
    if (exporting) return;
    const need = Math.max(1, Math.min(Number(count) || 1, 50));
    setExporting(true);
    setError('');
    setResult(null);
    try {
      // 1. 刷新当前账号（保证最新券状态）
      await refreshActiveAccount();
      // 2. 收集各账号未导出券
      const codesResp = await (window as any).electronAPI?.getExportedVoucherCodes?.();
      const exclude = new Set<string>(codesResp?.success ? codesResp.codes || [] : []);
      const accVouchers: { acc: any; vouchers: any[] }[] = [];
      for (const acc of accounts) {
        if (!acc.token || !acc.memberId) continue;
        const vs = await fetchUnusedVouchers(acc, exclude);
        if (vs.length > 0) accVouchers.push({ acc, vouchers: vs });
      }
      if (accVouchers.length === 0) {
        setError('没有可用兑换券（未使用且未导出过）');
        setExporting(false);
        return;
      }
      // 3. 优先选券数够的账号；不够则混合
      const single = accVouchers.filter((x) => x.vouchers.length >= need).sort((a, b) => b.vouchers.length - a.vouchers.length);
      let chosen: { acc: any; vouchers: any[] }[] = [];
      if (single.length > 0) {
        chosen = [single[0]];
      } else {
        const sorted = accVouchers.slice().sort((a, b) => b.vouchers.length - a.vouchers.length);
        let got = 0;
        for (const item of sorted) {
          if (got >= need) break;
          chosen.push({ acc: item.acc, vouchers: item.vouchers.slice(0, need - got) });
          got += chosen[chosen.length - 1].vouchers.length;
        }
      }
      // 4. 取券构建详情（不展示券码）
      const flat: any[] = [];
      for (const item of chosen) {
        for (const v of item.vouchers) {
          if (flat.length >= need) break;
          const code = String(v.voucher_no || v.voucherNo || '');
          const detail: any = await buildDetail(item.acc, code);
          detail.phone = item.acc.phone || '';
          detail.used = false;
          flat.push(detail);
        }
        if (flat.length >= need) break;
      }
      if (flat.length === 0) {
        setError('所选券信息获取失败，请重试');
        setExporting(false);
        return;
      }
      // 5. 生成订单号（独立文件，不覆盖旧页面）
      const phones = Array.from(new Set(flat.map((f) => f.phone)));
      const orderId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      // 链接有效期（默认 7 天）
      const expireAt = Date.now() + 7 * 24 * 3600 * 1000;
      const payload = {
        exportTime: new Date().toLocaleString('zh-CN'),
        exportPhone: phones[0] || '',
        mixed: phones.length > 1,
        expireAt,
        vouchers: flat.map((v, i) => ({
          _idx: i,
          code: v.code,
          name: '电影兑换券',
          notes: v.notes,
          used: false,
          phone: v.phone,
          validStart: '',
          validEnd: v.validEnd,
        })),
      };
      const dataJson = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
      const html = VOUCHER_TEMPLATE.replace('__VOUCHER_DATA__', dataJson);
      const deployResp = await (window as any).electronAPI?.deployVoucherPage?.(html, orderId);
      if (!deployResp) throw new Error('桌面应用不支持此功能');
      if (!deployResp.success || !deployResp.url) throw new Error(deployResp.error || '部署失败');
      const url = deployResp.url + '?t=' + Date.now();
      // 6. 记录导出日志（防重复 + 状态机）
      await (window as any).electronAPI?.saveVoucherExportRecord?.({
        orderId,
        phone: phones.join(','),
        codes: flat.map((f) => f.code),
        url,
        time: new Date().toLocaleString('zh-CN'),
        status: '已发送', // 已发送/已核销/已作废
        expireAt,
      });
      setResult({ url, count: flat.length, phones });
    } catch (e: any) {
      setError('导出失败：' + (e.message || String(e)));
    } finally {
      setExporting(false);
    }
  };

  // ===== 导出记录窗口 =====
  const loadRecords = async () => {
    setLoadingRecords(true);
    try {
      const resp = await (window as any).electronAPI?.getVoucherExportRecords?.();
      if (resp?.success) setRecords(resp.records || []);
    } catch (e) {
      console.error('load records failed:', e);
    } finally {
      setLoadingRecords(false);
    }
  };

  const openRecords = () => {
    setRecordsOpen(true);
    loadRecords();
  };

  const cancelExport = async (rec: any, idx: number) => {
    if (!rec) return;
    if (!window.confirm(`确定撤销该次导出吗？\n手机号：${rec.phone}\n${rec.codes?.length || 0} 张券。\n⚠️ 线上链接将立即删除（已发给客户将无法查看）。\n券码恢复可用后可重新导出。`)) return;
    setCancelling(String(idx));
    setError('');
    try {
      // 1. 删除线上页面文件（链接立即失效）
      if (rec.orderId) {
        const delResp = await (window as any).electronAPI?.deleteVoucherPage?.(rec.orderId);
        if (!delResp?.success) {
          setError('线上页面删除失败：' + (delResp?.error || '未知错误') + '（链接可能仍可访问，请手动检查）');
        }
      }
      // 2. 删除导出记录（券恢复可用）
      await (window as any).electronAPI?.cancelVoucherExport?.(rec);
      await loadRecords();
    } catch (e: any) {
      setError('撤销失败：' + (e.message || String(e)));
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border p-4 space-y-3">
      {/* 标题区 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
          <Link2 className="w-4 h-4 text-pink-500" />
          兑换券链接
        </h3>
        <button
          onClick={openRecords}
          className="flex items-center gap-1 px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg"
        >
          <History className="w-3.5 h-3.5" />
          导出记录
        </button>
      </div>

      {/* 输入数量 + 生成（简单模式） */}
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={50}
          value={count}
          onChange={(e) => setCount(Number(e.target.value) || 1)}
          className="w-20 px-2 py-2 text-sm border rounded-lg outline-none focus:border-pink-400 text-center"
        />
        <span className="text-xs text-gray-500">张</span>
        <button
          onClick={doExport}
          disabled={exporting}
          className="flex-1 py-2 text-sm bg-pink-500 hover:bg-pink-600 text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {exporting ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Link2 className="w-4 h-4" />
              生成兑换券链接
            </>
          )}
        </button>
      </div>
      <p className="text-[11px] text-gray-400">
        内部自动选券：优先券码足够的账号，不够时自动混合其他账号（每张券标注绑定手机号）。生成后不可重复导出。
      </p>

      {/* 生成结果（直接展示，不弹窗） */}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2 text-green-700 text-sm font-semibold">
            <CheckCircle className="w-4 h-4" />
            链接已生成（{result.count} 张券）
          </div>
          <p className="text-xs text-green-600">导出手机号：{result.phones.join('、')}</p>
          <div className="bg-white border rounded-lg p-2.5 break-all text-xs text-blue-600 select-all">
            {result.url}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(result.url);
                setError('链接已复制');
                setTimeout(() => setError(''), 2000);
              }}
              className="flex-1 py-2 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center justify-center gap-1"
            >
              <Copy className="w-3.5 h-3.5" />
              复制链接
            </button>
            <button
              onClick={() => window.open(result.url, '_blank')}
              className="flex-1 py-2 text-xs bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg flex items-center justify-center gap-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              预览
            </button>
          </div>
          <p className="text-[11px] text-green-500">若打开是旧内容，请点预览刷新或稍等 1-2 分钟。</p>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-700">
          {error}
        </div>
      )}

      {/* ===== 导出记录独立窗口 ===== */}
      {recordsOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-bold text-gray-800 text-sm">兑换券导出记录</h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={loadRecords}
                  disabled={loadingRecords}
                  className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"
                  title="刷新"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingRecords ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={() => setRecordsOpen(false)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg" title="关闭">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {records.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">暂无导出记录</p>
              ) : (
                records.map((r: any, i: number) => (
                  <div key={i} className="border rounded-lg p-3 text-xs space-y-1.5 bg-gray-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-700">📱 {r.phone}</span>
                      <span className="text-gray-400 shrink-0">{r.time}</span>
                    </div>
                    <div className="text-gray-500">
                      共 {r.codes?.length || 0} 张券
                      {r.codes && r.codes.length > 0 && (
                        <span className="block text-gray-400 truncate mt-0.5 font-mono">
                          {r.codes.join('、')}
                        </span>
                      )}
                    </div>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline break-all flex items-center gap-1">
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        {r.url}
                      </a>
                    ) : (
                      <span className="text-gray-400">（未生成链接）</span>
                    )}
                    <button
                      onClick={() => cancelExport(r, i)}
                      disabled={cancelling === String(i)}
                      className="mt-1 flex items-center gap-1 px-2 py-1 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg disabled:opacity-50"
                    >
                      {cancelling === String(i) ? <Loader className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
                      撤销导出（恢复可用）
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
