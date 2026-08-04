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
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useStore } from '../store/useStore';
import { api } from '../api/client';

export default function MemberInfo() {
  const { accounts, activeAccountId, refreshActiveAccount, loading, cinemas, selectedCinemaId } = useStore();
  const account = accounts.find((a) => a.id === activeAccountId);
  const [memberInfo, setMemberInfo] = useState<any>(null);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [storedCards, setStoredCards] = useState<any[]>([]);
  const [vouchersCollapsed, setVouchersCollapsed] = useState(true);

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
        <button
          onClick={() => setVouchersCollapsed(!vouchersCollapsed)}
          className="w-full flex items-center gap-2 text-sm font-medium hover:opacity-80 transition-opacity"
        >
          <Gift className="w-4 h-4 text-pink-500" />
          <span>卡券 ({vouchers.length})</span>
          {vouchersCollapsed ? (
            <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />
          ) : (
            <ChevronUp className="w-4 h-4 text-gray-400 ml-auto" />
          )}
        </button>
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
