import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  RefreshCw,
  ChevronLeft,
  Calendar,
  MapPin,
  Clock,
  Heart,
  Camera,
  Building2,
  ChevronDown,
  Check,
  X,
  Wallet,
  Smartphone,
  Loader,
  CheckCircle,
  AlertCircle,
  Copy,
  ImageDown,
  Save,
  Unlock,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useStore } from '../store/useStore';
import { api } from '../api/client';
import type { Schedule, Movie, Seat, Cinema, Account } from '../types';

const BASE_URL = 'https://860753002.api.yq30.com/jeecg-boot';
const POSTER_PREFIX = BASE_URL + '/';

function formatVerifyCode(code: string): string {
  const s = String(code || '').replace(/\s/g, '');
  if (s.length <= 5) return s;
  // 小程序取票码按每 3 位分组
  return s.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
}

function getDateStr(dateInput: string | Date | number): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput.replace(/-/g, '/')) : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dateLabel(dateStr: string): { text: string; colorClass: string } {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const d = new Date(dateStr.replace(/-/g, '/'));
  if (isNaN(d.getTime())) return { text: dateStr, colorClass: 'text-gray-400' };
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  if (isSameDay(d, today)) return { text: `今日（${md}）`, colorClass: 'text-pink-600' };
  if (isSameDay(d, tomorrow)) return { text: `明日（${md}）`, colorClass: 'text-blue-600' };
  return { text: md, colorClass: 'text-gray-500' };
}

const SEAT_SIZE = 28;
const SEAT_GAP = 6;
const ROW_LABEL_WIDTH = 40;

// ===== Schedule poster generation (canvas) =====
function formatTime(dateInput: string | Date | number): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput.replace(/-/g, '/')) : new Date(dateInput);
  if (isNaN(d.getTime())) return '--:--';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // 不设 crossOrigin：图片只在本地 canvas 展示，避免跨域加载失败导致海报不显示
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('load failed'));
    img.src = url;
  });
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + '…';
}

async function drawSchedulePoster(groups: FilmGroup[], cinemaName: string): Promise<string> {
  const W = 820;
  const padX = 26;
  const posterW = 92;
  const posterH = 126;
  const headerH = 96;
  const footerH = 34;
  const chipW = 96;
  const chipH = 26;
  const chipGap = 8;

  // 估算高度
  let bodyH = 0;
  for (const g of groups) {
    const byDate = new Map<string, Schedule[]>();
    g.schedules.forEach((s) => {
      const d = getDateStr(s.startTime || '');
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(s);
    });
    const dateGroups = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
    let rows = 0;
    dateGroups.forEach(([, list]) => {
      const maxPerRow = Math.floor((W - padX - posterW - 16 - padX) / (chipW + chipGap));
      rows += Math.max(1, Math.ceil(list.length / maxPerRow));
    });
    bodyH += 12 + posterH + 4 + rows * 34;
  }
  const H = headerH + bodyH + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // 背景渐变
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#2b2148');
  bg.addColorStop(1, '#12101f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 顶部装饰条
  ctx.fillStyle = '#ea68a2';
  ctx.fillRect(0, 0, W, 5);

  // Header
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px "Microsoft YaHei", sans-serif';
  ctx.fillText(cinemaName, padX, 46);
  ctx.fillStyle = '#b9b1dd';
  ctx.font = '14px "Microsoft YaHei", sans-serif';
  const now = new Date();
  const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  ctx.fillText(
    `排期一览 · ${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${week}`,
    padX,
    72
  );
  ctx.strokeStyle = 'rgba(234,104,162,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, 88);
  ctx.lineTo(W - padX, 88);
  ctx.stroke();

  let y = headerH;
  for (const g of groups) {
    // 海报
    let hasPoster = false;
    if (g.poster) {
      try {
        const img = await loadImage(POSTER_PREFIX + g.poster);
        ctx.save();
        roundRectPath(ctx, padX, y, posterW, posterH, 8);
        ctx.clip();
        ctx.drawImage(img, padX, y, posterW, posterH);
        ctx.restore();
        hasPoster = true;
      } catch (e) {
        hasPoster = false;
      }
    }
    if (!hasPoster) {
      ctx.fillStyle = '#352b55';
      roundRectPath(ctx, padX, y, posterW, posterH, 8);
      ctx.fill();
      ctx.fillStyle = '#776da3';
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无海报', padX + posterW / 2, y + posterH / 2);
      ctx.textAlign = 'left';
    }

    const tx = padX + posterW + 18;
    const rightEdge = W - padX;

    // 片名 + 主演
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 21px "Microsoft YaHei", sans-serif';
    ctx.fillText(truncateText(ctx, g.filmName, rightEdge - tx - 20), tx, y + 26);
    if (g.actor) {
      ctx.fillStyle = '#b3aad6';
      ctx.font = '12.5px "Microsoft YaHei", sans-serif';
      ctx.fillText(truncateText(ctx, '主演：' + g.actor, rightEdge - tx - 10), tx, y + 47);
    }

    // 按日期分组的场次 chips
    const byDate = new Map<string, Schedule[]>();
    g.schedules.forEach((s) => {
      const d = getDateStr(s.startTime || '');
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(s);
    });
    const dateGroups = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));

    let yy = y + 62;
    const maxPerRow = Math.floor((rightEdge - tx) / (chipW + chipGap));
    for (const [dateStr, list] of dateGroups) {
      const label = dateLabel(dateStr);
      const dateChipColor = label.text.includes('今日')
        ? '#ea68a2'
        : label.text.includes('明日')
        ? '#4f7fe8'
        : '#3d345f';
      const dateChipW = 14 + ctx.measureText(label.text).width + 16;
      ctx.fillStyle = dateChipColor;
      roundRectPath(ctx, tx, yy - 13, dateChipW, 20, 10);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.fillText(label.text, tx + 7, yy);

      let cx = tx + dateChipW + 14;
      let rowY = yy;
      list.forEach((s) => {
        if (cx + chipW > rightEdge + 4) {
          cx = tx;
          rowY += 34;
        }
        const timeText = formatTime(s.startTime || '');
        ctx.fillStyle = '#2f2650';
        roundRectPath(ctx, cx, rowY - 17, chipW, chipH, 13);
        ctx.fill();
        ctx.strokeStyle = 'rgba(234,104,162,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#eae6f8';
        ctx.font = '13px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(timeText, cx + chipW / 2, rowY);
        ctx.textAlign = 'left';
        cx += chipW + chipGap;
      });
      yy = rowY + 38;
    }

    y = yy + 10;
  }

  // Footer
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.font = '12px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('影联出票助手 · 一键生成', W / 2, H - 12);

  return canvas.toDataURL('image/png');
}

interface FilmGroup {
  filmCode: string;
  filmName: string;
  poster?: string;
  actor?: string;
  edition?: string;
  schedules: Schedule[];
}

interface SeatTypeInfo {
  id: string;
  type: string;
  fee: number;
  specialPrice: number;
  color: SeatColor;
}

interface SeatColor {
  bg: string;
  border: string;
  text: string;
  icon: string;
  solid: string;
}

