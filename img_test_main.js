const { app, BrowserWindow } = require('electron');
console.log('APP_OK', !!app);
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  console.log('READY');
  const win = new BrowserWindow({ width: 800, height: 600, show: false });
  win.webContents.on('console-message', (e, level, msg) => console.log('CONSOLE:', msg));
  await win.loadFile(__dirname + '/img_test.html');
  setTimeout(() => {
    win.webContents.executeJavaScript("({complete: document.getElementById('i1').complete, w: document.getElementById('i1').naturalWidth})").then(r => console.log('IMG-STATE:', JSON.stringify(r))).catch(e => console.log('JS-ERR:', e.message));
    setTimeout(() => app.quit(), 1500);
  }, 4000);
});
