import { useEffect, useState } from 'react';
import {
  Link2,
  X,
  Copy,
  ExternalLink,
  Loader,
  RefreshCw,
  Undo2,
  CheckCircle,
  History,
  Ticket,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { api } from '../api/client';
import { VOUCHER_TEMPLATE } from '../template_voucher';

// ===== 兑换券链接导出（自定义选券 + 防重复 + 取消恢复 + 导出记录） =====
export default function VoucherExport() {
  const { accounts, activeAccountId, refreshActiveAccount, switchAccount } = useStore();
  const [exporting, setExporting] = useState(false);
  const [loadingVouchers, setLoadingVouchers] = useState(false);
  const [result, setResult] = useState<{ url: string; count: number; phones: string[] } | null>(null);
  const [error, setError] = useState('');
  // 可用券（自定义勾选）
  const [available, setAvailable] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 导出记录
  const [records, setRecords] = useState<any[]>([]);
  const [showRecords, setShowRecords] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const loadExportRecords = async () => {
    try {
      const resp = await (window as any).electronAPI?.getVoucherExportRecords?.();
      if (resp?.success) setRecords(resp.records || []);
    } catch (e) {
      console.error('load records failed:', e);
    }
  };

  useEffect(() => {
    loadExportRecords();
  }, []);

  // 加载所有账号的可用券（未使用 + 未导出）
  const loadAvailableVouchers = async () => {
    setLoadingVouchers(true);
    setError('');
    setResult(null);
    try {
      await refreshActiveAccount();
      const codesResp = await (window as any).electronAPI?.getExportedVoucherCodes?.();
      const exclude = new Set<string>(codesResp?.success ? codesResp.codes || [] : []);
      const all: any[] = [];
      for (const acc of accounts) {
        if (!acc.token || !acc.memberId) continue;
        try {
          const resp = await api.getMemberVouchersAs(acc.token, acc.memberId, 1, 1, 200);
          if (!resp.success || !resp.result) continue;
          const data = resp.result as any;
          const list: any[] = Array.isArray(data) ? data : data.records || [];
          list.forEach((v: any) => {
            const code = String(v.voucher_no || v.voucherNo || '');
            if (!code || exclude.has(code)) return;
            if (String(v.status) !== '1') return;
            const name = String(v.voucher_name || v.voucherName || v.name || '');
            if (!name.includes('电影票兑换券') && !name.includes('电影') && !name.includes('观影券')) return;
            all.push({
              code,
              phone: acc.phone || '',
              accName: acc.name || acc.phone || '',
              name,
              schEnd: String(v.sch_end_date || v.schEndDate || '').substring(0, 10),
            });
          });
        } catch (e) {
          console.error('fetch vouchers failed:', acc.name, e);
        }
      }
      setAvailable(all);
      setSelected(new Set());
      if (all.length === 0) setError('没有可用兑换券（未使用且未导出过）');
    } catch (e: any) {
      setError('加载失败：' + (e.message || String(e)));
    } finally {
      setLoadingVouchers(false);
    }
  };

  const toggleSelect = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(available.map((v) => v.code)));
  const clearAll = () => setSelected(new Set());

  // 生成并部署链接
  const doExport = async () => {
    if (selected.size === 0) {
      setError('请先勾选要导出的兑换券');
      return;
    }
    setExporting(true);
    setError('');
    setResult(null);
    try {
      // 构建详情（券号 = 二维码内容；注意事项取核销接口）
      const flat: any[] = [];
      for (const v of available.filter((x) => selected.has(x.code))) {
        let notes = '本券可兑换电影票一张，需到前台出示兑换码，核销选座。';
        let validEnd = v.schEnd || '';
        try {
          const resp = await api.getVoucherUseByNo(v.code);
          if (resp.success && resp.result) {
            const r = resp.result as any;
            notes = r.voucherShow || notes;
            validEnd = String(r.schEndDate || validEnd).substring(0, 10);
          }
        } catch (e) {
          console.error('detail failed:', v.code, e);
        }
        flat.push({
          code: v.code,          // 券号（核销码）
          name: '电影兑换券',
          notes,
          used: false,
          phone: v.phone,
          validStart: '',
          validEnd,
        });
      }
      if (flat.length === 0) {
        setError('所选券信息获取失败，请重试');
        setExporting(false);
        return;
      }
      // 组装页面数据（导出时间 + 手机号）
      const payload = {
        exportTime: new Date().toLocaleString('zh-CN'),
        exportPhone: flat[0].phone || '',
        mixed: new Set(flat.map((f) => f.phone)).size > 1,
        vouchers: flat.map((v, i) => ({
          _idx: i,
          code: v.code,
          name: v.name,
          notes: v.notes,
          used: v.used,
          phone: v.phone,
          validStart: v.validStart,
          validEnd: v.validEnd,
        })),
      };
      const template = VOUCHER_TEMPLATE;
      const dataJson = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
      const html = template.replace('__VOUCHER_DATA__', dataJson);
      // 部署（带时间戳防缓存）
      const deployResp = await (window as any).electronAPI?.deployVoucherPage?.(html);
      if (!deployResp) throw new Error('桌面应用不支持此功能');
      if (!deployResp.success || !deployResp.url) throw new Error(deployResp.error || '部署失败');
      const url = deployResp.url + '?t=' + Date.now();
      // 记录导出日志（防重复）
      const phones = Array.from(new Set(flat.map((f) => f.phone)));
      await (window as any).electronAPI?.saveVoucherExportRecord?.({
        phone: phones.join(','),
        codes: flat.map((f) => f.code),
        url,
        time: new Date().toLocaleString('zh-CN'),
      });
      await loadExportRecords();
      setResult({ url, count: flat.length, phones });
      // 生成后刷新可用券（已导出的移除）
      await loadAvailableVouchers();
    } catch (e: any) {
      setError('导出失败：' + (e.message || String(e)));
    } finally {
      setExporting(false);
    }
  };

  // 取消导出：删除记录（券恢复可用，可重新导出）
  const cancelExport = async (idx: number) => {
    const rec = records[idx];
    if (!rec) return;
    if (!window.confirm(`确定取消该次导出吗？\n手机号：${rec.phone}\n券码 ${rec.codes?.length || 0} 张将恢复可用，可重新导出。`)) return;
    setCancelling(String(idx));
    try {
      await (window as any).electronAPI?.cancelVoucherExport?.(rec);
      await loadExportRecords();
      // 刷新可用券
      await loadAvailableVouchers();
    } catch (e: any) {
      setError('取消失败：' + (e.message || String(e)));
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 标题区 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
          <Link2 className="w-4 h-4 text-pink-500" />
          兑换券链接导出
        </h3>
        <button
          onClick={() => { setShowRecords(!showRecords); if (!showRecords) loadExportRecords(); }}
          className="flex items-center gap-1 px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg"
        >
          <History className="w-3.5 h-3.5" />
          导出记录 {records.length > 0 ? `(${records.length})` : ''}
        </button>
      </div>

      {/* 导出记录面板 */}
      {showRecords && (
        <div className="bg-white rounded-xl border p-3 space-y-2">
          {records.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">暂无导出记录</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {records.map((r: any, i: number) => (
                <div key={i} className="border rounded-lg p-2.5 text-xs space-y-1 bg-gray-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-700">📱 {r.phone}</span>
                    <span className="text-gray-400 shrink-0">{r.time}</span>
                  </div>
                  <div className="text-gray-500">
                    {r.codes?.length || 0} 张券：{String(r.codes || []).slice(0, 40)}
                    {(r.codes || []).length > 2 ? '...' : ''}
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
                    onClick={() => cancelExport(i)}
                    disabled={cancelling === String(i)}
                    className="mt-1 flex items-center gap-1 px-2 py-1 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg disabled:opacity-50"
                  >
                    {cancelling === String(i) ? <Loader className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
                    取消导出（恢复可用）
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 生成结果（不弹窗，直接展示） */}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm font-semibold">链接已生成（{result.count} 张券）</span>
          </div>
          <p className="text-xs text-green-600">
            导出手机号：{result.phones.join('、')}（每张券页面已标注绑定手机号）
          </p>
          <div className="bg-white border rounded-lg p-3 break-all text-xs text-blue-600 select-all">
            {result.url}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(result.url);
                setError('链接已复制');
                setTimeout(() => setError(''), 2000);
              }}
              className="flex-1 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center justify-center gap-1"
            >
              <Copy className="w-4 h-4" />
              复制链接
            </button>
            <button
              onClick={() => window.open(result.url, '_blank')}
              className="flex-1 py-2 text-sm bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg flex items-center justify-center gap-1"
            >
              <ExternalLink className="w-4 h-4" />
              打开预览
            </button>
          </div>
        </div>
      )}

      {/* 加载可用券 */}
      <button
        onClick={loadAvailableVouchers}
        disabled={loadingVouchers}
        className="w-full flex items-center justify-center gap-2 py-2.5 text-sm bg-pink-500 hover:bg-pink-600 text-white rounded-xl disabled:opacity-50"
      >
        {loadingVouchers ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        {loadingVouchers ? '加载中...' : '刷新并加载可用兑换券'}
      </button>

      {/* 可用券列表（自定义勾选） */}
      {available.length > 0 && (
        <div className="bg-white rounded-xl border p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">
              可用券 <span className="font-bold text-pink-600">{available.length}</span> 张 · 已选{' '}
              <span className="font-bold text-pink-600">{selected.size}</span> 张
            </p>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-pink-500 hover:underline">全选</button>
              <button onClick={clearAll} className="text-xs text-gray-400 hover:underline">清空</button>
            </div>
          </div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {available.map((v) => (
              <label
                key={v.code}
                className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                  selected.has(v.code) ? 'bg-pink-50 border-pink-300' : 'bg-white border-gray-100 hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(v.code)}
                  onChange={() => toggleSelect(v.code)}
                  className="accent-pink-500 w-4 h-4"
                />
                <Ticket className="w-4 h-4 text-pink-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-gray-800 truncate">{v.code}</p>
                  <p className="text-[11px] text-gray-400">
                    📱 {v.phone || '无手机号'}
                    {v.schEnd ? ` · 有效期至 ${v.schEnd}` : ''}
                  </p>
                </div>
              </label>
            ))}
          </div>
          <button
            onClick={doExport}
            disabled={exporting || selected.size === 0}
            className="mt-3 w-full py-2.5 text-sm bg-pink-500 hover:bg-pink-600 text-white rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {exporting ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                生成链接中...
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4" />
                生成兑换券链接（{selected.size} 张）
              </>
            )}
          </button>
        </div>
      )}

      {/* 错误/提示 */}
      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
          {error}
        </div>
      )}
    </div>
  );
}
