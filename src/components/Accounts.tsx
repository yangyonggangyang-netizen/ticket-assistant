import { useState } from 'react';
import { Plus, Trash2, Wifi, CheckCircle, XCircle, Loader, Edit2, Save, X, ExternalLink, Smartphone, Copy, KeyRound, Check } from 'lucide-react';
import { useStore } from '../store/useStore';
import { api, localApi } from '../api/client';
import type { Account } from '../types';

const WECHAT_APP_ID = 'wx4fd7f63cb29a8891';
const launchApplet = (path?: string) =>
  'weixin://launchapplet/?app_id=' + WECHAT_APP_ID + (path ? '&path=' + path : '');

export default function Accounts() {
  const { accounts, activeAccountId, addAccount, removeAccount, switchAccount, updateAccount, saveToStorage, loading, error } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [showPhoneLogin, setShowPhoneLogin] = useState(false);
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [memberId, setMemberId] = useState('');
  const [phone, setPhone] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [sendingCaptcha, setSendingCaptcha] = useState(false);
  const [phoneLoginMsg, setPhoneLoginMsg] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [captureMsg, setCaptureMsg] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);
  const [pwdAccId, setPwdAccId] = useState<string | null>(null);
  const [pwdValue, setPwdValue] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  const copyPhone = async (acc: Account) => {
    if (!acc.phone) return;
    try {
      await navigator.clipboard.writeText(acc.phone);
      setCopiedPhoneId(acc.id);
      setTimeout(() => setCopiedPhoneId(null), 1500);
    } catch (e) {
      alert('复制失败');
    }
  };

  const handleResetPwd = async () => {
    if (!/^\d{6}$/.test(pwdValue)) {
      setPwdMsg('密码应为 6 位数字');
      return;
    }
    if (pwdValue !== pwdConfirm) {
      setPwdMsg('两次输入的密码不一致');
      return;
    }
    setPwdLoading(true);
    setPwdMsg('');
    try {
      const resp = await api.wxResetPassword(pwdValue);
      if (resp.success) {
        setPwdMsg('✅ 重置成功');
        setTimeout(() => {
          setPwdAccId(null);
          setPwdValue('');
          setPwdConfirm('');
          setPwdMsg('');
        }, 1500);
      } else {
        setPwdMsg('重置失败：' + (resp.message || '未知错误'));
      }
    } catch (e: any) {
      setPwdMsg('重置失败：' + e.message);
    } finally {
      setPwdLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!token.trim() || !memberId.trim()) {
      alert('请填写 Token 和 MemberId');
      return;
    }
    try {
      await addAccount(name.trim() || `账号${accounts.length + 1}`, token.trim(), memberId.trim());
      setShowAdd(false);
      setName('');
      setToken('');
      setMemberId('');
    } catch (e: any) {
      alert('添加失败: ' + e.message);
    }
  };

  const handleSendCaptcha = async () => {
    const p = phone.trim();
    if (!/^1\d{10}$/.test(p)) {
      setPhoneLoginMsg('请输入正确的 11 位手机号');
      return;
    }
    setSendingCaptcha(true);
    setPhoneLoginMsg('');
    try {
      const resp = await api.sendCaptcha(p);
      if (resp.success) {
        setPhoneLoginMsg('验证码已发送，请注意查收');
        setCountdown(60);
        const timer = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setPhoneLoginMsg('发送失败：' + (resp.message || '未知错误'));
      }
    } catch (e: any) {
      setPhoneLoginMsg('发送失败：' + e.message);
    } finally {
      setSendingCaptcha(false);
    }
  };

  const handlePhoneLogin = async () => {
    const p = phone.trim();
    const c = captcha.trim();
    if (!/^1\d{10}$/.test(p)) {
      setPhoneLoginMsg('请输入正确的 11 位手机号');
      return;
    }
    if (!c) {
      setPhoneLoginMsg('请输入验证码');
      return;
    }
    try {
      setPhoneLoginMsg('正在登录...');
      const resp = await api.phoneLogin(p, c);
      if (resp.success && resp.result) {
        const result = resp.result as any;
        const loginToken = result.token || result.accessToken || result.xAccessToken || '';
        const loginMemberId = result.id || result.memberId || '';
        if (loginToken && loginMemberId) {
          await addAccount(name.trim() || p, loginToken, loginMemberId);
          setShowPhoneLogin(false);
          setPhone('');
          setCaptcha('');
          setPhoneLoginMsg('');
          return;
        }
      }
      setPhoneLoginMsg(
        '手机号验证码登录未返回可用 Token，可能后端仍需要微信 code 或使用了其他登录接口。' +
          '建议：1) 在小程序里输入验证码登录；2) 点击「捕获 Token」抓取登录响应；' +
          '3) 或把抓包得到的登录接口地址发给我。'
      );
    } catch (e: any) {
      setPhoneLoginMsg('登录失败：' + e.message);
    }
  };

  const handleCapture = async () => {
    setCapturing(true);
    setCaptureMsg('正在启动代理...');
    try {
      // Listen for capture events
      if (window.electronAPI?.onCaptureProgress) {
        window.electronAPI.onCaptureProgress((msg: string) => {
          setCaptureMsg(msg);
        });
      }
      if (window.electronAPI?.onCaptureData) {
        window.electronAPI.onCaptureData((data: any) => {
          if (data.token) {
            setToken(data.token);
            setMemberId(data.memberId || '');
            setCaptureMsg('✅ Token 捕获成功！');
            setShowAdd(true);
          }
        });
      }
      if (window.electronAPI?.onCaptureDone) {
        window.electronAPI.onCaptureDone((data: any) => {
          setCapturing(false);
          if (data?.token) {
            setToken(data.token);
            setMemberId(data.memberId || '');
            setCaptureMsg('✅ Token 捕获成功！');
            setShowAdd(true);
          } else {
            setCaptureMsg('未捕获到 Token，请确保在小程序中进行了登录操作');
          }
        });
      }

      const result = await localApi.startCapture();
      if (result.success) {
        setCaptureMsg(`代理已启动 (端口 ${result.port})，请在微信中打开大埔嘉逸影联小程序...`);
      } else {
        setCapturing(false);
        setCaptureMsg('启动失败: ' + (result.error || '未知错误'));
      }
    } catch (e: any) {
      setCapturing(false);
      setCaptureMsg('错误: ' + e.message);
    }
  };

  const handleStopCapture = async () => {
    await localApi.stopCapture();
    setCapturing(false);
    setCaptureMsg('');
  };

  const handleOpenMiniProgram = async (path?: string) => {
    const url = launchApplet(path);
    try {
      if (window.electronAPI?.openExternal) {
        const result = await window.electronAPI.openExternal(url);
        if (!result.success) {
          // fallback: open desktop shortcut
          if (window.electronAPI?.openPath) {
            const r2 = await window.electronAPI.openPath();
            if (!r2.success) {
              alert('打开小程序失败：' + (result.error || r2.error || '未知错误'));
            }
          } else {
            alert('打开小程序失败：' + (result.error || '未知错误'));
          }
        }
      } else if (window.electronAPI?.openPath) {
        const result = await window.electronAPI.openPath();
        if (!result.success) {
          alert('打开小程序失败：' + (result.error || '未知错误'));
        }
      } else {
        window.open(url, '_blank');
      }
    } catch (e: any) {
      alert('打开小程序失败：' + e.message);
    }
  };

  const startEditName = (acc: Account) => {
    setEditingId(acc.id);
    setEditingName(acc.name);
  };

  const saveEditName = async (id: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      alert('账号名称不能为空');
      return;
    }
    updateAccount(id, { name: trimmed });
    await saveToStorage();
    setEditingId(null);
  };

  const cancelEditName = () => {
    setEditingId(null);
    setEditingName('');
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">账号管理</h2>
          <p className="text-sm text-gray-500">管理多个影院账号，支持快速切换</p>
        </div>
        <div className="flex gap-2">
          {!capturing ? (
            <button
              onClick={handleCapture}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              <Wifi className="w-4 h-4" />
              捕获 Token
            </button>
          ) : (
            <button
              onClick={handleStopCapture}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"
            >
              <Loader className="w-4 h-4 animate-spin" />
              停止捕获
            </button>
          )}
          <button
            onClick={() => handleOpenMiniProgram()}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600"
            title="打开小程序首页"
          >
            <ExternalLink className="w-4 h-4" />
            打开小程序
          </button>
          <button
            onClick={() => handleOpenMiniProgram('pagesC/login/ph-login')}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-teal-500 text-white rounded-lg hover:bg-teal-600"
            title="打开小程序手机验证码登录页"
          >
            <Smartphone className="w-4 h-4" />
            打开登录页
          </button>
          <button
            onClick={() => handleOpenMiniProgram('pagesC/mine/order')}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
            title="打开小程序我的订单（可去支付）"
          >
            <CheckCircle className="w-4 h-4" />
            打开订单页
          </button>
          <button
            onClick={() => setShowPhoneLogin(!showPhoneLogin)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600"
          >
            <Smartphone className="w-4 h-4" />
            手机验证码登录
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-pink-500 text-white rounded-lg hover:bg-pink-600"
          >
            <Plus className="w-4 h-4" />
            手动添加
          </button>
        </div>
      </div>

      {/* Capture status */}
      {captureMsg && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
          {captureMsg}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Phone login form */}
      {showPhoneLogin && (
        <div className="bg-white rounded-lg border p-4 space-y-3">
          <h3 className="font-medium">手机验证码登录</h3>
          <div>
            <label className="text-xs text-gray-500 block mb-1">账号名称（可选）</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：张三的账号"
              className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-purple-400"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">手机号 *</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="11 位手机号"
              maxLength={11}
              className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-purple-400"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">验证码 *</label>
            <div className="flex gap-2">
              <input
                value={captcha}
                onChange={(e) => setCaptcha(e.target.value)}
                placeholder="短信验证码"
                className="flex-1 px-3 py-2 text-sm border rounded-lg outline-none focus:border-purple-400"
              />
              <button
                onClick={handleSendCaptcha}
                disabled={countdown > 0 || sendingCaptcha}
                className="px-3 py-2 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 whitespace-nowrap"
              >
                {countdown > 0 ? `${countdown}s 后重发` : sendingCaptcha ? '发送中...' : '获取验证码'}
              </button>
            </div>
          </div>
          {phoneLoginMsg && (
            <div className={`text-sm p-2 rounded ${phoneLoginMsg.includes('成功') || phoneLoginMsg.includes('已发送') ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
              {phoneLoginMsg}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handlePhoneLogin}
              disabled={loading}
              className="px-4 py-2 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
            >
              {loading ? '登录中...' : '登录'}
            </button>
            <button
              onClick={() => {
                setShowPhoneLogin(false);
                setPhone('');
                setCaptcha('');
                setPhoneLoginMsg('');
                setCountdown(0);
              }}
              className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              取消
            </button>
          </div>
          <div className="text-xs text-gray-400 bg-gray-50 p-2 rounded space-y-1">
            <p>💡 说明：</p>
            <p>1. 输入手机号后点击「获取验证码」，系统会请求小程序发送短信</p>
            <p>2. 如果后端支持手机号+验证码直接登录，会自动添加账号</p>
            <p>3. 但小程序实际登录流程最后一步需要微信 wx.login()，桌面端无法完成，所以大概率登录失败</p>
            <p>4. 加账号推荐用「捕获 Token」：先点「打开登录页」唤起小程序 → 点「捕获 Token」→ 在小程序里完成验证码登录</p>
            <p>5. 若仍捕获不到，可用手机抓包（手机连电脑 WiFi 代理，代理填 电脑IP:8888），操作小程序后把请求发给我</p>
          </div>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="bg-white rounded-lg border p-4 space-y-3">
          <h3 className="font-medium">添加账号</h3>
          <div>
            <label className="text-xs text-gray-500 block mb-1">账号名称（可选）</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：张三的账号"
              className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-pink-400"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Token *</label>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="X-Access-Token 值"
              className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-pink-400 font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">MemberId *</label>
            <input
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              placeholder="会员 ID"
              className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-pink-400 font-mono"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={loading}
              className="px-4 py-2 text-sm bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:opacity-50"
            >
              {loading ? '验证中...' : '添加账号'}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              取消
            </button>
          </div>
          <div className="text-xs text-gray-400 bg-gray-50 p-2 rounded space-y-1">
            <p>💡 如何获取 Token 和 MemberId：</p>
            <p>1. 点击「打开小程序」按钮唤起微信大埔嘉逸影联小程序</p>
            <p>2. 点击「捕获 Token」按钮启动代理</p>
            <p>3. 在小程序里重新登录或切换账号</p>
            <p>4. 系统会自动捕获登录 Token</p>
            <p>5. 或手动从抓包工具获取 Token 和 MemberId</p>
          </div>
        </div>
      )}

      {/* Account list */}
      <div className="space-y-3">
        {accounts.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>还没有添加账号</p>
            <p className="text-xs mt-1">点击「捕获 Token」或「手动添加」开始</p>
          </div>
        ) : (
          accounts.map((acc: Account) => (
            <div
              key={acc.id}
              className={`bg-white rounded-lg border p-4 flex items-center gap-4 ${
                activeAccountId === acc.id ? 'border-pink-400 bg-pink-50/30' : ''
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-purple-400 flex items-center justify-center text-white font-bold">
                {(acc.name || '?')[0]}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {editingId === acc.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditName(acc.id);
                          if (e.key === 'Escape') cancelEditName();
                        }}
                        className="px-2 py-0.5 text-sm border rounded outline-none focus:border-pink-400 w-32"
                        autoFocus
                      />
                      <button
                        onClick={() => saveEditName(acc.id)}
                        className="p-0.5 text-green-500 hover:bg-green-50 rounded"
                      >
                        <Save className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={cancelEditName}
                        className="p-0.5 text-gray-400 hover:bg-gray-100 rounded"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="font-medium">{acc.name}</p>
                      <button
                        onClick={() => startEditName(acc)}
                        className="p-0.5 text-gray-400 hover:text-pink-500 hover:bg-pink-50 rounded"
                        title="编辑名称"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                  {activeAccountId === acc.id && (
                    <span className="text-xs px-2 py-0.5 bg-pink-100 text-pink-600 rounded">当前</span>
                  )}
                  {acc.tokenValid === false ? (
                    <XCircle className="w-4 h-4 text-red-500" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                  {acc.phone && (
                    <button
                      onClick={() => copyPhone(acc)}
                      className="flex items-center gap-1 hover:text-pink-500"
                      title="点击复制手机号"
                    >
                      📱 {acc.phone}
                      {copiedPhoneId === acc.id ? (
                        <Check className="w-3 h-3 text-green-500" />
                      ) : (
                        <Copy className="w-3 h-3 opacity-60" />
                      )}
                    </button>
                  )}
                  {acc.levelDictText && <span>👑 {acc.levelDictText}</span>}
                  {acc.balance != null && <span>💰 ¥{Number(acc.balance).toFixed(2)}</span>}
                  {acc.score != null && <span>⭐ {acc.score}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                {activeAccountId !== acc.id && (
                  <button
                    onClick={() => switchAccount(acc.id)}
                    className="px-3 py-1.5 text-xs bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    切换
                  </button>
                )}
                <button
                  onClick={() => setPwdAccId(acc.id)}
                  title="重置当前账号的消费密码（6 位数字）"
                  className="flex items-center gap-1 px-2 py-1.5 text-xs bg-amber-50 text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-100"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  重置密码
                </button>
                <button
                  onClick={() => {
                    if (confirm(`确定删除账号「${acc.name}」？`)) {
                      removeAccount(acc.id);
                    }
                  }}
                  className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Reset password modal */}
      {pwdAccId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setPwdAccId(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium text-lg">重置消费密码</h3>
            <p className="text-xs text-gray-400">
              将重置当前激活账号「{accounts.find((a) => a.id === pwdAccId)?.name}」的消费密码。
              若目标账号不是当前账号，请先切换。
            </p>
            <div>
              <label className="text-xs text-gray-500 block mb-1">新密码（6 位数字）</label>
              <input
                type="password"
                value={pwdValue}
                onChange={(e) => setPwdValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="请输入 6 位数字"
                className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">确认新密码</label>
              <input
                type="password"
                value={pwdConfirm}
                onChange={(e) => setPwdConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleResetPwd();
                }}
                placeholder="再次输入新密码"
                className="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-amber-400"
              />
            </div>
            {pwdMsg && (
              <div className={`text-sm p-2 rounded ${pwdMsg.includes('✅') ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                {pwdMsg}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleResetPwd}
                disabled={pwdLoading}
                className="flex-1 px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
              >
                {pwdLoading ? '提交中...' : '确认重置'}
              </button>
              <button
                onClick={() => setPwdAccId(null)}
                className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
