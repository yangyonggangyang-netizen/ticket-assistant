import { useEffect, useState, useRef } from 'react';
import {
  ShoppingBag,
  CreditCard,
  Store,
  Gift,
  ChevronLeft,
  RefreshCw,
  Plus,
  Minus,
  ShoppingCart,
  AlertCircle,
  Wallet,
  Smartphone,
  CheckCircle,
  X,
  Loader,
  Copy,
  Building2,
  Camera,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useStore } from '../store/useStore';
import { api } from '../api/client';
import type { MallChannel, GoodsKind, Goods, PaymentResult, SetMeal } from '../types';

const MERCHANT_CODE = '860753002';
const BASE_URL = `https://${MERCHANT_CODE}.api.yq30.com/jeecg-boot`;
const GIMG_URL = `${BASE_URL}/sys/common/view/`;

function resolveImg(img: string | undefined): string {
  if (!img) return '';
  if (img.startsWith('http') || img.startsWith('https://')) return img;
  return GIMG_URL + img;
}

const CHANNEL_ICONS: Record<string, any> = {
  '1': ShoppingBag,
  '2': CreditCard,
  '4': Store,
  '8': Gift,
};

const CHANNEL_COLORS: Record<string, string> = {
  '1': 'from-pink-400 to-pink-500',
  '2': 'from-yellow-400 to-yellow-500',
  '4': 'from-purple-400 to-purple-500',
  '8': 'from-red-400 to-red-500',
};

// PayType: 1=积分 2=微信 3=余额
type PayType = '1' | '2' | '3';

interface DosingPlan {
  planId: number;
  planDetail: { goodsId: string; amount: number; breedId?: string }[];
}

interface CartItem {
  goodsId: string;
  goodsName: string;
  price: number;
  count: number;
  img: string;
  goods_breed?: string;
  breed_name?: string;
  dosing: DosingPlan[];
  isPoints: boolean;
}

