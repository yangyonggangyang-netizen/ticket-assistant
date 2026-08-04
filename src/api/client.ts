import axios from 'axios';
import type {
  ApiResponse,
  Account,
  Cinema,
  Movie,
  Schedule,
  Seat,
  Order,
  MemberInfo,
  PayType,
  Voucher,
  StoredCard,
  MallChannel,
  GoodsKind,
  Goods,
  PaymentResult,
  SetMeal,
} from '../types';

// ===== yq30 API Configuration =====
const MERCHANT_CODE = '860753002';
const BASE_URL = `https://${MERCHANT_CODE}.api.yq30.com/jeecg-boot`;
const SHOP_URL = 'https://applet.isol.com.cn';

// ===== Token Management =====
let currentToken = '';
let currentMemberId = '';

export function setAuth(token: string, memberId: string) {
  currentToken = token;
  currentMemberId = memberId;
}

export function getToken() {
  return currentToken;
}

export function getMemberId() {
  return currentMemberId;
}

// ===== Request Wrapper =====
async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  data: Record<string, any> = {},
  useShopUrl: boolean = false,
  isJson: boolean = false,
  skipMemberId: boolean = false
): Promise<ApiResponse<T>> {
  const baseUrl = useShopUrl ? SHOP_URL : BASE_URL;
  const url = baseUrl + path;

  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
    'Access-Control-Max-Age': '86400',
    Accept: 'application/json',
    checktoken: '0',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 MicroMessenger/8.0.49',
  };

  // Set content type
  if (method === 'POST' || method === 'PUT') {
    if (isJson) {
      headers['Content-Type'] = 'application/json; charset=UTF-8';
    } else {
      headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    }
  }

  // Add token header (except for login/captcha endpoints)
  if (currentToken && !path.includes('/api/member/login') && !path.includes('/api/captcha/')) {
    headers['X-Access-Token'] = currentToken;
  }

  // Auto-add memberId to data (unless explicitly skipped, e.g. captcha/create)
  const requestData = { ...data };
  if (!skipMemberId && !requestData.memberId && currentMemberId) {
    requestData.memberId = currentMemberId;
  }
  // Clean up empty memberId so it doesn't get sent as an empty param
  if (!requestData.memberId) {
    delete requestData.memberId;
  }

  try {
    let resp;
    if (method === 'GET') {
      resp = await axios.get(url, { params: requestData, headers, timeout: 15000 });
    } else if (method === 'POST') {
      if (isJson) {
        resp = await axios.post(url, requestData, { headers, timeout: 15000 });
      } else {
        resp = await axios.post(url, null, { params: requestData, headers, timeout: 15000 });
      }
    } else if (method === 'PUT') {
      if (isJson) {
        resp = await axios.put(url, requestData, { headers, timeout: 15000 });
      } else {
        resp = await axios.put(url, null, { params: requestData, headers, timeout: 15000 });
      }
    } else {
      resp = await axios.delete(url, { params: requestData, headers, timeout: 15000 });
    }

    return resp.data as ApiResponse<T>;
  } catch (e: any) {
    if (e.response) {
      const msg = e.response.data?.message || e.response.statusText;
      return { success: false, message: msg, code: e.response.status, result: null as T };
    }
    return { success: false, message: e.message || '网络错误', code: -1, result: null as T };
  }
}

// GET request (most reads)
async function get<T>(
  path: string,
  data: Record<string, any> = {},
  skipMemberId: boolean = false
): Promise<ApiResponse<T>> {
  return request<T>('GET', path, data, false, false, skipMemberId);
}

// POST request (form data)
async function post<T>(path: string, data: Record<string, any> = {}): Promise<ApiResponse<T>> {
  return request<T>('POST', path, data, false, false);
}

// POST request (JSON body)
async function postJson<T>(path: string, data: Record<string, any> = {}): Promise<ApiResponse<T>> {
  return request<T>('POST', path, data, false, true);
}

// PUT request (form data)
async function put<T>(path: string, data: Record<string, any> = {}): Promise<ApiResponse<T>> {
  return request<T>('PUT', path, data, false, false);
}

