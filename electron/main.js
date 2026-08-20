const { app, BrowserWindow, ipcMain, session, clipboard, nativeImage, screen, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, exec } = require('child_process');

// ========== Auto Updater ==========
const { autoUpdater } = require('electron-updater');
let updaterReady = false;
// 更新源：默认自有服务器（广州轻量，国内秒下），userData/server_config.json 可覆盖（未来切 HTTPS 域名）
let UPDATE_FEED_URL = 'http://8.134.105.236/updates';
try {
  const cfgFile = path.join(app.getPath('userData'), 'server_config.json');
  if (fs.existsSync(cfgFile)) {
    const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf-8'));
    if (cfg.updateUrl) UPDATE_FEED_URL = cfg.updateUrl;
  }
} catch (e) {
  console.log('[updater] config load failed:', e.message);
}
try {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_FEED_URL });
  updaterReady = true;
} catch (e) {
  console.log('[updater] not available in dev mode:', e.message);
}

// Disable GPU acceleration for compatibility
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

let storageFile = '';

function getStorageFile() {
  if (!storageFile) {
    storageFile = path.join(app.getPath('userData'), 'accounts.json');
  }
  return storageFile;
}

function loadAccounts() {
  try {
    const file = getStorageFile();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load accounts:', e);
  }
  return { accounts: [], activeAccountId: null };
}

function saveAccounts(data) {
  try {
    fs.writeFileSync(getStorageFile(), JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save accounts:', e);
  }
}

// ========== Token Capture ==========
const RUNTIME_DIR = path.join(app.getPath('userData'), 'runtime');
const MITMDUMP_CANDIDATES = [
  'C:\\Users\\Administrator\\.workbuddy\\binaries\\python\\envs\\default\\Scripts\\mitmdump.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python3*', 'Scripts', 'mitmdump.exe'),
  path.join(process.env.ProgramFiles || '', 'mitmproxy', 'bin', 'mitmdump.exe'),
  'mitmdump',
];
const CAPTURE_SCRIPT = path.join(RUNTIME_DIR, 'capture_token.py');
const TOKEN_OUTPUT = path.join(RUNTIME_DIR, 'captured_token.json');
const PROXY_PORT = 8888;

