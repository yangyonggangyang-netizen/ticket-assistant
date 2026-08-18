import { useState, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { getToken } from '../api/client';
import { useStore } from '../store/useStore';
import type { ImageRecognitionResult, Seat, Order } from '../types';
import {
  Upload,
  Image as ImageIcon,
  Users,
  MapPin,
  Clock,
  Film,
  CheckCircle,
  AlertCircle,
  Loader,
  ArrowRight,
  CreditCard,
} from 'lucide-react';

type Step = 'upload' | 'recognizing' | 'seats' | 'creating' | 'orderDetail' | 'paying' | 'done';

export default function NewOrder() {
  const { getActiveAccount } = useStore();
  const account = getActiveAccount();

  const [step, setStep] = useState<Step>('upload');
  const [imagePath, setImagePath] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [recognition, setRecognition] = useState<ImageRecognitionResult | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState<Order | null>(null);
  const [putOrderId, setPutOrderId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectImage = useCallback(async (file: File) => {
    if (!account) return;
    setError(null);
    setImagePath(file.name);
    setStep('recognizing');

    try {
      // 将文件转为 base64 发送到本地服务器
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]); // 去掉 data:image/xxx;base64, 前缀
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // 上传到本地服务器，由服务器转发到 API
      const uploadResp = await fetch('http://localhost:3456/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileData: base64, token: getToken() }),
      });
      const uploadResult = await uploadResp.json();
      if (uploadResult.error) throw new Error(uploadResult.error);
      if (uploadResult.rtnCode !== '000000') throw new Error(uploadResult.rtnMsg);

      const url = uploadResult.rtnData;
      setImageUrl(url);

      // 识别图片
      const recResult = await api.recognizeImage(url);
      setRecognition(recResult);
      setStep('seats');
    } catch (e: any) {
      setError(e.message);
      setStep('upload');
    }
  }, [account]);

  function toggleSeat(seat: Seat) {
    if (seat.status !== 'N') return; // Only available seats
    setSelectedSeats((prev) => {
      const next = new Set(prev);
      if (next.has(seat.seatId)) {
        next.delete(seat.seatId);
      } else {
        next.add(seat.seatId);
      }
      return next;
    });
  }

  async function handleCreateOrder() {
    if (!recognition || selectedSeats.size === 0) return;
    setStep('creating');
    setError(null);
    try {
      const orderId = await api.createOrder(
        recognition.showId,
        Array.from(selectedSeats)
      );
      setPutOrderId(orderId);
      const orderDetail = await api.queryOrder(orderId);
      setOrder(orderDetail);
      setStep('orderDetail');
    } catch (e: any) {
      setError(e.message);
      setStep('seats');
    }
  }

  async function handlePay() {
    if (!order) return;
    setStep('paying');
    setError(null);
    try {
      await api.payOrder(order.id, order.costTotalPrice);
      // Refresh order status
      const updated = await api.queryOrder(order.id);
      setOrder(updated);
      setStep('done');
    } catch (e: any) {
      setError(e.message);
      setStep('orderDetail');
    }
  }

  function reset() {
    setStep('upload');
    setImagePath('');
    setImageUrl('');
    setRecognition(null);
    setSelectedSeats(new Set());
    setOrder(null);
    setPutOrderId('');
    setError(null);
  }

  if (!account) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        请先选择账号
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">新建出票</h1>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        {['选择图片', '识别座位', '确认下单', '支付'].map((label, i) => {
          const stepOrder = ['upload', 'recognizing', 'seats', 'creating', 'orderDetail', 'paying', 'done'];
          const currentIdx = stepOrder.indexOf(step);
          const thresholds = [0, 1, 3, 4];
          const active = currentIdx >= thresholds[i];
          return (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                  active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'
                }`}
              >
                {i + 1}
              </div>
              <span className={active ? 'text-gray-700' : 'text-gray-400'}>{label}</span>
              {i < 3 && <ArrowRight size={14} className="text-gray-300" />}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Step: Upload */}
      {step === 'upload' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) {
              handleSelectImage(e.dataTransfer.files[0]);
            }
          }}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                handleSelectImage(e.target.files[0]);
              }
            }}
          />
          <Upload size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600 font-medium mb-1">点击或拖拽上传电影票截图</p>
          <p className="text-sm text-gray-400">支持 JPG / PNG / WebP 格式</p>
          <p className="text-xs text-gray-400 mt-2">系统会自动识别影院、影片、场次和座位</p>
        </div>
      )}

      {/* Step: Recognizing */}
      {step === 'recognizing' && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader size={40} className="text-blue-500 animate-spin mb-4" />
          <p className="text-gray-600">正在识别图片...</p>
        </div>
      )}

      {/* Step: Seats */}
      {step === 'seats' && recognition && (
        <div className="space-y-4">
          {/* Movie Info */}
          <div className="bg-white rounded-lg shadow-sm p-4 flex gap-4">
            {recognition.pic && (
              <img src={recognition.pic} alt={recognition.filmName} className="w-16 h-22 rounded object-cover" />
            )}
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-800">{recognition.filmName}</h2>
              <div className="text-sm text-gray-500 mt-1 space-y-0.5">
                <div className="flex items-center gap-1"><MapPin size={14} /> {recognition.cinemaName} - {recognition.hallName}</div>
                <div className="flex items-center gap-1"><Clock size={14} /> {recognition.showTime}</div>
                <div className="flex items-center gap-1"><Users size={14} /> {recognition.cityName}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400">已选 {selectedSeats.size} 座</div>
              <div className="text-lg font-bold text-blue-600">
                ¥{calcTotalPrice(recognition.seats, selectedSeats).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Seat Map */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="text-center mb-4">
              <div className="inline-block px-12 py-1 bg-gray-800 text-white text-sm rounded-t-lg">银幕</div>
            </div>
            <SeatMap seats={recognition.seats} selected={selectedSeats} onToggle={toggleSeat} />
            <div className="flex items-center justify-center gap-6 mt-4 text-xs text-gray-500">
              <div className="flex items-center gap-1"><div className="w-4 h-4 bg-blue-100 border border-blue-300 rounded"></div> 可选</div>
              <div className="flex items-center gap-1"><div className="w-4 h-4 bg-green-500 border border-green-600 rounded"></div> 已选</div>
              <div className="flex items-center gap-1"><div className="w-4 h-4 bg-gray-200 border border-gray-300 rounded"></div> 已售</div>
            </div>
          </div>

          {/* Selected seats list */}
          {selectedSeats.size > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-4">
              <div className="text-sm text-gray-600 mb-2">已选座位</div>
              <div className="flex flex-wrap gap-2">
                {recognition.seats
                  .filter((s) => selectedSeats.has(s.seatId))
                  .map((seat) => (
                    <span key={seat.seatId} className="px-2 py-1 bg-green-50 text-green-700 rounded text-sm">
                      {seat.seatNo} (¥{seat.price})
                    </span>
                  ))}
              </div>
            </div>
          )}

          {/* Action */}
          <div className="flex justify-end">
            <button
              onClick={handleCreateOrder}
              disabled={selectedSeats.size === 0}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              创建订单 ({selectedSeats.size} 座)
            </button>
          </div>
        </div>
      )}

      {/* Step: Creating */}
      {step === 'creating' && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader size={40} className="text-blue-500 animate-spin mb-4" />
          <p className="text-gray-600">正在创建订单...</p>
        </div>
      )}

      {/* Step: Order Detail */}
      {step === 'orderDetail' && order && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle size={20} className="text-green-500" />
              <span className="font-semibold text-gray-800">订单已创建</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <InfoRow label="影片" value={order.movieName} />
              <InfoRow label="影院" value={order.movieCinemaName} />
              <InfoRow label="影厅" value={order.movieHallName} />
              <InfoRow label="场次" value={order.movieShowTime} />
              <InfoRow label="座位" value={order.buySeats} />
              <InfoRow label="数量" value={`${order.buyNum} 张`} />
              <InfoRow label="订单号" value={order.id} />
              <InfoRow label="总价" value={`¥${order.costTotalPrice}`} highlight />
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-4 flex items-center gap-3">
            <CreditCard size={24} className="text-blue-600" />
            <div className="flex-1">
              <div className="text-sm text-blue-700">使用账户余额支付</div>
              <div className="text-xs text-blue-500">当前余额: ¥{account.balance?.toFixed(2)}</div>
            </div>
            <button
              onClick={handlePay}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              确认支付 ¥{order.costTotalPrice}
            </button>
          </div>
        </div>
      )}

      {/* Step: Paying */}
      {step === 'paying' && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader size={40} className="text-blue-500 animate-spin mb-4" />
          <p className="text-gray-600">正在支付...</p>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && order && (
        <div className="flex flex-col items-center justify-center py-16">
          <CheckCircle size={64} className="text-green-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">出票成功！</h2>
          <p className="text-gray-500 mb-1">{order.movieName} · {order.buySeats}</p>
          <p className="text-gray-400 text-sm mb-6">{order.movieShowTime}</p>
          {order.ticketCodes && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6 w-full max-w-md">
              <div className="text-sm text-gray-500 mb-1">取票码</div>
              <div className="font-mono text-lg font-bold text-gray-800">{order.ticketCodes}</div>
            </div>
          )}
          <button
            onClick={reset}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            继续出票
          </button>
        </div>
      )}
    </div>
  );
}

function calcTotalPrice(seats: Seat[], selected: Set<string>): number {
  return seats.filter((s) => selected.has(s.seatId)).reduce((sum, s) => sum + s.price, 0);
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center">
      <span className="text-gray-400 w-16">{label}</span>
      <span className={`flex-1 ${highlight ? 'text-blue-600 font-bold' : 'text-gray-700'}`}>{value}</span>
    </div>
  );
}

// Seat Map Component
function SeatMap({
  seats,
  selected,
  onToggle,
}: {
  seats: Seat[];
  selected: Set<string>;
  onToggle: (seat: Seat) => void;
}) {
  // Group seats by row
  const rows = new Map<string, Seat[]>();
  for (const seat of seats) {
    const row = seat.rowNo;
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row)!.push(seat);
  }

  // Sort rows and columns
  const sortedRows = Array.from(rows.keys()).sort((a, b) => Number(a) - Number(b));

  return (
    <div className="flex flex-col items-center gap-1.5 overflow-auto">
      {sortedRows.map((rowNo) => {
        const rowSeats = rows.get(rowNo)!.sort((a, b) => Number(a.columnNo) - Number(b.columnNo));
        return (
          <div key={rowNo} className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 w-6 text-center">{rowNo}排</span>
            {rowSeats.map((seat) => {
              const isSelected = selected.has(seat.seatId);
              const isAvailable = seat.status === 'N';
              const isLove = seat.lovestatus === 1;
              return (
                <button
                  key={seat.seatId}
                  onClick={() => onToggle(seat)}
                  disabled={!isAvailable}
                  className={`w-8 h-8 rounded text-xs font-medium border transition-all ${
                    isSelected
                      ? 'seat-selected'
                      : isAvailable
                      ? isLove ? 'seat-love' : 'seat-available'
                      : 'seat-occupied'
                  }`}
                  title={`${seat.seatNo} ¥${seat.price}`}
                >
                  {seat.columnNo}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