export default function Schedules() {
  const {
    selectedCinemaId,
    cinemas,
    setSelectedCinema,
    accounts,
    activeAccountId,
    switchAccount,
  } = useStore();
  const account = accounts.find((a) => a.id === activeAccountId);
  const [filmGroups, setFilmGroups] = useState<FilmGroup[]>([]);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  // 每个场次已出票数（当前账号，scheduleId -> 张数），每场限 6 张
  const [scheduleQuota, setScheduleQuota] = useState<Map<string, number>>(new Map());
  const schedulesRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: '',
    visible: false,
  });
  const [seatModal, setSeatModal] = useState<{
    schedule: Schedule;
    seats: Seat[];
    seatTypes: SeatTypeInfo[];
    loading: boolean;
    error?: string;
  } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  // 一键释放未支付订单
  const [releasing, setReleasing] = useState(false);

  const cinema = cinemas.find((c: Cinema) => c.id === selectedCinemaId);

  const showToast = (message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2000);
  };

  const generatePoster = async () => {
    if (filmGroups.length === 0) {
      showToast('暂无排期数据');
      return;
    }
    setGenerating(true);
    try {
      const dataUrl = await drawSchedulePoster(filmGroups, cinema?.cinemaName || '大埔嘉逸影联');
      setPosterPreview(dataUrl);
    } catch (e: any) {
      showToast('生成失败：' + e.message);
    } finally {
      setGenerating(false);
    }
  };

  const savePoster = async () => {
    if (!posterPreview) return;
    try {
      const result = await window.electronAPI?.saveImage?.(posterPreview, `${cinema?.cinemaName || '排期'}.png`);
      if (result?.success) {
        showToast('已保存：' + (result.filePath || ''));
      } else if (result && !result.canceled) {
        showToast('保存失败：' + (result.error || '未知错误'));
      }
    } catch (e: any) {
      showToast('保存失败：' + e.message);
    }
  };

  const copyPoster = async () => {
    if (!posterPreview) return;
    try {
      const result = await window.electronAPI?.copyImage?.(posterPreview);
      if (result?.success) {
        showToast('已复制到剪贴板，可直接粘贴');
      } else {
        showToast('复制失败：' + (result?.error || '未知错误'));
      }
    } catch (e: any) {
      showToast('复制失败：' + e.message);
    }
  };

  const loadData = async () => {
    if (!selectedCinemaId) return;
    setLoading(true);
    try {
      // 排期接口 + 电影接口（电影接口失败时重试 1 次，保证海报数据）
      let scheduleResp: any = null;
      let movieResp: any = null;
      try {
        [scheduleResp, movieResp] = await Promise.all([
          api.getScheduleAllFilm(selectedCinemaId),
          api.getNowPlayMovies(selectedCinemaId, 1, 50),
        ]);
      } catch (e) {
        // 并行失败时各自重试
        scheduleResp = await api.getScheduleAllFilm(selectedCinemaId).catch(() => null);
        movieResp = await api.getNowPlayMovies(selectedCinemaId, 1, 50).catch(() => null);
      }
      // 电影接口失败/空时重试一次（网络抖动或 token 短暂失效）
      if (!movieResp || !movieResp.success || !((movieResp.result as any)?.records || []).length) {
        movieResp = await api.getNowPlayMovies(selectedCinemaId, 1, 50).catch(() => movieResp);
      }

      const movieRecords = (movieResp?.result as any)?.records || [];
      const movieMap = new Map<string, Movie>();
      if (movieResp?.success && movieRecords) {
        movieRecords.forEach((m: Movie) => {
          if (m.code) movieMap.set(m.code, m);
        });
      }
      setMovies(movieRecords);

      if (scheduleResp?.success && scheduleResp.result) {
        const scheduleResult = scheduleResp.result as any;
        const list: Schedule[] = Array.isArray(scheduleResult)
          ? scheduleResult
          : scheduleResult?.records || [];

        const groups = new Map<string, FilmGroup>();
        list.forEach((s) => {
          const fc = s.filmCode || 'unknown';
          if (!groups.has(fc)) {
            const movie = movieMap.get(fc);
            groups.set(fc, {
              filmCode: fc,
              filmName: s.filmName || movie?.name || '未知影片',
              poster: movie?.poster || movie?.pic,
              actor: movie?.actor,
              edition: movie?.edition_dictText || movie?.edition,
              schedules: [],
            });
          }
          groups.get(fc)!.schedules.push(s);
        });

        groups.forEach((g) => {
          g.schedules.sort(
            (a, b) =>
              new Date(a.startTime || 0).getTime() -
              new Date(b.startTime || 0).getTime()
          );
        });

        setFilmGroups(Array.from(groups.values()));
      }
    } catch (e) {
      console.error('Failed to load schedules:', e);
    }
    // 加载当前账号每个场次的已出票数（每场限 6 张）
    try {
      const quotaMap = new Map<string, number>();
      // 拉最近订单分页统计（成功电影票 type=1 status=7）
      const listResp = await api.getOrderList(1, 100);
      if (listResp.success && listResp.result) {
        const data = listResp.result as any;
        const list: any[] = Array.isArray(data) ? data : data.records || [];
        list.forEach((o: any) => {
          const type = String(o.type ?? o.orderType ?? o.saleType ?? '');
          const status = String(o.status);
          if (type === '1' && status === '7') {
            const sid = String(o.schedule_id || o.scheduleId || o.filmScheduleId || '');
            if (sid) {
              // 张数在 message.num
              let num = 1;
              try {
                const mm = typeof o.message === 'string' ? JSON.parse(o.message) : o.message;
                if (mm && typeof mm === 'object') num = Number(mm.num) || 1;
              } catch {}
              quotaMap.set(sid, (quotaMap.get(sid) || 0) + num);
            }
          }
        });
      }
      setScheduleQuota(quotaMap);
    } catch (e) {
      console.error('Failed to load schedule quota:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [selectedCinemaId]);

  const copyRegionToClipboard = async (element: HTMLElement) => {
    if (!window.electronAPI?.captureRegion) {
      throw new Error('截图功能仅在桌面应用中可用');
    }
    // Scroll element to top first, then read rect so coordinates match the viewport
    element.scrollIntoView({ block: 'start', behavior: 'instant' as any });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const rect = element.getBoundingClientRect();
    const result = await window.electronAPI.captureRegion({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
    if (result.success) {
      return;
    }
    throw new Error(result.error || '截图失败');
  };

  const captureSchedules = () => {
    if (schedulesRef.current) {
      copyRegionToClipboard(schedulesRef.current).catch((e) =>
        showToast(e.message || '截图失败')
      );
    }
  };

  // 一键释放：取消所有已登录账号的未支付电影票订单（status 1/2/3，锁定座位）
  const releaseAllPendingOrders = async () => {
    const targetAccounts = accounts.filter((a) => a.token && a.memberId);
    if (targetAccounts.length === 0) {
      showToast('没有可用账号');
      return;
    }
    if (!confirm(`确定释放所有账号（${targetAccounts.length} 个）的未支付订单吗？\n\n将取消所有待支付/锁座的电影票订单，释放被占座位。`)) return;
    setReleasing(true);
    let found = 0;
    let cancelled = 0;
    let failed = 0;
    try {
      // 每个账号拉最近订单，找未支付电影票订单（type=1, status 1/2/3）
      for (const acc of targetAccounts) {
        let page = 1;
        for (;;) {
          const resp = await api.getOrderListAs(acc.token, acc.memberId, page, 100);
          if (!resp.success) break;
          const data = resp.result as any;
          const list: any[] = Array.isArray(data) ? data : data?.records || [];
          if (list.length === 0) break;
          for (const o of list) {
            const type = String(o.type ?? o.orderType ?? o.saleType ?? '');
            const status = String(o.status);
            if (type === '1' && ['1', '2', '3'].includes(status)) {
              found += 1;
              const orderId = o.id || o.orderId;
              if (orderId) {
                try {
                  const cResp = await api.cancelOrderAs(acc.token, acc.memberId, orderId);
                  if (cResp.success) {
                    cancelled += 1;
                  } else {
                    failed += 1;
                  }
                } catch {
                  failed += 1;
                }
              }
            }
          }
          const total = Number(data?.total ?? 0);
          if (total > 0 && page * 100 >= total) break;
          page += 1;
          if (page > 50) break;
        }
      }
      showToast(`释放完成：发现 ${found} 笔未支付订单，成功取消 ${cancelled} 笔${failed ? `，失败 ${failed} 笔` : ''}`);
    } catch (e: any) {
      showToast('释放失败：' + e.message);
    } finally {
      setReleasing(false);
    }
  };

  const openSeat = async (schedule: Schedule) => {
    if (!schedule.scheduleId) return;
    setSeatModal({
      schedule,
      seats: [],
      seatTypes: [],
      loading: true,
    });

    try {
      const [seatResp, priceResp] = await Promise.all([
        api.getSeatByScheduleId(schedule.scheduleId),
        api.getSeatTypeWithTicketPrice(
          schedule.scheduleId,
          String(schedule.balanceFlag || 1)
        ),
      ]);

      const priceResult = (priceResp.result as any) || [];
      const priceList = Array.isArray(priceResult) ? priceResult : [];
      // 价格接口返回 [{seatCode, specialPrice, type}]：优先按 seatCode 匹配，匹配不到用第一条作为全场基准价
      const priceBySeat = new Map<string, number>();
      let defaultPrice = 0;
      priceList.forEach((p: any, idx: number) => {
        const seatCode = String(p.seatCode || '');
        const sp = Number(p.specialPrice ?? p.price ?? p.fee ?? 0);
        if (idx === 0) defaultPrice = sp;
        if (seatCode) priceBySeat.set(seatCode, sp);
      });
      const typeList: SeatTypeInfo[] = priceList.map((t: any, idx: number) => ({
        id: String(t.seatCode || t.id || t.code || idx),
        type: t.type || '普通座',
        fee: Number(t.fee || 0),
        specialPrice: Number(t.specialPrice ?? t.fee ?? 0) || defaultPrice,
        color: resolveSeatTypeColor(t.type || ''),
      }));

      const typeMap = new Map<string, SeatTypeInfo>();
      typeList.forEach((t) => typeMap.set(t.id, t));

      const normalized = normalizeSeats(
        seatResp.success ? seatResp.result || [] : [],
        typeMap,
        priceBySeat,
        defaultPrice
      );

      setSeatModal({
        schedule,
        seats: normalized,
        seatTypes: typeList,
        loading: false,
        error: seatResp.success
          ? normalized.length === 0
            ? '该场次暂无座位数据'
            : undefined
          : seatResp.message || '加载座位失败',
      });
    } catch (e: any) {
      setSeatModal({
        schedule,
        seats: [],
        seatTypes: [],
        loading: false,
        error: e.message || '加载座位失败',
      });
    }
  };

  if (!account) {
    return (
      <div className="p-6 text-center text-gray-400 py-12">请先添加账号</div>
    );
  }

  return (
    <div className="p-6 space-y-4 relative">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">排期选座</h2>
          <p className="text-sm text-gray-500">
            {cinema?.cinemaName || '请选择影院'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CinemaSelector
            cinemas={cinemas}
            selectedId={selectedCinemaId}
            onChange={(id) => setSelectedCinema(id)}
          />
          <button
            onClick={releaseAllPendingOrders}
            disabled={releasing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
            title="取消所有账号未支付的电影票订单，释放锁定的座位"
          >
            {releasing ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <Unlock className="w-4 h-4" />
            )}
            {releasing ? '释放中...' : '一键释放'}
          </button>
          <button
            onClick={generatePoster}
            disabled={generating}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            title="生成排期宣传图（可保存/复制）"
          >
            {generating ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <ImageDown className="w-4 h-4" />
            )}
            生成排期图
          </button>
          <button
            onClick={captureSchedules}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50"
            title="复制所有排期截图到剪贴板"
          >
            <Camera className="w-4 h-4" />
            截图
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      <div ref={schedulesRef} className="space-y-4">
        {loading ? (
          <p className="text-center py-8 text-gray-400">加载中...</p>
        ) : filmGroups.length === 0 ? (
          <p className="text-center py-8 text-gray-400">暂无排期信息</p>
        ) : (
          filmGroups.map((group) => (
            <FilmCard
              key={group.filmCode}
              group={group}
              onSelectTime={openSeat}
              scheduleQuota={scheduleQuota}
            />
          ))
        )}
      </div>

      {seatModal && (
        <SeatModal
          cinema={cinema}
          account={account}
          modal={seatModal}
          onClose={() => setSeatModal(null)}
          onToast={showToast}
          onRefresh={() => openSeat(seatModal.schedule)}
          refreshing={seatModal.loading}
          scheduleQuota={scheduleQuota}
          accounts={accounts}
          onSwitchAccount={async (id) => {
            await switchAccount(id);
            // 切换后重新加载该场次座位 + 刷新配额
            await loadData();
          }}
        />
      )}

      {/* Poster preview modal */}
      {posterPreview && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setPosterPreview(null)}
        >
          <div
            className="bg-white rounded-xl p-4 max-w-[92vw] max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">排期图预览</h3>
              <button
                onClick={() => setPosterPreview(null)}
                className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-auto flex-1 rounded-lg bg-gray-100 p-2">
              <img src={posterPreview} alt="排期图" className="max-w-full" />
            </div>
            <div className="flex gap-2 mt-3 justify-center">
              <button
                onClick={savePoster}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-pink-500 text-white rounded-lg hover:bg-pink-600"
              >
                <Save className="w-4 h-4" />
                保存图片
              </button>
              <button
                onClick={copyPoster}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                <Copy className="w-4 h-4" />
                复制到剪贴板
              </button>
              <button
                onClick={() => setPosterPreview(null)}
                className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <div
        className={`
          fixed top-4 left-1/2 -translate-x-1/2 z-[60]
          px-4 py-2 rounded-lg shadow-lg text-sm text-white bg-black/80
          transition-opacity duration-200 pointer-events-none
          ${toast.visible ? 'opacity-100' : 'opacity-0'}
        `}
      >
        {toast.message}
      </div>
    </div>
  );
}

function CinemaSelector({
  cinemas,
  selectedId,
  onChange,
}: {
  cinemas: Cinema[];
  selectedId: string;
  onChange: (id: string) => void;
}) {
  const selected = cinemas.find((c) => c.id === selectedId);
  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border rounded-lg">
        <Building2 className="w-4 h-4 text-gray-400" />
        <select
          value={selectedId}
          onChange={(e) => onChange(e.target.value)}
          className="bg-transparent outline-none min-w-[120px] max-w-[200px] text-sm cursor-pointer"
        >
          {cinemas.map((c: Cinema) => (
            <option key={c.id} value={c.id}>
              {c.cinemaName}
            </option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}

function FilmCard({
  group,
  onSelectTime,
  scheduleQuota,
}: {
  group: FilmGroup;
  onSelectTime: (s: Schedule) => void;
  // 每个场次已出票数（当前账号），用于显示"已出 X/6 张"限制
  scheduleQuota?: Map<string, number>;
}) {
  // 海报 URL：兼容相对路径(files/...)和完整URL，加时间戳防缓存
  const posterUrl = useMemo(() => {
    if (!group.poster) return null;
    const raw = String(group.poster);
    const base = raw.startsWith('http') ? raw : POSTER_PREFIX + raw;
    return base + (base.includes('?') ? '&' : '?') + 't=' + Date.now();
  }, [group.poster]);
  const firstSchedule = group.schedules[0];
  // 图片加载失败状态（不隐藏，显示占位并可重试）
  const [posterFailed, setPosterFailed] = useState(false);
  const [posterKey, setPosterKey] = useState(0);

  return (
    <div className="bg-white rounded-xl border p-4 flex gap-4">
      <div className="shrink-0">
        {posterUrl ? (
          posterFailed ? (
            <div className="w-24 h-32 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xs text-center px-2 flex-col gap-1">
              暂无海报
              <button
                onClick={() => {
                  setPosterFailed(false);
                  setPosterKey((k) => k + 1);
                }}
                className="text-[10px] text-blue-500 hover:underline"
              >
                重试
              </button>
            </div>
          ) : (
            <img
              key={posterKey}
              src={posterUrl}
              alt={group.filmName}
              className="w-24 h-32 object-cover rounded-lg bg-gray-100"
              loading="lazy"
              onError={() => setPosterFailed(true)}
            />
          )
        ) : (
          <div className="w-24 h-32 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xs text-center px-2">
            暂无海报
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <h3 className="font-bold text-lg truncate">{group.filmName}</h3>
        <p className="text-sm text-gray-500 mt-1 line-clamp-1">
          {group.actor ? `主演：${group.actor}` : '暂无主演信息'}
        </p>

        {(() => {
          const byDate = new Map<string, Schedule[]>();
          group.schedules.forEach((s) => {
            const d = getDateStr(s.startTime || '');
            if (!byDate.has(d)) byDate.set(d, []);
            byDate.get(d)!.push(s);
          });
          const dateGroups = Array.from(byDate.entries()).sort(([a], [b]) =>
            a.localeCompare(b)
          );
          return dateGroups.map(([dateStr, list]) => {
            const label = dateLabel(dateStr);
            return (
              <div key={dateStr} className="mt-3">
                <p className={`text-xs font-medium mb-2 ${label.colorClass}`}>
                  {label.text}场次：
                </p>
                <div className="flex flex-wrap gap-2">
                  {list.map((s, idx) => {
                    // 每个场次每账号限 6 张（满 6 不禁用，仍可进入查看/截图座位，只是不能下单）
                    const used = scheduleQuota?.get(String(s.scheduleId)) || 0;
                    const quotaReached = used >= 6;
                    return (
                      <button
                        key={idx}
                        onClick={() => onSelectTime(s)}
                        disabled={s.canSale === false}
                        title={`${s.startTime?.substring(11, 16)}（已出 ${used}/6 张${quotaReached ? '，已满，仅可查看座位' : ''}）`}
                        className={`
                          px-3 py-1.5 text-sm rounded border transition-colors flex flex-col items-center
                          ${
                            s.canSale === false
                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                              : quotaReached
                              ? 'bg-orange-50 text-orange-600 border-orange-300 hover:bg-orange-100'
                              : 'bg-white text-pink-600 border-pink-300 hover:bg-pink-50'
                          }
                        `}
                      >
                        <span>{s.startTime?.substring(11, 16)}</span>
                        <span className={`text-[10px] leading-tight ${quotaReached ? 'text-orange-500' : used > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                          已出 {used}/6
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          });
        })()}

        <div className="mt-auto pt-3 flex items-center justify-between">
          <div className="text-xs text-gray-400">
            {firstSchedule?.language} {group.edition || firstSchedule?.dimensional}
            {firstSchedule?.hallLabel && firstSchedule.hallLabel.length > 0 && (
              <span className="ml-2">
                {firstSchedule.hallLabel.map((l) => l.labelName).join(' ')}
              </span>
            )}
          </div>
          <button
            onClick={() =>
              onSelectTime(
                group.schedules.find((s) => s.canSale !== false) ||
                  group.schedules[0]
              )
            }
            className="px-4 py-1.5 text-sm bg-pink-500 text-white rounded-lg hover:bg-pink-600"
          >
            购票
          </button>
        </div>
      </div>
    </div>
  );
}

function resolveSeatTypeColor(typeName: string): SeatColor {
  // 不区分猫眼/会员/普通，所有可售座位统一样式（影院已合并销售渠道）
  return {
    bg: 'bg-white',
    border: 'border-pink-300',
    text: 'text-gray-600',
    icon: 'text-pink-500',
    solid: 'bg-pink-500',
  };
}

function SeatModal({
  cinema,
  cinemaName,
  account,
  modal,
  onClose,
  onToast,
  onRefresh,
  refreshing,
  scheduleQuota,
  accounts,
  onSwitchAccount,
}: {
  cinema?: Cinema;
  cinemaName?: string;
  account?: Account;
  modal: {
    schedule: Schedule;
    seats: Seat[];
    seatTypes: SeatTypeInfo[];
    loading: boolean;
    error?: string;
  };
  onClose: () => void;
  onToast: (msg: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  scheduleQuota?: Map<string, number>;
  accounts?: Account[];
  onSwitchAccount?: (id: string) => Promise<void>;
}) {
  const { schedule, seats, seatTypes, loading, error } = modal;
  const cinemaId = (cinema as any)?.id || (schedule as any)?.cinemaId || '';
  const [selectedSeats, setSelectedSeats] = useState<Seat[]>([]);
  const seatAreaRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Payment state
  type PayType = '2' | '3';
  const [showPay, setShowPay] = useState(false);
  const [payType, setPayType] = useState<PayType>('2');
  const [paying, setPaying] = useState(false);
  const [payResult, setPayResult] = useState<'idle' | 'waiting' | 'success' | 'failed'>('idle');
  const [qrContent, setQrContent] = useState('');
  const [payMessage, setPayMessage] = useState('');
  const [memberBalance, setMemberBalance] = useState<number | null>(null);
  const [memberViewAmount, setMemberViewAmount] = useState<number | null>(null);
  const [memberTotalBalance, setMemberTotalBalance] = useState<number | null>(null);
  const [orderId, setOrderId] = useState<string>('');
  const [ticketInfo, setTicketInfo] = useState<{ verifyCode: string; seatText: string } | null>(null);
  const ticketCardRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const captureTicketCard = () => {
    if (ticketCardRef.current) {
      copyRegionToClipboard(ticketCardRef.current).catch((e) =>
        onToast(e.message || '截图失败')
      );
    }
  };

  // 优惠券/观影金 state
  const [voucherList, setVoucherList] = useState<any[]>([]);
  const [selectedCouponIds, setSelectedCouponIds] = useState<string[]>([]);
  const [selectedViewAmountIds, setSelectedViewAmountIds] = useState<string[]>([]);
  const [calcAmount, setCalcAmount] = useState<number | null>(null);
  const [loadingVouchers, setLoadingVouchers] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);

  // 支付成功前保留订单展示信息
  const [payOrderInfo, setPayOrderInfo] = useState<{
    filmName: string;
    showTime: string;
    seatText: string;
    totalPrice: number;
    actualPrice: number;
  } | null>(null);

  // Pending order (未完成订单) state — 类似小程序的"您有一个购票订单未完成"
  const [pendingOrder, setPendingOrder] = useState<any | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    setSelectedSeats([]);
    setPendingOrder(null);
  }, [modal.schedule.scheduleId]);

  // 进入座位页时，检查是否有未完成订单（type=1 电影票，status 1,2,3 待支付/处理中）
  useEffect(() => {
    const checkPending = async () => {
      try {
        const resp = await api.getOrderList(1, 5);
        if (resp.success && resp.result) {
          const data = resp.result;
          const list: any[] = Array.isArray(data) ? data : data.records || [];
          // 找出当前场次的电影票未完成订单
          const pending = list.find((o: any) => {
            const type = String(o.type || o.orderType || o.saleType || '');
            const status = String(o.status);
            // type=1 电影票, status 1,2,3 待支付/支付中/出票中
            return type === '1' && ['1', '2', '3'].includes(status);
          });
          if (pending) {
            setPendingOrder(pending);
          }
        }
      } catch (e) {
        // ignore
      }
    };
    checkPending();
  }, [modal.schedule.scheduleId]);


  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const { rows, minX, maxX, layoutWidth, layoutHeight } = useMemo(() => {
    if (!seats.length) {
      return { rows: [] as number[], minX: 0, maxX: 0, layoutWidth: 0, layoutHeight: 0 };
    }
    const minY = Math.min(...seats.map((s) => s.ycode || 0));
    const maxY = Math.max(...seats.map((s) => s.ycode || 0));
    const computedMinX = Math.min(...seats.map((s) => s.xcode || 0));
    const computedMaxX = Math.max(...seats.map((s) => s.xcode || 0));
    const rowList = Array.from({ length: maxY - minY + 1 }, (_, i) => minY + i);

    let maxRowWidth = 0;
    rowList.forEach((y) => {
      const rowSeats = seats.filter((s) => s.ycode === y);
      let width = ROW_LABEL_WIDTH;
      rowSeats.forEach(() => {
        width += SEAT_SIZE + SEAT_GAP;
      });
      width -= SEAT_GAP;
      if (width > maxRowWidth) maxRowWidth = width;
    });

    const colCount = computedMaxX - computedMinX + 1;
    const estimatedWidth = Math.max(
      maxRowWidth,
      ROW_LABEL_WIDTH + colCount * (SEAT_SIZE + SEAT_GAP)
    );
    const estimatedHeight =
      56 + // screen
      44 + // legend
      rowList.length * (SEAT_SIZE + SEAT_GAP) +
      64; // recommend + padding

    return {
      rows: rowList,
      minX: computedMinX,
      maxX: computedMaxX,
      layoutWidth: estimatedWidth + 32,
      layoutHeight: estimatedHeight,
    };
  }, [seats]);

  useEffect(() => {
    const compute = () => {
      const container = seatAreaRef.current;
      if (!container || layoutWidth === 0) {
        setScale(1);
        return;
      }
      const s = Math.min(
        1,
        container.clientWidth / layoutWidth,
        container.clientHeight / layoutHeight
      );
      setScale(Number(s.toFixed(3)));
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [layoutWidth, layoutHeight]);

  const seatByCoord = useMemo(() => {
    const map = new Map<string, Seat>();
    seats.forEach((s) => {
      map.set(`${s.xcode},${s.ycode}`, s);
    });
    return map;
  }, [seats]);

  const toggleSeat = (seat: Seat) => {
    if (!isSeatAvailable(seat)) return;
    setSelectedSeats((prev) => {
      const exists = prev.find((s) => s.seatCode === seat.seatCode);
      if (exists) return prev.filter((s) => s.seatCode !== seat.seatCode);
      // 每个场次每账号限 6 张（已出票数 + 本次选择 ≤ 6）；满 6 时提示切换账号续单
      const used = scheduleQuota?.get(String(modal.schedule.scheduleId)) || 0;
      const MAX_SEATS = 6;
      if (prev.length + used >= MAX_SEATS) {
        // 找其他可用的账号（有 token），按该场次已出票数升序（剩余票数多的优先）
        const sid = String(modal.schedule.scheduleId);
        const others = (accounts || [])
          .filter((a) => a.id !== account?.id && a.token && a.memberId)
          .map((a) => ({ acc: a, used: scheduleQuota?.get(sid) || 0 }))
          .filter((x) => x.used < MAX_SEATS)
          .sort((a, b) => a.used - b.used);
        const best = others[0];
        if (best && onSwitchAccount) {
          const remain = MAX_SEATS - best.used;
          const msg = `当前账号（${account?.name || account?.phone || '当前'}）该场次已出 ${used} 张，达到每账号限购 ${MAX_SEATS} 张。\n\n是否切换到「${best.acc.name || best.acc.phone}」账号继续下单？（该账号还可出 ${remain} 张）`;
          if (window.confirm(msg)) {
            // 清空已选座位，切换账号后由父组件重新加载该场次座位
            setSelectedSeats([]);
            onSwitchAccount(best.acc.id).then(() => {
              onToast(`已切换到「${best.acc.name || best.acc.phone}」，还可出 ${remain} 张，请重新选座`);
              // 触发重新加载座位（新账号价格/配额）
              setTimeout(() => onRefresh?.(), 300);
            });
          }
        } else {
          onToast(`该场次每账号限购 ${MAX_SEATS} 张（已出 ${used} 张），可截图座位但不能再选座`);
        }
        return prev;
      }
      return [...prev, seat];
    });
  };

  const totalPrice = selectedSeats.reduce(
    (sum, s) => sum + (s.specialPrice || s.price || s.fee || 0),
    0
  );

  const recommend = (count: number) => {
    const available = seats.filter(isSeatAvailable);
    const byRow = new Map<number, Seat[]>();
    available.forEach((s) => {
      const y = s.ycode || 0;
      if (!byRow.has(y)) byRow.set(y, []);
      byRow.get(y)!.push(s);
    });

    const rowKeys = Array.from(byRow.keys()).sort((a, b) => a - b);
    const midRow = rowKeys[Math.floor(rowKeys.length * 0.6)] || rowKeys[0];
    const centerX = (minX + maxX) / 2;
    let best: Seat[] | null = null;
    let bestScore = Infinity;

    byRow.forEach((rowSeats, y) => {
      const sorted = rowSeats.sort((a, b) => (a.xcode || 0) - (b.xcode || 0));
      for (let i = 0; i <= sorted.length - count; i++) {
        const group = sorted.slice(i, i + count);
        const allConsecutive = group.every(
          (s, idx) =>
            idx === 0 ||
            (s.xcode || 0) - (group[idx - 1].xcode || 0) === 1
        );
        if (!allConsecutive) continue;
        const avgX = group.reduce((sum, s) => sum + (s.xcode || 0), 0) / count;
        const rowDist = Math.abs(y - midRow);
        const colDist = Math.abs(avgX - centerX);
        const score = rowDist * 2 + colDist;
        if (score < bestScore) {
          bestScore = score;
          best = group;
        }
      }
    });

    if (best) {
      setSelectedSeats(best);
    } else if (count === 1 && available.length > 0) {
      setSelectedSeats([available[0]]);
    } else {
      onToast('未找到合适的推荐座位');
    }
  };

  const captureSeatArea = () => {
    const el = document.getElementById('seat-capture-area');
    if (el) {
      copyRegionToClipboard(el).catch((e) =>
        onToast(e.message || '截图失败')
      );
    }
  };

  // 取消未完成订单（参考小程序 chanelOrder）
  const cancelPendingOrder = async () => {
    if (!pendingOrder || cancelling) return;
    setCancelling(true);
    try {
      const orderId = pendingOrder.id || pendingOrder.orderId;
      const resp = await api.cancelOrder(orderId);
      if (resp.success) {
        onToast('订单已取消');
        setPendingOrder(null);
        // 刷新座位图，释放被锁座位
        onRefresh?.();
      } else {
        onToast(resp.message || '取消订单失败');
      }
    } catch (e: any) {
      onToast(e.message || '取消订单失败');
    } finally {
      setCancelling(false);
    }
  };

  // 继续支付：跳转到订单详情（这里简单处理：关闭座位页让用户去订单列表查看）
  const continuePendingOrder = () => {
    setPendingOrder(null);
    onToast('请到"订单"页面继续支付或取消该订单');
    // 关闭座位页，让用户去订单列表
    setTimeout(() => onClose(), 800);
  };

  const loadMemberBalance = async () => {
    try {
      const resp = await api.getMemberInfoById();
      if (resp.success && resp.result) {
        const r = resp.result;
        const balance = Number(r.balance ?? 0);
        const viewAmount = Number(r.viewAmountBalance ?? 0);
        const total = Number(r.totalBalance ?? balance + viewAmount);
        setMemberBalance(balance);
        setMemberViewAmount(viewAmount);
        setMemberTotalBalance(total);
      }
    } catch {}
  };

  const openPay = async () => {
    if (selectedSeats.length === 0) return;
    setShowPay(true);
    setPayResult('idle');
    setQrContent('');
    setPayMessage('');
    setTicketInfo(null);
    setPayOrderInfo(null);
    setSelectedCouponIds([]);
    setSelectedViewAmountIds([]);
    setCalcAmount(null);
    setVoucherList([]);
    setOrderId('');
    // 默认余额支付（与小程序一致：balanceFlag=1 用 payType=3），并同时加载余额
    setPayType(Number(schedule.balanceFlag) === 1 ? '3' : '2');
    loadMemberBalance();

    // 先创建订单，再加载可用优惠券/观影金
    setCreatingOrder(true);
    try {
      const seatCodes = selectedSeats.map((s) => s.seatCode).join(',');
      const seatNoFallback = selectedSeats.map((s) => s.seatNo || s.seatCode).join(',');
      const orderResp = await api.createTicketOrder({
        scheduleId: schedule.scheduleId,
        seatCode: seatCodes,
        seatNos: seatNoFallback,
        imgUrl: '',
        orderAmount: totalPrice,
        price: totalPrice,
        type: 1,
        buyChannel: 1,
        // 与小程序一致：balanceFlag=1 用 payType=3（余额支付通道，购票送卖品券活动依赖此参数）
        payType: Number(schedule.balanceFlag) === 1 ? 3 : 2,
        cinemaId,
        shopId: (cinema as any)?.shopId || '',
        phone: account?.phone || '',
      });

      if (!orderResp.success || !orderResp.result) {
        if (orderResp.code === 501) {
          setPayResult('failed');
          setPayMessage('座位已被他人占用，请重新选座');
          setTimeout(() => {
            setShowPay(false);
            onRefresh?.();
            setSelectedSeats([]);
          }, 1500);
        } else {
          setPayResult('failed');
          setPayMessage(orderResp.message || '创建订单失败');
        }
        setCreatingOrder(false);
        return;
      }

      const createdOrderId = (orderResp.result as any).orderId || (orderResp.result as any).id;
      if (!createdOrderId) {
        setPayResult('failed');
        setPayMessage('创建订单返回无订单ID');
        setCreatingOrder(false);
        return;
      }
      setOrderId(createdOrderId);

      // 加载可用优惠券/观影金
      setLoadingVouchers(true);
      try {
        const voucherResp = await api.getVoucherList(createdOrderId, '');
        if (voucherResp.success && voucherResp.result) {
          const data = voucherResp.result as any;
          const list = Array.isArray(data) ? data : data.records || [];
          setVoucherList(list);
        }
      } catch (e) {
        console.error('Failed to load vouchers:', e);
      }
      setLoadingVouchers(false);
    } catch (e: any) {
      setPayResult('failed');
      setPayMessage(e.message || '创建订单失败');
    } finally {
      setCreatingOrder(false);
    }
  };

  // 价格重算（选了券后调 priceCalc 获取实际支付金额）
  const recalcPrice = async () => {
    if (!orderId) return;
    // 没选任何券时不调 priceCalc
    if (selectedCouponIds.length === 0 && selectedViewAmountIds.length === 0) {
      setCalcAmount(null);
      return;
    }
    try {
      const seatCodes = selectedSeats.map((s) => s.seatCode).join(',');
      // 小程序逻辑：观影金只传 viewAmountList，优惠券只传 couponList
      const calcData: Record<string, any> = {
        orderType: 1,
        payType,
        scheduleId: schedule.scheduleId,
        seatCode: seatCodes,
        channelId: 1,
        cinemaId,
      };
      if (selectedViewAmountIds.length > 0) {
        calcData.viewAmountList = selectedViewAmountIds;
      } else {
        calcData.couponList = selectedCouponIds;
      }
      const resp = await api.priceCalc(calcData);
      if (resp.success && resp.result) {
        const r = resp.result as any;
        // totalVoucherPrice 为券后应付金额；兼容其他字段
        const actual =
          r.totalVoucherPrice ??
          (typeof r.totalSalePrice === 'number' && typeof r.voucherDiscount === 'number'
            ? r.totalSalePrice + r.voucherDiscount
            : null) ??
          r.payAmount ??
          r.actualAmount ??
          r.amount ??
          totalPrice;
        setCalcAmount(Number(actual));
      }
    } catch (e) {
      console.error('priceCalc failed:', e);
    }
  };

  // 券选择变化时重算价格
  useEffect(() => {
    if (orderId) {
      recalcPrice();
    }
  }, [selectedCouponIds, selectedViewAmountIds, orderId]);

  const closePay = async () => {
    setShowPay(false);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    // 若已创建订单但未支付成功，取消订单释放座位
    if (orderId && payResult !== 'success') {
      try {
        await api.cancelOrder(orderId);
      } catch (e) {
        console.error('cancel order on close failed:', e);
      }
    }
    setVoucherList([]);
    setSelectedCouponIds([]);
    setSelectedViewAmountIds([]);
    setCalcAmount(null);
    setPayOrderInfo(null);
  };

  const fetchTicketInfo = async (id: string, attempts = 0) => {
    try {
      const resp = await api.ticketMessage(id);
      if (resp.success && resp.result) {
        const o = resp.result as any;
        // 小程序电影票取票码实际取自 order.printNo，优先用它
        let code = String(o.order?.printNo || o.order?.print_no || o.printNo || o.print_no || '').trim();
        if (!code) {
          const cards = o.cardGoodsCode || o.ticketCodes || [];
          if (Array.isArray(cards) && cards.length > 0) {
            code = String(cards.map((c: any) => c.ticketCode || c.code || c).filter(Boolean).join(','));
          }
        }
        if (!code) {
          code = String(o.order?.verifyCode || o.order?.verify_code || o.order?.ticketCode || o.order?.ticketNo || o.verifyCode || o.verify_code || o.ticketCode || o.pickupCode || o.ticketNo || '');
        }
        const seatList =
          o.order?.seatMessage ||
          o.orderShopList?.map((d: any) => d.seatName || d.seat_name).filter(Boolean).join('，') ||
          '';
        if (code) {
          setTicketInfo({ verifyCode: code, seatText: seatList });
        } else if (attempts < 3) {
          // 出票可能延迟，重试最多 3 次
          setTimeout(() => fetchTicketInfo(id, attempts + 1), 2000);
        }
      }
    } catch (e) {
      console.error('Failed to fetch ticket info:', e);
    }
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
            setPayResult('success');
            setPayMessage('支付成功！');
            setSelectedSeats([]);
            if (createdOrderId) {
              fetchTicketInfo(createdOrderId);
            }
          }
        }
      } catch {
        // keep polling
      }
    }, 2000);
  };

  const doTicketPay = async () => {
    if (paying || !orderId) return;

    const actualAmount = calcAmount ?? totalPrice;

    if (payType === '3' && memberTotalBalance !== null && memberTotalBalance < actualAmount) {
      setPayResult('failed');
      setPayMessage(`余额不足（当前 ¥${memberTotalBalance.toFixed(2)}）`);
      return;
    }

    setPaying(true);
    setPayResult('idle');
    setPayMessage('');
    setQrContent('');

    try {
      // 如果选了券，先调 priceCalc 获取最终支付金额
      let finalAmount = actualAmount;
      // 判断券类型：观影金(couponKind=4) vs 优惠券(couponKind=1)
      const usingViewAmount = selectedViewAmountIds.length > 0;
      const usingCoupon = selectedCouponIds.length > 0;
      const couponKind = usingViewAmount ? 4 : (usingCoupon ? 1 : 0);

      if (usingViewAmount || usingCoupon) {
        const seatCodes = selectedSeats.map((s) => s.seatCode).join(',');
        // 小程序逻辑：观影金只传 viewAmountList，优惠券只传 couponList，不混传
        const calcData: Record<string, any> = {
          orderType: 1,
          payType,
          scheduleId: schedule.scheduleId,
          seatCode: seatCodes,
          channelId: 1,
          cinemaId,
        };
        if (usingViewAmount) {
          calcData.viewAmountList = selectedViewAmountIds;
        } else {
          calcData.couponList = selectedCouponIds;
        }
        const calcResp = await api.priceCalc(calcData);
        if (calcResp.success && calcResp.result) {
          const r = calcResp.result as any;
          finalAmount =
            Number(
              r.totalVoucherPrice ??
                (typeof r.totalSalePrice === 'number' && typeof r.voucherDiscount === 'number'
                  ? r.totalSalePrice + r.voucherDiscount
                  : null) ??
                r.payAmount ??
                r.actualAmount ??
                r.amount ??
                totalPrice
            );
        }
      }

      // 构建 payV3 订单参数（与小程序 ensureCreatePaymentOrder 对齐）
      const orderItem: Record<string, any> = {
        payAmount: finalAmount,
        type: 1,
        orderId,
        couponList: usingViewAmount ? [] : selectedCouponIds,
        equityCardList: [],
      };
      // 观影金时设 viewAmountList + couponKind=4；优惠券时设 couponKind=1
      if (usingViewAmount) {
        orderItem.viewAmountList = selectedViewAmountIds;
        orderItem.couponKind = 4;
      } else if (usingCoupon) {
        orderItem.couponKind = 1;
      }

      const payResp = await api.payV3({
        orders: [orderItem],
        payType,
        phone: account?.phone || '',
        totalPayAmount: finalAmount,
        channel: 1,
        cinemaId,
      });

      if (!payResp.success || !payResp.result) {
        setPayResult('failed');
        setPayMessage(payResp.message || '创建支付订单失败');
        setPaying(false);
        return;
      }

      const result = payResp.result;
      const paymentOrderId = result.paymentOrder?.id || '';
      const paymentStatus = result.paymentOrder?.status;

      // 支付成功前先把展示信息保存下来，避免清空 selectedSeats 后显示 0 座
      const savedSeatText = selectedSeats.map((s) => `${s.rowNum || ''}排${s.columnNum || ''}座`).join('，');

      if (payType === '3') {
        if (paymentStatus === '3') {
          setPayOrderInfo({
            filmName: schedule.filmName || '',
            showTime: schedule.startTime?.substring(5, 16) || '',
            seatText: savedSeatText,
            totalPrice,
            actualPrice: finalAmount,
          });
          setPayResult('success');
          setPayMessage('支付成功！');
          setSelectedSeats([]);
          fetchTicketInfo(orderId);
        } else {
          setPayResult('failed');
          setPayMessage('余额支付失败：' + (payResp.message || '未知错误'));
        }
      } else {
        if (paymentStatus === '3') {
          setPayOrderInfo({
            filmName: schedule.filmName || '',
            showTime: schedule.startTime?.substring(5, 16) || '',
            seatText: savedSeatText,
            totalPrice,
            actualPrice: finalAmount,
          });
          setPayResult('success');
          setPayMessage('支付成功！');
          setSelectedSeats([]);
          fetchTicketInfo(orderId);
        } else {
          const pkg = result.package || '';
          const prepayId = pkg.replace('prepay_id=', '');
          if (!prepayId) {
            setPayResult('failed');
            setPayMessage('未获取到微信支付参数');
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
            setPayResult('failed');
            setPayMessage('未获取到支付订单ID');
          }
        }
      }
    } catch (e: any) {
      setPayResult('failed');
      setPayMessage(e.message || '支付失败');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-none sm:rounded-2xl w-full h-full sm:h-[90vh] sm:max-w-4xl flex flex-col overflow-hidden">
        {/* 未完成订单提示（参考小程序"您有一个购票订单未完成"） */}
        {pendingOrder && (
          <div className="absolute inset-0 z-20 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl">
              <div className="p-5 text-center">
                <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-3" />
                <p className="text-base text-gray-800 leading-relaxed">
                  您有一个购票订单未完成，请继续支付或取消后重新选座。
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  订单号：{pendingOrder.id || pendingOrder.orderId}
                </p>
              </div>
              <div className="grid grid-cols-2 border-t">
                <button
                  onClick={cancelPendingOrder}
                  disabled={cancelling}
                  className="py-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 border-r"
                >
                  {cancelling ? '取消中...' : '取消订单'}
                </button>
                <button
                  onClick={continuePendingOrder}
                  className="py-3.5 text-sm font-medium text-pink-600 hover:bg-pink-50"
                >
                  继续支付
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Screenshot area: cinema header + movie info + seat grid */}
        <div id="seat-capture-area" className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center px-4 py-3 border-b shrink-0">
            <button
              onClick={onClose}
              className="p-2 -ml-2 hover:bg-gray-100 rounded-full"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 text-center">
              <p className="font-bold truncate px-4">{cinemaName || '影院'}</p>
            </div>
            <button
              onClick={captureSeatArea}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50"
              title="复制座位图到剪贴板"
            >
              <Camera className="w-4 h-4" />
              截图
            </button>
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-60"
              title="刷新座位状态"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              加载座位中...
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              {error}
            </div>
          ) : (
            <>
              {/* Movie info */}
              <div className="px-4 py-3 bg-pink-50 shrink-0">
                <h3 className="font-bold text-lg">
                  {schedule.filmName}
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    {schedule.language} {formatDimensional(schedule.dimensional)}
                  </span>
                </h3>
                <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {schedule.startTime?.substring(5, 16)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    散场 {schedule.endTime?.substring(11, 16)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {schedule.name || schedule.hallName}
                  </span>
                </div>
              </div>

              {/* Seat area */}
              <div
                ref={seatAreaRef}
                className="flex-1 overflow-hidden bg-gray-50 p-4 relative"
              >
                <div
                  className="origin-top transition-transform"
                  style={{
                    transform: `scale(${scale})`,
                    width: layoutWidth || 'auto',
                    height: layoutHeight || 'auto',
                  }}
                >
                  {/* Screen */}
                  <div className="relative h-10 mb-6 mx-auto max-w-xl">
                    <div className="absolute inset-x-8 top-0 h-6 bg-gradient-to-b from-gray-200 to-transparent rounded-b-lg" />
                    <p className="absolute inset-x-0 top-1 text-center text-xs text-gray-400">
                      银幕中央
                    </p>
                  </div>

                  {/* Legend */}
                  <div className="flex items-center justify-center gap-4 mb-4 text-xs flex-wrap">
                    <span className="flex items-center gap-1">
                      <span className="w-5 h-5 rounded bg-white border border-pink-300" />
                      可售
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-5 h-5 rounded bg-red-500 border border-red-600" />
                      已售
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-5 h-5 rounded bg-gray-300 border border-gray-400" />
                      停用
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-5 h-5 rounded bg-pink-100 border border-pink-400 flex items-center justify-center">
                        <Heart className="w-3 h-3 text-pink-500" strokeWidth={2} />
                      </span>
                      情侣座
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-5 h-5 rounded bg-pink-100 border border-pink-400 flex items-center justify-center">
                        <Heart className="w-3 h-3 text-pink-500" strokeWidth={2} />
                      </span>
                      按摩椅
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-5 h-5 rounded bg-green-500 border border-green-600 flex items-center justify-center">
                        <span className="text-[10px] text-white font-medium">1</span>
                      </span>
                      已选
                    </span>
                  </div>

                  {/* Grid */}
                  <div className="pb-4">
                    {rows.map((y) => {
                      const rowSeats = seats.filter((s) => s.ycode === y);
                      const firstSeat = rowSeats[0];
                      return (
                        <div
                          key={y}
                          className="flex items-center justify-center gap-1.5 mb-1.5"
                        >
                          <span className="text-xs text-gray-500 w-8 text-right mr-2 shrink-0">
                            {firstSeat?.rowNum || y}
                          </span>
                          {Array.from(
                            { length: maxX - minX + 1 },
                            (_, i) => minX + i
                          ).map((x) => {
                            const seat = seatByCoord.get(`${x},${y}`);
                            if (!seat) {
                              return (
                                <div key={x} className="w-7 h-7 shrink-0" />
                              );
                            }

                            const sold = isSoldSeat(seat);
                            const disabled = isDisabledSeat(seat);
                            const isAvailable = !sold && !disabled;
                            const isSelected = selectedSeats.some(
                              (s) => s.seatCode === seat.seatCode
                            );
                            const isLove = isCoupleSeat(seat, seats) || isMassageSeat(seat);

                            return (
                              <button
                                key={x}
                                onClick={() => toggleSeat(seat)}
                                disabled={!isAvailable}
                                title={`${seat.rowNum || ''}排${
                                  seat.columnNum || ''
                                }座`}
                                className={`
                                  w-7 h-7 shrink-0 rounded flex items-center justify-center transition-colors
                                  ${
                                    isSelected
                                      ? 'bg-green-500 border border-green-600'
                                      : sold
                                      ? 'bg-red-500 border border-red-600 cursor-not-allowed'
                                      : disabled
                                      ? 'bg-gray-300 border border-gray-400 cursor-not-allowed'
                                      // 可售座位统一白色（与猫眼一致）；情侣座保持粉色主题
                                      : isLove
                                      ? 'bg-pink-50 border border-pink-400 hover:bg-pink-100'
                                      : 'bg-white border border-pink-300 hover:bg-pink-50'
                                  }
                                `}
                              >
                                {isLove ? (
                                  <Heart
                                    className={`w-4 h-4 ${
                                      isSelected || sold || disabled
                                        ? 'text-white'
                                        : 'text-pink-500'
                                    }`}
                                    strokeWidth={2}
                                    fill={
                                      isSelected || sold || disabled
                                        ? 'currentColor'
                                        : 'none'
                                    }
                                  />
                                ) : (
                                  <span
                                    className={`text-xs font-medium ${
                                      isSelected || sold || disabled
                                        ? 'text-white'
                                        : 'text-pink-500'
                                    }`}
                                  >
                                    {seat.columnNum || ''}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>

                  {/* Recommended seats */}
                  <div className="mt-4 flex items-center gap-3 px-2">
                    <span className="text-sm text-gray-500">推荐座位</span>
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        onClick={() => recommend(n)}
                        className="px-4 py-1.5 text-sm border rounded-lg hover:bg-pink-50 hover:border-pink-300"
                      >
                        {n}人
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Bottom bar */}
        <div className="px-4 py-3 border-t bg-white shrink-0">
          {selectedSeats.length === 0 ? (
            <button className="w-full py-3 bg-pink-300 text-white rounded-lg font-medium cursor-not-allowed">
              请先选座
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm">
                  已选 {selectedSeats.length} 座：
                  <span className="text-gray-600 ml-1">
                    {selectedSeats
                      .map(
                        (s) =>
                          `${s.rowNum || ''}排${s.columnNum || ''}座`
                      )
                      .join('，')}
                  </span>
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  点击右侧按钮下单支付
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-pink-600">
                  ¥{totalPrice.toFixed(2)}
                </p>
              </div>
              <button
                onClick={openPay}
                className="px-6 py-2.5 bg-pink-500 hover:bg-pink-600 text-white rounded-lg font-bold"
              >
                确认支付
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      {showPay && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]" onClick={closePay}>
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-lg">确认支付</h3>
              <button onClick={closePay} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{schedule.filmName}</span>
                  <span className="text-gray-800">{schedule.startTime?.substring(5, 16)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {selectedSeats.length} 座：
                    {selectedSeats.map((s) => `${s.rowNum || ''}排${s.columnNum || ''}座`).join('，')}
                  </span>
                </div>
                <div className="border-t pt-2 flex items-center justify-between font-bold">
                  <span>合计</span>
                  <span className="text-red-500">
                    ¥{(calcAmount ?? totalPrice).toFixed(2)}
                    {calcAmount !== null && calcAmount < totalPrice && (
                      <span className="text-xs text-gray-400 line-through ml-2">¥{totalPrice.toFixed(2)}</span>
                    )}
                  </span>
                </div>
              </div>

              {payResult === 'idle' && (
                <>
                  {/* 优惠券/观影金选择 */}
                  {creatingOrder && (
                    <div className="flex items-center justify-center py-4 text-sm text-gray-400">
                      <Loader className="w-4 h-4 animate-spin mr-2" />
                      正在创建订单...
                    </div>
                  )}
                  {!creatingOrder && orderId && (
                    <>
                      {loadingVouchers ? (
                        <div className="flex items-center justify-center py-4 text-sm text-gray-400">
                          <Loader className="w-4 h-4 animate-spin mr-2" />
                          加载优惠券...
                        </div>
                      ) : voucherList.length > 0 ? (
                        <div className="space-y-3">
                          {/* 优惠券 */}
                          {voucherList.filter((v: any) => String(v.couponKind || v.kind || v.type || '') !== '4').length > 0 && (
                            <div>
                              <p className="text-sm font-medium mb-2 text-gray-700">优惠券</p>
                              <div className="space-y-2 max-h-40 overflow-y-auto">
                                {voucherList
                                  .filter((v: any) => String(v.couponKind || v.kind || v.type || '') !== '4')
                                  .map((v: any) => {
                                    const vid = String(v.memberVoucherId || v.id || v.voucherId || v.voucherNo || '');
                                    const vname = v.voucherName || v.name || v.title || '优惠券';
                                    const vamount = Number(v.value || v.amount || v.faceValue || v.denomination || v.price || 0);
                                    const vcond = v.useCondition || v.condition || v.remarks || v.remark || '';
                                    const validity = v.validityTerm || '';
                                    const checked = selectedCouponIds.includes(vid);
                                    return (
                                      <button
                                        key={vid}
                                        onClick={() => {
                                          setSelectedCouponIds(prev =>
                                            prev.includes(vid) ? prev.filter(i => i !== vid) : [...prev, vid]
                                          );
                                        }}
                                        className={`w-full flex flex-col p-3 rounded-lg border-2 transition-colors text-left ${
                                          checked ? 'border-pink-500 bg-pink-50' : 'border-gray-200'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between">
                                          <p className="text-sm font-medium truncate">{vname}</p>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-red-500 font-bold text-sm">{vamount > 0 ? `-¥${vamount.toFixed(2)}` : ''}</span>
                                            {checked && <Check className="w-4 h-4 text-pink-500" />}
                                          </div>
                                        </div>
                                        <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                                          {validity && <p>有效期：{validity}</p>}
                                          {vcond && <p>{vcond}</p>}
                                        </div>
                                      </button>
                                    );
                                  })}
                              </div>
                            </div>
                          )}
                          {/* 观影金 */}
                          {voucherList.filter((v: any) => String(v.couponKind || v.kind || v.type || '') === '4').length > 0 && (
                            <div>
                              <p className="text-sm font-medium mb-2 text-gray-700">观影金</p>
                              <div className="space-y-2 max-h-40 overflow-y-auto">
                                {voucherList
                                  .filter((v: any) => String(v.couponKind || v.kind || v.type || '') === '4')
                                  .map((v: any) => {
                                    // 观影金传给 priceCalc / payV3 的是 memberVoucherId（用户拥有的券实例）
                                    const vid = String(v.memberVoucherId || v.id || v.voucherId || v.voucherNo || '');
                                    const vname = v.voucherName || v.name || v.title || '观影金';
                                    const vamount = Number(v.value || v.amount || v.faceValue || v.denomination || v.price || 0);
                                    const validity = v.validityTerm || '';
                                    const remark = v.remarks || v.remark || '';
                                    const usePay = v.usePay || '';
                                    const useStore = v.useStore || '';
                                    const checked = selectedViewAmountIds.includes(vid);
                                    return (
                                      <button
                                        key={vid}
                                        onClick={() => {
                                          setSelectedViewAmountIds(prev =>
                                            prev.includes(vid) ? prev.filter(i => i !== vid) : [...prev, vid]
                                          );
                                        }}
                                        className={`w-full flex flex-col p-3 rounded-lg border-2 transition-colors text-left ${
                                          checked ? 'border-pink-500 bg-pink-50' : 'border-gray-200'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between">
                                          <p className="text-sm font-medium truncate">{vname}</p>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-red-500 font-bold text-sm">{vamount > 0 ? `¥${vamount.toFixed(2)}` : ''}</span>
                                            {checked && <Check className="w-4 h-4 text-pink-500" />}
                                          </div>
                                        </div>
                                        <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                                          {validity && <p>有效期：{validity}</p>}
                                          {remark && <p>{remark}</p>}
                                          {usePay && <p>{usePay}</p>}
                                          {useStore && <p>适用门店：{useStore}</p>}
                                        </div>
                                      </button>
                                    );
                                  })}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 text-center py-2">暂无可用优惠券</p>
                      )}
                    </>
                  )}

                  <div>
                    <p className="text-sm font-medium mb-2 text-gray-700">选择支付方式</p>
                    <button
                      onClick={() => setPayType('3')}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${
                        payType === '3' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      }`}
                    >
                      <Wallet className="w-5 h-5 text-blue-500" />
                      <div className="text-left">
                        <span className="text-sm font-medium">余额支付</span>
                        {memberTotalBalance !== null && (
                          <span className="text-xs text-gray-400 block">
                            账户余额 ¥{memberTotalBalance.toFixed(2)}
                            {memberViewAmount ? `（含观影金 ¥${memberViewAmount.toFixed(2)}）` : ''}
                          </span>
                        )}
                      </div>
                    </button>
                  </div>

                  {memberTotalBalance !== null && memberTotalBalance < (calcAmount ?? totalPrice) && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-600">
                      余额不足（当前 ¥{memberTotalBalance.toFixed(2)}）
                    </div>
                  )}

                  <button
                    onClick={doTicketPay}
                    disabled={paying || creatingOrder || !orderId || (memberTotalBalance !== null && memberTotalBalance < (calcAmount ?? totalPrice))}
                    className={`w-full py-3 rounded-xl font-bold text-white transition-colors ${
                      paying || creatingOrder || !orderId || (memberTotalBalance !== null && memberTotalBalance < (calcAmount ?? totalPrice))
                        ? 'bg-gray-300 cursor-not-allowed'
                        : 'bg-blue-500 hover:bg-blue-600'
                    }`}
                  >
                    {paying ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader className="w-5 h-5 animate-spin" />
                        处理中...
                      </span>
                    ) : (
                      `余额支付 ¥${(calcAmount ?? totalPrice).toFixed(2)}`
                    )}
                  </button>
                </>
              )}

              {payResult === 'waiting' && qrContent && (
                <div className="flex flex-col items-center py-4">
                  <div className="bg-white p-4 rounded-2xl border-2 border-green-200 mb-4">
                    <QRCodeSVG value={qrContent} size={200} level="M" />
                  </div>
                  <p className="text-sm text-gray-600 mb-1">请用微信扫一扫</p>
                  <p className="text-xs text-gray-400">支付金额：¥{(calcAmount ?? totalPrice).toFixed(2)}</p>
                  <div className="flex items-center gap-2 mt-3 text-sm text-green-500">
                    <Loader className="w-4 h-4 animate-spin" />
                    <span>等待支付...</span>
                  </div>
                </div>
              )}

              {payResult === 'success' && (
                <div className="flex flex-col items-center py-4">
                  <CheckCircle className="w-14 h-14 text-green-500 mb-2" />
                  <p className="text-lg font-bold text-gray-800 mb-4">{payMessage}</p>

                  {ticketInfo?.verifyCode ? (
                    <div
                      ref={ticketCardRef}
                      className="w-full border rounded-xl p-4 bg-white space-y-4"
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between border-b pb-3">
                        <h3 className="font-bold text-base">
                          {cinema?.cinemaName || '影院'}
                        </h3>
                        <button
                          onClick={captureTicketCard}
                          className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
                          title="截图"
                        >
                          <Camera className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Movie info */}
                      <div className="text-left space-y-1">
                        <p className="font-bold text-lg">
                          {payOrderInfo?.filmName || schedule.filmName}
                        </p>
                        <p className="text-sm text-pink-500">
                          {payOrderInfo?.showTime || schedule.startTime?.substring(5, 16)}{' '}
                          {schedule.language && `（${schedule.language}${schedule.edition ? ` ${schedule.edition}` : ''}）`}
                        </p>
                        <p className="text-sm text-gray-400">
                          {schedule.name || schedule.hallName}
                        </p>
                        {(ticketInfo.seatText || payOrderInfo?.seatText) && (
                          <p className="text-xl font-medium mt-2">
                            {ticketInfo.seatText || payOrderInfo?.seatText}
                          </p>
                        )}
                      </div>

                      {/* Verify code + QR */}
                      <div className="border-t border-b py-4 text-center space-y-3">
                        <p className="text-sm text-gray-500">取票码</p>
                        <div className="flex items-center justify-center gap-2">
                          <p className="text-2xl font-mono font-medium tracking-wider">
                            {formatVerifyCode(ticketInfo.verifyCode)}
                          </p>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(ticketInfo.verifyCode);
                              onToast('取票码已复制');
                            }}
                            className="p-1.5 text-gray-400 hover:text-pink-500"
                            title="复制"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex justify-center">
                          <QRCodeSVG value={ticketInfo.verifyCode} size={180} level="M" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">正在获取取票码...</p>
                  )}

                  <button
                    onClick={closePay}
                    className="mt-6 px-8 py-2.5 bg-pink-500 hover:bg-pink-600 text-white rounded-xl font-medium"
                  >
                    完成
                  </button>
                </div>
              )}

              {payResult === 'failed' && (
                <div className="flex flex-col items-center py-6">
                  <AlertCircle className="w-16 h-16 text-red-500 mb-3" />
                  <p className="text-lg font-bold text-gray-800 px-2 text-center">{payMessage}</p>
                  {orderId && (
                    <p className="text-xs text-gray-400 mt-2">订单号：{orderId}</p>
                  )}
                  <div className="flex items-center gap-3 mt-5">
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
                      className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium"
                    >
                      返回重试
                    </button>
                    {orderId && (
                      <button
                        onClick={async () => {
                          if (paying) return;
                          setPaying(true);
                          try {
                            const resp = await api.cancelOrder(orderId);
                            if (resp.success) {
                              onToast('订单已取消，座位已释放');
                              closePay();
                              setSelectedSeats([]);
                              onRefresh?.();
                            } else {
                              onToast(resp.message || '取消订单失败');
                            }
                          } catch (e: any) {
                            onToast(e.message || '取消订单失败');
                          } finally {
                            setPaying(false);
                          }
                        }}
                        className="px-6 py-2.5 bg-white border border-red-300 hover:bg-red-50 text-red-600 rounded-xl font-medium"
                      >
                        取消订单释放座位
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

async function copyRegionToClipboard(element: HTMLElement) {
  if (!window.electronAPI?.captureRegion) {
    throw new Error('截图功能仅在桌面应用中可用');
  }
  // Scroll element to top first, then read rect so coordinates match the viewport
  element.scrollIntoView({ block: 'start', behavior: 'instant' as any });
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const rect = element.getBoundingClientRect();
  const result = await window.electronAPI.captureRegion({
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  });
  if (result.success) {
    return;
  }
  throw new Error(result.error || '截图失败');
}

function normalizeSeats(
  seats: any[],
  typeMap: Map<string, SeatTypeInfo>,
  priceBySeat: Map<string, number> = new Map(),
  defaultPrice: number = 0
): Seat[] {
  if (!Array.isArray(seats)) return [];
  const list = seats.map((s) => {
    const seatCode = String(s.seatCode || '');
    // 优先按 seatCode 匹配价格；匹配不到用全场基准价；再不行用 typeMap 或 fee
    const seatPrice =
      priceBySeat.get(seatCode) ??
      defaultPrice ??
      typeMap.get(String(s.type || ''))?.specialPrice ??
      s.fee ??
      0;
    const typeInfo = typeMap.get(String(s.seatCode || s.type || ''));
    return {
      ...s,
      price: seatPrice,
      specialPrice: seatPrice,
      seatTypeName: typeInfo?.type,
    } as Seat;
  });
  list.sort(
    (a, b) =>
      (a.ycode || 0) - (b.ycode || 0) ||
      (a.xcode || 0) - (b.xcode || 0)
  );
  return list;
}

function isSoldSeat(seat: Seat): boolean {
  if (seat.isSold === true) return true;
  if (seat.seatStatus && seat.seatStatus !== '0') return true;
  if (seat.ticketState && seat.ticketState !== '0') return true;
  if (seat.isChoosed === true) return true;
  // canSale=0 = 已售/不可售（影院接口用 canSale 标记已售座位）
  if (seat.canSale === '0' || seat.canSale === 0) return true;
  return false;
}

function isDisabledSeat(seat: Seat): boolean {
  if (seat.canSale === '-1' || seat.canSale === -1) return true; // 停用（走道/无座位）
  if (seat.isCanBuy === false) return true;
  return false;
}

function isSeatAvailable(seat: Seat): boolean {
  return !isSoldSeat(seat) && !isDisabledSeat(seat);
}

function isCoupleSeat(seat: Seat, allSeats: Seat[]): boolean {
  if (!seat.seatGroup) return false;
  const partners = allSeats.filter(
    (s) => s.seatGroup === seat.seatGroup && s.seatCode !== seat.seatCode
  );
  return partners.length > 0;
}

function isMassageSeat(seat: Seat): boolean {
  const name = String(seat.seatTypeName || seat.area || '').toLowerCase();
  return name.includes('按摩');
}

function formatDimensional(val?: string): string {
  if (!val) return '';
  const map: Record<string, string> = {
    '1': '2D',
    '2': '3D',
    '3': 'IMAX',
    '4': '4DX',
    '5': 'Dolby',
  };
  return map[val] || val;
}
