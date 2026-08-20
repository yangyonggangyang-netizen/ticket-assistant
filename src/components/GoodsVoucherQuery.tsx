import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Search, RefreshCw, Camera, FolderOpen, Loader, Ticket, Copy, Check } from 'lucide-react';
import { useStore } from '../store/useStore';
import { api } from '../api/client';

// ===== 卖品券码查询（积分兑换的爆米花等） + 一键生成截图 =====
// 数据源：卖品订单（type=4，message 含商品明细 goodsName/amount/outNum）
// 取货码 = order.printNo；使用状态 = outNum>=amount 取货完成 / 否则未取货
// 查询结果缓存到 localStorage，点「刷新」才重新拉最近 30 天订单
type StateFilter = 'unused' | 'used' | 'all';

const CACHE_KEY = 'goods_voucher_cache';

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

// 订单是否在最近 N 天内（create_time 兼容时间戳/日期串）
function isRecent(order: any, days: number): boolean {
  const t = order.create_time ?? order.createTime ?? order.payTime ?? '';
  if (t === '' || t == null) return true; // 无时间信息不排除
  let ts = 0;
  if (typeof t === 'number' || (typeof t === 'string' && /^\d+$/.test(t))) {
    ts = Number(t);
  } else {
    ts = new Date(String(t).replace(' ', 'T')).getTime();
  }
  if (isNaN(ts) || ts <= 0) return true;
  return Date.now() - ts <= days * 24 * 3600 * 1000;
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
  // 使用状态：有出库信息的按 outNum>=amount 判断；没有出库信息时按订单状态兜底（5/6/7=已完成）
  const hasOutInfo = items.some((g: any) => (g.outNum ?? g.takeNum ?? g.out_num ?? g.takenNum) != null);
  const orderStatus = String(o.status ?? '');
  let taken: boolean;
  if (items.length > 0 && hasOutInfo) {
    taken = items.every((g: any) => {
      const amount = Number(g.amount ?? g.num ?? g.take_num ?? g.buyNum ?? 1);
      const outNum = Number(g.outNum ?? g.takeNum ?? g.out_num ?? g.takenNum ?? 0);
      return outNum >= amount;
    });
  } else {
    taken = items.length > 0 && ['5', '6', '7'].includes(orderStatus);
  }
  return { id: String(o.id ?? o.orderNo ?? o.order_no ?? ''), name, code, taken, account: accountName, items };
}

