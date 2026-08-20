import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Search, RefreshCw, Camera, FolderOpen, Loader, Ticket } from 'lucide-react';
import { useStore } from '../store/useStore';
import { api } from '../api/client';

// ===== 卖品券码查询 + 一键生成截图 =====
// 查询各账号已兑换的卖品券（排除电影票券），列表显示 卖品名-券码-使用状态，每条可生成截图
type StateFilter = 'unused' | 'used' | 'all';

export default function GoodsVoucherQuery() {
  const { accounts } = useStore();
  const [stateFilter, setStateFilter] = useState<StateFilter>('unused');
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [snapping, setSnapping] = useState(false);
  const [snapMsg, setSnapMsg] = useState('');
  // 截图状态：设置后渲染隐藏二维码，合成后保存
  const [snapVoucher, setSnapVoucher] = useState<any>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);

  // 拉取某状态的全部券（翻页全量）
  const fetchByState = async (state: number): Promise<any[]> => {
    const all: any[] = [];
    for (const acc of accounts) {
      if (!acc.token || !acc.memberId) continue;
      try {
        for (let page = 1; page <= 10; page++) {
          const resp = await api.getMemberVouchersAs(acc.token, acc.memberId, state, page, 200);
          if (!resp.success || !resp.result) break;
          const data = resp.result as any;
          const list: any[] = Array.isArray(data) ? data : data.records || [];
          if (list.length === 0) break;
          all.push(...list.map((v: any) => ({ ...v, _acc: acc.name })));
          const total = Number(data.total) || 0;
          if (all.length >= total || list.length < 200) break;
        }
      } catch (e) {
        console.error('fetch vouchers failed:', acc.name, e);
      }
    }
    return all;
  };

  // 电影票券排除（卖品券 = 代金券/折扣券等非观影券）
  const isMovieVoucher = (v: any): boolean => {
    const name = String(v.voucher_name || v.voucherName || v.name || '');
    if (name.includes('电影') || name.includes('观影') || name.includes('影票')) return true;
    if (String(v.type) === '2') return true;
    return false;
  };

  const loadVouchers = async () => {
    setLoading(true);
    setError('');
    setSnapMsg('');
    try {
      let list: any[] = [];
      if (stateFilter === 'all') {
        const [u, used] = await Promise.all([fetchByState(1), fetchByState(2)]);
        list = [...u, ...used];
      } else {
        list = await fetchByState(stateFilter === 'unused' ? 1 : 2);
      }
      const goods = list.filter(
        (v) => !isMovieVoucher(v) && String(v.voucher_no || v.voucherNo || '') !== ''
      );
      setVouchers(goods);
    } catch (e: any) {
      setError('查询失败：' + (e.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accounts.length > 0) loadVouchers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length, stateFilter]);

  const statusText = (v: any): string => {
    const st = String(v.status ?? '');
    if (st === '1') return '未使用';
    if (st === '2') return '已使用';
    if (st === '3') return '已过期';
    return v.statusDictText || '未知';
  };

  const vName = (v: any): string => String(v.voucher_name || v.voucherName || v.name || '卖品券');
  const vCode = (v: any): string => String(v.voucher_no || v.voucherNo || '');
  const vValidEnd = (v: any): string => String(v.sch_end_date || v.validEndTime || v.schEndDate || '').substring(0, 10);

  // 合成截图卡片（600x800 PNG）：卖品名 + 券码 + 二维码 + 有效期 + 核销提示
  const buildCard = (v: any, qrDataUrl: string): Promise<string> =>
    new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('');
        return;
      }
      // 背景渐变
      const grad = ctx.createLinearGradient(0, 0, 0, 800);
      grad.addColorStop(0, '#8c1f3c');
      grad.addColorStop(1, '#571322');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 600, 800);
      ctx.textAlign = 'center';
      // 顶部品牌
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = 'bold 26px "Microsoft YaHei", "PingFang SC", sans-serif';
      ctx.fillText('客家影 · 卖品兑换券', 300, 62);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '14px "Microsoft YaHei", "PingFang SC", sans-serif';
      ctx.fillText('KEJIAYING 卖品部核销专用', 300, 92);
      // 白色卡片
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(36, 120, 528, 640, 22);
      ctx.fill();
      // 卖品名
      ctx.fillStyle = '#333333';
      ctx.font = 'bold 38px "Microsoft YaHei", "PingFang SC", sans-serif';
      const name = vName(v);
      const shortName = name.length > 10 ? name.slice(0, 10) + '…' : name;
      ctx.fillText(shortName, 300, 208);
      ctx.strokeStyle = '#eeeeee';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(80, 244);
      ctx.lineTo(520, 244);
      ctx.stroke();
      // 券码
      ctx.fillStyle = '#8c1f3c';
      ctx.font = 'bold 40px Consolas, "Courier New", monospace';
      ctx.fillText(vCode(v), 300, 332);
      // 二维码
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 200, 372, 200, 200);
        ctx.fillStyle = '#9ca3af';
        ctx.font = '16px "Microsoft YaHei", "PingFang SC", sans-serif';
        ctx.fillText('扫一扫核销 / 输入券码核销', 300, 606);
        // 有效期
        ctx.fillStyle = '#6b7280';
        ctx.font = '18px "Microsoft YaHei", "PingFang SC", sans-serif';
        ctx.fillText(vValidEnd(v) ? `有效期至 ${vValidEnd(v)}` : '有效期以票面为准', 300, 668);
        // 底部提示条
        ctx.fillStyle = '#8c1f3c';
        ctx.beginPath();
        ctx.roundRect(80, 700, 440, 42, 10);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px "Microsoft YaHei", "PingFang SC", sans-serif';
        ctx.fillText('出示此码至卖品部核销', 300, 727);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve('');
      img.src = qrDataUrl;
    });

  // 触发截图：设置 snapVoucher → 渲染隐藏二维码 → 合成 → 保存
  const handleSnap = (v: any) => {
    if (snapping) return;
    setSnapMsg('');
    setSnapVoucher(v);
  };

  useEffect(() => {
    if (!snapVoucher) return;
    setSnapping(true);
    const t = setTimeout(async () => {
      try {
        const qr = qrRef.current;
        if (!qr) {
          setSnapMsg('二维码生成失败');
          return;
        }
        const qrDataUrl = qr.toDataURL('image/png');
        const cardUrl = await buildCard(snapVoucher, qrDataUrl);
        if (!cardUrl) {
          setSnapMsg('截图生成失败');
          return;
        }
        const fileName = `${vName(snapVoucher)}-${vCode(snapVoucher)}`;
        const resp = await (window as any).electronAPI?.saveGoodsVoucherPng?.(cardUrl, fileName);
        if (resp?.success) {
          setSnapMsg(`✅ 已保存：${resp.path}`);
        } else {
          setSnapMsg('保存失败：' + (resp?.error || '未知错误'));
        }
      } catch (e: any) {
        setSnapMsg('截图失败：' + (e.message || String(e)));
      } finally {
        setSnapping(false);
        setSnapVoucher(null);
      }
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapVoucher]);

  const totalCount = useMemo(() => vouchers.length, [vouchers]);

  return (
    <div className="bg-white rounded-xl border p-4 space-y-3">
      {/* 标题 + 操作 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
          <Ticket className="w-4 h-4 text-pink-500" />
          卖品券码查询（{totalCount} 张）
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => (window as any).electronAPI?.openGoodsSnapDir?.()}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            截图文件夹
          </button>
          <button
            onClick={loadVouchers}
            disabled={loading}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-pink-500 hover:bg-pink-600 text-white rounded-lg disabled:opacity-50"
          >
            {loading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            查询
          </button>
        </div>
      </div>

      {/* 状态筛选 */}
      <div className="flex gap-1.5">
        {(
          [
            ['unused', '未使用'],
            ['used', '已使用'],
            ['all', '全部'],
          ] as [StateFilter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setStateFilter(key)}
            className={`px-3 py-1 text-xs rounded-lg transition-colors ${
              stateFilter === key ? 'bg-pink-500 text-white' : 'bg-white border text-gray-500 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 提示 */}
      <p className="text-[11px] text-gray-400">
        查询所有账号已兑换的卖品券（自动排除电影票券）。点「生成截图」保存券码卡片（PNG，含二维码）到本地。
      </p>

      {/* 结果列表：卖品名 - 券码 - 使用状态 + 生成截图 */}
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700">{error}</div>}
      {snapMsg && <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 text-xs text-green-700 break-all">{snapMsg}</div>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-400 py-10">
          <Loader className="w-4 h-4 animate-spin" />
          正在查询所有账号...
        </div>
      ) : vouchers.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">
          <Search className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          暂无卖品券，点「查询」重新拉取
        </div>
      ) : (
        <div className="space-y-2 max-h-[50vh] overflow-auto pr-1">
          {vouchers.map((v, i) => {
            const st = statusText(v);
            const stCls =
              st === '未使用'
                ? 'bg-green-100 text-green-600'
                : st === '已使用'
                  ? 'bg-gray-200 text-gray-500'
                  : st === '已过期'
                    ? 'bg-orange-100 text-orange-500'
                    : 'bg-gray-100 text-gray-500';
            return (
              <div key={i} className="border rounded-lg p-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{vName(v)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {v._acc ? `${v._acc} · ` : ''}
                    <span className="font-mono">{vCode(v)}</span>
                    {vValidEnd(v) ? ` · ${vValidEnd(v)}到期` : ''}
                  </p>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${stCls}`}>{st}</span>
                <button
                  onClick={() => handleSnap(v)}
                  disabled={snapping}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-purple-500 hover:bg-purple-600 text-white rounded-lg shrink-0 disabled:opacity-50"
                >
                  {snapping && snapVoucher?.code === vCode(v) ? (
                    <Loader className="w-3 h-3 animate-spin" />
                  ) : (
                    <Camera className="w-3.5 h-3.5" />
                  )}
                  生成截图
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 隐藏二维码（截图用） */}
      {snapVoucher && (
        <div style={{ position: 'fixed', left: -9999, top: 0, pointerEvents: 'none' }}>
          <QRCodeCanvas ref={qrRef} value={vCode(snapVoucher)} size={200} level="M" />
        </div>
      )}
    </div>
  );
}