function findMitmdump() {
  for (const candidate of MITMDUMP_CANDIDATES) {
    if (candidate.includes('*')) {
      try {
        const matches = require('glob').sync(candidate);
        if (matches.length > 0) return matches[0];
      } catch (e) {}
    } else if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  // Try PATH
  try {
    const which = require('child_process').execSync('where mitmdump', { encoding: 'utf-8' }).trim().split('\n')[0];
    if (which) return which;
  } catch (e) {}
  return null;
}

let mitmProcess = null;
let capturePollTimer = null;
let mainWindow = null;

function setSystemProxy(enable) {
  return new Promise((resolve) => {
    const regPath = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
    if (enable) {
      exec(`reg add "${regPath}" /v ProxyEnable /t REG_DWORD /d 1 /f`, () => {
        exec(`reg add "${regPath}" /v ProxyServer /t REG_SZ /d "127.0.0.1:${PROXY_PORT}" /f`, () => {
          exec(`reg add "${regPath}" /v ProxyOverride /t REG_SZ /d "localhost;127.0.0.1;<local>" /f`, () => {
            resolve();
          });
        });
      });
    } else {
      exec(`reg add "${regPath}" /v ProxyEnable /t REG_DWORD /d 0 /f`, () => {
        resolve();
      });
    }
  });
}

// Ensure capture script exists
const CAPTURE_SCRIPT_CONTENT = `#!/usr/bin/env python3
"""Capture token / member info from yq30 API responses (login, register, phone number)."""
import os
import json

output_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'captured_token.json')

class TokenCapture:
    def __init__(self, output_file):
        self.output_file = output_file
        self.captured = False

    def save(self, data):
        with open(self.output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def _try_parse(self, text):
        try:
            return json.loads(text)
        except Exception:
            return None

    def response(self, flow):
        url = flow.request.url or ''
        try:
            body = self._try_parse(flow.response.text)
        except Exception:
            body = None

        # 1) Login response: /api/member/login -> token + id + phone
        if '/api/member/login' in url:
            if body and isinstance(body, dict) and body.get('success') and body.get('result'):
                r = body['result'] or {}
                if r.get('token'):
                    self.save({
                        'token': r.get('token', ''),
                        'memberId': r.get('id') or r.get('memberId') or '',
                        'phone': r.get('phone', ''),
                        'level': r.get('level', ''),
                        'cinemaId': r.get('cinemaId', ''),
                        'source': 'login',
                        'done': True,
                    })
                    self.captured = True
                    print(f'[CAPTURED] login token: {r.get("token", "")[:20]}... memberId: {r.get("id", "")}')
                    print('[DONE] Token captured successfully!')
                    return

        # 2) Register response: /api/member/register -> member id + phone (token comes right after in login)
        if '/api/member/register' in url:
            if body and isinstance(body, dict) and body.get('success') and body.get('result'):
                r = body.get('result') or {}
                m = r.get('member') or {}
                if m.get('id') or m.get('phone'):
                    self.save({
                        'token': r.get('token') or m.get('token') or '',
                        'memberId': str(m.get('id') or r.get('id') or ''),
                        'phone': m.get('phone') or r.get('phone') or '',
                        'level': m.get('level', ''),
                        'cinemaId': m.get('cinemaId', ''),
                        'source': 'register',
                        'done': bool(r.get('token') or m.get('token')),
                    })
                    self.captured = True
                    print(f'[CAPTURED] register: phone={m.get("phone", "")} memberId={m.get("id", "")}')
                    if self._last_saved_done():
                        print('[DONE] Token captured successfully!')
                    return

        # 3) Phone number from WeChat one-click: api/member/getPhoneNumber
        if 'getPhoneNumber' in url:
            if body and isinstance(body, dict) and body.get('success') and body.get('result'):
                phone = (body.get('result') or {}).get('phoneNumber', '')
                if phone:
                    self.save({
                        'phone': phone,
                        'source': 'getPhoneNumber',
                        'done': False,
                    })
                    self.captured = True
                    print(f'[CAPTURED] phone: {phone}')
                    return

        # 4) queryByPhone: member exists?
        if 'queryByPhone' in url:
            if body and isinstance(body, dict) and body.get('success'):
                self.save({
                    'queryByPhoneResult': body.get('result'),
                    'source': 'queryByPhone',
                    'done': False,
                })
                print(f'[CAPTURED] queryByPhone: {json.dumps(body.get("result"), ensure_ascii=False)[:100]}')
                return

        # 5) updateMemberOpenId: old member binds wechat
        if 'updateMemberOpenId' in url:
            if body and isinstance(body, dict) and body.get('success'):
                self.save({'source': 'updateMemberOpenId', 'done': False})
                print('[CAPTURED] updateMemberOpenId success')
                return

        # 6) Any JSON response that contains a non-empty token field
        if body and isinstance(body, dict):
            result = body.get('result')
            token = None
            if isinstance(result, dict):
                token = result.get('token') or result.get('accessToken')
            elif isinstance(result, str):
                pass
            if token:
                memberId = result.get('id') or result.get('memberId') or '' if isinstance(result, dict) else ''
                self.save({
                    'token': token,
                    'memberId': memberId,
                    'phone': result.get('phone', '') if isinstance(result, dict) else '',
                    'source': url.split('/')[-1],
                    'done': True,
                })
                self.captured = True
                print(f'[CAPTURED] token from {url}')
                print('[DONE] Token captured successfully!')

    def _last_saved_done(self):
        try:
            if os.path.exists(self.output_file):
                return json.load(open(self.output_file, encoding='utf-8')).get('done', False)
        except Exception:
            pass
        return False

addons = [TokenCapture(output_file)]
`;

if (!fs.existsSync(RUNTIME_DIR)) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
}
if (!fs.existsSync(CAPTURE_SCRIPT) || fs.readFileSync(CAPTURE_SCRIPT, 'utf-8') !== CAPTURE_SCRIPT_CONTENT) {
  fs.writeFileSync(CAPTURE_SCRIPT, CAPTURE_SCRIPT_CONTENT, 'utf-8');
}