export default function GoodsVoucherQuery() {
  const { accounts } = useStore();
  const [stateFilter, setStateFilter] = useState<StateFilter>('unused');
  const [vouchers, setVouchers] = useState<SnackVoucher[]>([]); // 缓存全量（含已取货/未取货）
  const [savedAt, setSavedAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [snapping, setSnapping] = useState(false);
  const [snapMsg, setSnapMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [snapVoucher, setSnapVoucher] = useState<SnackVoucher | null>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);

  // 拉取所有账号最近 30 天卖品订单（最多 5 页/账号）
  const fetchRecent = async (): Promise<SnackVoucher[]> => {
    const out: SnackVoucher[] = [];
    for (const acc of accounts) {
      if (!acc.token || !acc.memberId) continue;
      try {
        for (let page = 1; page <= 5; page++) {
          const resp = await api.getOrderListAs(acc.token, acc.memberId, page, 200);
          if (!resp.success || !resp.result) break;
          const data = resp.result as any;
          const list: any[] = Array.isArray(data) ? data : data.records || [];
          if (list.length === 0) break;
          for (const o of list) {
            if (!isRecent(o, 30)) continue; // 只保留最近 30 天
            const v = parseSnackVoucher(o, acc.name);
            if (v) out.push(v);
          }
          if (list.length < 200) break;
        }
      } catch (e) {
        console.error('fetch snack orders failed:', acc.name, e);
      }
    }
    // 按账号+取货码去重
    const seen = new Set<string>();
    return out.filter((v) => {
      const k = `${v.account}-${v.code}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  // 刷新：重新拉最近 30 天并缓存
  const refresh = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    setSnapMsg('');
    try {
      const list = await fetchRecent();
      setVouchers(list);
      const now = new Date().toLocaleString('zh-CN');
      setSavedAt(now);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ list, savedAt: now }));
      setSnapMsg(`✅ 已刷新最近 30 天：共 ${list.length} 张卖品券（${list.filter((v) => !v.taken).length} 张未取货）`);
    } catch (e: any) {
      setError('刷新失败：' + (e.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  // 进入页面：直接读缓存显示（不重新查询）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cache = JSON.parse(raw);
        if (Array.isArray(cache.list)) {
          setVouchers(cache.list);
          setSavedAt(cache.savedAt || '');
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 筛选后的显示列表
  const displayList = useMemo(
    () => vouchers.filter((v) => (stateFilter === 'all' ? true : stateFilter === 'unused' ? !v.taken : v.taken)),
    [vouchers, stateFilter]
  );

  // 合成截图卡片（600x800 PNG）
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
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = 'bold 26px "Microsoft YaHei", "PingFang SC", sans-serif';
      ctx.fillText('客家影 · 卖品兑换券', 300, 62);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '14px "Microsoft YaHei", "PingFang SC", sans-serif';
      ctx.fillText('KEJIAYING 卖品部核销专用', 300, 92);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(36, 120, 528, 640, 22);
      ctx.fill();
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
      ctx.fillStyle = '#8c1f3c';
      ctx.font = 'bold 40px Consolas, "Courier New", monospace';
      ctx.fillText(v.code, 300, 332);
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 200, 372, 200, 200);
        ctx.fillStyle = '#9ca3af';
        ctx.font = '16px "Microsoft YaHei", "PingFang SC", sans-serif';
        ctx.fillText('扫一扫核销 / 输入取货码核销', 300, 606);
        ctx.fillStyle = '#6b7280';
        ctx.font = '18px "Microsoft YaHei", "PingFang SC", sans-serif';
        ctx.fillText('积分兑换卖品 · 出示此券至卖品部领取', 300, 668);
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

  // 触发截图：设置 snapVoucher → 渲染隐藏二维码 → 合成 → 保存 + 复制
  const handleSnap = (v: SnackVoucher) => {
    if (snapping) return;
    setSnapMsg('');
    setCopied(false);
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
        // 保存到本地
        const resp = await (window as any).electronAPI?.saveGoodsVoucherPng?.(cardUrl, fileName);
        // 一键复制到剪贴板
        const copyResp = await (window as any).electronAPI?.copyGoodsVoucherPng?.(cardUrl);
        if (resp?.success) {
          setSnapMsg(
            `✅ 已保存：${resp.path}\n${copyResp?.success ? '📋 已复制到剪贴板，直接粘贴发送即可' : '（复制失败，可手动复制文件）'}`
          );
          setCopied(!!copyResp?.success);
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
          卖品券码查询（{displayList.length} 张）
          {savedAt && <span className="text-[11px] text-gray-400 font-normal">· 数据截至 {savedAt}</span>}
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
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-pink-500 hover:bg-pink-600 text-white rounded-lg disabled:opacity-50"
          >
            {loading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            刷新全部账号（最近30天）
          </button>
        </div>
      </div>

      {/* 状态筛选（本地过滤，不重新查询） */}
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
        查询结果自动保存，下次打开直接显示；点「刷新」拉取最近 30 天订单。生成截图后自动保存并复制到剪贴板。
      </p>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700">{error}</div>}
      {snapMsg && <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 text-xs text-green-700 break-all whitespace-pre-line">{snapMsg}</div>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-400 py-10">
          <Loader className="w-4 h-4 animate-spin" />
          正在刷新最近 30 天卖品订单...
        </div>
      ) : displayList.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">
          <Search className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          {vouchers.length === 0 ? '暂无数据，点「刷新（最近30天）」拉取' : '当前筛选下没有卖品券'}
        </div>
      ) : (
        <div className="space-y-2 max-h-[50vh] overflow-auto pr-1">
          {displayList.map((v, i) => (
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
