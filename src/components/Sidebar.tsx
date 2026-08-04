import { useEffect, useState } from 'react';
import { Film, Calendar, Ticket, User, Users, ShoppingCart, Pin, PinOff, BookOpen } from 'lucide-react';
import { useStore } from '../store/useStore';
import type { Page } from '../App';
import UpdateChecker from './UpdateChecker';

const menuItems: { id: Page; label: string; icon: any }[] = [
  { id: 'dashboard', label: '首页', icon: Film },
  { id: 'schedules', label: '电影排期', icon: Calendar },
  { id: 'orders', label: '订单', icon: Ticket },
  { id: 'mall', label: '商城', icon: ShoppingCart },
  { id: 'ledger', label: '记账日历', icon: BookOpen },
  { id: 'member', label: '会员信息', icon: User },
  { id: 'accounts', label: '账号管理', icon: Users },
];

export default function Sidebar({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  const { accounts, activeAccountId, switchAccount } = useStore();
  const activeAccount = accounts.find((a) => a.id === activeAccountId);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);

  useEffect(() => {
    window.electronAPI?.getAlwaysOnTop?.().then((v) => setAlwaysOnTop(!!v)).catch(() => {});
  }, []);

  const toggleAlwaysOnTop = async () => {
    const next = !alwaysOnTop;
    try {
      const result = await window.electronAPI?.setAlwaysOnTop?.(next);
      if (result?.success) {
        setAlwaysOnTop(next);
      } else if (result?.error) {
        alert('设置失败：' + result.error);
      }
    } catch (e: any) {
      alert('设置失败：' + e.message);
    }
  };

  return (
    <aside className="w-56 bg-gray-900 text-white flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Film className="w-6 h-6 text-pink-400" />
          影联出票助手
        </h1>
        <p className="text-xs text-gray-400 mt-1">大埔嘉逸影联</p>
      </div>

      {/* Account selector */}
      {accounts.length > 0 && (
        <div className="p-3 border-b border-gray-700">
          <label className="text-xs text-gray-400 block mb-1">当前账号</label>
          <select
            value={activeAccountId || ''}
            onChange={(e) => switchAccount(e.target.value)}
            className="w-full bg-gray-800 text-white text-sm rounded px-2 py-1.5 border border-gray-600 focus:border-pink-400 outline-none"
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name} {acc.tokenValid === false ? '⚠️' : ''}
              </option>
            ))}
          </select>
          {activeAccount && (
            <div className="mt-2 text-xs text-gray-400">
              {activeAccount.phone && <p>📱 {activeAccount.phone}</p>}
              {activeAccount.levelDictText && <p>👑 {activeAccount.levelDictText}</p>}
              {activeAccount.balance !== undefined && (
                <p>💰 余额: ¥{Number(activeAccount.balance).toFixed(2)}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Menu */}
      <nav className="flex-1 py-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = page === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                active
                  ? 'bg-pink-600 text-white border-r-2 border-pink-300'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-gray-700 space-y-2">
        <button
          onClick={toggleAlwaysOnTop}
          title={alwaysOnTop ? '取消窗口置顶' : '窗口置顶（始终显示在最前面）'}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg transition-colors ${
            alwaysOnTop
              ? 'bg-pink-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
          }`}
        >
          {alwaysOnTop ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
          {alwaysOnTop ? '已置顶（点击取消）' : '窗口置顶'}
        </button>
        <UpdateChecker />
        <p className="text-xs text-gray-500">merchant: 860753002</p>
      </div>
    </aside>
  );
}
