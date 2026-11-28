'use strict';

const {
  app, BrowserWindow, ipcMain, webContents, dialog, shell, Menu, clipboard, session,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { fileURLToPath, pathToFileURL } = require('node:url');
const QRCode = require('qrcode');
const { scanLocalServers } = require('./main/ports');
const { StaticServer } = require('./main/static-server');

const RENDERER_DIR = path.join(__dirname, 'renderer');
const START_URL = pathToFileURL(path.join(RENDERER_DIR, 'start.html')).href;
const CHROME_MAJOR = process.versions.chrome.split('.')[0];
const SMOKE_DIR = process.env.MP_SMOKE || '';
const IS_MAC = process.platform === 'darwin';

// Smoke runs use a throwaway profile so they never touch the user's settings.
if (SMOKE_DIR) app.setPath('userData', path.join(os.tmpdir(), `mobile-preview-smoke-${process.pid}`));

if (!SMOKE_DIR && !app.requestSingleInstanceLock()) {
  app.quit();
}

/** @type {BrowserWindow | null} */
let win = null;
const server = new StaticServer();

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

let settings = {};
let saveTimer = null;
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) || {};
  } catch {
    settings = {};
  }
}

function writeSettingsNow() {
  clearTimeout(saveTimer);
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('[settings] write failed:', err.message);
  }
}

function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeSettingsNow, 300);
}

/* ------------------------------------------------------------------ */
/* Window                                                              */
/* ------------------------------------------------------------------ */

const CHROME_COLORS = {
  dark: { color: '#16181c', symbolColor: '#c9ced6', bg: '#0f1114' },
  light: { color: '#f6f7f8', symbolColor: '#2a2e35', bg: '#e9ebee' },
};

function initialDark() {
  const pref = settings.theme || 'system';
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  const { nativeTheme } = require('electron');
  return nativeTheme.shouldUseDarkColors;
}

function createWindow() {
  const palette = initialDark() ? CHROME_COLORS.dark : CHROME_COLORS.light;
  const bounds = settings.window || {};
  const iconPath = path.join(__dirname, 'assets', 'icon.png');

  win = new BrowserWindow({
    width: bounds.width || 1440,
    height: bounds.height || 940,
    x: Number.isFinite(bounds.x) ? bounds.x : undefined,
    y: Number.isFinite(bounds.y) ? bounds.y : undefined,
    minWidth: 820,
    minHeight: 560,
    title: 'Mobile Preview',
    backgroundColor: palette.bg,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    titleBarStyle: 'hidden',
    ...(IS_MAC
      ? { trafficLightPosition: { x: 14, y: 16 } }
      : { titleBarOverlay: { color: palette.color, symbolColor: palette.symbolColor, height: 48 } }),
    show: false,
    skipTaskbar: !!SMOKE_DIR,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      spellcheck: false,
    },
  });

  if (bounds.maximized && !SMOKE_DIR) win.maximize();
  // Smoke runs must never steal keyboard focus from whatever the user is doing.
  win.once('ready-to-show', () => (SMOKE_DIR ? win.showInactive() : win.show()));
  if (SMOKE_DIR) win.setFocusable(false);

  // The host page must never navigate away (e.g. when a file is dropped on it).
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Lock down every <webview> the renderer creates.
  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    const src = params.src || 'about:blank';
    if (!/^(https?:|file:|about:)/i.test(src)) event.preventDefault();
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = IS_MAC ? input.meta : input.control || input.meta;
    if (!app.isPackaged && ctrl && input.shift && input.key.toLowerCase() === 'i') {
      event.preventDefault();
      win.webContents.toggleDevTools();
      return;
    }
    const name = shortcutFor(input);
    if (name) {
      event.preventDefault();
      win.webContents.send('shortcut', name, null);
    }
  });

  win.on('close', () => {
    if (!win) return;
    const maximized = win.isMaximized();
    const b = win.getNormalBounds();
    settings.window = { ...b, maximized };
    writeSettingsNow();
  });
  win.on('closed', () => {
    win = null;
  });

  win.loadFile(path.join(RENDERER_DIR, 'index.html'));

  if (SMOKE_DIR) runSmoke();
}

/* ------------------------------------------------------------------ */
/* Guest (<webview>) behaviour                                         */
/* ------------------------------------------------------------------ */

