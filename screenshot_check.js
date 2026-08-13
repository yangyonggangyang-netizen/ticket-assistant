// 直接加载 dist 页面检查图片（不依赖账号，先看有没有图片元素）
const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 800, show: false, webPreferences: { offscreen: true } });
  await win.loadFile('D:/巴蒂哥/2026-08-03-21-45-13/movie-ticket-desktop/dist/index.html');
  setTimeout(async () => {
    const img = await win.webContents.executeJavaScript(`
      (() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        return imgs.map(i => ({ src: i.src.slice(0,80), complete: i.complete, naturalWidth: i.naturalWidth, display: getComputedStyle(i).display }));
      })()
    `);
    console.log('IMGS:', JSON.stringify(img, null, 2));
    app.quit();
  }, 5000);
});
