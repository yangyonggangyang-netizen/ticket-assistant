import { useEffect, useState, useRef } from 'react';
import {
  Ticket,
  RefreshCw,
  X,
  Copy,
  MapPin,
  Camera,
  ChevronRight,
  ShoppingBag,
  Gift,
  CreditCard,
  Wallet,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useStore } from '../store/useStore';
import { api } from '../api/client';

interface OrderMsg {
  filmName?: string;
  goodsName?: string;
  setMealName?: string;
  cinemaName?: string;
  cinemaId?: string;
  num?: string;
  imgUrl?: string;
  hall?: string;
  startTime?: string;
  endTime?: string;
  language?: string;
  dimensional?: string;
  seatMessage?: string;
  benefit?: string;
  price?: number;
  jifen?: number;
}

const MERCHANT_CODE = '860753002';
const BASE_URL = `https://${MERCHANT_CODE}.api.yq30.com/jeecg-boot`;
const GIMG_URL = `${BASE_URL}/sys/common/view/`;

const statusMap: Record<string, { label: string; color: string }> = {
  '0': { label: '待支付', color: 'text-red-500' },
  '1': { label: '已支付', color: 'text-red-500' },
  '2': { label: '已出票', color: 'text-red-500' },
  '3': { label: '已取消', color: 'text-gray-400' },
  '4': { label: '已退款', color: 'text-gray-400' },
  '5': { label: '已完成', color: 'text-red-500' },
  '6': { label: '已出票', color: 'text-red-500' },
  '7': { label: '完成', color: 'text-red-500' },
  '8': { label: '已取消', color: 'text-gray-400' },
};

const payTypeMap: Record<string, string> = {
  '0': '余额',
  '1': '微信支付',
  '2': '会员卡支付',
  '3': '会员卡支付',
  '4': '支付宝',
};

const payStatusMap: Record<string, { label: string; color: string }> = {
  '0': { label: '待支付', color: 'text-red-500' },
  '1': { label: '支付中', color: 'text-orange-500' },
  '2': { label: '支付成功', color: 'text-green-500' },
  '3': { label: '支付成功', color: 'text-green-500' },
  '4': { label: '已退款', color: 'text-gray-400' },
  '5': { label: '已关闭', color: 'text-gray-400' },
};

function parseMessage(message: any): OrderMsg {
  if (!message) return {};
  if (typeof message === 'object') {
    // 卖品 message 有时是数组，取第一项作为摘要
    if (Array.isArray(message)) return (message[0] as OrderMsg) || {};
    return message as OrderMsg;
  }
  try {
    const parsed = JSON.parse(message);
    if (Array.isArray(parsed)) return (parsed[0] as OrderMsg) || {};
    return parsed as OrderMsg;
  } catch {
    return {};
  }
}

