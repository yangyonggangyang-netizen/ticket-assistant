/**
 * 影联出票助手 - Node.js 服务器
 * 替代 Electron，直接在浏览器中使用
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFile, exec } = require('child_process');

const PORT = 3456;
const DIST_DIR = path.join(__dirname, '..', 'dist');
const STORAGE_FILE = path.join(__dirname, '..', 'appdata', 'accounts.json');

// 确保存储目录存在
const storageDir = path.dirname(STORAGE_FILE);
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

// MIME types
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ========== 工具函数 ==========

function loadAccounts() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      return JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load accounts:', e.message);
  }
  return { accounts: [], activeAccountId: null };
}

function saveAccounts(data) {
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Failed to save accounts:', e.message);
    return false;
  }
}

// 代理 API 请求到 business.mhdyp.com
function proxyApiRequest(body, token) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname: 'business.mhdyp.com',
      port: 443,
      method: 'POST',
      path: body._path || '/api/movie-server/movie/user/detail',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'token': token || '',
        'channelid': 'C00001',
        'txntime': Date.now().toString(),
        'sign': '',
        'Origin': 'https://business.mhdyp.com',
        'Referer': 'https://business.mhdyp.com/',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    // 移除内部字段 _path
    const cleanBody = { ...body };
    delete cleanBody._path;
    const cleanData = JSON.stringify(cleanBody);
    options.headers['Content-Length'] = Buffer.byteLength(cleanData);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: 'Failed to parse response', raw: data });
        }
      });
    });

    req.on('error', reject);
    req.write(cleanData);
    req.end();
  });
}

// 文件上传
function uploadFile(filePath, token) {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Math.random().toString(16).slice(2);
    const fileName = path.basename(filePath);
    const fileData = fs.readFileSync(filePath);

    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: image/jpeg\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, fileData, footer]);

    const options = {
      hostname: 'business.mhdyp.com',
      port: 443,
      path: '/api/user-server/user/common/file/upload',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'token': token,
        'channelid': 'C00001',
        'txntime': Date.now().toString(),
        'sign': '',
        'Origin': 'https://business.mhdyp.com',
        'Referer': 'https://business.mhdyp.com/',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse upload response: ' + data));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ========== Token 捕获 ==========
const PYTHON_EXE = 'C:\\Users\\Administrator\\.workbuddy\\binaries\\python\\envs\\default\\Scripts\\python.exe';
const MITMDUMP_EXE = 'C:\\Users\\Administrator\\.workbuddy\\binaries\\python\\envs\\default\\Scripts\\mitmdump.exe';
const CAPTURE_SCRIPT = path.join(__dirname, 'capture_token.py');
const TOKEN_OUTPUT = path.join(__dirname, '..', 'captured_token.json');
const PROXY_PORT = 8888;

let mitmProcess = null;
let capturePollTimer = null;

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

function stopCapture() {
  if (capturePollTimer) {
    clearInterval(capturePollTimer);
    capturePollTimer = null;
  }
  if (mitmProcess) {
    try { mitmProcess.kill('SIGTERM'); } catch (e) {}
    mitmProcess = null;
  }
  setSystemProxy(false);
}

// ========== HTTP 服务器 ==========

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API routes
  if (req.url.startsWith('/api/')) {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const data = body ? JSON.parse(body) : {};

        // 账号管理
        if (req.url === '/api/accounts/load') {
          const result = loadAccounts();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        if (req.url === '/api/accounts/save') {
          saveAccounts(data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          return;
        }

        // API 代理
        if (req.url === '/api/proxy') {
          const result = await proxyApiRequest(data.body, data.token);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        // 文件上传（从浏览器，base64编码）
        if (req.url === '/api/upload') {
          // 将 base64 数据写入临时文件，然后上传
          const tmpFile = path.join(require('os').tmpdir(), `upload_${Date.now()}.jpg`);
          const fileBuffer = Buffer.from(data.fileData, 'base64');
          fs.writeFileSync(tmpFile, fileBuffer);
          const result = await uploadFile(tmpFile, data.token);
          // 清理临时文件
          try { fs.unlinkSync(tmpFile); } catch(e) {}
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        // Token 捕获 - 开始
        if (req.url === '/api/capture/start') {
          if (fs.existsSync(TOKEN_OUTPUT)) {
            fs.unlinkSync(TOKEN_OUTPUT);
          }
          await setSystemProxy(true);

          mitmProcess = execFile(MITMDUMP_EXE, [
            '-s', CAPTURE_SCRIPT,
            TOKEN_OUTPUT,
            '-p', String(PROXY_PORT),
            '--set', 'ssl_insecure=true',
          ], { cwd: path.join(__dirname, '..'), windowsHide: true });

          mitmProcess.stdout.on('data', (d) => {
            console.log('[mitm]', d.toString().trim());
          });

          await new Promise(r => setTimeout(r, 2000));

          // 开始轮询
          capturePollTimer = setInterval(() => {
            if (fs.existsSync(TOKEN_OUTPUT)) {
              try {
                const capData = JSON.parse(fs.readFileSync(TOKEN_OUTPUT, 'utf-8'));
                // 写到共享文件供前端轮询
                fs.writeFileSync(path.join(__dirname, '..', 'capture_status.json'), JSON.stringify(capData), 'utf-8');
                if (capData.done) {
                  stopCapture();
                }
              } catch (e) {}
            }
          }, 1000);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, port: PROXY_PORT }));
          return;
        }

        // Token 捕获 - 状态
        if (req.url === '/api/capture/status') {
          let status = { token: null, done: false };
          const statusFile = path.join(__dirname, '..', 'capture_status.json');
          if (fs.existsSync(statusFile)) {
            try {
              status = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
            } catch (e) {}
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(status));
          return;
        }

        // Token 捕获 - 停止
        if (req.url === '/api/capture/stop') {
          stopCapture();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // 静态文件
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(DIST_DIR, filePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    // SPA fallback
    const indexFile = path.join(DIST_DIR, 'index.html');
    if (fs.existsSync(indexFile)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(indexFile).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  }
});

// 清理
process.on('exit', () => {
  stopCapture();
});

server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  影联出票助手已启动！`);
  console.log(`  打开浏览器访问: http://localhost:${PORT}`);
  console.log(`  按 Ctrl+C 退出`);
  console.log(`========================================\n`);

  // 自动打开浏览器
  exec(`start http://localhost:${PORT}`);
});