// ===== Date helper (matches mini-program's Date.Format) =====
function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ===== API Methods =====
export const api = {
  // ===== Cinema =====
  getCinemaList: () => get<Cinema[]>('/api/film/getCinemaList'),

  // ===== Movies =====
  getNowPlayMovies: (cinemaId: string = '', pageNo: number = 1, pageSize: number = 20) =>
    post<{ records: Movie[]; total: number; size: number; current: number; pages: number }>(
      '/api/film/getNowPlayMovies',
      {
        startDate: formatDate(new Date()),
        endDate: '',
        pageSize,
        pageNo,
        cinemaId,
        infoType: 1,
      }
    ),

  getFilmDetail: (id: string) => get('/film/film/queryById', { id }),

  // ===== Schedules =====
  getScheduleAllFilm: (cinemaId: string, startDate?: string) =>
    get('/api/film/getScheduleAllFilm', {
      cinemaId,
      startDate: startDate || formatDate(new Date()),
    }),

  getSeatByScheduleId: (scheduleId: string) =>
    get<Seat[]>('/api/seat/getSeatByScheduleId', { id: scheduleId }),

  getSeatTypeWithTicketPrice: (scheduleId: string, balanceFlag: string = '1') =>
    get('/api/film/getSeatTypeWithTicketPrice', { filmScheduleId: scheduleId, balanceFlag }),

  getTicketPriceBySeatV2: (scheduleId: string, seatIds: string) =>
    get('/api/film/getTicketPriceBySeatV2', { scheduleId, seatIds }),

  getLevelPriceByScheduleId: (scheduleId: string) =>
    get('/api/film/getLevelPriceByScheduleId', { scheduleId }),

  getRoomService: (scheduleId: string) =>
    get('/film/filmSchedule/getRoomService', { scheduleId }),

  // ===== Member =====
  getMemberInfoById: () => get<MemberInfo>('/api/member/getMemberInfoById'),

  getMemberLevelList: () => get('/api/member/getMemberLevelList'),

  editMemberInfo: (data: Partial<MemberInfo>) => put('/api/member/editMemberInfo', data),

  updatePhoneNumber: (phone: string, code: string) =>
    post('/api/member/updatePhoneNumber', { phone, code }),

  wxResetPassword: (consumerPassword: string) =>
    postJson('/api/member/wxResetPassword', { consumerPassword }),

  checkPassword: (memberId: string, consumerPassword: string) =>
    postJson('/api/member/checkPassword', { memberId, consumerPassword }),

  // 小程序注册流程相关接口（桌面端目前无法完成登录，因为后端登录只认微信 code）
  sendCaptcha: (phone: string) =>
    get('/api/captcha/create', { phone }, true),

  queryMemberByPhone: (phone: string, flag: number = 1) =>
    get('/member/memberInfo/queryByPhone', { phone, flag }),

  registerMember: (data: Record<string, any>) =>
    post('/api/member/register', data),

  updateMemberOpenId: (phone: string) =>
    postJson('/member/memberInfo/updateMemberOpenId', { phone }),

  // 尝试手机号+验证码直接登录（小程序实际登录接口需抓包确认）
  phoneLogin: (phone: string, code: string) =>
    post('/api/member/login', { phone, code }),

  // ===== Orders =====
  getOrderList: (pageNo: number = 1, pageSize: number = 20) =>
    get<{ records: any[]; total: number } | any[]>('/api/order/getSaleOrder', {
      pageNo,
      pageSize,
      flag: 1,
    }),

  getSaleOrder: (orderId: string) => get('/api/order/getSaleOrder', { orderId }),

  getPaymentOrder: (orderId: string) => get('/api/order/getPaymentOrder', { orderId }),

  refundTicket: (orderId: string) => post('/api/order/refundTicket', { orderId }),

  ticketMessage: (orderId: string) => get('/api/order/ticketMessage', { orderId }),

  createTicketOrder: (data: Record<string, any>) =>
    post('/api/order/createTicketOrder', data),

  // 小程序用 postClientActionWithJson (POST JSON)
  createSaleOrder: (data: Record<string, any>) =>
    postJson('/api/order/createSaleOrder', data),

  createSaleOrderV2: (data: Record<string, any>) =>
    postJson('/api/order/createSaleOrderV2', data),

  // 卡类商品下单
  createCardGoodsOrder: (data: Record<string, any>) =>
    postJson('/api/order/createCardGoodsOrder', data),

  // 取消订单
  cancelOrder: (orderId: string) =>
    post('/api/order/chanelOrder', { orderId }),

  // ===== Payment =====
  // 小程序用 getClientAction (GET)
  getTicketPayType: (filmScheduleId: string) =>
    get<PayType>('/api/pay/getTicketPayType', { channel: 1, filmScheduleId }),

  getGoodsPayType: (cinemaId: string, goodsIds: string) =>
    get<PayType>('/api/pay/getGoodsPayType', { channel: 1, cinemaId, goodsIds }),

  // 小程序用 postClientActionWithJson (POST JSON)
  payV2: (data: Record<string, any>) =>
    postJson<PaymentResult>('/api/pay/payV2', data),

  payV3: (data: Record<string, any>) =>
    postJson<PaymentResult>('/api/pay/payV3', data),

  // 小程序用 postClientActionWithJson (POST JSON)
  queryWechatOrder: (paymentOrderId: string) =>
    postJson<{ code: string }>('/api/pay/queryWechatOrder', { paymentOrderId }),

  // 完成支付订单通知
  completePayOrder: (data: Record<string, any>) =>
    postJson('/wxpay/notify/completePayOrder', data),

  // 通知等待状态
  notifyWaitState: (paymentOrderId: string) =>
    postJson('/api/pay/notifyWaitState', { paymentOrderId }),

  // ===== Price =====
  priceCalc: (data: Record<string, any>) => postJson('/api/price/calc', data),

  goodsCalc: (data: Record<string, any>) => post('/api/price/goodsCalc', data),

  // ===== Activity / Voucher =====
  getMemberVouchers: (state: number = 1, pageNo: number = 1, pageSize: number = 50) =>
    get<{ records: Voucher[]; total: number }>('/api/activity/getAllVoucherByMemberId', {
      state,
      pageNo,
      pageSize,
    }),

  getVoucherUseByNo: (voucherNo: string) =>
    get('/api/activity/getVoucherUseByNo', { voucherNo }),

  getVoucherList: (orderId: string, payType: string = '') =>
    get('/api/activity/getVoucherList', { orderId, payType }),

  // 卖品可用优惠券列表
  getGoodsVoucherList: (data: Record<string, any> = {}) =>
    get('/api/activity/getGoodsVoucherList', data),

  getDefaultVoucherList: (data: Record<string, any> = {}) =>
    get('/api/activity/getDefaultVoucherList', data),

  getStoredCard: (cinemaId: string = '') =>
    get<StoredCard[]>('/api/activity/getStoredCard', { cinemaId, goodsFlag: 1 }),

  saveOrder: (data: Record<string, any>) => post('/api/activity/saveOrder', data),

  // 小程序用 postClientActionWithJson (POST JSON)
  saveOrderV2: (data: Record<string, any>) =>
    postJson<{ orderId: string }>('/api/activity/saveOrderV2', data),

  // 储值套餐列表（商城-特惠套餐）
  getSetMeatList: (cinemaId: string, setMealType: string = '3', memberId: string = '') =>
    get<SetMeal[]>('/api/activity/setMeatList', { cinemaId, setMealType, memberId }),

  // 会员续充/储值余额套餐列表（小程序「会员续充」页）
  getMemberStoreBalanceList: (cinemaId: string, pageSize: number = 99, memberId: string = '') =>
    get<{ records: SetMeal[] }>('/setmeal/memberStoreBalance/list', { cinemaId, pageSize, memberId }),

  // 移动端频道套餐列表（小程序「会员储值优惠」频道）
  getMobileChannelSetMealList: (id: string, pageNo: number = 1, pageSize: number = 99, memberId: string = '') =>
    get<{ records: SetMeal[] }>('/api/activity/getMobileChannelSetMealList', { id, pageNo, pageSize, memberId }),

  // 套餐详情
  getSetMeatMessage: (id: string) =>
    get('/api/activity/setMeatMessage', { id }),

  // 通用交易下单（会员储值续充等）
  superTrans: (data: Record<string, any>) =>
    postJson<PaymentResult>('/trans/superTrans', data),

  // ===== Goods / Snacks =====
  // 小程序用 getClientAction (GET) 调用 getMobileGoodsList
  getMobileGoodsList: (data: Record<string, any> = {}) =>
    get<{ records: Goods[]; total: number; current: number; pages: number }>('/api/goods/getMobileGoodsList', data),

  getMobileGoodsListV1: (data: Record<string, any> = {}) =>
    get('/api/goods/getMobileGoodsListV1', data),

  getDeviceGoods: (cinemaId: string) => get('/api/activity/getDeviceGoods', { cinemaId }),

  // ===== Mall =====
  getMarketChannelList: (cinemaId: string) =>
    get<{ records: MallChannel[] }>('/marketChannel/getlistApplet', { cinemaId }),

  // 小程序用 getClientAction (GET)，路径需有前导 /
  getMobileGoodsFrontKindList: (cinemaId: string) =>
    get<GoodsKind[]>('/api/goods/getMobileGoodsFrontKindList', { cinema_id: cinemaId }),

  // 小程序用 postClientActionWithJson (POST JSON)
  getGoodsKindList: (cinemaId: string, flag: number = 2) =>
    postJson<{ return_data?: { pageData?: GoodsKind[] } }>('/goods/goods/getGoodsKindList', {
      pageIndex: 1,
      pageSize: 999999,
      searchInfo: {},
      cinemaId,
      flag,
    }),

  // ===== Film Charter =====
  getFilmCharterList: (data: Record<string, any> = {}) =>
    post('/film/filmCharter/list', data),

  // ===== System =====
  getShareConfig: () => get('/api/film/getShareConfig'),

  queryParameter: (setName: string, cinemaId: string = '') =>
    get('/film/sysParameter/queryParameter', { setName, cinemaId }),

  getTagDetails: (data: Record<string, any> = {}) => get('/api/film/getTagDetails', data),

  // ===== Transfer =====
  transfer: (data: Record<string, any>) => postJson('/trans/trans', data),

  // ===== Check Token =====
  checkToken: async (): Promise<boolean> => {
    try {
      const resp = await get<MemberInfo>('/api/member/getMemberInfoById');
      return resp.success && resp.result != null;
    } catch {
      return false;
    }
  },
};

