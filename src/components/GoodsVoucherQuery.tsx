import { useEffect, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Search, RefreshCw, Camera, FolderOpen, Loader, Ticket } from 'lucide-react';
import { useStore } from '../store/useStore';
import { api } from '../api/client';

// ===== 卖品券码查询（积分兑换的爆米花等） + 一键生成截图 =====
// 数据源：卖品订单（type=4，message 含商品明细 goodsName/amount/outNum）
// 取货码 = order.printNo；使用状态 = outNum>=amount 取货完成 / 否则未取货
type StateFilter = 'unused' | 'used' | 'all';

interface SnackVoucher {
  id: string;          // 订单 id
  name: string;        // 卖品名
  code: string;        // 取货码
  taken: boolean;      // 是否全部取完
  account: string;     // 账号名
  items: any[];        // 商品明细
}

// 解析 message（数组取第一项摘要）
function parseMsg(message: any): any {
  if (!message) return {};
  if (typeof message === 'object') {
    if (Array.isArray(message)) return message[0] || {};
    return message;
  }
  try {
    const parsed = JSON.parse(message);
    if (Array.isArray(parsed)) return parsed[0] || {};
    return parsed;
  } catch {
    return {};
  }
}

// 解析卖品订单 → SnackVoucher | null（电影票/充值订单返回 null）
function parseSnackVoucher(o: any, accountName: string): SnackVoucher | null {
  const type = String(o.type ?? o.orderType ?? o.saleType ?? '').toLowerCase();
  const msg = parseMsg(o.message);
  if (msg.filmName || msg.film_name) return null;
  if (msg.setMealName || msg.setMealId) return null;
  const isSnack =
    type === '4' ||
    type.includes('goods') ||
    type.includes('snack') ||
    !!msg.goodsName ||
    !!msg.goods_name;
  if (!isSnack) return null;
  // 商品明细：优先 message 数组，兜底 details
  let items: any[] = [];
  try {
    const m = typeof o.message === 'string' ? JSON.parse(o.message) : o.message;
    if (Array.isArray(m)) items = m;
  } catch {}
  if (items.length === 0) items = o.details || o.orderDetails || [];
  const first = items[0] || msg || {};
  const name = String(
    first.goodsName || first.goods_name || first.planName || msg.goodsName || msg.goods_name || '卖品'
  );
  const code = String(o.printNo || o.print_no || o.verifyCode || o.verify_code || '').trim();
  if (!code) return null;
  // 使用状态：全部商品取完 = 取货完成，否则未取货
  const taken =
    items.length > 0 &&
    items.every((g: any) => {
      const amount = Number(g.amount ?? g.num ?? g.take_num ?? 1);
      const outNum = Number(g.outNum ?? g.takeNum ?? 0);
      return outNum >= amount;
    });
  return { id: String(o.id ?? o.orderNo ?? o.order_no ?? ''), name, code, taken, account: accountName, items };
}