const MENU_TEXT = {
  uz: { back: 'Orqaga', forward: 'Oldinga', reload: 'Qayta yuklash', copy: 'Nusxa olish', copyLink: 'Havoladan nusxa olish', inspect: 'Elementni tekshirish', openExternal: 'Brauzerda ochish' },
  ru: { back: 'Назад', forward: 'Вперёд', reload: 'Перезагрузить', copy: 'Копировать', copyLink: 'Копировать ссылку', inspect: 'Просмотреть код', openExternal: 'Открыть в браузере' },
  en: { back: 'Back', forward: 'Forward', reload: 'Reload', copy: 'Copy', copyLink: 'Copy link', inspect: 'Inspect element', openExternal: 'Open in browser' },
};

function shortcutFor(input) {
  if (input.type !== 'keyDown') return null;
  const ctrl = IS_MAC ? input.meta : input.control || input.meta;
  const key = (input.key || '').toLowerCase();
  if (input.key === 'F5' || (ctrl && key === 'r')) return input.shift ? 'hardReload' : 'reload';
  if (input.key === 'F12' || (ctrl && input.shift && key === 'i')) return 'devtools';
  if (ctrl && key === 'l') return 'focusUrl';
  if (ctrl && (key === '=' || key === '+')) return 'zoomIn';
  if (ctrl && key === '-') return 'zoomOut';
  if (ctrl && key === '0') return 'zoomFit';
  if (IS_MAC) {
    if (ctrl && key === '[') return 'back';
    if (ctrl && key === ']') return 'forward';
    return null;
  }
  if (input.alt && input.key === 'ArrowLeft') return 'back';
  if (input.alt && input.key === 'ArrowRight') return 'forward';
  return null;
}

app.on('web-contents-created', (_event, wc) => {
  if (wc.getType() !== 'webview') return;

  // Mobile browsers open target=_blank links in a new tab; here we keep them in the same screen.
  wc.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|file:)/i.test(url)) setImmediate(() => !wc.isDestroyed() && wc.loadURL(url));
    return { action: 'deny' };
  });

  // Dropping a file onto a screen would navigate to file://. Serve it over HTTP instead,
  // so ES modules, fetch() and absolute paths behave like on a real server.
  wc.on('will-navigate', (event, url) => {
    if (!/^file:/i.test(url) || url.startsWith(START_URL)) return;
    event.preventDefault();
    try {
      const target = server.urlForPath(fileURLToPath(url));
      if (target.url) {
        attachWatcherNotifier();
        wc.loadURL(target.url);
      }
    } catch (err) {
      console.error('[guest] file navigation failed:', err.message);
    }
  });

  wc.on('before-input-event', (event, input) => {
    const name = shortcutFor(input);
    if (name && win) {
      event.preventDefault();
      win.webContents.send('shortcut', name, wc.id);
    }
  });

  wc.on('context-menu', (_e, params) => {
    const t = MENU_TEXT[settings.lang] || MENU_TEXT.uz;
    const nav = wc.navigationHistory;
    const template = [
      { label: t.back, enabled: nav.canGoBack(), click: () => nav.goBack() },
      { label: t.forward, enabled: nav.canGoForward(), click: () => nav.goForward() },
      { label: t.reload, click: () => wc.reload() },
      { type: 'separator' },
    ];
    if (params.selectionText) template.push({ label: t.copy, click: () => wc.copy() });
    if (params.linkURL) template.push({ label: t.copyLink, click: () => clipboard.writeText(params.linkURL) });
    const pageUrl = wc.getURL();
    if (/^https?:/i.test(pageUrl)) template.push({ label: t.openExternal, click: () => shell.openExternal(pageUrl) });
    template.push({ type: 'separator' }, { label: t.inspect, click: () => wc.inspectElement(params.x, params.y) });
    Menu.buildFromTemplate(template).popup({ window: win || undefined });
  });
});

// Dev servers often use self-signed HTTPS certificates. Trust them only on local/private hosts.
app.on('certificate-error', (event, _wc, url, _error, _cert, callback) => {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
    const local = host === 'localhost' || host === '::1' || host.endsWith('.localhost') || host.endsWith('.local')
      || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (local) {
      event.preventDefault();
      callback(true);
      return;
    }
  } catch { /* fall through */ }
  callback(false);
});

