// ===== yq30 API Types =====

// Base API response
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  code: number;
  result: T;
  result1?: any;
  timestamp?: number;
}

// Account (local storage)
export interface Account {
  id: string;
  name: string;
  token: string;
  memberId: string;
  phone?: string;
  level?: string;
  levelDictText?: string;
  cinemaId?: string;
  cinemaName?: string;
  balance?: number;
  score?: number;
  growthNum?: number;
  cardNo?: string;
  wxName?: string;
  wxHeadPortrait?: string;
  createdAt: string;
  lastActiveAt?: string;
  tokenValid?: boolean;
}

// Cinema
export interface Cinema {
  id: string;
  cinemaName: string;
  cinemaCode: string;
  city: string;
  area: string;
  province: string;
  businessStatus: string;
  businessStatusDictText?: string;
  shopId?: number;
  deductions?: string;
  tags?: string;
  place?: string;
  position?: string;
  cinemaTel?: string;
}

// Movie
export interface Movie {
  code: string;
  name?: string;
  originalPrice?: number;
  lowestPrice?: number;
  memberLowestPrice?: number;
  edition?: string;
  edition_dictText?: string;
  type?: string;
  scale?: string;
  length?: string;
  actor?: string;
  introduction?: string;
  poster?: string;
  pic?: string;
  filmSchedule?: {
    filmCode: string;
    isShowing: number;
    priceType: number;
    startTime: string;
    language: string;
    isEquity: number;
  };
  filmSchedules?: Array<{
    filmCode: string;
    isShowing: number;
    priceType: number;
    startTime: string;
    language: string;
    isEquity: number;
  }>;
}

// Schedule
export interface Schedule {
  id?: string;
  scheduleId?: string;
  filmCode?: string;
  filmName?: string;
  cinemaId?: string;
  cinemaName?: string;
  hallId?: string;
  hallName?: string;
  name?: string; // hall name alias
  startTime?: string;
  endTime?: string;
  date?: string;
  price?: number;
  salePrice?: number;
  shopPrice?: number;
  bestPrice?: number;
  originalPrice?: number;
  language?: string;
  edition?: string;
  dimensional?: string;
  dimensionalText?: string;
  screenType?: string;
  canSale?: boolean;
  showFlag?: string;
  balanceFlag?: number;
  mobileTicketShows?: Array<{
    code: string;
    rename?: string;
    price: number;
    name: string;
  }>;
  hallLabel?: Array<{
    labelId: number;
    hallId: string;
    id: number;
    labelName: string;
  }>;
}

// Seat
export interface Seat {
  id?: string;
  seatCode?: string;
  seatNo?: string;
  rowNum?: string;
  rowNo?: string;
  columnNo?: string;
  columnNum?: string;
  xcode?: number;
  ycode?: number;
  sectionId?: string;
  seatId?: string;
  status?: string;
  seatStatus?: string;
  ticketState?: string;
  lovestatus?: number;
  price?: number;
  fee?: number;
  area?: string;
  type?: string; // seat type id
  seatGroup?: string;
  isCanBuy?: boolean;
  canSale?: number | string;
  isSold?: boolean;
  isChoosed?: boolean;
  isQl?: boolean;
  qlSeat?: string;
  hallCode?: string;
  // computed
  seatTypeName?: string;
  specialPrice?: number;
}

// Order
export interface Order {
  id?: string;
  orderId?: string;
  orderNo?: string;
  filmName?: string;
  cinemaName?: string;
  hallName?: string;
  showTime?: string;
  seats?: string;
  buyNum?: number;
  totalAmount?: number;
  payAmount?: number;
  status?: number;
  statusDictText?: string;
  createTime?: string;
  payTime?: string;
  ticketCodes?: string;
}

// Member Info
export interface MemberInfo {
  id?: string;
  phone?: string;
  name?: string;
  level?: string;
  levelDictText?: string;
  balance?: number;
  actual?: number;
  viewAmountBalance?: number;
  totalBalance?: number;
  score?: number;
  growthNum?: number;
  cardNo?: string;
  openId?: string;
  wxName?: string;
  wxHeadPortrait?: string;
  birthday?: string;
  sex?: string;
  regDate?: string;
  sumTicketNum?: number;
  certificateNo?: string;
  certificateType?: string;
}