export default function GoodsVoucherQuery() {
  const { accounts } = useStore();
  const [stateFilter, setStateFilter] = useState<StateFilter>('unused');
  const [vouchers, setVouchers] = useState<SnackVoucher[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [snapping, setSnapping] = useState(false);
  const [snapMsg, setSnapMsg] = useState('');
  const [snapVoucher, setSnapVoucher] = useState<SnackVoucher | null>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);

  // 拉取某账号全部卖品订单（翻页全量）
  const fetchSnackOrders = async (acc: any): Promise<SnackVoucher[]> => {
    const out: SnackVoucher[] = [];
    try {
      for (let page = 1; page <= 20; page++) {
        const resp = await api.getOrderListAs(acc.token, acc.memberId, page, 200);
        if (!resp.success || !resp.result) break;
        const data = resp.result as any;
        const list: any[] = Array.isArray(data) ? data : data.records || [];
        if (list.length === 0) break;
        for (const o of list) {
          const v = parseSnackVoucher(o, acc.name);
          if (v) out.push(v);
        }
        const total = Number(data.total) || 0;
        if (out.length >= total || list.length < 200) break;
      }
    } catch (e) {
      console.error('fetch snack orders failed:', acc.name, e);
    }
    return out;
  };

  const loadVouchers = async () => {
    setLoading(true);
    setError('');
    setSnapMsg('');
    try {
      const all: SnackVoucher[] = [];
      for (const acc of accounts) {
        if (!acc.token || !acc.memberId) continue;
        const list = await fetchSnackOrders(acc);
        all.push(...list);
      }
      // 去重（按 账号+取货码）
      const seen = new Set<string>();
      const uniq = all.filter((v) => {
        const k = `${v.account}-${v.code}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      setVouchers(
        uniq.filter((v) =>
          stateFilter === 'all' ? true : stateFilter === 'unused' ? !v.taken : v.taken
        )
      );
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

  // 合成截图卡片（600x800 PNG）：卖品名 + 取货码 + 二维码 + 提示
  const buildCard = (v: SnackVoucher, qrDataUrl: string): Promise<string> =>
    new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('');
        return;
      }
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
      const name = v.name.length > 10 ? v.name.slice(0, 10) + '…' : v.name;
      ctx.fillText(name, 300, 208);
      ctx.strokeStyle = '#eeeeee';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(80, 244);
      ctx.lineTo(520, 244);
      ctx.stroke();
      // 取货码
      ctx.fillStyle = '#8c1f3c';
      ctx.font = 'bold 40px Consolas, "Courier New", monospace';
      ctx.fillText(v.code, 300, 332);
      // 二维码
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 200, 372, 200, 200);
        ctx.fillStyle = '#9ca3af';
        ctx.font = '16px "Microsoft YaHei", "PingFang SC", sans-serif';
        ctx.fillText('扫一扫核销 / 输入取货码核销', 300, 606);
        ctx.fillStyle = '#6b7280';
        ctx.font = '18px "Microsoft YaHei", "PingFang SC", sans-serif';
        ctx.fillText('积分兑换卖品 · 出示此券至卖品部领取', 300, 668);
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

  const handleSnap = (v: SnackVoucher) => {
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
        const fileName = `${snapVoucher.name}-${snapVoucher.code}`;
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

  return (
    <div className="bg-white rounded-xl border p-4 space-y-3">
      {/* 标题 + 操作 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
          <Ticket className="w-4 h-4 text-pink-500" />
          卖品券码查询（{vouchers.length} 张）
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
            ['unused', '未取货'],
            ['used', '已取货'],
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
        查询所有账号积分兑换的卖品订单（爆米花等），自动识别取货码与取货状态。点「生成截图」保存券码卡片 PNG。
      </p>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700">{error}</div>}
      {snapMsg && <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 text-xs text-green-700 break-all">{snapMsg}</div>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-400 py-10">
          <Loader className="w-4 h-4 animate-spin" />
          正在查询所有账号卖品订单...
        </div>
      ) : vouchers.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">
          <Search className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          暂无卖品券，点「查询」重新拉取
        </div>
      ) : (
        <div className="space-y-2 max-h-[50vh] overflow-auto pr-1">
          {vouchers.map((v, i) => (
            <div key={i} className="border rounded-lg p-2.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 truncate">{v.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {v.account} · <span className="font-mono">{v.code}</span>
                  {v.items.length > 1 ? ` · ${v.items.length} 项` : ''}
                </p>
              </div>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${
                  v.taken ? 'bg-gray-200 text-gray-500' : 'bg-green-100 text-green-600'
                }`}
              >
                {v.taken ? '取货完成' : '未取货'}
              </span>
              <button
                onClick={() => handleSnap(v)}
                disabled={snapping}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-purple-500 hover:bg-purple-600 text-white rounded-lg shrink-0 disabled:opacity-50"
              >
                {snapping && snapVoucher?.code === v.code ? (
                  <Loader className="w-3 h-3 animate-spin" />
                ) : (
                  <Camera className="w-3.5 h-3.5" />
                )}
                生成截图
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 隐藏二维码（截图用） */}
      {snapVoucher && (
        <div style={{ position: 'fixed', left: -9999, top: 0, pointerEvents: 'none' }}>
          <QRCodeCanvas ref={qrRef} value={snapVoucher.code} size={200} level="M" />
        </div>
      )}
    </div>
  );
}