function formatDateTime(ts: any): string {
  if (!ts) return '-';
  const t = typeof ts === 'string' && /^\d+$/.test(ts) ? Number(ts) : ts;
  const date = new Date(typeof t === 'number' && String(t).length === 13 ? t : t);
  if (isNaN(date.getTime())) return String(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDateTimeShort(ts: any): string {
  if (!ts) return '-';
  const t = typeof ts === 'string' && /^\d+$/.test(ts) ? Number(ts) : ts;
  const date = new Date(typeof t === 'number' && String(t).length === 13 ? t : t);
  if (isNaN(date.getTime())) return String(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatMoney(v: any): string {
  return `¥${Number(v ?? 0).toFixed(2)}`;
}

function formatVerifyCode(code: string): string {
  const s = String(code || '').replace(/\s/g, '');
  if (s.length <= 5) return s;
  // 小程序取票码按每 3 位分组
  return s.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
}

function resolveImg(img: string | undefined): string {
  if (!img) return '';
  if (img.startsWith('http') || img.startsWith('https://')) return img;
  return GIMG_URL + img;
}

// Order type detection
type OrderKind = 'movie' | 'snack' | 'recharge' | 'other';

function detectOrderKind(order: any): OrderKind {
  const type = String(order.type || order.orderType || order.saleType || '').toLowerCase();
  if (type.includes('film') || type.includes('movie') || type.includes('ticket') || type === '1') return 'movie';
  if (type.includes('goods') || type.includes('snack') || type.includes('sale') || type === '4') return 'snack';
  if (type.includes('recharge') || type.includes('setmeal') || type.includes('stored') || type === '2') return 'recharge';

  const msg = parseMessage(order.message);
  if (msg.filmName) return 'movie';
  if (msg.goodsName || msg.setMealName) {
    return msg.setMealName ? 'recharge' : 'snack';
  }

  const details = order.details || order.orderDetails || [];
  if (details.length > 0) {
    const first = details[0];
    if (first.filmName || first.schedule_id || first.film_code) return 'movie';
    if (first.goodsName || first.goods_name || first.goodsId) return 'snack';
    if (first.setMealName || first.setMealId) return 'recharge';
  }

  if (order.setMealId || order.setMealName || order.setMeatName) return 'recharge';

  return 'other';
}

interface OrderDisplay {
  kind: OrderKind;
  title: string;
  subtitle: string;
  image: string;
  count: number;
  countUnit: string;
  amountText: string;
  statusText: string;
  statusColor: string;
}

function buildOrderDisplay(order: any, posterMap?: Map<string, string>): OrderDisplay {
  const kind = detectOrderKind(order);
  const msg = parseMessage(order.message);
  const status = statusMap[String(order.status)] || {
    label: order.statusDictText || `状态${order.status}`,
    color: 'text-gray-400',
  };

  const details = order.details || order.orderDetails || [];
  const firstDetail = details[0] || {};

  if (kind === 'movie') {
    const filmName = msg.filmName || order.filmName || firstDetail.filmName || '电影订单';
    const num = Number(msg.num ?? order.buyNum ?? firstDetail.buyNum ?? details.length ?? 1);
    let image = msg.imgUrl || order.imgUrl || firstDetail.imgUrl || '';
    // 若订单消息里没海报，用当前上映影片列表按片名匹配兜底
    if (!image && posterMap) {
      const fallback = posterMap.get(filmName);
      if (fallback) image = fallback;
    }
    const amount = Number(order.pay_amount ?? order.payAmount ?? order.totalAmount ?? msg.price ?? 0);
    return {
      kind,
      title: filmName,
      subtitle: `${num}张`,
      image,
      count: num,
      countUnit: '张',
      amountText: amount > 0 ? `${amount.toFixed(2)}元` : '-',
      statusText: status.label,
      statusColor: status.color,
    };
  }

  if (kind === 'snack') {
    const goodsName = msg.goodsName || order.goodsName || firstDetail.goodsName || firstDetail.goods_name || '卖品订单';
    const num = Number(msg.num ?? order.buyNum ?? firstDetail.amount ?? firstDetail.buyNum ?? 1);
    const image = msg.imgUrl || order.imgUrl || firstDetail.imgUrl || firstDetail.goodsImg || firstDetail.imgUrl_M || '';
    const jifen = Number(msg.jifen ?? order.jifen ?? firstDetail.jifen ?? 0);
    const payAmount = Number(order.pay_amount ?? order.payAmount ?? 0);
    const totalAmount = Number(order.total_amount ?? order.totalAmount ?? msg.price ?? 0);
    let amountText = '-';
    if (jifen > 0 && payAmount === 0) {
      amountText = `${jifen}积分`;
    } else if (payAmount > 0) {
      amountText = `${payAmount.toFixed(2)}元`;
    } else if (totalAmount > 0) {
      amountText = `${totalAmount.toFixed(2)}元`;
    }
    return {
      kind,
      title: goodsName,
      subtitle: `数量：${num}`,
      image,
      count: num,
      countUnit: '份',
      amountText,
      statusText: status.label,
      statusColor: status.color,
    };
  }

  if (kind === 'recharge') {
    const name = msg.setMealName || order.setMealName || order.setMeatName || firstDetail.setMealName || '储值套餐';
    const image = msg.imgUrl || order.imgUrl || firstDetail.imgUrl || '';
    const payAmount = Number(order.pay_amount ?? order.payAmount ?? order.total_amount ?? order.totalAmount ?? msg.price ?? 0);
    return {
      kind,
      title: name,
      subtitle: '余额充值',
      image,
      count: 1,
      countUnit: '笔',
      amountText: payAmount > 0 ? `${payAmount.toFixed(2)}元` : '-',
      statusText: status.label,
      statusColor: status.color,
    };
  }

  // other / fallback
  const title = order.title || msg.filmName || msg.goodsName || msg.setMealName || '订单';
  const amount = Number(order.pay_amount ?? order.payAmount ?? 0);
  return {
    kind,
    title,
    subtitle: '',
    image: msg.imgUrl || order.imgUrl || '',
    count: 1,
    countUnit: '',
    amountText: amount > 0 ? `${amount.toFixed(2)}元` : '-',
    statusText: status.label,
    statusColor: status.color,
  };
}

export default function OrderList() {
  const { accounts, activeAccountId, cinemas } = useStore();
  const account = accounts.find((a) => a.id === activeAccountId);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [posterMap, setPosterMap] = useState<Map<string, string>>(new Map());

  const loadMoviePosters = async (orderList: any[]) => {
    const cinemaIds = new Set<string>();
    orderList.forEach((o) => {
      const msg = parseMessage(o.message);
      const cid = msg.cinemaId || o.cinemaId || o.cinema_id;
      if (cid) cinemaIds.add(String(cid));
    });
    if (cinemaIds.size === 0) return;
    const map = new Map<string, string>();
    for (const cid of cinemaIds) {
      try {
        const resp = await api.getNowPlayMovies(cid, 1, 50);
        const records = (resp.result as any)?.records || [];
        records.forEach((m: any) => {
          if (m.name && (m.poster || m.pic)) {
            map.set(m.name, m.poster || m.pic);
          }
        });
      } catch (e) {
        // 忽略，让列表保持原样
      }
    }
    setPosterMap(map);
  };

  const loadOrders = async () => {
    if (!account) return;
    setLoading(true);
    try {
      const resp = await api.getOrderList(1, 50);
      if (resp.success && resp.result) {
        const data = resp.result;
        let list: any[] = [];
        if (Array.isArray(data)) {
          list = data;
        } else if (data.records) {
          list = data.records;
        }
        setOrders(list);
        loadMoviePosters(list);
      }
    } catch (e) {
      console.error('Failed to load orders:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadOrders();
  }, [activeAccountId]);

  if (!account) {
    return <div className="p-6 text-center text-gray-400 py-12">请先添加账号</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">订单列表</h2>
          <p className="text-sm text-gray-500">{account.name} · 共 {orders.length} 笔</p>
        </div>
        <button
          onClick={loadOrders}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {loading ? (
        <p className="text-center py-8 text-gray-400">加载中...</p>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Ticket className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>暂无订单</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order: any, i: number) => (
            <OrderListItem
              key={order.id || i}
              order={order}
              posterMap={posterMap}
              onClick={() => setSelectedOrder(order)}
            />
          ))}
        </div>
      )}

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          cinemas={cinemas}
          posterMap={posterMap}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </div>
  );
}

function OrderListItem({ order, posterMap, onClick }: { order: any; posterMap?: Map<string, string>; onClick: () => void }) {
  const display = buildOrderDisplay(order, posterMap);
  const Icon = display.kind === 'movie' ? Ticket : display.kind === 'snack' ? ShoppingBag : display.kind === 'recharge' ? CreditCard : Ticket;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border p-3 flex items-center gap-3 hover:shadow-sm cursor-pointer"
    >
      <div className="w-20 h-28 rounded-lg bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
        {display.image ? (
          <img src={resolveImg(display.image)} alt={display.title} className="w-full h-full object-cover" />
        ) : (
          <Icon className="w-8 h-8 text-gray-300" />
        )}
      </div>
      <div className="flex-1 min-w-0 py-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-base truncate pr-2">{display.title} {display.count > 0 ? `${display.count}${display.countUnit}` : ''}</p>
          <span className={`text-sm shrink-0 ${display.statusColor}`}>{display.statusText}</span>
        </div>
        <p className="text-sm text-gray-400 mt-2">
          购买时间:{formatDateTimeShort(order.create_time)}
        </p>
        <p className="text-sm font-medium text-gray-800 mt-4">
          总价：{display.amountText}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
    </div>
  );
}

function OrderDetailModal({
  order,
  cinemas,
  posterMap,
  onClose,
}: {
  order: any;
  cinemas: any[];
  posterMap?: Map<string, string>;
  onClose: () => void;
}) {
  const captureRef = useRef<HTMLDivElement>(null);
  const modalBodyRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    // 用 ticketMessage 接口获取更完整的订单+支付+取票码信息
    const fetchDetail = async () => {
      if (!order.id) return;
      setLoadingDetail(true);
      try {
        const resp = await api.ticketMessage(order.id);
        if (resp.success && resp.result) {
          const r = resp.result as any;
          const o = r.order || {};
          const p = r.paymentOrder || {};
          // 展平 ticketMessage 响应为 buildOrderDisplay 可用的格式
          const merged = {
            ...o,
            // 兼容下划线和驼峰命名
            pay_amount: o.payAmount ?? o.pay_amount,
            pay_type: p.payType ?? o.payType ?? o.pay_type,
            create_time: o.createTime ?? o.create_time,
            status: o.status,
            member_phone: o.memberPhone ?? o.member_phone,
            // 取票码/取货码：小程序实际显示 order.printNo，这里只做兼容下划线命名
            print_no: o.printNo ?? o.print_no,
            // 支付单号单独保存，不要和取票码混在一起
            paymentOrderId: p.id,
            // 取票码优先用 order.verifyCode 作为后备
            verify_code: o.verifyCode ?? o.verify_code ?? o.ticketCode ?? o.ticketNo ?? '',
            // 支付单状态
            payStatus: p.status,
            // ticketMessage 特有字段
            cardGoodsCode: r.cardGoodsCode,
            cinemaInfo: r.cinemaInfo,
            orderShopList: r.orderShopList,
            goodsList: r.goodsList,
            bisOrderStoredcard: r.bisOrderStoredcard,
            // 保留列表 order 的 message 作为后备
            message: o.message ?? order.message,
          };
          setDetail(merged);
        } else {
          // ticketMessage 失败时回退到 getSaleOrder
          const resp2 = await api.getSaleOrder(order.id);
          if (resp2.success && resp2.result) {
            setDetail(resp2.result);
          }
        }
      } catch (e) {
        console.error('Failed to load order detail:', e);
      }
      setLoadingDetail(false);
    };
    fetchDetail();
  }, [order.id]);

  const mergedOrder = detail || order;
  const display = buildOrderDisplay(mergedOrder, posterMap);
  const msg = parseMessage(mergedOrder.message);
  const kind = display.kind;

  const cinemaName = msg.cinemaName || mergedOrder.cinemaInfo?.cinemaName || mergedOrder.cinema_name || mergedOrder.cinemaName || '-';
  const cinema = cinemas.find((c: any) => c.id === (msg.cinemaId || mergedOrder.cinemaInfo?.id || mergedOrder.cinema_id || mergedOrder.cinemaId));
  const cinemaAddress = mergedOrder.cinemaInfo?.place || cinema?.place || '';

  // Movie fields
  const hallName = msg.hall || mergedOrder.hallName || mergedOrder.details?.[0]?.hall_name || '';
  const startTime = msg.startTime || mergedOrder.startTime || '';
  const endTime = msg.endTime || mergedOrder.endTime || '';
  const language = msg.language || mergedOrder.language || '';
  const dimensional = msg.dimensional === '2' ? 'IMAX' : msg.dimensional === '1' ? '2D' : '';
  const showTimeText = startTime && endTime
    ? `${startTime.split(' ')[0]} ${startTime.split(' ')[1]?.slice(0, 5)}~${endTime.split(' ')[1]?.slice(0, 5)}`
    : startTime;
  const seatText = msg.seatMessage
    ? msg.seatMessage.replace(/^.*?\s/, '')
    : mergedOrder.details?.map((d: any) => d.seat_name).filter(Boolean).join('，') || '';

  // Pickup / verify code
  // 电影票：小程序实际显示的是 order.printNo（完整取票码），所以优先用 printNo；
  // 卖品：同样优先 order.printNo；最后 fallback 到 verifyCode 等字段
  const cardCodes = mergedOrder.cardGoodsCode || [];
  const movieTicketCodes = kind === 'movie'
    ? Array.from(new Set(
        (Array.isArray(cardCodes) ? cardCodes : [])
          .map((c: any) => String(c.ticketCode || c.code || '').trim())
          .filter(Boolean)
      ))
    : [];
  const printNoCode = String(mergedOrder.print_no || mergedOrder.printNo || '').trim();
  const snackVerifyCode = kind === 'snack' && printNoCode
    ? printNoCode
    : '';
  const fallbackVerifyCode = String(
    mergedOrder.verify_code ||
    mergedOrder.verifyCode ||
    mergedOrder.ticketCode ||
    mergedOrder.ticketNo ||
    mergedOrder.ticketCodes ||
    mergedOrder.pickupCode ||
    ''
  );
  const displayTicketCodes = kind === 'movie'
    ? (movieTicketCodes.length > 0
        ? movieTicketCodes
        : printNoCode
        ? [printNoCode]
        : fallbackVerifyCode
        ? [fallbackVerifyCode]
        : [])
    : snackVerifyCode
    ? [snackVerifyCode]
    : printNoCode
    ? [printNoCode]
    : fallbackVerifyCode
    ? [fallbackVerifyCode]
    : [];

  // 卖品列表（从 ticketMessage 的 goodsList 解析）
  const goodsList: any[] = mergedOrder.goodsList || mergedOrder.orderShopList || [];
  const snackItems = kind === 'snack'
    ? (goodsList.length > 0
      ? goodsList
      : (() => {
          try {
            const arr = JSON.parse(mergedOrder.message || '[]');
            return Array.isArray(arr) ? arr : [arr];
          } catch {
            return [];
          }
        })())
    : [];
  // 使用状态：所有商品都已出完则"取货完成"，否则"未取货"
  const allGoodsTaken = snackItems.length > 0 && snackItems.every((g: any) => {
    const amount = Number(g.amount ?? g.num ?? 1);
    const outNum = Number(g.outNum ?? g.takeNum ?? 0);
    return outNum >= amount;
  });
  const snackStatusText = allGoodsTaken ? '取货完成' : '未取货';
  const snackStatusColor = allGoodsTaken ? 'text-gray-400' : 'text-orange-500';

  // 支付状态（从 paymentOrder.status 取，回退到订单状态）
  const payStatusInfo = payStatusMap[String(mergedOrder.payStatus)] ||
    { label: display.statusText, color: display.statusColor };

  const copyCode = (code: string) => {
    if (code) {
      navigator.clipboard.writeText(code);
      setToast('取货码已复制');
      setTimeout(() => setToast(''), 2000);
    }
  };

  const handleCapture = async () => {
    if (!captureRef.current) return;
    if (!window.electronAPI?.captureRegion) {
      setToast('截图功能仅在桌面应用中可用');
      setTimeout(() => setToast(''), 2000);
      return;
    }
    try {
      // 重置 modal 内部滚动，确保截图元素回到视口顶部
      if (modalBodyRef.current) {
        modalBodyRef.current.scrollTop = 0;
      }
      const el = captureRef.current;
      el.scrollIntoView({ block: 'start', behavior: 'instant' as any });
      await new Promise((resolve) => setTimeout(resolve, 120));
      const rect = el.getBoundingClientRect();
      const result = await window.electronAPI.captureRegion({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
      if (result.success) {
        setToast('截图已复制');
        setTimeout(() => setToast(''), 2000);
      } else {
        setToast(result.error || '截图失败');
        setTimeout(() => setToast(''), 2000);
      }
    } catch (e: any) {
      setToast(e.message || '截图失败');
      setTimeout(() => setToast(''), 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={modalBodyRef} className="bg-white rounded-lg max-w-md w-full max-h-[92vh] overflow-auto relative">
        {/* 截图区域：包含标题栏 + 取票卡片，不包含下面的订单/支付信息 */}
        <div ref={captureRef} className="bg-white">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
            <h3 className="font-bold text-base">{cinemaName}</h3>
            <div className="flex items-center gap-1">
              <button
                onClick={handleCapture}
                className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
                title="截图"
              >
                <Camera className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {loadingDetail && (
              <p className="text-center text-sm text-gray-400 py-2">加载订单详情...</p>
            )}

            {/* Order main info */}
            {kind === 'snack' ? (
              <div className="space-y-3">
                {snackItems.map((g: any, idx: number) => {
                  const amount = Number(g.amount ?? g.num ?? 1);
                  const outNum = Number(g.outNum ?? g.takeNum ?? 0);
                  const taken = outNum >= amount;
                  const img = g.goodsImageM || g.goodsImageSm || g.goodsImageXl || g.goodsImg || g.imgUrl || '';
                  const price = Number(g.orderPrice ?? g.price ?? 0);
                  return (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="w-16 h-16 rounded-lg bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                        {img ? (
                          <img src={resolveImg(img)} alt={g.goodsName || g.planName} className="w-full h-full object-cover" />
                        ) : (
                          <ShoppingBag className="w-6 h-6 text-gray-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-base">{g.goodsName || g.planName || display.title}</p>
                        <p className="text-sm text-pink-500 mt-0.5">{price > 0 ? `${price.toFixed(2)}元` : ''} × {amount}</p>
                      </div>
                      <span className={`text-sm shrink-0 ${taken ? 'text-gray-400' : 'text-orange-500'}`}>
                        {taken ? '取货完成' : '未取货'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-lg leading-tight">{display.title}</p>
                  {kind === 'movie' && (
                    <p className="text-sm text-pink-500 mt-1">
                      {showTimeText} {language && `（${language}${dimensional ? dimensional : ''}）`}
                    </p>
                  )}
                  {kind === 'movie' && hallName && <p className="text-sm text-gray-400 mt-1">{hallName}</p>}
                  {kind === 'movie' && seatText && <p className="text-xl font-medium mt-2">{seatText}</p>}
                  {kind === 'recharge' && (
                    <p className="text-sm text-gray-500 mt-1">余额充值</p>
                  )}
                </div>
                {display.image && (
                  <div className="w-20 h-28 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                    <img src={resolveImg(display.image)} alt={display.title} className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            )}

            {/* Verify code + QR */}
            {displayTicketCodes.length > 0 && (
              <div className="border-t border-b py-4 space-y-4">
                {displayTicketCodes.length > 1 && (
                  <p className="text-sm text-gray-500 text-center">{kind === 'movie' ? '取票码' : '取货码'}（共 {displayTicketCodes.length} 张）</p>
                )}
                {displayTicketCodes.length === 1 && (
                  <p className="text-sm text-gray-500 text-center">{kind === 'movie' ? '取票码' : '取货码'}</p>
                )}
                {displayTicketCodes.map((code, idx) => (
                  <div key={idx} className="text-center space-y-3">
                    {displayTicketCodes.length > 1 && (
                      <p className="text-xs text-gray-400">第 {idx + 1} 张</p>
                    )}
                    <div className="flex items-center justify-center gap-2">
                      <p className="text-2xl font-mono font-medium tracking-wider">
                        {formatVerifyCode(code)}
                      </p>
                      <button
                        onClick={() => copyCode(code)}
                        className="p-1.5 text-gray-400 hover:text-pink-500"
                        title="复制"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex justify-center">
                      <QRCodeSVG value={code} size={180} level="M" />
                    </div>
                  </div>
                ))}
                {kind === 'snack' && (
                  <p className={`text-xs ${snackStatusColor} text-center`}>{snackStatusText}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 以下内容不进入截图 */}
        <div className="px-4 pb-4 space-y-4">
          {/* Cinema address (only movie/snack has cinema) */}
          {(kind === 'movie' || kind === 'snack') && (
            <div className="border rounded-lg p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">{cinemaName}</p>
                {cinemaAddress && (
                  <p className="text-xs text-gray-400 mt-1">{cinemaAddress}</p>
                )}
              </div>
              <div className="shrink-0 text-pink-500">
                <MapPin className="w-6 h-6" />
              </div>
            </div>
          )}

          {/* Order info */}
          <div className="space-y-3">
            <p className="font-bold text-sm">订单信息</p>
            <div className="text-sm space-y-2">
              <InfoRow label="订单号" value={mergedOrder.id} />
              <InfoRow label="购买时间" value={formatDateTime(mergedOrder.create_time)} />
              <InfoRow label="手机号" value={mergedOrder.member_phone} />
              <div className="flex justify-between">
                <span className="text-gray-500">订单状态</span>
                <span className={display.statusColor}>{display.statusText}</span>
              </div>
            </div>
          </div>

          {/* Payment info */}
          <div className="space-y-3">
            <p className="font-bold text-sm">支付信息</p>
            <div className="text-sm space-y-2">
              <InfoRow label="支付单号" value={mergedOrder.paymentOrderId} />
              <InfoRow label="支付方式" value={payTypeMap[String(mergedOrder.pay_type)]} />
              <div className="flex justify-between">
                <span className="text-gray-500">支付状态</span>
                <span className={payStatusInfo.color}>{payStatusInfo.label}</span>
              </div>
            </div>
          </div>
        </div>

        {toast && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-sm px-4 py-2 rounded-full z-50">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: any }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-800">{String(value)}</span>
    </div>
  );
}