function setupPreviewSession() {
  const ses = session.fromPartition('persist:preview');
  const decisions = new Map();
  const ALWAYS = new Set(['clipboard-sanitized-write', 'fullscreen', 'pointerLock', 'window-management']);
  const ASK = new Set(['media', 'geolocation', 'notifications', 'clipboard-read']);

  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (ALWAYS.has(permission)) return callback(true);
    if (!ASK.has(permission) || !win) return callback(false);
    let origin = '';
    try { origin = new URL(details.requestingUrl || wc.getURL()).origin; } catch { /* ignore */ }
    const key = `${origin}|${permission}`;
    if (decisions.has(key)) return callback(decisions.get(key));
    const lang = settings.lang || 'uz';
    const text = {
      uz: { allow: 'Ruxsat berish', deny: 'Rad etish', msg: `${origin} quyidagiga ruxsat so‘ramoqda: ${permission}` },
      ru: { allow: 'Разрешить', deny: 'Запретить', msg: `${origin} запрашивает доступ: ${permission}` },
      en: { allow: 'Allow', deny: 'Block', msg: `${origin} wants to use: ${permission}` },
    }[lang] || {};
    dialog.showMessageBox(win, {
      type: 'question', buttons: [text.allow, text.deny], defaultId: 1, cancelId: 1,
      title: 'Mobile Preview', message: text.msg,
    }).then(({ response }) => {
      const ok = response === 0;
      decisions.set(key, ok);
      callback(ok);
    }).catch(() => callback(false));
    return undefined;
  });
}

/* ------------------------------------------------------------------ */
/* Device emulation via the Chrome DevTools Protocol                   */
/* ------------------------------------------------------------------ */

async function applyEmulation(wc, p) {
  const dbg = wc.debugger;
  if (!dbg.isAttached()) {
    dbg.attach('1.3');
  }
  const errors = [];
  const send = async (method, params) => {
    try {
      return await dbg.sendCommand(method, params);
    } catch (err) {
      errors.push(`${method}: ${err.message}`);
      return null;
    }
  };

  await send('Emulation.setDeviceMetricsOverride', {
    width: p.width,
    height: p.height,
    deviceScaleFactor: p.dpr,
    mobile: true,
    scale: p.scale,
    screenWidth: p.screenWidth,
    screenHeight: p.screenHeight,
    screenOrientation: p.landscape
      ? { type: 'landscapePrimary', angle: 90 }
      : { type: 'portraitPrimary', angle: 0 },
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
  const ua = { userAgent: p.userAgent, platform: p.platform };
  if (p.uaMetadata) ua.userAgentMetadata = p.uaMetadata;
  await send('Emulation.setUserAgentOverride', ua);
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: p.colorScheme || '' }],
  });
  if (p.safeArea) {
    // Experimental in Chromium; ignore if this build does not support it.
    try { await dbg.sendCommand('Emulation.setSafeAreaInsetsOverride', { insets: p.safeArea }); } catch { /* optional */ }
  }
  return errors;
}

ipcMain.handle('emu:apply', async (_e, id, params) => {
  const wc = webContents.fromId(id);
  if (!wc || wc.isDestroyed()) return { ok: false, errors: ['gone'] };
  try {
    const errors = await applyEmulation(wc, params);
    return { ok: errors.length === 0, errors };
  } catch (err) {
    return { ok: false, errors: [err.message] };
  }
});

/* ------------------------------------------------------------------ */
/* Screenshots                                                         */
/* ------------------------------------------------------------------ */

function shotsDir() {
  return path.join(app.getPath('pictures'), 'Mobile Preview');
}

function savePng(buffer, name) {
  const dir = shotsDir();
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+/, '');
  const safe = String(name || 'screen').replace(/[^\w\-. ]+/g, '').trim().replace(/\s+/g, '-') || 'screen';
  const file = path.join(dir, `${safe}_${stamp}.png`);
  fs.writeFileSync(file, buffer);
  return file;
}

