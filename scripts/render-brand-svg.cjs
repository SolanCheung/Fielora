const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const sourcePath = path.resolve(__dirname, '..', 'apps', 'desktop', 'assets', 'fielora-brand-mark.svg');
const outputPath = path.resolve(__dirname, '..', 'apps', 'desktop', 'assets', 'fielora-brand-mark.png');

app.whenReady().then(async () => {
  const svg = readFileSync(sourcePath, 'utf8');
  const window = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true },
  });
  const imagePromise = new Promise((resolve) => window.webContents.once('paint', (_event, _dirty, image) => resolve(image)));
  const html = `<!doctype html><style>html,body{width:100%;height:100%;margin:0;background:transparent;overflow:hidden}svg{display:block;width:100%;height:100%}</style>${svg}`;
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  const image = await imagePromise;
  writeFileSync(outputPath, image.toPNG());
  window.destroy();
  app.quit();
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