export default function Mall() {
  const { accounts, activeAccountId, cinemas, selectedCinemaId, setSelectedCinema } = useStore();
  const account = accounts.find((a) => a.id === activeAccountId);
  const [view, setView] = useState<'home' | 'goods' | 'recharge'>('home');
  const [channels, setChannels] = useState<MallChannel[]>([]);
  const [currentChannel, setCurrentChannel] = useState<MallChannel | null>(null);
  const [kinds, setKinds] = useState<GoodsKind[]>([]);
  const [currentKindId, setCurrentKindId] = useState<string>('');
  const [goods, setGoods] = useState<Goods[]>([]);
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recharge state
  const [setMeals, setSetMeals] = useState<SetMeal[]>([]);

  // Checkout state
  const [showCheckout, setShowCheckout] = useState(false);
  const [payType, setPayType] = useState<PayType>('2');
  const [paying, setPaying] = useState(false);
  const [payResult, setPayResult] = useState<'idle' | 'waiting' | 'success' | 'failed'>('idle');
  const [qrContent, setQrContent] = useState<string>('');
  const [payMessage, setPayMessage] = useState<string>('');
  const [memberBalance, setMemberBalance] = useState<number | null>(null);
  const [memberViewAmount, setMemberViewAmount] = useState<number | null>(null);
  const [memberScore, setMemberScore] = useState<number | null>(null);
  const [orderId, setOrderId] = useState<string>('');
  const [pickupInfo, setPickupInfo] = useState<{ verifyCode: string; goodsName: string; cinemaName?: string; orderNo?: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 兑换成功卡片（一键截图用）
  const pickupCardRef = useRef<HTMLDivElement>(null);

  // 卖品优惠券/价格计算
  const [goodsVouchers, setGoodsVouchers] = useState<any[]>([]);
  const [selectedVoucherId, setSelectedVoucherId] = useState<string>('');
  const [calcResult, setCalcResult] = useState<{
    bisCash: number;        // 实付金额（分）
    totalSalePrice: number; // 总售价（分）
    discount: number;       // 会员折扣（分）
    concessions: number;    // 券抵扣（分）
  } | null>(null);
  const [qrExpireAt, setQrExpireAt] = useState<number>(0);
  const [qrCountdown, setQrCountdown] = useState<number>(0);
  const qrTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Spec selection modal
  const [specModal, setSpecModal] = useState<{
    goods: Goods;
    onConfirm: (dosing: DosingPlan[], breedId?: string, breedName?: string) => void;
  } | null>(null);

  const cinemaId = selectedCinemaId || cinemas[0]?.id || '';
  const isPointsChannel = currentChannel?.channel === '8';

  useEffect(() => {
    if (view === 'home' && cinemaId) {
      loadChannels();
    }
  }, [view, cinemaId]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (qrTimerRef.current) clearInterval(qrTimerRef.current);
    };
  }, []);

  const loadChannels = async () => {
    if (!cinemaId) return;
    setPageLoading(true);
    setError(null);
    try {
      const resp = await api.getMarketChannelList(cinemaId);
      if (resp.success && resp.result) {
        const list = Array.isArray(resp.result) ? resp.result : resp.result.records || [];
        setChannels(list);
      } else {
        setError(resp.message || '加载商城入口失败');
      }
    } catch (e: any) {
      setError(e.message || '网络错误');
    } finally {
      setPageLoading(false);
    }
  };

  const loadMemberAssets = async () => {
    try {
      const resp = await api.getMemberInfoById();
      if (resp.success && resp.result) {
        setMemberBalance(resp.result.balance ?? 0);
        setMemberViewAmount(resp.result.viewAmountBalance ?? 0);
        setMemberScore(resp.result.score ?? 0);
      }
    } catch {}
  };

  const enterChannel = async (channel: MallChannel) => {
    setCurrentChannel(channel);
    setView('goods');
    setKinds([]);
    setGoods([]);
    setCurrentKindId('');
    setCart({});
    setError(null);

    if (!cinemaId) return;

    try {
      if (channel.channel === '8') {
        const resp = await api.getGoodsKindList(cinemaId, 2);
        if (resp.success && resp.result) {
          const list = resp.result.return_data?.pageData || [];
          setKinds(list);
          if (list.length > 0) {
            setCurrentKindId(list[0].id || '');
            loadGoods(channel, list[0].id || '');
          } else {
            setError('暂无积分兑换分类');
          }
        } else {
          setError(resp.message || '加载分类失败');
        }
      } else if (channel.channel === '1') {
        const resp = await api.getMobileGoodsFrontKindList(cinemaId);
        if (resp.success && resp.result) {
          const list = Array.isArray(resp.result) ? resp.result : [];
          setKinds(list);
          if (list.length > 0) {
            setCurrentKindId(list[0].id || '');
            loadGoods(channel, list[0].id || '');
          } else {
            setError('暂无卖品分类');
          }
        } else {
          setError(resp.message || '加载分类失败');
        }
      }
    } catch (e: any) {
      setError(e.message || '加载分类失败');
    }
  };

  const loadGoods = async (channel: MallChannel, kindId: string) => {
    if (!cinemaId || !kindId) return;
    setPageLoading(true);
    setError(null);
    try {
      const resp = await api.getMobileGoodsList({
        cinema_id: cinemaId,
        kindId,
        pageNo: 1,
        pageSize: 50,
        marketChannelId: channel.id || '',
      });
      if (resp.success && resp.result) {
        setGoods(resp.result.records || []);
      } else {
        setError(resp.message || '加载商品失败');
      }
    } catch (e: any) {
      setError(e.message || '加载商品失败');
    } finally {
      setPageLoading(false);
    }
  };

  const handleKindChange = (kindId: string) => {
    setCurrentKindId(kindId);
    if (currentChannel) loadGoods(currentChannel, kindId);
  };

  // Build default dosing for a goods item (auto-select fixed/custom plans)
  const buildDefaultDosing = (g: Goods): DosingPlan[] => {
    const dosing: DosingPlan[] = [];
    const plan = (g as any).goodsPlan;
    if (!plan) return dosing;

    if (Array.isArray(plan.fixationPlan) && plan.fixationPlan.length > 0) {
      dosing.push({
        planId: 0,
        planDetail: plan.fixationPlan.map((p: any) => ({
          goodsId: p.subGoodsId || p.goodsId || '',
          amount: p.number || 1,
          breedId: p.goodsBreedId || p.breedId || '',
        })),
      });
    }

    if (Array.isArray(plan.customPlan) && plan.customPlan.length > 0) {
      plan.customPlan.forEach((cp: any) => {
        const selected = (cp.planDetail || []).filter((d: any) => d.def === 1 || d.def === '1');
        if (selected.length === 0 && cp.planDetail?.length > 0) {
          // fallback to first option if none selected
          selected.push(cp.planDetail[0]);
        }
        dosing.push({
          planId: cp.plan?.id || 0,
          planDetail: selected.map((d: any) => ({
            goodsId: d.goodsId || '',
            amount: d.number || 1,
            breedId: d.goodsBreedId || d.breedId || '',
          })),
        });
      });
    }

    return dosing;
  };

  const hasSpecs = (g: Goods): boolean => {
    const plan = (g as any).goodsPlan;
    if (!plan) return false;
    return (
      (Array.isArray(plan.fixationPlan) && plan.fixationPlan.length > 0) ||
      (Array.isArray(plan.customPlan) && plan.customPlan.length > 0)
    );
  };

  const updateCart = (g: Goods, delta: number, customDosing?: DosingPlan[]) => {
    const id = g.goodsId || g.id || '';
    if (!id) return;

    setCart((prev) => {
      const next = { ...prev };
      const existing = next[id];
      const currentCount = existing?.count || 0;
      const newCount = Math.max(0, currentCount + delta);

      if (newCount === 0) {
        delete next[id];
        return next;
      }

      const isPoints = isPointsChannel;
      const price = isPoints ? (g.jifen ?? 0) : (g.fanPrice ?? g.price ?? g.goodsPrice ?? g.memberPrice ?? 0);
      const dosing = customDosing ?? existing?.dosing ?? buildDefaultDosing(g);

      next[id] = {
        goodsId: id,
        goodsName: g.goodsName || g.name || '商品',
        price,
        count: newCount,
        // 小程序卖品/积分商品图片字段为 imgUrl_M（已是完整 URL）
        img: resolveImg(g.imgUrl_M || g.goodsImg || g.imgUrl || g.goodsImgUrl || ''),
        goods_breed: g.goods_breed || (g as any).breedId,
        breed_name: g.breed_name || (g as any).breedName,
        dosing,
        isPoints,
      };
      return next;
    });
  };

  const cartItems = Object.values(cart);
  const cartCount = cartItems.reduce((a, b) => a + b.count, 0);
  const cartTotal = cartItems.reduce((a, b) => a + b.price * b.count, 0);

  // ===== Recharge (储值充值) =====
  // 标准化不同接口返回的储值套餐字段，方便统一渲染
  const normalizeSetMeal = (raw: any): SetMeal => {
    if (!raw || typeof raw !== 'object') return raw;
    return {
      ...raw,
      id: String(raw.id || raw.mealId || raw.setMealId || raw.setMeatId || ''),
      setMealName:
        raw.setMealName || raw.setMeatName || raw.set_meal_name || raw.mealName || raw.name || raw.title || raw.setMealTitle || '',
      setMeatPrice: Number(
        raw.setMeatPrice ?? raw.set_meat_price ?? raw.setMealPrice ?? raw.mealPrice ?? raw.salePrice ?? raw.price ?? raw.amount ?? raw.rechargeAmount ?? 0
      ),
      set_meal_picture: raw.set_meal_picture || raw.setMealPicture || raw.mealPicture || raw.setMealImg || raw.imgUrl || raw.image || '',
    };
  };

  const loadSetMeals = async () => {
    if (!cinemaId) return;
    setPageLoading(true);
    setError(null);
    try {
      const memberId = account?.memberId || '';
      const [r1, r2, r3] = await Promise.allSettled([
        api.getSetMeatList(cinemaId, '3', memberId),
        api.getMemberStoreBalanceList(cinemaId, 99, memberId),
        api.getMobileChannelSetMealList(cinemaId, 1, 99, memberId),
      ]);

      const combined: SetMeal[] = [];
      const addList = (resp: any, source: string) => {
        if (!resp?.success || !resp?.result) return;
        const arr = Array.isArray(resp.result) ? resp.result : resp.result.records || [];
        console.log(`[SetMeal:${source}] sample:`, arr[0]);
        arr.forEach((item: any) => {
          const normalized = normalizeSetMeal(item);
          const id = normalized.id;
          if (id && combined.find((x) => x.id === id)) return; // 去重
          combined.push(normalized);
        });
      };

      addList(r1.status === 'fulfilled' ? r1.value : null, 'setMeatList');
      addList(r2.status === 'fulfilled' ? r2.value : null, 'memberStoreBalance');
      addList(r3.status === 'fulfilled' ? r3.value : null, 'mobileChannelSetMeal');

      // 按价格升序
      combined.sort((a, b) => (a.setMeatPrice || 0) - (b.setMeatPrice || 0));
      console.log('[SetMeal] combined:', combined);
      setSetMeals(combined);
    } catch (e: any) {
      setError(e.message || '网络错误');
    } finally {
      setPageLoading(false);
    }
  };

  const enterRecharge = () => {
    setView('recharge');
    setSetMeals([]);
    setError(null);
    loadSetMeals();
    loadMemberAssets();
  };

  // ===== Checkout / Payment =====
  const openCheckout = async () => {
    if (cartCount === 0) return;
    loadMemberAssets();
    // Default pay type: points channel -> points, otherwise wechat
    setPayType(isPointsChannel ? '1' : '2');
    setPayResult('idle');
    setQrContent('');
    setPayMessage('');
    setOrderId('');
    setPickupInfo(null);
    setSelectedVoucherId('');
    setCalcResult(null);
    setGoodsVouchers([]);
    setQrExpireAt(0);
    setQrCountdown(0);
    setShowCheckout(true);

    // 加载卖品可用优惠券
    if (!isPointsChannel) {
      try {
        const goodsList = cartItems.map((item) => ({ goodsId: item.goodsId, amount: item.count }));
        const resp = await api.getGoodsVoucherList({
          cinemaId,
          goods: JSON.stringify(goodsList),
          discount: 0,
          totalCash: cartTotal,
        });
        if (resp.success && Array.isArray(resp.result)) {
          const list = resp.result
            .filter((v: any) => {
              // 过滤不满足满减条件的券
              const valStr = v.voucher?.voucherValue;
              if (!valStr) return true;
              try {
                const val = JSON.parse(valStr);
                if (Array.isArray(val.delValue) && val.delValue.includes('满')) {
                  const min = Number(val.voucherValue4) || 0;
                  if (cartTotal < min) return false;
                }
              } catch {}
              return true;
            })
            .map((v: any) => ({
              ...v,
              memberVoucherId: String(v.id || v.memberVoucherId || ''),
              voucherName: v.name || v.voucherName || '优惠券',
              voucherPrice: Number(v.face || v.voucherPrice || 0),
              type: String(v.type || '1'),
            }));
          setGoodsVouchers(list);
        }
      } catch (e) {
        console.error('加载卖品优惠券失败:', e);
      }
    }
  };

  const closeCheckout = () => {
    setShowCheckout(false);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (qrTimerRef.current) {
      clearInterval(qrTimerRef.current);
      qrTimerRef.current = null;
    }
    setQrExpireAt(0);
    setQrCountdown(0);
  };

  const fetchPickupInfo = async (id: string, attempts = 0) => {
    try {
      const resp = await api.ticketMessage(id);
      if (resp.success && resp.result) {
        const o = resp.result as any;
        const ord = o.order || {};
        // 券码优先级：完整码优先（电影票 verify_code / 卖品 print_no / 小票号），takeCode(后4位)仅兜底
        // 实测：爆米花 print_no='3704478436'（完整券码），takeCode='8436'（只是后4位，不是完整券码）
        let code = String(
          o.pickupCode ||
          o.verify_code ||
          o.printNo ||
          o.print_no ||
          ord.verifyCode ||
          ord.printNo ||
          ord.print_no ||
          o.ticketCode ||
          o.takeCode ||
          ''
        );
        const cards = o.cardGoodsCode || o.ticketCodes || [];
        if (!code && Array.isArray(cards) && cards.length > 0) {
          code = String(cards.map((c: any) => c.ticketCode || c.code || c).filter(Boolean).join(','));
        }
        // 套餐名称
        const goodsName =
          o.goodsName ||
          o.order?.goodsName ||
          (o.goodsList && o.goodsList[0]?.goodsName) ||
          (o.orderShopList && o.orderShopList[0]?.goodsName) ||
          '';
        // 影城名称
        const cinemaName =
          o.cinemaInfo?.cinemaName ||
          o.cinemaName ||
          o.order?.cinemaName ||
          o.cinemaInfo?.name ||
          '';
        // 订单号
        const orderNo = String(o.order?.orderNo || o.orderNo || o.order?.id || o.orderId || id || '');
        if (code) {
          setPickupInfo({ verifyCode: code, goodsName, cinemaName, orderNo });
        } else if (attempts < 3) {
          setTimeout(() => fetchPickupInfo(id, attempts + 1), 2000);
        }
      }
    } catch (e) {
      console.error('Failed to fetch pickup info:', e);
    }
  };

  // 一键截图兑换成功卡片（影城/套餐/券码/二维码）
  const capturePickupCard = async () => {
    if (!window.electronAPI?.captureRegion) {
      setPayMessage('截图功能仅在桌面应用中可用');
      setTimeout(() => setPayMessage('支付成功！'), 2000);
      return;
    }
    if (!pickupCardRef.current) return;
    try {
      const el = pickupCardRef.current;
      el.scrollIntoView({ block: 'center', behavior: 'instant' as any });
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const rect = el.getBoundingClientRect();
      const result = await window.electronAPI.captureRegion({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
      setPayMessage(result.success ? '截图已复制，可直接粘贴发送' : result.error || '截图失败');
      setTimeout(() => setPayMessage('支付成功！'), 2500);
    } catch (e: any) {
      setPayMessage('截图失败：' + e.message);
      setTimeout(() => setPayMessage('支付成功！'), 2500);
    }
  };

  const calcGoodsPrice = async (voucherId?: string) => {
    try {
      const goodsArr = cartItems.map((item) => ({
        goodsId: item.goodsId,
        dosing: item.dosing,
        amount: item.count,
        goods_breed: item.goods_breed || '',
        breed_name: item.breed_name || '',
      }));
      const payload: Record<string, any> = {
        cinemaId,
        goods: JSON.stringify(goodsArr),
        payType: '2',
        channelId: 1,
        couponList: voucherId && voucherId !== 'none' ? JSON.stringify([voucherId]) : '[]',
        equityCardList: '[]',
      };
      if (currentChannel?.id) {
        payload.marketChannelID = currentChannel.id;
      }
      const resp = await api.goodsCalc(payload);
      if (resp.success && resp.result) {
        const r = resp.result as any;
        setCalcResult({
          bisCash: Number(r.bisCash ?? cartTotal * 100),
          totalSalePrice: Number(r.totalSalePrice ?? cartTotal * 100),
          discount: Number(r.discount?.cash ?? 0),
          concessions: Number(r.concessions?.cash ?? 0),
        });
      }
    } catch (e) {
      console.error('goodsCalc failed:', e);
    }
  };

  const buildOrderParams = (pt: PayType) => {
    const goodsArr = cartItems.map((item) => ({
      goodsId: item.goodsId,
      dosing: item.dosing,
      amount: item.count,
      goods_breed: item.goods_breed || '',
      breed_name: item.breed_name || '',
    }));
    // 后端 createSaleOrderV2 的 payCash 期望以"分"为单位
    const payCash = calcResult?.bisCash ?? Math.round(cartTotal * 100);
    const params: Record<string, any> = {
      cinemaId,
      goods: goodsArr,
      payType: pt,
      payCash,
      discount: calcResult?.discount ?? 0,
      tel: account?.phone || '',
      channelId: 1,
      ducprice: calcResult?.concessions ?? 0,
      marketChannelID: currentChannel?.id || '',
    };
    // 优惠券在创建订单阶段传递
    if (selectedVoucherId && selectedVoucherId !== 'none') {
      params.couponKind = 1;
      params.couponList = [selectedVoucherId];
    }
    return params;
  };

  const startPolling = (paymentOrderId: string, createdOrderId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let attempts = 0;
    const maxAttempts = 60;

    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        setPayResult('failed');
        setPayMessage('支付超时，请重试');
        return;
      }

      try {
        const resp = await api.queryWechatOrder(paymentOrderId);
        if (resp.success && resp.result) {
          const code = resp.result.code;
          if (code === '0') {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            try {
              await api.completePayOrder(resp.result);
            } catch {}
            handlePaySuccess(createdOrderId);
          }
          // code === '2' = processing, keep polling
        }
      } catch {
        // keep polling
      }
    }, 2000);
  };

  const handlePaySuccess = (id?: string) => {
    setPayResult('success');
    setPayMessage('支付成功！');
    setCart({});
    loadMemberAssets();
    if (id) fetchPickupInfo(id);
  };

  const handlePayError = (msg: string) => {
    setPayResult('failed');
    setPayMessage(msg || '支付失败');
  };

  // 启动二维码有效期倒计时（微信支付 prepay_id 一般 5 分钟有效）
  const startQrCountdown = () => {
    if (qrTimerRef.current) clearInterval(qrTimerRef.current);
    const expireAt = Date.now() + 5 * 60 * 1000;
    setQrExpireAt(expireAt);
    setQrCountdown(300);
    qrTimerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.round((expireAt - Date.now()) / 1000));
      setQrCountdown(remaining);
      if (remaining <= 0 && qrTimerRef.current) {
        clearInterval(qrTimerRef.current);
        qrTimerRef.current = null;
      }
    }, 1000);
  };

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const doPay = async () => {
    if (paying) return;

    // 非积分渠道强制微信扫码支付
    const effectivePayType = isPointsChannel ? payType : '2';

    // Validate points balance
    if (isPointsChannel && effectivePayType === '1' && memberScore !== null && memberScore < cartTotal) {
      setPayResult('failed');
      setPayMessage(`积分不足（当前 ${memberScore} 积分，需要 ${cartTotal} 积分）`);
      return;
    }

    setPaying(true);
    setPayResult('idle');
    setPayMessage('');
    setQrContent('');
    setQrExpireAt(0);
    setQrCountdown(0);

    try {
      const orderParams = buildOrderParams(effectivePayType as PayType);
      const orderResp = await api.createSaleOrderV2(orderParams);
      if (!orderResp.success || !orderResp.result) {
        handlePayError(orderResp.message || '创建订单失败');
        setPaying(false);
        return;
      }

      const createdOrderId = (orderResp.result as any).id;
      setOrderId(createdOrderId);
      const payAmount = (orderResp.result as any).payAmount ?? (calcResult?.bisCash ? calcResult.bisCash / 100 : cartTotal);

      const payResp = await api.payV3({
        orders: [
          {
            payAmount,
            type: 4,
            orderId: createdOrderId,
            payType: effectivePayType,
          },
        ],
        payType: effectivePayType,
        phone: account?.phone || '',
        totalPayAmount: payAmount,
        channel: 1,
      });

      if (!payResp.success || !payResp.result) {
        handlePayError(payResp.message || '创建支付订单失败');
        setPaying(false);
        return;
      }

      const result = payResp.result;
      const paymentOrderId = result.paymentOrder?.id || '';
      const paymentStatus = result.paymentOrder?.status;

      if (effectivePayType === '1') {
        // Points payment
        if (paymentStatus === '3') {
          handlePaySuccess(createdOrderId);
        } else {
          handlePayError((payResp.message || '支付失败') + '（状态:' + paymentStatus + '）');
        }
      } else if (effectivePayType === '2') {
        if (paymentStatus === '3') {
          handlePaySuccess();
        } else {
          const pkg = result.package || '';
          const prepayId = pkg.replace('prepay_id=', '');
          if (!prepayId) {
            handlePayError('未获取到微信支付参数');
            setPaying(false);
            return;
          }
          const qrUrl = `weixin://wxpay/bizpayurl?pr=${prepayId}`;
          setQrContent(qrUrl);
          setPayResult('waiting');
          setPayMessage('请用微信扫码支付');
          startQrCountdown();
          // 通知服务端进入等待支付状态，有助于部分场景下链接保持有效
          if (paymentOrderId) {
            api.notifyWaitState(paymentOrderId).catch(() => {});
            startPolling(paymentOrderId, createdOrderId);
          } else {
            handlePayError('未获取到支付订单ID');
          }
        }
      }
    } catch (e: any) {
      handlePayError(e.message || '支付失败');
    } finally {
      setPaying(false);
    }
  };

  const doRecharge = async (meal: SetMeal, pt: PayType) => {
    setPaying(true);
    setPayResult('idle');
    setPayMessage('');
    setQrContent('');

    try {
      const memberId = account?.memberId || '';
      const payAmount = meal.setMeatPrice || Number(meal.salePrice ?? meal.price ?? meal.amount ?? meal.rechargeAmount ?? 0);

      // 判断套餐来源：memberStoreBalance/list 返回的套餐没有 set_meal_code/set_meal_type，需用 superTrans
      const isMemberStoreBalance =
        !meal.set_meal_code && !meal.set_meal_type && !meal.setMealCode && (meal.amount != null || meal.rechargeAmount != null);

      let orderId = '';
      if (isMemberStoreBalance) {
        // 会员储值余额续充：transType=22
        const transResp = await api.superTrans({
          transType: 22,
          cinemaId,
          memberId,
          channel: 1,
          payType: pt,
          orderAmount: payAmount,
          payAmount: payAmount,
        });
        if (!transResp.success || !transResp.result) {
          handlePayError(transResp.message || '创建储值订单失败');
          setPaying(false);
          return;
        }
        orderId = transResp.result.orderId || transResp.result.id || '';
      } else {
        const orderResp = await api.saveOrderV2({
          memberId,
          setMealId: meal.id,
          buyChannel: 1,
          phone: account?.phone || '',
          cinemaId,
        });

        if (!orderResp.success || !orderResp.result) {
          handlePayError(orderResp.message || '创建订单失败');
          setPaying(false);
          return;
        }
        orderId = orderResp.result.orderId;
      }

      if (!orderId) {
        handlePayError('未获取到储值订单ID');
        setPaying(false);
        return;
      }
      setOrderId(orderId);

      const payResp = await api.payV2({
        memberId,
        orders: [
          {
            payAmount,
            orderId,
            payType: pt,
            phone: account?.phone || '',
            type: 2,
          },
        ],
      });

      if (!payResp.success || !payResp.result) {
        handlePayError(payResp.message || '创建支付订单失败');
        setPaying(false);
        return;
      }

      const result = payResp.result;
      const paymentOrderId = result.paymentOrder?.id || result.payOrderId || '';
      const paymentStatus = result.paymentOrder?.status;

      if (pt === '3') {
        if (paymentStatus === '3') {
          setPayResult('success');
          setPayMessage('充值成功！');
          loadMemberAssets();
        } else {
          handlePayError('余额支付失败：' + (payResp.message || '未知错误'));
        }
      } else if (pt === '2') {
        if (paymentStatus === '3') {
          setPayResult('success');
          setPayMessage('充值成功！');
          loadMemberAssets();
        } else {
          const pkg = result.package || '';
          const prepayId = pkg.replace('prepay_id=', '');
          if (!prepayId) {
            handlePayError('未获取到微信支付参数');
            setPaying(false);
            return;
          }
          const qrUrl = `weixin://wxpay/bizpayurl?pr=${prepayId}`;
          setQrContent(qrUrl);
          setPayResult('waiting');
          setPayMessage('请用微信扫码支付');
          if (paymentOrderId) {
            startPolling(paymentOrderId, orderId);
          } else {
            handlePayError('未获取到支付订单ID');
          }
        }
      }
    } catch (e: any) {
      handlePayError(e.message || '充值失败');
    } finally {
      setPaying(false);
    }
  };

  if (!account) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500">请先添加账号</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {view !== 'home' && (
            <button
              onClick={() => {
                setView('home');
                setCart({});
              }}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
          )}
          <h2 className="text-lg font-bold">
            {view === 'home' ? '商城' : view === 'recharge' ? '余额充值' : currentChannel?.channelName || '商品列表'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {(view === 'home' || view === 'recharge') && (
            <button
              onClick={view === 'home' ? loadChannels : loadSetMeals}
              disabled={pageLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className={`w-4 h-4 ${pageLoading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          )}
          {view === 'goods' && (
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <ShoppingCart className="w-4 h-4" />
              <span>{cartCount}</span>
            </div>
          )}
        </div>
      </div>

      {/* Cinema selector */}
      <div className="bg-white border-b px-4 py-2 flex items-center gap-2 shrink-0">
        <span className="text-xs text-gray-500">当前影院：</span>
        <select
          value={cinemaId}
          onChange={(e) => setSelectedCinema(e.target.value)}
          className="text-sm border rounded-lg px-2 py-1 bg-white focus:border-pink-400 outline-none"
        >
          {cinemas.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.cinemaName}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* ===== Home View ===== */}
        {view === 'home' && (
          <div>
            {pageLoading && channels.length === 0 ? (
              <p className="text-center text-gray-400 py-12">加载中...</p>
            ) : channels.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <ShoppingBag className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>暂无商城入口</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 max-w-2xl mx-auto mb-6">
                  {channels.map((channel) => {
                    const Icon = CHANNEL_ICONS[channel.channel || ''] || ShoppingBag;
                    const gradient = CHANNEL_COLORS[channel.channel || ''] || 'from-gray-400 to-gray-500';
                    const supported = channel.channel === '1' || channel.channel === '8';
                    return (
                      <button
                        key={channel.id}
                        onClick={() => supported && enterChannel(channel)}
                        disabled={!supported}
                        className={`relative overflow-hidden rounded-2xl p-6 text-left transition-transform hover:scale-[1.02] ${
                          supported ? 'hover:shadow-lg' : 'opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-90`} />
                        <div className="relative z-10">
                          <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center mb-4">
                            <Icon className="w-7 h-7 text-white" />
                          </div>
                          <p className="text-white font-bold text-lg">{channel.channelName}</p>
                          {!supported && <p className="text-white/80 text-xs mt-1">暂未接入</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Recharge entry */}
                <div className="max-w-2xl mx-auto">
                  <button
                    onClick={enterRecharge}
                    className="w-full bg-white rounded-xl border p-4 flex items-center gap-3 hover:shadow-md transition-shadow"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-green-500 flex items-center justify-center">
                      <Wallet className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-bold text-gray-800">余额充值</p>
                      <p className="text-xs text-gray-400">储值套餐充值，微信/余额支付</p>
                    </div>
                    <ChevronLeft className="w-5 h-5 text-gray-300 rotate-180" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ===== Recharge View ===== */}
        {view === 'recharge' && (
          <div className="max-w-2xl mx-auto">
            {memberBalance !== null && (
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 mb-4 text-white">
                <p className="text-sm opacity-80">当前余额</p>
                <p className="text-3xl font-bold mt-1">
                  ¥{(memberBalance + (memberViewAmount ?? 0)).toFixed(2)}
                </p>
                {memberViewAmount ? (
                  <p className="text-xs opacity-70 mt-1">
                    普通余额 ¥{memberBalance.toFixed(2)} + 观影金 ¥{memberViewAmount.toFixed(2)}
                  </p>
                ) : null}
              </div>
            )}

            {pageLoading && setMeals.length === 0 ? (
              <p className="text-center text-gray-400 py-12">加载套餐中...</p>
            ) : setMeals.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Wallet className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>暂无储值套餐</p>
              </div>
            ) : (
              <div className="space-y-3">
                {setMeals.map((meal, i) => {
                  // 兼容多种可能的字段命名
                  const price = Number(
                    meal.setMeatPrice ?? meal.setMealPrice ?? meal.salePrice ?? meal.price ?? meal.amount ?? meal.rechargeAmount ?? 0
                  );
                  const mealImg = resolveImg(
                    meal.set_meal_picture || meal.setMealPicture || meal.setMealImg || meal.imgUrl || meal.image || ''
                  );
                  const mealName =
                    meal.setMealName || meal.setMeatName || meal.name || meal.title || meal.setMealTitle || '储值套餐';
                  return (
                    <RechargeCard
                      key={meal.id || i}
                      meal={meal}
                      name={mealName}
                      img={mealImg}
                      price={price}
                      memberBalance={(memberBalance ?? 0) + (memberViewAmount ?? 0)}
                      paying={paying}
                      payResult={payResult}
                      qrContent={qrContent}
                      payMessage={payMessage}
                      orderId={orderId}
                      onPay={(pt) => doRecharge(meal, pt)}
                      onClose={closeCheckout}
                      onReset={() => {
                        setPayResult('idle');
                        setQrContent('');
                        setPayMessage('');
                        setOrderId('');
                        if (pollRef.current) {
                          clearInterval(pollRef.current);
                          pollRef.current = null;
                        }
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== Goods View ===== */}
        {view === 'goods' && currentChannel && (
          <div className="flex gap-4 h-full">
            {/* Left kind sidebar */}
            <div className="w-32 shrink-0 space-y-1">
              {kinds.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">暂无分类</p>
              ) : (
                kinds.map((kind) => {
                  const id = kind.id || '';
                  const name = kind.kindName || kind.name || '分类';
                  return (
                    <button
                      key={id}
                      onClick={() => handleKindChange(id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        id === currentKindId
                          ? 'bg-pink-500 text-white font-medium'
                          : 'bg-white text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {name}
                    </button>
                  );
                })
              )}
            </div>

            {/* Right goods list */}
            <div className="flex-1 min-w-0 pb-20">
              {pageLoading && goods.length === 0 ? (
                <p className="text-center text-gray-400 py-12">加载商品中...</p>
              ) : goods.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <ShoppingBag className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>暂无商品</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {goods.map((g, i) => {
                    const id = g.goodsId || g.id || String(i);
                    const name = g.goodsName || g.name || '商品';
                    const img = resolveImg(g.imgUrl_M || g.goodsImg || g.imgUrl || g.goodsImgUrl || '');
                    const desc = g.detail || g.goodsDetail || '';
                    const price = isPointsChannel ? g.jifen : (g.fanPrice ?? g.price ?? g.goodsPrice ?? g.memberPrice ?? 0);
                    const unit = isPointsChannel ? '积分' : '元';
                    const count = cart[id]?.count || 0;
                    const showSpecBtn = hasSpecs(g);

                    return (
                      <div
                        key={id}
                        className="bg-white rounded-xl border p-3 flex items-center gap-3 hover:shadow-sm transition-shadow"
                      >
                        <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                          {img ? (
                            <img src={img} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <ShoppingBag className="w-8 h-8 text-gray-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{name}</p>
                          {desc && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{desc}</p>}
                          <p className={`text-sm font-bold mt-2 ${isPointsChannel ? 'text-orange-500' : 'text-red-500'}`}>
                            {isPointsChannel ? '' : '¥'}
                            {price ?? '--'}
                            <span className="text-xs font-normal ml-0.5">{unit}</span>
                          </p>
                          {showSpecBtn && (
                            <button
                              onClick={() => {
                                setSpecModal({
                                  goods: g,
                                  onConfirm: (dosing, breedId, breedName) => {
                                    updateCart(g, 1, dosing);
                                    setCart((prev) => {
                                      const next = { ...prev };
                                      if (next[id]) {
                                        next[id] = { ...next[id], goods_breed: breedId, breed_name: breedName };
                                      }
                                      return next;
                                    });
                                  },
                                });
                              }}
                              className="mt-1 text-xs text-pink-500 border border-pink-200 px-2 py-0.5 rounded hover:bg-pink-50"
                            >
                              选规格
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {count > 0 && (
                            <>
                              <button
                                onClick={() => updateCart(g, -1)}
                                className="w-7 h-7 rounded-full border flex items-center justify-center hover:bg-gray-50"
                              >
                                <Minus className="w-3.5 h-3.5 text-gray-600" />
                              </button>
                              <span className="text-sm w-4 text-center">{count}</span>
                            </>
                          )}
                          <button
                            onClick={() => {
                              if (showSpecBtn) {
                                setSpecModal({
                                  goods: g,
                                  onConfirm: (dosing, breedId, breedName) => {
                                    updateCart(g, 1, dosing);
                                    setCart((prev) => {
                                      const next = { ...prev };
                                      if (next[id]) {
                                        next[id] = { ...next[id], goods_breed: breedId, breed_name: breedName };
                                      }
                                      return next;
                                    });
                                  },
                                });
                              } else {
                                updateCart(g, 1);
                              }
                            }}
                            className="w-7 h-7 rounded-full bg-pink-500 flex items-center justify-center hover:bg-pink-600"
                          >
                            <Plus className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===== Cart bottom bar ===== */}
      {view === 'goods' && cartCount > 0 && (
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t shadow-lg px-4 py-3 flex items-center justify-between z-20">
          <div className="flex items-center gap-3">
            <div className="relative">
              <ShoppingCart className="w-8 h-8 text-pink-500" />
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-400">合计</p>
              <p className="text-lg font-bold text-red-500">
                {isPointsChannel ? `${cartTotal} 积分` : `¥${cartTotal.toFixed(2)}`}
              </p>
            </div>
          </div>
          <button
            onClick={openCheckout}
            className="px-8 py-2.5 rounded-xl font-bold text-white bg-pink-500 hover:bg-pink-600 transition-colors"
          >
            去结算
          </button>
        </div>
      )}

      {/* ===== Spec Selection Modal ===== */}
      {specModal && (
        <SpecModal
          goods={specModal.goods}
          isPoints={isPointsChannel}
          onClose={() => setSpecModal(null)}
          onConfirm={(dosing, breedId, breedName) => {
            specModal.onConfirm(dosing, breedId, breedName);
            setSpecModal(null);
          }}
        />
      )}

      {/* ===== Checkout Modal ===== */}
      {showCheckout && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeCheckout}>
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-lg">确认支付</h3>
              <button onClick={closeCheckout} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                {cartItems.map((item) => (
                  <div key={item.goodsId} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 truncate flex-1">
                      {item.goodsName} × {item.count}
                    </span>
                    <span className="text-gray-800 ml-2">
                      {item.isPoints ? `${item.price * item.count} 积分` : `¥${(item.price * item.count).toFixed(2)}`}
                    </span>
                  </div>
                ))}
                <div className="border-t pt-2 flex items-center justify-between font-bold">
                  <span>合计</span>
                  <span className="text-red-500">
                    {isPointsChannel ? `${cartTotal} 积分` : `¥${cartTotal.toFixed(2)}`}
                  </span>
                </div>
              </div>

              {payResult === 'idle' && (
                <>
                  {/* 优惠券选择（仅现金卖品） */}
                  {!isPointsChannel && goodsVouchers.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2 text-gray-700">选择优惠券</p>
                      <div className="space-y-2 max-h-40 overflow-auto">
                        <button
                          onClick={() => {
                            setSelectedVoucherId('none');
                            setCalcResult(null);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors ${
                            selectedVoucherId === '' || selectedVoucherId === 'none'
                              ? 'border-pink-500 bg-pink-50 text-pink-700'
                              : 'border-gray-200 text-gray-700'
                          }`}
                        >
                          <span>不使用优惠券</span>
                          <span className="text-xs text-gray-400">-¥0.00</span>
                        </button>
                        {goodsVouchers.map((v) => (
                          <button
                            key={v.memberVoucherId}
                            onClick={() => {
                              setSelectedVoucherId(v.memberVoucherId);
                              calcGoodsPrice(v.memberVoucherId);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors ${
                              selectedVoucherId === v.memberVoucherId
                                ? 'border-pink-500 bg-pink-50 text-pink-700'
                                : 'border-gray-200 text-gray-700'
                            }`}
                          >
                            <div className="text-left">
                              <p className="font-medium">{v.voucherName}</p>
                              <p className="text-[10px] text-gray-400">
                                有效期至 {v.validEnd?.split(' ')[0] || '未知'}
                              </p>
                            </div>
                            <span className="text-sm font-bold text-pink-500">
                              -¥{v.voucherPrice.toFixed(2)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 价格明细 */}
                  {!isPointsChannel && (
                    <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-sm">
                      <div className="flex items-center justify-between text-gray-600">
                        <span>商品小计</span>
                        <span>¥{cartTotal.toFixed(2)}</span>
                      </div>
                      {calcResult && calcResult.discount > 0 && (
                        <div className="flex items-center justify-between text-gray-600">
                          <span>会员折扣</span>
                          <span className="text-green-500">-¥{(calcResult.discount / 100).toFixed(2)}</span>
                        </div>
                      )}
                      {calcResult && calcResult.concessions > 0 && (
                        <div className="flex items-center justify-between text-gray-600">
                          <span>优惠券抵扣</span>
                          <span className="text-pink-500">-¥{(calcResult.concessions / 100).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="border-t pt-1.5 flex items-center justify-between font-bold">
                        <span>应付金额</span>
                        <span className="text-red-500">
                          ¥{(calcResult?.bisCash ? calcResult.bisCash / 100 : cartTotal).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-sm font-medium mb-2 text-gray-700">选择支付方式</p>
                    <div className={`grid gap-3 ${isPointsChannel ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {isPointsChannel && (
                        <button
                          onClick={() => setPayType('1')}
                          className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-colors ${
                            payType === '1' ? 'border-orange-500 bg-orange-50' : 'border-gray-200'
                          }`}
                        >
                          <Gift className="w-5 h-5 text-orange-500" />
                          <span className="text-sm font-medium">积分</span>
                          {memberScore !== null && <span className="text-[10px] text-gray-400">{memberScore}</span>}
                        </button>
                      )}
                      <button
                        onClick={() => setPayType('2')}
                        className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-colors ${
                          payType === '2' ? 'border-green-500 bg-green-50' : 'border-gray-200'
                        }`}
                      >
                        <Smartphone className="w-5 h-5 text-green-500" />
                        <span className="text-sm font-medium">微信扫码</span>
                      </button>
                    </div>
                  </div>

                  {isPointsChannel && payType === '1' && memberScore !== null && memberScore < cartTotal && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-600">
                      积分不足（当前 {memberScore} 积分，需要 {cartTotal} 积分）
                    </div>
                  )}

                  <button
                    onClick={doPay}
                    disabled={paying || (isPointsChannel && payType === '1' && memberScore !== null && memberScore < cartTotal)}
                    className={`w-full py-3 rounded-xl font-bold text-white transition-colors ${
                      paying || (isPointsChannel && payType === '1' && memberScore !== null && memberScore < cartTotal)
                        ? 'bg-gray-300 cursor-not-allowed'
                        : payType === '1'
                        ? 'bg-orange-500 hover:bg-orange-600'
                        : 'bg-green-500 hover:bg-green-600'
                    }`}
                  >
                    {paying ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader className="w-5 h-5 animate-spin" />
                        处理中...
                      </span>
                    ) : isPointsChannel ? (
                      payType === '1' ? '积分支付' : '微信扫码支付'
                    ) : (
                      '微信扫码支付'
                    )}
                  </button>
                </>
              )}

              {payResult === 'waiting' && qrContent && (
                <div className="flex flex-col items-center py-4">
                  <div
                    className={`bg-white p-4 rounded-2xl border-2 mb-4 relative ${
                      qrCountdown === 0 ? 'border-gray-200 opacity-60' : 'border-green-200'
                    }`}
                  >
                    <QRCodeSVG value={qrContent} size={200} level="M" />
                    {qrCountdown === 0 && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-2xl">
                        <span className="text-sm font-bold text-red-500">已过期</span>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-1">请用微信扫一扫</p>
                  <p className="text-xs text-gray-400">
                    支付金额：
                    {isPointsChannel
                      ? `${cartTotal} 积分`
                      : `¥${(calcResult?.bisCash ? calcResult.bisCash / 100 : cartTotal).toFixed(2)}`}
                  </p>
                  <div className="flex items-center gap-2 mt-3 text-sm text-green-500 mb-2">
                    {qrCountdown === 0 ? (
                      <span className="text-red-500">二维码已过期，请重新生成</span>
                    ) : (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        <span>等待支付... 有效时间 {formatCountdown(qrCountdown)}</span>
                      </>
                    )}
                  </div>

                  {orderId && (
                    <div className="w-full mx-2 bg-orange-50 border border-orange-200 rounded-lg p-3 mb-3 text-xs text-orange-700 space-y-2">
                      <p>
                        <span className="font-bold">桌面端微信支付可能因微信限制失效</span>，推荐去手机小程序「我的订单」完成支付：
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600">订单号：</span>
                        <span className="font-mono font-medium">{orderId}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(orderId);
                            setPayMessage('订单号已复制');
                            setTimeout(() => setPayMessage('请用微信扫一扫'), 1500);
                          }}
                          className="px-2 py-1 bg-white border rounded text-[10px] text-gray-600 hover:text-orange-600"
                        >
                          复制
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 w-full px-2 mt-1">
                    <button
                      onClick={() => navigator.clipboard.writeText(qrContent)}
                      disabled={qrCountdown === 0}
                      className="flex-1 py-2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg disabled:opacity-50"
                    >
                      复制链接
                    </button>
                    <button
                      onClick={() => doPay()}
                      className="flex-1 py-2 text-xs bg-green-500 hover:bg-green-600 text-white rounded-lg"
                    >
                      重新生成
                    </button>
                  </div>
                  <p className="text-xs text-orange-500 mt-2 text-center px-4">
                    提示：若微信提示过期，可复制链接到微信打开，或复制订单号去小程序「我的订单」支付
                  </p>
                </div>
              )}

              {payResult === 'success' && (
                <div className="flex flex-col items-center py-4">
                  <CheckCircle className="w-14 h-14 text-green-500 mb-2" />
                  <p className="text-lg font-bold text-gray-800 mb-4">{payMessage}</p>

                  {pickupInfo?.verifyCode ? (
                    <div
                      ref={pickupCardRef}
                      className="w-full border-t pt-4 text-center space-y-3"
                    >
                      {/* 影城名称 */}
                      {pickupInfo.cinemaName && (
                        <div className="flex items-center justify-center gap-1.5">
                          <Building2 className="w-4 h-4 text-pink-500" />
                          <p className="text-base font-semibold text-gray-800">{pickupInfo.cinemaName}</p>
                        </div>
                      )}
                      {/* 套餐名称 */}
                      {pickupInfo.goodsName && (
                        <p className="text-sm text-gray-600">{pickupInfo.goodsName}</p>
                      )}
                      {/* 券码/取货码 */}
                      <p className="text-sm text-gray-500">券码 / 取货码</p>
                      <div className="flex items-center justify-center gap-2">
                        <p className="text-2xl font-mono font-bold tracking-widest text-gray-900">
                          {pickupInfo.verifyCode.replace(/\s/g, '').replace(/(\d{4})(?=\d)/g, '$1 ').trim()}
                        </p>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(pickupInfo.verifyCode);
                            setPayMessage('券码已复制');
                            setTimeout(() => setPayMessage('支付成功！'), 2000);
                          }}
                          className="p-1.5 text-gray-400 hover:text-pink-500"
                          title="复制"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      {/* 二维码 */}
                      <div className="flex justify-center bg-white p-3 rounded-xl border">
                        <QRCodeSVG value={pickupInfo.verifyCode} size={180} level="M" />
                      </div>
                      {pickupInfo.orderNo && (
                        <p className="text-xs text-gray-400">订单号：{pickupInfo.orderNo}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">正在获取取货码...</p>
                  )}

                  {/* 一键截图按钮（兑换成功卡片） */}
                  {pickupInfo?.verifyCode && (
                    <button
                      onClick={capturePickupCard}
                      className="mt-3 flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"
                      title="截图兑换信息，可直接粘贴发送"
                    >
                      <Camera className="w-4 h-4" />
                      一键截图
                    </button>
                  )}

                  <button
                    onClick={() => {
                      closeCheckout();
                      setView('home');
                    }}
                    className="mt-6 px-8 py-2.5 bg-pink-500 hover:bg-pink-600 text-white rounded-xl font-medium"
                  >
                    完成
                  </button>
                </div>
              )}

              {payResult === 'failed' && (
                <div className="flex flex-col items-center py-8">
                  <AlertCircle className="w-16 h-16 text-red-500 mb-3" />
                  <p className="text-lg font-bold text-gray-800">{payMessage}</p>
                  <button
                    onClick={() => {
                      setPayResult('idle');
                      setQrContent('');
                      setPayMessage('');
                      if (pollRef.current) {
                        clearInterval(pollRef.current);
                        pollRef.current = null;
                      }
                    }}
                    className="mt-4 px-8 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium"
                  >
                    返回
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Spec Selection Modal =====
function SpecModal({
  goods,
  isPoints,
  onClose,
  onConfirm,
}: {
  goods: Goods;
  isPoints: boolean;
  onClose: () => void;
  onConfirm: (dosing: DosingPlan[], breedId?: string, breedName?: string) => void;
}) {
  const plan = (goods as any).goodsPlan || {};
  const [selectedOptions, setSelectedOptions] = useState<Record<number, any>>(() => {
    const defaults: Record<number, any> = {};
    (plan.customPlan || []).forEach((cp: any, idx: number) => {
      const selected = (cp.planDetail || []).find((d: any) => d.def === 1 || d.def === '1');
      defaults[idx] = selected || cp.planDetail?.[0];
    });
    return defaults;
  });

  const getDosing = (): DosingPlan[] => {
    const dosing: DosingPlan[] = [];

    if (Array.isArray(plan.fixationPlan) && plan.fixationPlan.length > 0) {
      dosing.push({
        planId: 0,
        planDetail: plan.fixationPlan.map((p: any) => ({
          goodsId: p.subGoodsId || p.goodsId || '',
          amount: p.number || 1,
          breedId: p.goodsBreedId || p.breedId || '',
        })),
      });
    }

    if (Array.isArray(plan.customPlan) && plan.customPlan.length > 0) {
      plan.customPlan.forEach((cp: any, idx: number) => {
        const opt = selectedOptions[idx];
        if (opt) {
          dosing.push({
            planId: cp.plan?.id || 0,
            planDetail: [
              {
                goodsId: opt.goodsId || '',
                amount: opt.number || 1,
                breedId: opt.goodsBreedId || opt.breedId || '',
              },
            ],
          });
        }
      });
    }

    return dosing;
  };

  const firstPlanDetail = plan.customPlan?.[0]?.planDetail?.[0];
  const breedId = firstPlanDetail?.goodsBreedId || firstPlanDetail?.breedId || goods.goods_breed || (goods as any).breedId;
  const breedName = goods.breed_name || (goods as any).breedName || '';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-bold text-lg">选择规格</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="font-medium">{goods.goodsName || goods.name}</p>

          {Array.isArray(plan.customPlan) &&
            plan.customPlan.map((cp: any, idx: number) => (
              <div key={idx}>
                <p className="text-sm text-gray-500 mb-2">{cp.plan?.planName || `规格${idx + 1}`}</p>
                <div className="flex flex-wrap gap-2">
                  {(cp.planDetail || []).map((d: any, didx: number) => (
                    <button
                      key={didx}
                      onClick={() => setSelectedOptions((prev) => ({ ...prev, [idx]: d }))}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        selectedOptions[idx] === d
                          ? 'bg-pink-500 text-white border-pink-500'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-pink-300'
                      }`}
                    >
                      {d.goodsName || d.name || `选项${didx + 1}`}
                    </button>
                  ))}
                </div>
              </div>
            ))}

          {Array.isArray(plan.fixationPlan) && plan.fixationPlan.length > 0 && (
            <div>
              <p className="text-sm text-gray-500 mb-2">固定搭配</p>
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
                {plan.fixationPlan.map((p: any, idx: number) => (
                  <div key={idx}>
                    {p.subGoodsName || p.name || '搭配商品'} × {p.number || 1}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => onConfirm(getDosing(), breedId, breedName)}
            className="w-full py-3 rounded-xl font-bold text-white bg-pink-500 hover:bg-pink-600 transition-colors"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Recharge Card Component =====
function RechargeCard({
  meal,
  name,
  img,
  price,
  memberBalance,
  paying,
  payResult,
  qrContent,
  payMessage,
  orderId,
  onPay,
  onClose,
  onReset,
}: {
  meal: SetMeal;
  name: string;
  img: string;
  price: number;
  memberBalance: number | null;
  paying: boolean;
  payResult: 'idle' | 'waiting' | 'success' | 'failed';
  qrContent: string;
  payMessage: string;
  orderId: string;
  onPay: (pt: PayType) => void;
  onClose?: () => void;
  onReset: () => void;
}) {
  const [localPayType, setLocalPayType] = useState<PayType>('2');
  const [showPay, setShowPay] = useState(false);
  const [copiedOrderId, setCopiedOrderId] = useState(false);

  const giveMoney = meal.giveMoney || 0;
  const giveScore = meal.giveScore || 0;

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="p-4 flex items-center gap-4">
        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-green-400 to-green-500 flex items-center justify-center shrink-0 overflow-hidden">
          {img ? (
            <img src={img} alt="" className="w-full h-full object-cover" />
          ) : (
            <Wallet className="w-8 h-8 text-white" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-800">{name}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-lg font-bold text-red-500">¥{price.toFixed(2)}</span>
            {giveMoney > 0 && <span className="text-xs text-green-500">赠¥{giveMoney}</span>}
            {giveScore > 0 && <span className="text-xs text-orange-500">赠{giveScore}积分</span>}
          </div>
          {meal.remark && <p className="text-xs text-gray-400 mt-1 line-clamp-1">{meal.remark}</p>}
        </div>
        <button
          onClick={() => {
            setShowPay(true);
            onReset();
          }}
          className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm rounded-lg font-medium shrink-0"
        >
          购买
        </button>
      </div>

      {showPay && (
        <div className="border-t bg-gray-50 p-4 space-y-3">
          {payResult === 'idle' && (
            <>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5 text-xs text-orange-600 mb-2">
                储值套餐仅支持微信扫码支付，避免余额/观影金循环扣款
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowPay(false)}
                  className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg"
                >
                  取消
                </button>
                <button
                  onClick={() => onPay('2')}
                  disabled={paying}
                  className={`flex-1 py-2 text-white text-sm rounded-lg font-medium ${
                    paying ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'
                  }`}
                >
                  {paying ? '处理中...' : `微信扫码支付 ¥${price.toFixed(2)}`}
                </button>
              </div>
            </>
          )}

          {payResult === 'waiting' && qrContent && (
            <div className="flex flex-col items-center py-3">
              <div className="bg-white p-3 rounded-xl border-2 border-green-200 mb-2">
                <QRCodeSVG value={qrContent} size={160} level="M" />
              </div>
              <p className="text-sm text-gray-600">请用微信扫一扫</p>
              <p className="text-xs text-gray-400 mb-2">支付金额：¥{price.toFixed(2)}</p>
              <div className="flex items-center gap-2 text-sm text-green-500 mb-2">
                <Loader className="w-4 h-4 animate-spin" />
                <span>等待支付...</span>
              </div>

              {orderId && (
                <div className="w-full bg-orange-50 border border-orange-200 rounded-lg p-3 mb-3 text-xs text-orange-700 space-y-2">
                  <p>
                    <span className="font-bold">二维码可能因微信限制失效</span>，推荐去手机小程序「我的订单」支付：
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600">订单号：</span>
                    <span className="font-mono font-medium">{orderId}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(orderId);
                        setCopiedOrderId(true);
                        setTimeout(() => setCopiedOrderId(false), 1500);
                      }}
                      className={`px-2 py-1 border rounded text-[10px] ${
                        copiedOrderId
                          ? 'bg-green-50 text-green-600 border-green-200'
                          : 'bg-white text-gray-600 hover:text-orange-600'
                      }`}
                    >
                      {copiedOrderId ? '已复制' : '复制'}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 w-full">
                <button
                  onClick={() => navigator.clipboard.writeText(qrContent)}
                  className="flex-1 py-2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"
                >
                  复制链接
                </button>
                <button
                  onClick={() => onPay(localPayType)}
                  className="flex-1 py-2 text-xs bg-green-500 hover:bg-green-600 text-white rounded-lg"
                >
                  重新生成
                </button>
              </div>
              <p className="text-xs text-orange-500 mt-2 text-center px-2">
                提示：若微信提示二维码过期，可复制链接到微信打开，或复制订单号去小程序支付
              </p>
            </div>
          )}

          {payResult === 'success' && (
            <div className="flex flex-col items-center py-4">
              <CheckCircle className="w-12 h-12 text-green-500 mb-2" />
              <p className="font-bold text-gray-800">{payMessage}</p>
              <button
                onClick={() => {
                  setShowPay(false);
                  onReset();
                }}
                className="mt-2 px-6 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm rounded-lg"
              >
                完成
              </button>
            </div>
          )}

          {payResult === 'failed' && (
            <div className="flex flex-col items-center py-4">
              <AlertCircle className="w-12 h-12 text-red-500 mb-2" />
              <p className="font-bold text-gray-800">{payMessage}</p>
              <button
                onClick={onReset}
                className="mt-2 px-6 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg"
              >
                返回
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