/** Full-resolution capture of a device screen (device pixels, e.g. 1179×2556 for iPhone 15 Pro). */
async function captureDevice(wc) {
  if (wc.debugger.isAttached()) {
    try {
      const metrics = await wc.debugger.sendCommand('Page.getLayoutMetrics');
      const vp = metrics.cssVisualViewport || metrics.visualViewport;
      const r = await wc.debugger.sendCommand('Page.captureScreenshot', {
        format: 'png',
        clip: { x: vp.pageX, y: vp.pageY, width: vp.clientWidth, height: vp.clientHeight, scale: 1 },
      });
      return Buffer.from(r.data, 'base64');
    } catch (err) {
      console.warn('[shot] CDP capture failed, falling back:', err.message);
    }
  }
  return (await wc.capturePage()).toPNG();
}

ipcMain.handle('shot:screen', async (_e, id, name) => {
  const wc = webContents.fromId(id);
  if (!wc || wc.isDestroyed()) return { error: 'gone' };
  try {
    return { path: savePng(await captureDevice(wc), name) };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('shot:rect', async (_e, rect, name) => {
  if (!win) return { error: 'nowin' };
  try {
    const r = {
      x: Math.max(0, Math.floor(rect.x)), y: Math.max(0, Math.floor(rect.y)),
      width: Math.ceil(rect.width), height: Math.ceil(rect.height),
    };
    const img = await win.webContents.capturePage(r);
    return { path: savePng(img.toPNG(), name) };
  } catch (err) {
    return { error: err.message };
  }
});

/* ------------------------------------------------------------------ */
/* Local files, static server, LAN sharing                             */
/* ------------------------------------------------------------------ */

let watcherHooked = false;
function attachWatcherNotifier() {
  if (watcherHooked) return;
  watcherHooked = true;
  server.on('change', (file) => {
    if (win) win.webContents.send('watch:changed', { file, origin: server.origin });
  });
}

ipcMain.handle('path:open', async (_e, p) => {
  try {
    await server.ready;
    let localPath = p;
    if (typeof p === 'string' && /^file:\/\//i.test(p)) localPath = fileURLToPath(p);
    else if (IS_MAC && typeof p === 'string' && p.startsWith('~/')) localPath = path.join(os.homedir(), p.slice(2));
    const res = server.urlForPath(localPath);
    if (res.url) attachWatcherNotifier();
    return res;
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('dialog:open', async (_e, kind) => {
  if (!win) return null;
  const opts = kind === 'folder'
    ? { properties: ['openDirectory'] }
    : { properties: ['openFile'], filters: [{ name: 'HTML', extensions: ['html', 'htm'] }, { name: '*', extensions: ['*'] }] };
  const r = await dialog.showOpenDialog(win, opts);
  if (r.canceled || !r.filePaths[0]) return null;
  return r.filePaths[0];
});

function lanAddresses() {
  const virtual = /(vethernet|virtualbox|vmware|wsl|hyper-v|docker|loopback|bluetooth|tailscale|zerotier)/i;
  const rank = (ip) => (/^192\.168\./.test(ip) ? 0 : /^10\./.test(ip) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  const list = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) {
        list.push({ name, address: a.address, score: rank(a.address) + (virtual.test(name) ? 10 : 0) });
      }
    }
  }
  return list.sort((a, b) => a.score - b.score).map((a) => a.address);
}

ipcMain.handle('lan:qr', async (_e, url) => {
  let u;
  try { u = new URL(url); } catch { return { error: 'bad' }; }
  if (!/^https?:$/.test(u.protocol)) return { error: 'bad' };
  const ips = lanAddresses();
  let shared = false;
  const loopback = ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(u.hostname);
  if (loopback) {
    if (!ips.length) return { error: 'nolan' };
    if (server.origin && u.origin === server.origin) {
      // Our own static server listens on loopback only until the user asks to share it.
      try { await server.shareOnLan(ips[0]); } catch (err) { return { error: 'share', message: err.message }; }
      shared = true;
    }
    u.hostname = ips[0];
  }
  const dataUrl = await QRCode.toDataURL(u.href, {
    margin: 1, width: 360, errorCorrectionLevel: 'M', color: { dark: '#0b0d10', light: '#ffffff' },
  });
  return { url: u.href, dataUrl, loopback, shared };
});

/* ------------------------------------------------------------------ */
/* Misc IPC                                                            */
/* ------------------------------------------------------------------ */

ipcMain.handle('app:info', () => ({
  startUrl: START_URL,
  chromeMajor: CHROME_MAJOR,
  version: app.getVersion(),
  platform: process.platform,
  shotsDir: shotsDir(),
  smokeUrl: process.env.MP_SMOKE_URL || '',
  smokeState: process.env.MP_SMOKE_STATE ? JSON.parse(process.env.MP_SMOKE_STATE) : null,
}));

ipcMain.handle('settings:get', () => settings);
ipcMain.on('settings:set', (_e, patch) => {
  if (!patch || typeof patch !== 'object') return;
  Object.assign(settings, patch);
  saveSettings();
});

ipcMain.handle('scan:ports', () => scanLocalServers({ exclude: server.port ? [server.port] : [] }));

ipcMain.on('ui:theme', (_e, dark) => {
  if (!win) return;
  const palette = dark ? CHROME_COLORS.dark : CHROME_COLORS.light;
  if (!IS_MAC) {
    try {
      win.setTitleBarOverlay({ color: palette.color, symbolColor: palette.symbolColor, height: 48 });
    } catch { /* not supported on this platform */ }
  }
  win.setBackgroundColor(palette.bg);
});

ipcMain.handle('shell:show', (_e, p) => {
  if (typeof p !== 'string') return;
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) shell.openPath(p);
  else shell.showItemInFolder(p);
});

ipcMain.handle('shell:external', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
});

/* ------------------------------------------------------------------ */
/* Smoke test (MP_SMOKE=<dir>): capture window + device metrics, exit  */
/* ------------------------------------------------------------------ */

function runSmoke() {
  const delay = Number(process.env.MP_SMOKE_DELAY || 8000);
  setTimeout(async () => {
    const report = { devices: [] };
    try {
      fs.mkdirSync(SMOKE_DIR, { recursive: true });
      if (process.env.MP_SMOKE_PRE_JS) {
        report.preEval = await win.webContents.executeJavaScript(process.env.MP_SMOKE_PRE_JS, true).catch((err) => String(err));
        await new Promise((r) => setTimeout(r, Number(process.env.MP_SMOKE_PRE_WAIT || 800)));
      }
      const shot = await win.webContents.capturePage();
      fs.writeFileSync(path.join(SMOKE_DIR, 'window.png'), shot.toPNG());
      const guests = webContents.getAllWebContents().filter((w) => w.getType() === 'webview');
      let i = 0;
      for (const g of guests) {
        const metrics = await g.executeJavaScript(`({
          url: location.href, innerWidth, innerHeight, dpr: devicePixelRatio,
          screen: screen.width + 'x' + screen.height, ua: navigator.userAgent,
          touch: navigator.maxTouchPoints, coarse: matchMedia('(pointer: coarse)').matches,
          hoverNone: matchMedia('(hover: none)').matches,
          dark: matchMedia('(prefers-color-scheme: dark)').matches,
          orientation: screen.orientation && screen.orientation.type
        })`).catch((err) => ({ error: err.message }));
        const buf = await captureDevice(g);
        const file = path.join(SMOKE_DIR, `device-${i}.png`);
        fs.writeFileSync(file, buf);
        const { nativeImage } = require('electron');
        metrics.shotSize = nativeImage.createFromBuffer(buf).getSize();
        report.devices.push(metrics);
        i += 1;
      }
      if (process.env.MP_SMOKE_JS) {
        report.hostEval = await win.webContents.executeJavaScript(process.env.MP_SMOKE_JS).catch((err) => String(err));
      }
    } catch (err) {
      report.error = err.stack || String(err);
    }
    fs.writeFileSync(path.join(SMOKE_DIR, 'report.json'), JSON.stringify(report, null, 2));
    app.exit(0);
  }, delay);
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

app.on('second-instance', () => {
  if (!win) {
    if (IS_MAC && app.isReady()) createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  loadSettings();
  Menu.setApplicationMenu(IS_MAC ? Menu.buildFromTemplate([
    { label: 'Mobile Preview', role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ]) : null);
  setupPreviewSession();
  server.start().catch((err) => console.error('[server] failed to start:', err.message));
  createWindow();
});

app.on('activate', () => {
  if (IS_MAC && !win) createWindow();
});

app.on('window-all-closed', () => {
  if (IS_MAC) server.stopSharing();
  else app.quit();
});

app.on('before-quit', () => server.stop());
