const { app, BrowserWindow, clipboard, nativeImage } = require('electron');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

let win;

app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 400, height: 300, show: false });
  await win.loadURL('data:text/html,<html><body style="background:red;width:200px;height:200px;"></body></html>');
  await new Promise(r => setTimeout(r, 500));
  try {
    const image = await win.webContents.capturePage();
    console.log('captured size', image.getSize());
    const cropped = image.crop({ x: 0, y: 0, width: 100, height: 100 });
    console.log('cropped size', cropped.getSize());
    clipboard.writeImage(cropped);
    console.log('clipboard formats', clipboard.availableFormats());
    const img2 = clipboard.readImage();
    console.log('read back size', img2.getSize());
    console.log('SUCCESS');
  } catch (e) {
    console.error('ERROR', e.message, e.stack);
  }
  app.quit();
});