async function startCapture() {
  try {
    const mitmdumpExe = findMitmdump();
    if (!mitmdumpExe || !fs.existsSync(mitmdumpExe)) {
      return { success: false, error: '未找到 mitmdump，请安装 mitmproxy 并确保 mitmdump 在 PATH 中' };
    }
    if (fs.existsSync(TOKEN_OUTPUT)) {
      fs.unlinkSync(TOKEN_OUTPUT);
    }
    await setSystemProxy(true);

    mitmProcess = execFile(mitmdumpExe, [
      '-s', `${CAPTURE_SCRIPT}`,
      '--mode', `regular@127.0.0.1:${PROXY_PORT}`,
      '--set', 'ssl_insecure=true',
    ], {
      cwd: path.join(__dirname, '..'),
      windowsHide: true,
    });

    mitmProcess.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      console.log('[mitm]', msg);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('capture:progress', msg);
      }
      if (msg.includes('[CAPTURED]') || msg.includes('[DONE]')) {
        setTimeout(() => {
          if (fs.existsSync(TOKEN_OUTPUT)) {
            try {
              const captured = JSON.parse(fs.readFileSync(TOKEN_OUTPUT, 'utf-8'));
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('capture:data', captured);
              }
              if (captured.done) {
                stopCapture();
              }
            } catch (e) {}
          }
        }, 500);
      }
    });

    mitmProcess.stderr.on('data', (data) => {
      console.error('[mitm stderr]', data.toString().trim());
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    capturePollTimer = setInterval(() => {
      if (fs.existsSync(TOKEN_OUTPUT)) {
        try {
          const data = JSON.parse(fs.readFileSync(TOKEN_OUTPUT, 'utf-8'));
          if (data.done) {
            stopCapture();
          }
        } catch (e) {}
      }
    }, 2000);

    return { success: true, port: PROXY_PORT };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function stopCapture() {
  if (capturePollTimer) {
    clearInterval(capturePollTimer);
    capturePollTimer = null;
  }
  if (mitmProcess) {
    try { mitmProcess.kill('SIGTERM'); } catch (e) {}
    mitmProcess = null;
  }
  await setSystemProxy(false);

  let result = null;
  if (fs.existsSync(TOKEN_OUTPUT)) {
    try {
      result = JSON.parse(fs.readFileSync(TOKEN_OUTPUT, 'utf-8'));
    } catch (e) {}
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('capture:done', result);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '影联出票助手',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 关闭 webSecurity：file:// 页面跨域请求后端 API（POST/GET）不拦截，
      // 修复"排期电影海报不显示"（getNowPlayMovies 的 POST 请求被 CORS 拦截导致 movieMap 空）
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
  });

  // Handle CORS（webSecurity 已关闭，这里保留 CORS 头兜底，保证 canvas 海报 crossOrigin 可用）
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders || {};
    headers['access-control-allow-origin'] = ['*'];
    headers['access-control-allow-headers'] = ['*'];
    headers['access-control-allow-methods'] = ['GET, POST, PUT, DELETE, OPTIONS'];
    callback({ responseHeaders: headers });
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Register IPC handlers inside app.whenReady()
  ipcMain.handle('accounts:load', () => loadAccounts());
  ipcMain.handle('accounts:save', (event, data) => {
    saveAccounts(data);
    return true;
  });
  ipcMain.handle('capture:start', async () => {
    return await startCapture();
  });
  ipcMain.handle('capture:stop', async () => {
    await stopCapture();
    return true;
  });
  ipcMain.handle('app:openPath', async (event, filePath) => {
    try {
      const resolved = filePath || path.join(require('os').homedir(), 'Desktop', '大埔嘉逸影联.lnk');
      const result = await shell.openPath(resolved);
      return { success: !result, error: result || undefined };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  });

  ipcMain.handle('app:openExternal', async (event, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  });

  // Window always-on-top
  ipcMain.handle('window:setAlwaysOnTop', (event, flag) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(!!flag);
        return { success: true, alwaysOnTop: !!flag };
      }
      return { success: false, error: '主窗口不存在' };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  });
  ipcMain.handle('window:getAlwaysOnTop', () => {
    return mainWindow ? mainWindow.isAlwaysOnTop() : false;
  });

  // Save voucher records to 卷码收录 folder (D:\巴蒂哥\出票助手\卷码收录\{phone}.txt)
  ipcMain.handle('voucher:save', async (event, { phone, content }) => {
    try {
      if (!phone) return { success: false, error: '手机号为空' };
      const dir = 'D:/巴蒂哥/出票助手/卷码收录';
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, `${String(phone).trim()}.txt`);
      fs.writeFileSync(filePath, String(content || ''), 'utf-8');
      return { success: true, filePath };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  });

  // ===== 兑换券导出记录（防重复导出 + 历史追溯） =====
  // 记录文件：D:\巴蒂哥\出票助手\兑换券导出记录.json
  const VOUCHER_EXPORT_FILE = 'D:/巴蒂哥/出票助手/兑换券导出记录.json';

  function loadVoucherExportRecords() {
    try {
      if (fs.existsSync(VOUCHER_EXPORT_FILE)) {
        const data = JSON.parse(fs.readFileSync(VOUCHER_EXPORT_FILE, 'utf-8'));
        if (data && Array.isArray(data.records)) return data;
      }
    } catch (e) {
      console.error('Failed to load voucher export records:', e);
    }
    return { records: [] };
  }

  function saveVoucherExportRecords(data) {
    try {
      fs.mkdirSync(path.dirname(VOUCHER_EXPORT_FILE), { recursive: true });
      fs.writeFileSync(VOUCHER_EXPORT_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save voucher export records:', e);
    }
  }

  // 保存一条导出记录：{ phone, codes: [], url, time }
  ipcMain.handle('voucher:exportRecord', async (event, record) => {
    try {
      const data = loadVoucherExportRecords();
      data.records.unshift({
        phone: String(record?.phone || ''),
        codes: Array.isArray(record?.codes) ? record.codes : [],
        url: String(record?.url || ''),
        time: String(record?.time || new Date().toLocaleString('zh-CN')),
      });
      // 防重复：去重（同 phone + code 只留最新）
      const seen = new Set();
      data.records = data.records.filter((r) => {
        const key = `${r.phone}|${r.codes.join(',')}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      saveVoucherExportRecords(data);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  });

  // 查询所有已导出的券码（用于防重复导出过滤）
  ipcMain.handle('voucher:exportedCodes', async () => {
    try {
      const data = loadVoucherExportRecords();
      const codes = new Set();
      data.records.forEach((r) => {
        (r.codes || []).forEach((c) => codes.add(String(c)));
      });
      return { success: true, codes: Array.from(codes) };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  });

  // 查询导出记录列表（展示用）
  ipcMain.handle('voucher:exportRecords', async () => {
    try {
      const data = loadVoucherExportRecords();
      return { success: true, records: data.records };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  });

  // 取消导出：删除记录（券恢复可用）
  ipcMain.handle('voucher:cancelExport', async (event, record) => {
    try {
      const data = loadVoucherExportRecords();
      const targetCodes = Array.isArray(record?.codes) ? record.codes : [];
      data.records = data.records.filter((r) => {
        const rc = r.codes || [];
        // 只删这条记录里完全匹配的（同 phone + 同 codes 列表）
        return !(r.phone === record?.phone && JSON.stringify(rc) === JSON.stringify(targetCodes));
      });
      saveVoucherExportRecords(data);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  });

  // ===== 兑换券链接部署（自有服务器 8.134.105.236） =====
  // 上传 HTML 到服务器 /var/www/voucher，Nginx 直接服务，秒级生效
  // 配置优先级：userData/server_config.json > 代码内置默认（兼容已安装用户）
  let VOUCHER_SERVER = 'http://8.134.105.236';
  let VOUCHER_API_KEY = 'bc777d634b98d5b472b8db34dc9e29c59d5a72565102b44b';
  try {
    const cfgFile = path.join(app.getPath('userData'), 'server_config.json');
    if (fs.existsSync(cfgFile)) {
      const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf-8'));
      if (cfg.serverUrl) VOUCHER_SERVER = String(cfg.serverUrl).replace(/\/+$/, '');
      if (cfg.apiKey) VOUCHER_API_KEY = String(cfg.apiKey);
    }
  } catch (e) {
    console.error('Failed to load server config:', e.message);
  }

  async function voucherApi(path, method = 'GET', payload = null) {
    const url = `${VOUCHER_SERVER}${path}`;
    const headers = {
      'X-API-Key': VOUCHER_API_KEY,
      'Content-Type': 'application/json',
    };
    const opts = { method, headers };
    if (payload) {
      opts.body = JSON.stringify(payload);
    }
    const resp = await fetch(url, opts);
    const text = await resp.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) {}
    if (!resp.ok) {
      throw new Error(`服务器 ${resp.status}: ${(data && (data.error || data.message)) || text}`);
    }
    return data;
  }

  // 部署：每个订单独立文件名 voucher-{id}.html，不覆盖旧页面，秒级生效
  ipcMain.handle('voucher:deployPage', async (event, { html, fileId }) => {
    try {
      if (!html || typeof html !== 'string') {
        return { success: false, error: 'HTML 内容为空' };
      }
      const safeId = String(fileId || '').replace(/[^a-zA-Z0-9_-]/g, '');
      if (!safeId) {
        return { success: false, error: '缺少订单标识' };
      }
      const data = await voucherApi('/api/voucher', 'POST', { id: safeId, html });
      return { success: true, url: `${VOUCHER_SERVER}${data.url}` };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  });

  // 撤销：删除线上页面文件（链接立即失效）
  ipcMain.handle('voucher:deletePage', async (event, { fileId }) => {
    try {
      const safeId = String(fileId || '').replace(/[^a-zA-Z0-9_-]/g, '');
      if (!safeId) {
        return { success: false, error: '缺少订单标识' };
      }
      await voucherApi(`/api/voucher/${safeId}`, 'DELETE');
      return { success: true, deleted: true };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  });

  // Save base64 image to disk (for generated schedule poster)
  ipcMain.handle('image:save', async (event, { dataUrl, defaultName }) => {
    try {
      const base64 = String(dataUrl || '').replace(/^data:image\/\w+;base64,/, '');
      if (!base64) return { success: false, error: '图片数据为空' };
      const buffer = Buffer.from(base64, 'base64');
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: '保存图片',
        defaultPath: defaultName || '排期图.png',
        filters: [{ name: 'PNG 图片', extensions: ['png'] }],
      });
      if (canceled || !filePath) return { success: false, canceled: true };
      fs.writeFileSync(filePath, buffer);
      return { success: true, filePath };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  });

  // Copy base64 image to clipboard
  ipcMain.handle('image:copy', async (event, dataUrl) => {
    try {
      const base64 = String(dataUrl || '').replace(/^data:image\/\w+;base64,/, '');
      if (!base64) return { success: false, error: '图片数据为空' };
      const buffer = Buffer.from(base64, 'base64');
      const img = nativeImage.createFromBuffer(buffer);
      if (img.isEmpty()) return { success: false, error: '图片解析失败' };
      clipboard.writeImage(img);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  });

  ipcMain.handle('capture:region', async (event, rect) => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { success: false, error: '主窗口不存在' };
      }

      const originalBounds = mainWindow.getBounds();
      const originalContentSize = mainWindow.getContentSize();

      // Expand the client (content) area so the full target element is in viewport.
      // rect coordinates come from getBoundingClientRect() which is relative to the viewport.
      const requiredContentHeight = rect.y + rect.height + 16;
      const needResize = originalContentSize[1] < requiredContentHeight;
      if (needResize) {
        mainWindow.setContentSize(originalContentSize[0], requiredContentHeight);
        // Wait for the renderer to paint the enlarged viewport
        await new Promise((resolve) => setTimeout(resolve, 400));
      }

      const image = await mainWindow.webContents.capturePage();
      const contentSize = mainWindow.getContentSize();
      // capturePage returns a device-scale image; contentSize is CSS pixels.
      const scaleX = image.getSize().width / contentSize[0];
      const scaleY = image.getSize().height / contentSize[1];

      const cropRect = {
        x: Math.round(rect.x * scaleX),
        y: Math.round(rect.y * scaleY),
        width: Math.round(rect.width * scaleX),
        height: Math.round(rect.height * scaleY),
      };

      // Clamp to the captured image
      const imgSize = image.getSize();
      cropRect.x = Math.max(0, Math.min(cropRect.x, imgSize.width - 1));
      cropRect.y = Math.max(0, Math.min(cropRect.y, imgSize.height - 1));
      cropRect.width = Math.min(cropRect.width, imgSize.width - cropRect.x);
      cropRect.height = Math.min(cropRect.height, imgSize.height - cropRect.y);

      if (cropRect.width <= 0 || cropRect.height <= 0) {
        if (needResize) mainWindow.setBounds(originalBounds);
        return { success: false, error: '截图区域超出页面范围' };
      }

      const cropped = image.crop(cropRect);
      if (!cropped || cropped.isEmpty()) {
        if (needResize) mainWindow.setBounds(originalBounds);
        return { success: false, error: '截图裁剪结果为空' };
      }

      // Write as PNG buffer then recreate NativeImage to avoid any handle issues
      const pngBuffer = cropped.toPNG();
      const clipboardImage = nativeImage.createFromBuffer(pngBuffer, { width: cropRect.width, height: cropRect.height });
      clipboard.writeImage(clipboardImage);

      if (needResize) {
        mainWindow.setBounds(originalBounds);
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  });

  // ========== Auto Updater IPC ==========
  if (updaterReady) {
    autoUpdater.on('update-available', (info) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:updateAvailable', info);
      }
    });
    autoUpdater.on('update-not-available', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:updateNotAvailable');
      }
    });
    autoUpdater.on('download-progress', (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:downloadProgress', progress);
      }
    });
    autoUpdater.on('update-downloaded', (info) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:updateDownloaded', info);
      }
    });
    autoUpdater.on('error', (err) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:error', err?.message || String(err));
      }
    });

    ipcMain.handle('updater:check', async () => {
      try {
        const result = await autoUpdater.checkForUpdates();
        return { success: true, info: result?.updateInfo || null };
      } catch (e) {
        return { success: false, error: e.message || String(e) };
      }
    });
    ipcMain.handle('updater:download', async () => {
      try {
        await autoUpdater.downloadUpdate();
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message || String(e) };
      }
    });
    ipcMain.handle('updater:install', async () => {
      try {
        autoUpdater.quitAndInstall();
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message || String(e) };
      }
    });
    ipcMain.handle('updater:version', () => {
      return app.getVersion();
    });
  } else {
    ipcMain.handle('updater:check', async () => ({ success: false, error: 'dev mode' }));
    ipcMain.handle('updater:download', async () => ({ success: false, error: 'dev mode' }));
    ipcMain.handle('updater:install', async () => ({ success: false, error: 'dev mode' }));
    ipcMain.handle('updater:version', () => app.getVersion());
  }

  createWindow();

  // 启动后自动检查更新（延时 3 秒，不打扰启动；有新版自动下载，下载完提示一键重启）
  if (updaterReady) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((e) => {
        console.log('[updater] auto check failed:', e.message);
      });
    }, 3000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', async () => {
  await setSystemProxy(false);
  if (mitmProcess) {
    try { mitmProcess.kill('SIGTERM'); } catch (e) {}
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
