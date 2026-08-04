// 最简测试 - 用 app.commandLine.appendSwitch 禁用 GPU
const { app, BrowserWindow } = require('electron');
const path = require('path');

// 在 app ready 之前禁用所有 GPU 相关功能
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('override-use-software-gl-for-tests');
app.commandLine.appendSwitch('no-sandbox');

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 800, height: 600, title: '测试' });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  console.log('Window created successfully!');
});

app.on('window-all-closed', () => app.quit());
