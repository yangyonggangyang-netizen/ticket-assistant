import { useEffect, useState } from 'react';
import {
  User,
  Wallet,
  Star,
  TrendingUp,
  CreditCard,
  Gift,
  RefreshCw,
  Ticket,
  ChevronDown,
  ChevronUp,
  Link2,
  History,
  Copy,
  CheckCircle,
  X,
  ExternalLink,
  Loader,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useStore } from '../store/useStore';
import { api } from '../api/client';
import { VOUCHER_TEMPLATE } from '../template_voucher';

export default function MemberInfo() {
  const { accounts, activeAccountId, refreshActiveAccount, loading, cinemas, selectedCinemaId } = useStore();  const account = accounts.find((a) => a.id === activeAccountId);
  const [memberInfo, setMemberInfo] = useState<any>(null);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [storedCards, setStoredCards] = useState<any[]>([]);
  const [vouchersCollapsed, setVouchersCollapsed] = useState(true);
  // ===== 兑换券导出状态 =====
  const [showExport, setShowExport] = useState(false);
  const [exportCount, setExportCount] = useState(5);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ url: string; count: number; phones: string[] } | null>(null);
  const [exportedCodes, setExportedCodes] = useState<Set<string>>(new Set());
  const [exportRecords, setExportRecords] = useState<any[]>([]);
  const [showRecords, setShowRecords] = useState(false);

  // 加载已导出券码（防重复）+ 导出记录
  const loadExportState = async () => {
    try {
      const codesResp = await (window as any).electronAPI?.getExportedVoucherCodes?.();
      if (codesResp?.success) setExportedCodes(new Set(codesResp.codes || []));
      const recResp = await (window as any).electronAPI?.getVoucherExportRecords?.();
      if (recResp?.success) setExportRecords(recResp.records || []);
    } catch (e) {
      console.error('Failed to load export state:', e);
    }
  };

  useEffect(() => {
    loadExportState();
  }, []);

  const loadMemberInfo = async () => {
    if (!account) return;
    try {
      const resp = await api.getMemberInfoById();
      if (resp.success) setMemberInfo(resp.result);

      const cinemaId = selectedCinemaId || cinemas[0]?.id || '';

      const vResp = await api.getMemberVouchers(1, 1, 50);
      if (vResp.success && vResp.result) {
        setVouchers(vResp.result.records || []);
      }

      if (cinemaId) {
        const sResp = await api.getStoredCard(cinemaId);
        if (sResp.success && sResp.result) {
          setStoredCards(Array.isArray(sResp.result) ? sResp.result : [sResp.result]);
        }
      }
    } catch (e) {
      console.error('Failed to load member info:', e);
    }
  };

  useEffect(() => {
    loadMemberInfo();
  }, [activeAccountId, selectedCinemaId, cinemas.length]);

  // ===== 兑换券导出逻辑 =====
  // 拉取某账号的未使用电影票兑换券（state=1 未使用；过滤已导出）
  const fetchUnusedVouchers = async (acc: any, excludeCodes: Set<string>): Promise<any[]> => {
    try {
      const resp = await api.getMemberVouchersAs(acc.token, acc.memberId, 1, 1, 200);
      if (!resp.success || !resp.result) return [];
      const data = resp.result as any;
      const list: any[] = Array.isArray(data) ? data : data.records || [];
      return list.filter((v: any) => {
        const code = String(v.voucher_no || v.voucherNo || '');
        if (!code) return false;
        if (excludeCodes.has(code)) return false; // 防重复导出
        // 只导电影票兑换券（status=1 未使用）
        if (String(v.status) !== '1') return false;
        const name = String(v.voucher_name || v.voucherName || v.name || '');
        if (!name.includes('电影票兑换券') && !name.includes('电影') && !name.includes('观影券')) return false;
        return true;
      });
    } catch (e) {
      console.error('fetch vouchers failed:', e);
      return [];
    }
  };

  // 生成券详情（核销信息 + 注意事项）
  const buildVoucherDetail = async (acc: any, code: string) => {
    try {
      const resp = await api.getVoucherUseByNo(code);
      if (resp.success && resp.result) {
        const r = resp.result as any;
        return {
          code,
          name: r.voucherName || '电影兑换券',
          exchangeCode: r.voucherCode || '',
          notes: r.voucherShow || '本券可兑换电影票一张，需到前台出示兑换码，核销选座。',
          used: r.userVoucher !== 1, // userVoucher=1 未使用；其他视为已使用
          validStart: r.schStartDate || '',
          validEnd: r.schEndDate || '',
        };
      }
    } catch (e) {
      console.error('voucher detail failed:', e);
    }
    return { code, name: '电影兑换券', exchangeCode: '', notes: '本券可兑换电影票一张，需到前台出示兑换码，核销选座。', used: false };
  };

  // 生成 HTML 并部署到 GitHub Pages，返回链接
  const deployVoucherLink = async (vouchersData: any[], exportPhone: string, mixedPhones: string[]) => {
    try {
      // 构造页面数据
      const payload = {
        exportTime: new Date().toLocaleString('zh-CN'),
        exportPhone,
        mixed: mixedPhones.length > 1,
        vouchers: vouchersData.map((v, i) => ({
          _idx: i,
          code: v.code,
          name: v.name,
          exchangeCode: v.exchangeCode,
          notes: v.notes,
          used: v.used,
          phone: v.phone,
        })),
      };
      // 读取模板并注入数据（模板内容内置在代码中，避免依赖外部文件）
      const template = VOUCHER_TEMPLATE;
      const dataJson = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
      const html = template.replace('__VOUCHER_DATA__', dataJson);
      // 部署到 GitHub Pages（主进程 IPC）
      const deployResp = await (window as any).electronAPI?.deployVoucherPage?.(html);
      if (!deployResp) throw new Error('桌面应用不支持此功能');
      if (deployResp.success && deployResp.url) return deployResp.url;
      throw new Error(deployResp.error || '部署失败');
    } catch (e: any) {
      throw new Error('生成链接失败：' + (e.message || String(e)));
    }
  };

  // 主导出流程：优先当前账号券够的，不够混合其他账号
  const doExport = async () => {
    if (!account || exporting) return;
    setExporting(true);
    setExportResult(null);
    try {
      // 1. 刷新当前账号（保证最新券状态）
      await refreshActiveAccount();
      // 2. 收集各账号未导出券
      const exclude = new Set(exportedCodes);
      const accVouchers: { acc: any; vouchers: any[] }[] = [];
      for (const acc of accounts) {
        if (!acc.token || !acc.memberId) continue;
        const vs = await fetchUnusedVouchers(acc, exclude);
        if (vs.length > 0) accVouchers.push({ acc, vouchers: vs });
      }
      if (accVouchers.length === 0) {
        setExportResult({ url: '', count: 0, phones: [] });
        setExporting(false);
        return;
      }
      // 3. 优先选券数够的账号（单账号券数 >= 需要的数量时优先用券最多的）
      const need = exportCount;
      const single = accVouchers.filter((x) => x.vouchers.length >= need).sort((a, b) => b.vouchers.length - a.vouchers.length);
      let chosen: { acc: any; vouchers: any[] }[] = [];
      if (single.length > 0) {
        chosen = [single[0]];
      } else {
        // 混合：从券多的账号开始凑
        const sorted = accVouchers.slice().sort((a, b) => b.vouchers.length - a.vouchers.length);
        let got = 0;
        for (const item of sorted) {
          if (got >= need) break;
          const take = item.vouchers.slice(0, need - got);
          chosen.push({ acc: item.acc, vouchers: take });
          got += take.length;
        }
      }
      // 4. 取券并构建详情
      const flat: any[] = [];
      for (const item of chosen) {
        for (const v of item.vouchers.slice(0, need - flat.length)) {
          const code = String(v.voucher_no || v.voucherNo || '');
          const detail: any = await buildVoucherDetail(item.acc, code);
          detail.phone = item.acc.phone || '';
          flat.push(detail);
          if (flat.length >= need) break;
        }
        if (flat.length >= need) break;
      }
      if (flat.length === 0) {
        setExportResult({ url: '', count: 0, phones: [] });
        setExporting(false);
        return;
      }
      // 5. 部署生成链接
      const phones = Array.from(new Set(chosen.map((c) => c.acc.phone || '')));
      const url = await deployVoucherLink(flat, phones[0] || '', phones);
      // 6. 记录导出日志（防重复 + 追溯）
      const codes = flat.map((f) => f.code);
      const record = { phone: phones.join(','), codes, url, time: new Date().toLocaleString('zh-CN') };
      await (window as any).electronAPI?.saveVoucherExportRecord?.(record);
      // 更新本地已导出集合
      const newExported = new Set(exportedCodes);
      codes.forEach((c) => newExported.add(c));
      setExportedCodes(newExported);
      await loadExportState();
      setExportResult({ url, count: flat.length, phones });
    } catch (e: any) {
      alert('导出失败：' + (e.message || String(e)));
    } finally {
      setExporting(false);
    }
  };

  if (!account) {
    return <div className="p-6 text-center text-gray-400 py-12">请先添加账号</div>;
  }

  const info = memberInfo || account;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">会员信息</h2>
        <button
          onClick={() => { refreshActiveAccount(); loadMemberInfo(); }}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* Member card */}
      <div className="bg-gradient-to-r from-pink-500 to-purple-500 rounded-xl p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
            {info.wxHeadPortrait ? (
              <img src={info.wxHeadPortrait} alt="" className="w-16 h-16 rounded-full object-cover" />
            ) : (
              <User className="w-8 h-8" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold truncate">{info.wxName || info.name || account.name}</p>
            <p className="text-sm text-white/80">
              {info.phone || account.phone} · {info.cardNo || account.cardNo}
            </p>
            <p className="text-sm text-white/80 mt-1">
              {info.levelDictText || account.levelDictText || info.level || '普通会员'}
            </p>
          </div>
        </div>
      </div>

      {/* 导出记录面板 */}
      {showRecords && (
        <div className="bg-white rounded-lg border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">兑换券导出记录</p>
            <button onClick={() => setShowRecords(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          {exportRecords.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">暂无导出记录</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {exportRecords.map((r: any, i: number) => (
                <div key={i} className="border rounded-lg p-2.5 text-xs space-y-1 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-700">📱 {r.phone}</span>
                    <span className="text-gray-400">{r.time}</span>
                  </div>
                  <div className="text-gray-500">{r.codes.length} 张券：{r.codes.slice(0, 3).join('、')}{r.codes.length > 3 ? ` 等${r.codes.length}张` : ''}</div>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline flex items-center gap-1 break-all">
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      {r.url}
                    </a>
                  ) : (
                    <span className="text-gray-400">（未生成链接）</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 导出兑换券链接弹窗 */}
      {showExport && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowExport(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-800">导出兑换券链接</h3>
              <button onClick={() => setShowExport(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {exportResult ? (
              exportResult.count === 0 ? (
                <div className="text-center py-6 space-y-3">
                  <p className="text-sm text-gray-500">当前没有可导出的兑换券（未使用且未导出过）</p>
                  <button onClick={() => setExportResult(null)} className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 text-gray-600">
                    返回
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">已生成兑换券链接（{exportResult.count} 张）</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    导出手机号：{exportResult.phones.join('、')}
                  </p>
                  <div className="bg-gray-50 border rounded-lg p-3 break-all text-xs text-blue-600 select-all">
                    {exportResult.url}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(exportResult.url);
                        alert('链接已复制');
                      }}
                      className="flex-1 py-2 text-sm bg-pink-500 hover:bg-pink-600 text-white rounded-lg flex items-center justify-center gap-1"
                    >
                      <Copy className="w-4 h-4" />
                      复制链接
                    </button>
                    <button
                      onClick={() => window.open(exportResult.url, '_blank')}
                      className="flex-1 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex items-center justify-center gap-1"
                    >
                      <ExternalLink className="w-4 h-4" />
                      预览
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">链接已记录，下次导出会自动跳过这 {exportResult.count} 张券，防止重复导出。</p>
                  <button onClick={() => { setShowExport(false); setExportResult(null); }} className="w-full py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg">
                    完成
                  </button>
                </div>
              )
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-gray-500 bg-gray-50 border rounded-lg p-3 space-y-1">
                  <p>• 导出后每张券生成二维码+券码，一个链接内左右滑动查看</p>
                  <p>• 每张券标注绑定手机号；已导出的券不会重复导出</p>
                  <p>• 当前账号券不够时会自动混合其他账号导出</p>
                </div>
                <div>
                  <label className="text-xs text-gray-600 font-medium">导出数量</label>
                  <div className="flex gap-2 mt-1.5">
                    {[1, 3, 5, 10].map((n) => (
                      <button
                        key={n}
                        onClick={() => setExportCount(n)}
                        className={`flex-1 py-2 text-sm rounded-lg border ${exportCount === n ? 'bg-pink-500 text-white border-pink-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                      >
                        {n} 张
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={doExport}
                  disabled={exporting}
                  className="w-full py-2.5 text-sm bg-pink-500 hover:bg-pink-600 text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {exporting ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    '生成兑换券链接'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Wallet} label="总余额" value={`¥${Number(info.totalBalance ?? (info.balance ?? 0) + (info.viewAmountBalance ?? 0)).toFixed(2)}`} color="text-blue-600 bg-blue-50" />
        <StatCard icon={Star} label="积分" value={String(info.score ?? 0)} color="text-yellow-600 bg-yellow-50" />
        <StatCard icon={TrendingUp} label="成长值" value={String(info.growthNum ?? 0)} color="text-green-600 bg-green-50" />
        <StatCard icon={Wallet} label="观影金" value={`¥${Number(info.viewAmountBalance ?? 0).toFixed(2)}`} color="text-pink-600 bg-pink-50" />
      </div>

      {/* Balance detail */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-medium mb-3">余额明细</h3>
        <div className="space-y-2 text-sm">
          <DetailRow label="普通余额" value={`¥${Number(info.balance ?? 0).toFixed(2)}`} />
          <DetailRow label="观影金余额" value={`¥${Number(info.viewAmountBalance ?? 0).toFixed(2)}`} />
          <DetailRow label="总可用余额" value={`¥${Number(info.totalBalance ?? (info.balance ?? 0) + (info.viewAmountBalance ?? 0)).toFixed(2)}`} />
        </div>
      </div>

      {/* Details */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-medium mb-3">账户详情</h3>
        <div className="space-y-2 text-sm">
          <DetailRow label="会员ID" value={info.id || account.memberId} />
          <DetailRow label="手机号" value={info.phone || account.phone} />
          <DetailRow label="卡号" value={info.cardNo || account.cardNo} />
          <DetailRow label="等级" value={info.levelDictText || account.levelDictText} />
          <DetailRow label="注册时间" value={info.regDate} />
          <DetailRow label="生日" value={info.birthday} />
          <DetailRow label="累计观影" value={info.sumTicketNum ? `${info.sumTicketNum} 次` : ''} />
        </div>
      </div>

      {/* Vouchers */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVouchersCollapsed(!vouchersCollapsed)}
            className="flex items-center gap-2 text-sm font-medium hover:opacity-80 transition-opacity flex-1"
          >
            <Gift className="w-4 h-4 text-pink-500" />
            <span>卡券 ({vouchers.length})</span>
            {vouchersCollapsed ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            )}
          </button>
          <button
            onClick={() => { setShowExport(true); loadExportState(); }}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-pink-500 hover:bg-pink-600 text-white rounded-lg shrink-0"
          >
            <Link2 className="w-3.5 h-3.5" />
            导出兑换券链接
          </button>
          <button
            onClick={() => { setShowRecords(!showRecords); if (!showRecords) loadExportState(); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg shrink-0"
            title="查看导出记录"
          >
            <History className="w-3.5 h-3.5" />
          </button>
        </div>
        {!vouchersCollapsed && (
          vouchers.length === 0 ? (
            <div className="bg-white rounded-lg border p-6 text-center text-gray-400">
              <Ticket className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">暂无卡券</p>
            </div>
          ) : (
            <div className="space-y-3">
              {vouchers.map((v: any, i: number) => (
                <VoucherCard key={i} voucher={v} />
              ))}
            </div>
          )
        )}
      </div>

      {/* Stored cards */}
      {storedCards.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-500" />
            储值卡 ({storedCards.length})
          </h3>
          <div className="space-y-3">
            {storedCards.map((c: any, i: number) => (
              <StoredCardCard key={i} card={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VoucherCard({ voucher }: { voucher: any }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const name = voucher.voucher_name || voucher.voucherName || voucher.name || '卡券';
  const value = voucher.value != null ? Number(voucher.value) : null;
  const unit = voucher.unit || '元';
  const statusText = voucher.statusDictText || (voucher.status === '1' ? '未使用' : voucher.status === '2' ? '已使用' : voucher.status === '3' ? '已过期' : '');
  const validEnd = voucher.sch_end_date || voucher.validEndTime || '';
  const voucherNo = voucher.voucher_no || voucher.voucherNo || '';
  const typeText = voucher.type === '2' ? '观影券' : voucher.type === '3' ? '折扣券' : '代金券';

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !detail && voucherNo) {
      setLoading(true);
      try {
        const resp = await api.getVoucherUseByNo(voucherNo);
        if (resp.success && resp.result) {
          setDetail(resp.result);
        }
      } catch (e) {
        console.error('Failed to load voucher detail:', e);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <button
        onClick={toggle}
        className="w-full p-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="w-16 h-20 rounded-lg bg-pink-50 flex flex-col items-center justify-center shrink-0">
          <span className="text-lg font-bold text-pink-500 leading-tight">
            {value != null ? value : ''}
          </span>
          <span className="text-xs text-pink-400 mt-0.5">{unit}</span>
        </div>
        <div className="flex-1 min-w-0 py-0.5">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium text-sm truncate pr-2">{name}</p>
            {statusText && (
              <span className="text-xs px-2 py-0.5 rounded bg-pink-100 text-pink-600 shrink-0">
                {statusText}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1.5">券号：{voucherNo}</p>
          {validEnd && (
            <p className="text-xs text-gray-400 mt-1">有效期至：{validEnd.substring(0, 10)}</p>
          )}
          <p className="text-xs text-gray-500 mt-2">{typeText}</p>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t bg-gray-50 p-4 space-y-4">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">加载详情中...</p>
          ) : (
            <>
              {/* QR Code */}
              <div className="flex flex-col items-center">
                <div className="bg-white p-3 rounded-lg border">
                  <QRCodeSVG value={voucherNo || ' '} size={160} level="M" />
                </div>
                <p className="text-xs text-gray-400 mt-2">券号：{voucherNo}</p>
              </div>

              {/* Info card */}
              <div className="bg-white rounded-lg border p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">名称</span>
                  <span className="text-gray-800 text-right max-w-[60%]">{name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">券号</span>
                  <span className="text-gray-800 font-mono">{voucherNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">类型</span>
                  <span className="text-gray-800">{detail?.typeName || typeText}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">有效期</span>
                  <span className="text-gray-800">
                    {(detail?.schStartDate || voucher.sch_start_date || '').substring(0, 10)}
                    {' 至 '}
                    {(detail?.schEndDate || validEnd || '').substring(0, 10)}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StoredCardCard({ card }: { card: any }) {
  const name = card.cardName || card.cardNo || '储值卡';
  const balance = Number(card.balance ?? 0).toFixed(2);
  const statusText = card.statusDictText || (card.status === 0 ? '正常' : '');

  return (
    <div className="bg-white rounded-xl border p-3 flex items-center gap-3 hover:shadow-sm">
      <div className="w-16 h-20 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
        <CreditCard className="w-7 h-7 text-blue-500" />
      </div>
      <div className="flex-1 min-w-0 py-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-sm truncate pr-2">{name}</p>
          {statusText && (
            <span className="text-sm text-red-500 shrink-0">{statusText}</span>
          )}
        </div>
        <p className="text-sm text-gray-400 mt-2">卡号：{card.cardNo || '-'}</p>
        <p className="text-sm font-medium text-gray-800 mt-3">
          余额：{balance}元
        </p>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: any) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-xs text-gray-500 mt-3">{label}</p>
      <p className="text-lg font-bold mt-1 truncate">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between py-1 border-b border-gray-50 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-800">{value}</span>
    </div>
  );
}
