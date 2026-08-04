const { app, BrowserWindow, clipboard, nativeImage } = require('electron');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

let win;

app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 800, height: 600, show: false });
  await win.loadURL('data:text/html,' + encodeURIComponent(`
    <html>
      <body style="margin:0;padding:0;">
        <div id="target" style="margin:50px;width:300px;height:200px;background:linear-gradient(to right, blue 50%, yellow 50%);"></div>
      </body>
    </html>
  `));
  await new Promise(r => setTimeout(r, 500));

  // Replicate capture:region logic
  const originalContentSize = win.getContentSize();
  const elementBounds = await win.webContents.executeJavaScript(`
    (() => {
      const el = document.getElementById('target');
      const rect = el.getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
    })()
  `);
  console.log('element bounds', elementBounds);

  const requiredContentHeight = elementBounds.y + elementBounds.height + 16;
  win.setContentSize(originalContentSize[0], requiredContentHeight);
  await new Promise(r => setTimeout(r, 400));

  const image = await win.webContents.capturePage();
  const contentSize = win.getContentSize();
  const scaleX = image.getSize().width / contentSize[0];
  const scaleY = image.getSize().height / contentSize[1];
  console.log('scale', scaleX, scaleY, 'image size', image.getSize(), 'content', contentSize);

  const cropRect = {
    x: Math.round(elementBounds.x * scaleX),
    y: Math.round(elementBounds.y * scaleY),
    width: Math.round(elementBounds.width * scaleX),
    height: Math.round(elementBounds.height * scaleY),
  };
  console.log('cropRect', cropRect);

  const cropped = image.crop(cropRect);
  const pngBuffer = cropped.toPNG();
  const img = nativeImage.createFromBuffer(pngBuffer, { width: cropRect.width, height: cropRect.height });
  clipboard.writeImage(img);
  console.log('clipboard formats', clipboard.availableFormats());
  console.log('SUCCESS');
  app.quit();
}).catch(e => {
  console.error('ERROR', e.message, e.stack);
  app.quit();
});
