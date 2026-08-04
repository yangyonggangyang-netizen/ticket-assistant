import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Download, CheckCircle, AlertCircle, Loader } from 'lucide-react';

type UpdateState = 'idle' | 'checking' | 'available' | 'notAvailable' | 'downloading' | 'downloaded' | 'error';

export default function UpdateChecker() {
  const [state, setState] = useState<UpdateState>('idle');
  const [version, setVersion] = useState('');
  const [newVersion, setNewVersion] = useState('');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [updateInfo, setUpdateInfo] = useState<any>(null);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) return;

    api.getAppVersion().then((v: string) => setVersion(v));

    api.onUpdateAvailable((info: any) => {
      setNewVersion(info?.version || '新版本');
      setUpdateInfo(info);
      setState('available');
    });
    api.onUpdateNotAvailable(() => setState('notAvailable'));
    api.onDownloadProgress((p: any) => {
      setProgress(Math.round(p?.percent || 0));
      setState('downloading');
    });
    api.onUpdateDownloaded(() => setState('downloaded'));
    api.onUpdaterError((err: string) => {
      setErrorMsg(err);
      setState('error');
    });
  }, []);

  const handleCheck = useCallback(async () => {
    const api = (window as any).electronAPI;
    if (!api?.checkForUpdates) return;
    setState('checking');
    const result = await api.checkForUpdates();
    if (!result.success && result.error !== 'dev mode') {
      setErrorMsg(result.error);
      setState('error');
    } else if (result.success && !result.info) {
      setState('notAvailable');
    }
  }, []);

  const handleDownload = useCallback(async () => {
    const api = (window as any).electronAPI;
    if (!api?.downloadUpdate) return;
    setState('downloading');
    setProgress(0);
    await api.downloadUpdate();
  }, []);

  const handleInstall = useCallback(async () => {
    const api = (window as any).electronAPI;
    if (!api?.installUpdate) return;
    await api.installUpdate();
  }, []);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-gray-500">版本 v{version || '...'}</span>
        {state === 'idle' && (
          <button
            onClick={handleCheck}
            className="text-pink-400 hover:text-pink-300 text-xs flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            检查更新
          </button>
        )}
        {state === 'checking' && (
          <span className="text-gray-400 text-xs flex items-center gap-1">
            <Loader className="w-3 h-3 animate-spin" />
            检查中...
          </span>
        )}
      </div>

      {state === 'available' && (
        <div className="bg-blue-900/50 border border-blue-700 rounded-lg p-2 space-y-2">
          <div className="flex items-center gap-1.5 text-blue-300 text-xs">
            <Download className="w-3 h-3" />
            发现新版本 v{newVersion}
          </div>
          {updateInfo?.releaseNotes && (
            <p className="text-xs text-gray-300 whitespace-pre-wrap max-h-24 overflow-auto">
              {typeof updateInfo.releaseNotes === 'string'
                ? updateInfo.releaseNotes
                : '新版本已发布'}
            </p>
          )}
          <button
            onClick={handleDownload}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs py-1.5 rounded"
          >
            下载更新
          </button>
        </div>
      )}

      {state === 'notAvailable' && (
        <p className="text-green-400 text-xs flex items-center gap-1">
          <CheckCircle className="w-3 h-3" />
          已是最新版本
        </p>
      )}

      {state === 'downloading' && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Loader className="w-3 h-3 animate-spin" />
              下载中...
            </span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-1.5">
            <div
              className="bg-pink-500 h-1.5 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {state === 'downloaded' && (
        <div className="bg-green-900/50 border border-green-700 rounded-lg p-2 space-y-2">
          <p className="text-green-300 text-xs flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            下载完成，重启安装
          </p>
          <button
            onClick={handleInstall}
            className="w-full bg-green-600 hover:bg-green-700 text-white text-xs py-1.5 rounded"
          >
            立即重启更新
          </button>
        </div>
      )}

      {state === 'error' && (
        <p className="text-red-400 text-xs flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {errorMsg || '检查失败'}
        </p>
      )}
    </div>
  );
}
