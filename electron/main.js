const { app, BrowserWindow, ipcMain, session, clipboard, nativeImage, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, exec } = require('child_process');

// ========== Auto Updater ==========
const { autoUpdater } = require('electron-updater');
let updaterReady = false;
try {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
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
"""Capture token from yq30 API login response."""
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

    def response(self, flow):
        if '/api/member/login' in flow.request.url:
            try:
                body = json.loads(flow.response.text)
                if body.get('success') and body.get('result'):
                    result = body['result']
                    data = {
                        'token': result.get('token', ''),
                        'memberId': result.get('id', ''),
                        'phone': result.get('phone', ''),
                        'level': result.get('level', ''),
                        'cinemaId': result.get('cinemaId', ''),
                        'done': True,
                    }
                    self.save(data)
                    self.captured = True
                    print(f'[CAPTURED] Token: {data["token"][:20]}... MemberId: {data["memberId"]}')
                    print('[DONE] Token captured successfully!')
            except Exception as e:
                print(f'[ERROR] Failed to parse login response: {e}')

addons = [TokenCapture(output_file)]
`;

if (!fs.existsSync(RUNTIME_DIR)) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
}
if (!fs.existsSync(CAPTURE_SCRIPT)) {
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
    },
  });

  // Handle CORS
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
