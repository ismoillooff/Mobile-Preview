'use strict';

// Renders the app icon from SVG with Electron and writes 256px and 512px PNGs.
// Usage: npx electron scripts/make-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#262a30"/>
      <stop offset="1" stop-color="#0d0f12"/>
    </linearGradient>
  </defs>
  <rect x="10" y="10" width="236" height="236" rx="56" fill="url(#bg)"/>
  <rect x="10.75" y="10.75" width="234.5" height="234.5" rx="55.25" fill="none" stroke="#ffffff" stroke-opacity="0.09" stroke-width="1.5"/>
  <rect x="79" y="36" width="98" height="184" rx="25" fill="none" stroke="#eceef1" stroke-width="12"/>
  <rect x="111" y="56" width="34" height="10" rx="5" fill="#eceef1"/>
  <circle cx="128" cy="140" r="23" fill="#3ddc97"/>
</svg>`;

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true },
  });
  const page = `<!doctype html><html style="overflow:hidden"><body style="margin:0;overflow:hidden;background:transparent"><style>svg{display:block}</style>${SVG}</body></html>`;
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`);
  await new Promise((r) => setTimeout(r, 400));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const root = path.join(__dirname, '..');
  const big = image.resize({ width: 512, height: 512, quality: 'best' });
  const icon256 = image.resize({ width: 256, height: 256, quality: 'best' });
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), big.toPNG());
  fs.writeFileSync(path.join(root, 'src', 'assets', 'icon.png'), icon256.toPNG());
  console.log('icon written:', big.getSize(), icon256.getSize());
  app.quit();
});