// ===== Local IPC API (Electron) =====
export const localApi = {
  loadAccounts: async () => {
    // Use Electron IPC if available, otherwise localStorage
    if (window.electronAPI?.loadAccounts) {
      return await window.electronAPI.loadAccounts();
    }
    const data = localStorage.getItem('accounts');
    return data ? JSON.parse(data) : { accounts: [], activeAccountId: null };
  },

  saveAccounts: async (data: any) => {
    if (window.electronAPI?.saveAccounts) {
      return await window.electronAPI.saveAccounts(data);
    }
    localStorage.setItem('accounts', JSON.stringify(data));
    return true;
  },

  startCapture: async () => {
    if (window.electronAPI?.startCapture) {
      return await window.electronAPI.startCapture();
    }
    throw new Error('Token 捕获功能仅在桌面应用中可用');
  },

  stopCapture: async () => {
    if (window.electronAPI?.stopCapture) {
      return await window.electronAPI.stopCapture();
    }
    return true;
  },
};

// Type declaration for Electron preload
declare global {
  interface Window {
    electronAPI?: {
      loadAccounts: () => Promise<any>;
      saveAccounts: (data: any) => Promise<boolean>;
      startCapture: () => Promise<any>;
      stopCapture: () => Promise<boolean>;
      captureRegion: (rect: { x: number; y: number; width: number; height: number }) => Promise<{ success: boolean; data?: string; error?: string }>;
      openPath: (filePath?: string) => Promise<{ success: boolean; error?: string }>;
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
      checkForUpdates: () => Promise<{ success: boolean; info?: any; error?: string }>;
      downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
      installUpdate: () => Promise<{ success: boolean; error?: string }>;
      getAppVersion: () => Promise<string>;
      onUpdateAvailable?: (callback: (info: any) => void) => void;
      onUpdateNotAvailable?: (callback: () => void) => void;
      onDownloadProgress?: (callback: (progress: any) => void) => void;
      onUpdateDownloaded?: (callback: (info: any) => void) => void;
      onUpdaterError?: (callback: (err: string) => void) => void;
      onCaptureProgress?: (callback: (msg: string) => void) => void;
      onCaptureData?: (callback: (data: any) => void) => void;
      onCaptureDone?: (callback: (data: any) => void) => void;
    };
  }
}
