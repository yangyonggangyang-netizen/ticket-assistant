import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Wifi, CheckCircle, XCircle, Loader, Edit2, Save, X, ExternalLink, Smartphone, Copy, KeyRound, Check, RefreshCw, BookMarked, Search, ArrowUpDown, ArrowUp, ArrowDown, ListChecks, Wallet, Star, Ticket, FileText, BadgeCheck } from 'lucide-react';
import { useStore } from '../store/useStore';
import { api, localApi } from '../api/client';
import type { Account } from '../types';
import VoucherExport from './VoucherExport';
import { syncVoucherSnapshot } from '../utils/voucherSnapshot';

const WECHAT_APP_ID = 'wx4fd7f63cb29a8891';
const launchApplet = (path?: string) =>
  'weixin://launchapplet/?app_id=' + WECHAT_APP_ID + (path ? '&path=' + path : '');

// 隐藏「打开小程序 / 打开登录页 / 打开订单页」三个按钮（保留代码，改这里可恢复）
const HIDE_APP_BUTTONS = true;

export default function Accounts() {
  const { accounts, activeAccountId, addAccount, removeAccount, switchAccount, updateAccount, saveToStorage, loading, error, refreshActiveAccount, getActiveAccount, selectedCinemaId } = useStore();
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
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);
  const [pwdAccId, setPwdAccId] = useState<string | null>(null);
  const [pwdValue, setPwdValue] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [confirmAcc, setConfirmAcc] = useState<Account | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [collectMsg, setCollectMsg] = useState('');
  const [collecting, setCollecting] = useState(false);
  const [clearMsg, setClearMsg] = useState('');
  const [clearing, setClearing] = useState(false);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortMode, setSortMode] = useState<'none' | 'asc' | 'desc'>('none');
  // 券码快照：总数 / 上次对比结果
  const [snapInfo, setSnapInfo] = useState<{ total: number; added: number; used: number; usedProfit: number; lastSync: string } | null>(null);
  const [syncingSnap, setSyncingSnap] = useState(false);

  // 进入页面加载快照总数
  useEffect(() => {
    (async () => {
      const resp = await (window as any).electronAPI?.loadVoucherSnapshot?.();
      if (resp?.success && Array.isArray(resp.list)) {
        setSnapInfo((prev) => ({
          total: resp.list.length,
          added: prev?.added || 0,
          used: prev?.used || 0,
          usedProfit: prev?.usedProfit || 0,
          lastSync: prev?.lastSync || '',
        }));
      }
    })();
  }, []);

  // 过滤 + 排序后的账号列表
  const visibleAccounts = useMemo(() => {
    let list = [...accounts];
    const q = searchTerm.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (a) =>
          (a.name || '').toLowerCase().includes(q) ||
          (a.phone || '').includes(q) ||
          (a.memberId || '').includes(q)
      );
    }
    if (sortMode === 'asc') {
      list.sort((a, b) => Number(a.balance || 0) - Number(b.balance || 0));
    } else if (sortMode === 'desc') {
      list.sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0));
    }
    return list;
  }, [accounts, searchTerm, sortMode]);

  // 收录指定账号的券码 + 余额积分，写入 D:/巴蒂哥/出票助手/卷码收录/{phone}.txt
  const collectAccountVouchers = async (acc: Account): Promise<string> => {
    if (!acc.phone) return `⚠️ ${acc.name || acc.memberId} 无手机号，跳过`;
    if (!acc.token || !acc.memberId) return `⚠️ ${acc.phone} 无 token/memberId，跳过`;
    try {
      // 拉取余额/积分 + 券列表（用该账号自己的 token/memberId）
      const [mResp, vResp] = await Promise.all([
        api.getMemberInfoByIdAs(acc.token, acc.memberId),
        api.getMemberVouchersAs(acc.token, acc.memberId, 1, 1, 100),
      ]);
      const info = mResp.success ? (mResp.result as any) : null;
      const balance = info?.balance ?? acc.balance ?? 0;
      const score = info?.score ?? acc.score ?? 0;
      // 顺手刷新账号卡上的券数（全部未使用券数，不只是电影票兑换券）
      if (info && mResp.success) {
        updateAccount(acc.id, {
          balance: info.balance ?? acc.balance,
          score: info.score ?? acc.score,
          voucherNum: info.voucherNum,
          lastActiveAt: new Date().toISOString(),
          tokenValid: true,
        });
      }
      const records: any[] = (vResp.success ? (vResp.result as any)?.records : []) || [];
      const now = Date.now();
      const valid = records.filter((v: any) => {
        const vname = v.voucher_name || v.voucherName || '';
        if (!vname.includes('电影票兑换券')) return false;
        const end = v.sch_end_date || v.validEndTime || '';
        if (end) {
          const t = new Date(String(end).replace(' ', 'T')).getTime();
          if (!isNaN(t) && t <= now) return false; // 过期不收录
        }
        return true;
      });
      const lines: string[] = [];
      lines.push(`${acc.phone}---${Number(balance).toFixed(2)}---${Number(score).toFixed(0)}`);
      lines.push(`收录时间：${new Date().toLocaleString('zh-CN')}`);
      lines.push(`收录数量：${valid.length} 张（电影票兑换券·未过期）`);
      lines.push('─'.repeat(34));
      if (valid.length === 0) {
        lines.push('（无未过期的电影票兑换券）');
      } else {
        valid.forEach((v: any) => {
          lines.push(`券名：${v.voucher_name || v.voucherName || ''}`);
          lines.push(`券号：${v.voucher_no || v.voucherNo || ''}`);
          lines.push(`到期时间：${v.sch_end_date || v.validEndTime || '未知'}`);
          lines.push('─'.repeat(34));
        });
      }
      const content = lines.join('\n');
      const result = await window.electronAPI?.saveVoucherRecord(acc.phone, content);
      if (result?.success) {
        return `✅ ${acc.phone} 已收录 ${valid.length} 张券（余额 ¥${Number(balance).toFixed(2)} / 积分 ${Number(score).toFixed(0)}）`;
      }
      return `❌ ${acc.phone} 写入失败：${result?.error || '未知错误'}`;
    } catch (e: any) {
      return `❌ ${acc.phone} 失败：${e.message}`;
    }
  };

  // 收录当前激活账号
  const collectVouchers = async () => {
    const active = getActiveAccount();
    if (!active) {
      setCollectMsg('⚠️ 请先切换/激活一个账号');
      return;
    }
    setCollecting(true);
    setCollectMsg('');
    try {
      const msg = await collectAccountVouchers(active);
      setCollectMsg(msg);
    } finally {
      setCollecting(false);
    }
  };

  // 一键收录所有已登录账号
  const collectAllVouchers = async () => {
    const targets = accounts.filter((a) => a.token && a.memberId && a.phone);
    if (targets.length === 0) {
      setCollectMsg('⚠️ 没有可收录的账号（需要手机号）');
      return;
    }
    setCollecting(true);
    setCollectMsg('');
    const results: string[] = [];
    for (let i = 0; i < targets.length; i++) {
      const msg = await collectAccountVouchers(targets[i]);
      results.push(msg);
      setCollectMsg(`正在收录 (${i + 1}/${targets.length})... ${msg}`);
    }
    const ok = results.filter((r) => r.startsWith('✅')).length;
    setCollectMsg(`✅ 收录完成：${ok}/${targets.length} 个账号成功`);
  };

  // 一键刷新所有账号信息（余额/积分/等级等）
  const refreshAllAccounts = async () => {
    setRefreshingAll(true);
    setClearMsg('');
    let okCount = 0;
    const targetAccounts = accounts.filter((a) => a.token && a.memberId);
    for (let i = 0; i < targetAccounts.length; i++) {
      const acc = targetAccounts[i];
      setClearMsg(`正在刷新 (${i + 1}/${targetAccounts.length})：${acc.name || acc.memberId}...`);
      try {
        const resp = await api.getMemberInfoByIdAs(acc.token, acc.memberId);
        if (resp.success && resp.result) {
          const info = resp.result as any;
          updateAccount(acc.id, {
            phone: info.phone || acc.phone,
            level: info.level,
            levelDictText: info.levelDictText || info.level_dictText,
            balance: info.balance,
            score: info.score,
            growthNum: info.growthNum,
            voucherNum: info.voucherNum,
            lastActiveAt: new Date().toISOString(),
            tokenValid: true,
          });
          okCount++;
        } else {
          updateAccount(acc.id, { tokenValid: false });
        }
      } catch {
        updateAccount(acc.id, { tokenValid: false });
      }
    }
    await saveToStorage();
    setClearMsg(`✅ 刷新完成：${okCount}/${targetAccounts.length} 个账号已更新`);
    // 刷新后自动对比券码快照（少了=已使用→自动记账）
    try {
      const snapMsg = await syncSnapshotLocal();
      setClearMsg(`✅ 刷新完成：${okCount}/${targetAccounts.length} 个账号已更新\n${snapMsg}`);
    } catch (e: any) {
      console.error('snapshot sync failed:', e);
    }
    setRefreshingAll(false);
  };

  // ===== 券码快照同步（公共函数，见 utils/voucherSnapshot.ts） =====
  // 记录电影票核销券码（txt 去重），对比旧快照：少了=已使用→自动记账（按实际核销时间）；多了=更新数量
  const syncSnapshotLocal = async (): Promise<string> => {
    const r = await syncVoucherSnapshot(accounts);
    const lastSync = new Date().toLocaleString('zh-CN');
    setSnapInfo({ total: r.total, added: r.added, used: r.used, usedProfit: r.usedProfit, lastSync });
    return r.msg;
  };

  // 手动同步券码快照
  const handleSyncSnapshot = async () => {
    if (syncingSnap) return;
    setSyncingSnap(true);
    setCollectMsg('正在同步券码快照...');
    try {
      const msg = await syncSnapshotLocal();
      setCollectMsg(msg);
    } catch (e: any) {
      setCollectMsg('快照同步失败：' + (e.message || String(e)));
    } finally {
      setSyncingSnap(false);
    }
  };

  // 清理缓存 + 强制全量刷新（只刷新显示数据，不动 accounts.json）
  const handleClearCache = async () => {
    if (!confirm('确定清理缓存并强制全量刷新？\n\n仅清理页面显示数据（余额/券/订单等），已登录账号不受影响。')) return;
    setClearing(true);
    setClearMsg('');
    try {
      await refreshActiveAccount();
      const active = getActiveAccount();
      if (active?.phone) await collectVouchers();
      setClearMsg('✅ 缓存已清理，数据已刷新');
    } catch (e: any) {
      setClearMsg('刷新失败：' + e.message);
    } finally {
      setClearing(false);
    }
  };

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

  // 复制 token + memberId（手机 H5 查券用）
  const copyLoginInfo = async (acc: Account) => {
    if (!acc.token || !acc.memberId) return;
    try {
      await navigator.clipboard.writeText(acc.token + '\n' + acc.memberId);
      setCopiedTokenId(acc.id);
      setTimeout(() => setCopiedTokenId(null), 2000);
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
      const active = getActiveAccount();
      if (!active?.token) {
        setPhoneLoginMsg('⚠️ 请先添加一个已登录账号（换绑需要借用当前微信身份）');
        return;
      }
      setPhoneLoginMsg('正在查询账号是否已注册...');
      // 预检：手机号是否已注册
      const qResp = await api.queryMemberByPhone(p, 1);
      if (!qResp.success) {
        setPhoneLoginMsg('查询账号失败：' + (qResp.message || '未知错误'));
        return;
      }
      const qResult = qResp.result as any;
      if (qResult == null) {
        // 未注册 → 注册新用户
        setPhoneLoginMsg('该手机号未注册，正在注册新用户...');
        const regData: any = { phone: p, code: c, isWeChatPhone: 0 };
        if (selectedCinemaId) regData.cinemaId = selectedCinemaId;
        const regResp = await api.registerMember(regData);
        if (!regResp.success || !regResp.result) {
          setPhoneLoginMsg('注册失败：' + (regResp.message || '未知错误'));
          return;
        }
        const regResult = regResp.result as any;
        const newMemberId = regResult.member?.id || regResult.id || '';
        if (!newMemberId) {
          setPhoneLoginMsg('注册成功但未获取到会员 ID');
          return;
        }
        // 确保当前微信 openId 绑定到新会员
        await api.updateMemberOpenId(p);
        await addAccount(name.trim() || p, active.token, String(newMemberId));
        setShowPhoneLogin(false);
        setPhone('');
        setCaptcha('');
        setPhoneLoginMsg('');
        collectVouchers();
        return;
      }
      // 已注册 → 弹「使用原有账号」确认框
      const info = qResult;
      setConfirmAcc({
        id: 'pending_' + p,
        name: p,
        token: active.token,
        memberId: String(info.id || ''),
        phone: p,
        level: info.level,
        levelDictText: info.level_dictText || info.levelDictText,
        balance: info.balance,
        score: info.score,
        createdAt: '',
        tokenValid: true,
      } as any);
      // 换绑警告：若当前账号无手机号，原账号换绑后无法通过微信登录
      const noPhoneWarn = !active.phone
        ? `⚠️ 当前账号「${active.name}」未绑定手机号，换绑后它将无法通过微信登录（数据仍在，但入口丢失）。`
        : '';
      setPhoneLoginMsg(
        `检测到该手机号已注册（${info.level_dictText || info.levelDictText || '会员'}）` +
          (noPhoneWarn ? '。' + noPhoneWarn : '') +
          '。请确认是否使用原有账号：'
      );
    } catch (e: any) {
      setPhoneLoginMsg('登录失败：' + e.message);
    }
  };

  // 确认「使用原有账号」→ 换绑 openId → 添加账号
  const handleConfirmUseExisting = async () => {
    if (!confirmAcc) return;
    const p = confirmAcc.phone || '';
    setConfirmLoading(true);
    setPhoneLoginMsg('');
    try {
      const upResp = await api.updateMemberOpenId(p);
      if (!upResp.success) {
        setPhoneLoginMsg('换绑失败：' + (upResp.message || '未知错误'));
        return;
      }
      await addAccount(name.trim() || p, confirmAcc.token, confirmAcc.memberId);
      setConfirmAcc(null);
      setShowPhoneLogin(false);
      setPhone('');
      setCaptcha('');
      collectVouchers();
    } catch (e: any) {
      setPhoneLoginMsg('换绑失败：' + e.message);
    } finally {
      setConfirmLoading(false);
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
            onClick={handleClearCache}
            disabled={clearing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
            title="清理页面显示缓存并强制全量刷新（不影响已登录账号）"
          >
            <RefreshCw className={`w-4 h-4 ${clearing ? 'animate-spin' : ''}`} />
            {clearing ? '刷新中...' : '清理缓存'}
          </button>
          <button
            onClick={refreshAllAccounts}
            disabled={refreshingAll}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50"
            title="刷新所有已登录账号的余额/积分/等级等信息"
          >
            <ListChecks className={`w-4 h-4 ${refreshingAll ? 'animate-spin' : ''}`} />
            {refreshingAll ? '刷新中...' : '刷新账号列表'}
          </button>
          <button
            onClick={collectAllVouchers}
            disabled={collecting}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
            title="一键收录所有已登录账号的电影票兑换券（含余额/积分）"
          >
            <BookMarked className={`w-4 h-4 ${collecting ? 'animate-pulse' : ''}`} />
            {collecting ? '收录中...' : '一键收录所有券码'}
          </button>
          <button
            onClick={() => collectVouchers()}
            disabled={collecting}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50"
            title="重新收录当前账号的电影票兑换券到 卷码收录 文件夹"
          >
            <BookMarked className="w-4 h-4" />
            重新收录
          </button>
          {!HIDE_APP_BUTTONS && (
            <button
              onClick={() => handleOpenMiniProgram()}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600"
              title="打开小程序首页"
            >
              <ExternalLink className="w-4 h-4" />
              打开小程序
            </button>
          )}
          {!HIDE_APP_BUTTONS && (
            <button
              onClick={() => handleOpenMiniProgram('pagesC/login/ph-login')}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-teal-500 text-white rounded-lg hover:bg-teal-600"
              title="打开小程序手机验证码登录页"
            >
              <Smartphone className="w-4 h-4" />
              打开登录页
            </button>
          )}
          {!HIDE_APP_BUTTONS && (
            <button
              onClick={() => handleOpenMiniProgram('pagesC/mine/order')}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
              title="打开小程序我的订单（可去支付）"
            >
              <CheckCircle className="w-4 h-4" />
              打开订单页
            </button>
          )}
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

      {/* 账号汇总统计（总余额/总积分/总券码） */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-4">
          <p className="text-xs text-emerald-600 font-medium flex items-center gap-1">
            <Wallet className="w-3.5 h-3.5" /> 总余额
          </p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            ¥{accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0).toFixed(2)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {accounts.filter((a) => Number(a.balance) > 0).length} 个账号有余额
          </p>
        </div>
        <div className="bg-orange-50 rounded-lg border border-orange-200 p-4">
          <p className="text-xs text-orange-600 font-medium flex items-center gap-1">
            <Star className="w-3.5 h-3.5" /> 总积分
          </p>
          <p className="text-2xl font-bold text-orange-600 mt-1">
            {accounts.reduce((s, a) => s + (Number(a.score) || 0), 0).toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {accounts.filter((a) => Number(a.score) > 0).length} 个账号有积分
          </p>
        </div>
        <div className="bg-purple-50 rounded-lg border border-purple-200 p-4">
          <p className="text-xs text-purple-600 font-medium flex items-center gap-1">
            <Ticket className="w-3.5 h-3.5" /> 总券码
          </p>
          <p className="text-2xl font-bold text-purple-600 mt-1">
            {snapInfo ? snapInfo.total : accounts.reduce((s, a) => s + (Number(a.voucherNum) || 0), 0)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {snapInfo
              ? `快照 ${snapInfo.total} 张 · ${snapInfo.lastSync.split(' ')[0]} 同步`
              : `${accounts.filter((a) => Number(a.voucherNum) > 0).length} 个账号有券`}
          </p>
          <div className="flex gap-1.5 mt-2">
            <button
              onClick={handleSyncSnapshot}
              disabled={syncingSnap}
              className="flex items-center gap-1 px-2 py-1 text-[11px] bg-purple-500 hover:bg-purple-600 text-white rounded-lg disabled:opacity-50"
            >
              {syncingSnap ? <Loader className="w-3 h-3 animate-spin" /> : <BadgeCheck className="w-3 h-3" />}
              同步快照
            </button>
            <button
              onClick={() => (window as any).electronAPI?.openVoucherSnapshot?.()}
              title="打开券码快照 txt"
              className="flex items-center gap-1 px-2 py-1 text-[11px] bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-lg"
            >
              <FileText className="w-3 h-3" />
              快照文件
            </button>
          </div>
          {snapInfo && (snapInfo.used > 0 || snapInfo.added > 0) && (
            <p className="text-[11px] mt-1.5 text-gray-500">
              上次同步：{snapInfo.added > 0 ? `新增 ${snapInfo.added} 张；` : ''}
              {snapInfo.used > 0 ? `已使用 ${snapInfo.used} 张 → 已自动记账 +¥${snapInfo.usedProfit.toFixed(0)}` : '无使用'}
            </p>
          )}
        </div>
      </div>

      {/* 兑换券链接导出（自定义选券 + 防重复 + 取消恢复 + 导出记录） */}
      <VoucherExport />

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
            <p>1. 输入手机号 → 获取验证码（短信照常收到，验证码内容后端不校验，随便填也能过）</p>
            <p>2. 系统先查询手机号：已注册 → 确认后换绑微信身份登录；未注册 → 自动注册新用户</p>
            <p>3. 登录成功后自动收录该账号的「电影票兑换券」到 卷码收录 文件夹</p>
            <p>4. ⚠️ 换绑会把当前微信身份切到该手机号账号；若当前账号没绑手机号，换绑后它将无法通过微信登录</p>
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

      {/* 清理缓存 / 收录状态 */}
      {(clearMsg || collectMsg) && (
        <div className="space-y-2">
          {clearMsg && (
            <div className={`text-sm p-2.5 rounded ${clearMsg.includes('✅') ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
              {clearMsg}
            </div>
          )}
          {collectMsg && (
            <div className={`text-sm p-2.5 rounded ${collectMsg.includes('✅') ? 'bg-green-50 text-green-700' : collectMsg.includes('⚠️') ? 'bg-orange-50 text-orange-700' : 'bg-yellow-50 text-yellow-700'}`}>
              {collectMsg}
            </div>
          )}
        </div>
      )}

      {/* 搜索 + 排序 */}
      {accounts.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索账号名称 / 手机号 / MemberId"
              className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg outline-none focus:border-pink-400"
            />
          </div>
          <button
            onClick={() => setSortMode(sortMode === 'none' ? 'desc' : sortMode === 'desc' ? 'asc' : 'none')}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border ${
              sortMode === 'none'
                ? 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                : 'bg-pink-50 border-pink-300 text-pink-600'
            }`}
            title="按余额排序：降序 → 升序 → 取消"
          >
            {sortMode === 'none' ? (
              <ArrowUpDown className="w-4 h-4" />
            ) : sortMode === 'desc' ? (
              <ArrowDown className="w-4 h-4" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
            {sortMode === 'none' ? '按余额排序' : sortMode === 'desc' ? '余额降序' : '余额升序'}
          </button>
        </div>
      )}

      {/* Account list */}
      <div className="space-y-3">
        {visibleAccounts.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            {accounts.length === 0 ? (
              <>
                <p>还没有添加账号</p>
                <p className="text-xs mt-1">点击「捕获 Token」或「手动添加」开始</p>
              </>
            ) : (
              <p>没有匹配「{searchTerm}」的账号</p>
            )}
          </div>
        ) : (
          visibleAccounts.map((acc: Account) => (
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
                  {acc.voucherNum != null && <span>🎫 {acc.voucherNum} 张券</span>}
                </div>
                <button
                  onClick={() => copyLoginInfo(acc)}
                  className="mt-2 flex items-center gap-1 text-[11px] bg-purple-50 text-purple-600 px-2 py-1 rounded-lg hover:bg-purple-100"
                  title="复制 token 和 memberId（手机 H5 查券用）"
                >
                  {copiedTokenId === acc.id ? (
                    <Check className="w-3 h-3 text-green-500" />
                  ) : (
                    <KeyRound className="w-3 h-3" />
                  )}
                  {copiedTokenId === acc.id ? '已复制' : '复制登录信息（手机查券）'}
                </button>
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

      {/* 使用原有账号 confirm modal */}
      {confirmAcc && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setConfirmAcc(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium text-lg">使用原有账号</h3>
            <p className="text-xs text-gray-400">
              该手机号已注册会员，确认后将把当前微信身份换绑到以下账号：
            </p>
            <div className="bg-purple-50 rounded-lg p-3 space-y-1 text-sm">
              <p>📱 手机号：{confirmAcc.phone}</p>
              {confirmAcc.levelDictText && <p>👑 等级：{confirmAcc.levelDictText}</p>}
              {confirmAcc.balance != null && <p>💰 余额：¥{Number(confirmAcc.balance).toFixed(2)}</p>}
              {confirmAcc.score != null && <p>⭐ 积分：{confirmAcc.score}</p>}
              <p className="text-xs text-gray-400">MemberId：{confirmAcc.memberId}</p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleConfirmUseExisting}
                disabled={confirmLoading}
                className="flex-1 px-4 py-2 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
              >
                {confirmLoading ? '换绑中...' : '确认使用原有账号'}
              </button>
              <button
                onClick={() => setConfirmAcc(null)}
                className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

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