// Pay Type
export interface PayType {
  payType?: string;
  payTypeName?: string;
  discount?: number;
  isDefault?: boolean;
}

// Voucher / Coupon
export interface Voucher {
  id?: string;
  voucherNo?: string;
  voucherName?: string;
  voucherType?: string;
  amount?: number;
  validStartTime?: string;
  validEndTime?: string;
  status?: number;
  statusDictText?: string;
}

// Stored Card
export interface StoredCard {
  id?: string;
  cardNo?: string;
  cardName?: string;
  balance?: number;
  status?: number;
}

// Mall Channel
export interface MallChannel {
  id?: string;
  channel?: string;
  channelName?: string;
  channelImg?: string;
  url?: string;
  sort?: number;
}

// Goods Kind / Category
export interface GoodsKind {
  id?: string;
  kindName?: string;
  name?: string;
  sort?: number;
}

// Goods / Product
export interface Goods {
  id?: string;
  goodsId?: string;
  goodsName?: string;
  name?: string;
  goodsImg?: string;
  imgUrl?: string;
  imgUrl_M?: string; // 小程序卖品/积分商品图片（完整 URL）
  goodsImgUrl?: string;
  detail?: string;
  goodsDetail?: string;
  price?: number;
  fanPrice?: number;
  goodsPrice?: number;
  memberPrice?: number;
  jifen?: number;
  unit?: string;
  count?: number;
  frontKindId?: string;
  kindId?: string;
  goods_breed?: string;
  breed_name?: string;
  breedId?: string;
  breedName?: string;
  goodsPlan?: {
    fixationPlan?: any[];
    customPlan?: any[];
  };
}

// Payment Result (payV2/payV3 response)
export interface PaymentResult {
  paymentOrder?: {
    id?: string;
    orderId?: string;
    status?: string; // "1"=待支付 "2"=支付中 "3"=已支付
  };
  timeStamp?: string;
  nonceStr?: string;
  package?: string; // prepay_id=xxx
  signType?: string;
  paySign?: string;
  takeOrderMessage?: string;
  // 其他可能的字段
  [key: string]: any;
}

// Stored Value Package (储值套餐)
export interface SetMeal {
  id?: string;
  setMealName?: string; // 列表/详情名称（注意大写 M）
  setMeatName?: string; // 部分接口可能返回的别名
  set_meal_name?: string;
  setMealPrice?: number; // 价格（正确拼写）
  setMeatPrice?: number; // 价格（小写 a）
  set_meat_price?: string | number;
  setMealType?: string; // "3"=储值套餐
  set_meal_type?: string;
  set_meal_code?: string;
  setMealCode?: string;
  saleMemberType?: number; // 0=选择, 1=余额, 2=微信
  integralExchange?: number;
  giveMoney?: number;
  giveScore?: number;
  giveTicketNum?: number;
  set_meal_picture?: string; // 列表图片（相对路径）
  setMealPicture?: string; // 详情图片（相对路径）
  setMealImg?: string;
  salePrice?: number;
  price?: number;
  amount?: number;
  rechargeAmount?: number;
  name?: string;
  title?: string;
  remark?: string;
  setMealTitle?: string;
  imgUrl?: string;
  image?: string;
}

// Pay Type Option
export interface PayTypeOption {
  payType?: string; // "1"=积分 "2"=微信 "3"=余额 "6"=储值卡
  payTypeName?: string;
  discount?: number;
  isDefault?: boolean;
  state?: boolean; // 是否可用
}

// Film Schedule Detail
export interface FilmSchedule {
  id?: string;
  filmCode?: string;
  filmName?: string;
  cinemaId?: string;
  cinemaName?: string;
  hallId?: string;
  hallName?: string;
  startTime?: string;
  endTime?: string;
  price?: number;
  settlementPrice?: number;
  language?: string;
  edition?: string;
  dimension?: string;
  screenType?: string;
  isEquity?: number;
}
