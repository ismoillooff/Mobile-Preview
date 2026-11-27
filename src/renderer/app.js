/* Mobile Preview — renderer. Plain scripts, no build step. */
(function () {
  'use strict';

  const api = window.mp;
  const { t } = window.MP.i18n;
  const i18n = window.MP.i18n;
  const icon = window.MP.icon;
  const G = window.MP.statusGlyphs;
  const D = window.MP.devices;

  /* ---------------------------------------------------------------- */
  /* Helpers                                                           */
  /* ---------------------------------------------------------------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  const html = (markup) => {
    const tpl = document.createElement('template');
    tpl.innerHTML = markup.trim();
    return tpl.content.firstElementChild;
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const debounce = (fn, ms) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  };
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  function toHref(u) {
    try { return new URL(u).href; } catch { return u; }
  }
  function sameUrl(a, b) {
    return toHref(a || '') === toHref(b || '');
  }

  /* ---------------------------------------------------------------- */
  /* State                                                             */
  /* ---------------------------------------------------------------- */

  const AUTHOR_URL = 'https://github.com/ismoillooff';
  const ZOOM_STEPS = [0.25, 0.33, 0.4, 0.5, 0.6, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5];
  const STAGE_PAD_Y = 24 + 32;
  const STAGE_PAD_X = 64;
  const HEAD_H = 38 + 12;
  const GAP_X = 44;

  const DEFAULTS = {
    lang: 'uz',
    theme: 'system',
    scheme: 'auto',
    sync: true,
    statusBar: true,
    frame: true,
    zoom: 'fit',
    devices: [{ id: 'iphone-15-pro', landscape: false }, { id: 'galaxy-s24', landscape: false }],
    customDevices: [],
    recent: [],
    last: null,
  };

  let info = null;
  let state = null;
  let zoomValue = 1;
  let currentUrl = '';
  let currentLocal = null;
  let servedOrigin = '';
  let focused = null;
  let uidSeq = 0;
  /** @type {DeviceView[]} */
  const views = [];

  const els = {};

  function persist(...keys) {
    const patch = {};
    for (const k of keys) {
      patch[k] = k === 'devices' ? state.devices.map(({ id, landscape }) => ({ id, landscape })) : state[k];
    }
    api.setSettings(patch);
  }

  function allPresets() {
    return D.PRESETS.concat(state.customDevices || []);
  }
  function findPreset(id) {
    return allPresets().find((p) => p.id === id);
  }

  function startUrl() {
    return `${info.startUrl}?lang=${i18n.lang}`;
  }
  function isStart(url) {
    return typeof url === 'string' && url.startsWith(info.startUrl);
  }

  /* ---------------------------------------------------------------- */
  /* Device view                                                       */
  /* ---------------------------------------------------------------- */

  class DeviceView {
    constructor(entry) {
      this.entry = entry;
      this.preset = findPreset(entry.id);
      this.wcId = null;
      this.ready = false;
      this.pending = null;
      this.programmatic = false;
      this.url = '';
      this.g = null;
      this.lastEmu = '';
      this.build();
    }

    build() {
      const p = this.preset;
      const platform = D.platformOf(p);
      this.el = html(`
        <section class="device" data-frame="${p.frame}" data-platform="${platform}">
          <header class="device-head">
            <div class="device-title">
              <span class="device-name" title="${esc(p.name)}">${esc(p.name)}</span>
              <span class="device-dims"></span>
            </div>
            <div class="device-actions">
              <button class="tb-btn sm" data-act="rotate">${icon('rotate', 16)}</button>
              <button class="tb-btn sm" data-act="shot" popovertarget="pop-shot">${icon('camera', 16)}</button>
              <button class="tb-btn sm" data-act="devtools">${icon('code', 16)}</button>
              <button class="tb-btn sm" data-act="remove">${icon('x', 16)}</button>
            </div>
          </header>
          <div class="frame">
            <span class="hw hw-a"></span><span class="hw hw-b"></span><span class="hw hw-c"></span>
            <span class="classic-speaker"></span><span class="classic-home"></span><span class="tablet-cam"></span>
            <div class="screen">
              <div class="statusbar"><span class="sb-left"></span><span class="sb-mid"></span><span class="sb-right"></span></div>
              <div class="viewport">
                <span class="load-bar"></span>
                <div class="screen-overlay" hidden></div>
              </div>
              <span class="cutout"></span>
              <span class="home-indicator"></span>
            </div>
          </div>
        </section>`);
      this.dims = $('.device-dims', this.el);
      this.overlay = $('.screen-overlay', this.el);
      this.fillStatusBar();

      const wv = document.createElement('webview');
      wv.setAttribute('partition', 'persist:preview');
      wv.setAttribute('allowpopups', '');
      wv.setAttribute('useragent', D.userAgentFor(p, info.chromeMajor).userAgent);
      wv.setAttribute('src', 'about:blank');
      $('.viewport', this.el).prepend(wv);
      this.wv = wv;

      wv.addEventListener('dom-ready', () => this.onDomReady());
      wv.addEventListener('did-start-loading', () => this.setLoading(true));
      wv.addEventListener('did-stop-loading', () => {
        this.setLoading(false);
        // Only navigations the user made inside this screen are mirrored to the others.
        // Loads we started ourselves (and their redirects) never propagate, so redirect
        // chains and per-device OAuth parameters cannot ping-pong between screens.
        const programmatic = this.programmatic;
        this.programmatic = false;
        if (!programmatic) propagateFrom(this);
      });
      wv.addEventListener('did-fail-load', (e) => {
        if (e.isMainFrame && e.errorCode !== -3) this.showError(e.validatedURL, e.errorDescription || String(e.errorCode));
      });
      wv.addEventListener('did-navigate', (e) => this.onNavigate(e.url));
      wv.addEventListener('did-navigate-in-page', (e) => {
        if (!e.isMainFrame) return;
        this.onNavigate(e.url);
        // Client-side route change after the page finished loading (SPA link click).
        if (!this.isLoading && !this.programmatic) propagateFrom(this);
      });
      wv.addEventListener('did-finish-load', () => this.sampleColors());
      wv.addEventListener('page-title-updated', (e) => onPageTitle(this, e.title));
      wv.addEventListener('render-process-gone', () => this.showCrash());
      wv.addEventListener('focus', () => setFocused(this));

      this.el.addEventListener('pointerdown', () => setFocused(this));
      $('.device-actions', this.el).addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === 'rotate') this.rotate();
        else if (act === 'shot') shotMenuTarget = this;
        else if (act === 'devtools') this.toggleDevtools();
        else if (act === 'remove') removeDevice(this);
      });
      this.translate();
    }

    translate() {
      const set = (act, key) => {
        const b = $(`[data-act="${act}"]`, this.el);
        b.title = t(key);
        b.setAttribute('aria-label', t(key));
      };
      set('rotate', 'rotate');
      set('shot', 'screenshot');
      set('devtools', 'devtools');
      set('remove', 'remove');
    }

    fillStatusBar() {
      const left = $('.sb-left', this.el);
      const mid = $('.sb-mid', this.el);
      const right = $('.sb-right', this.el);
      const time = '<span class="sb-time"></span>';
      switch (this.preset.frame) {
        case 'classic':
          left.innerHTML = G.signal + G.wifi;
          mid.innerHTML = time;
          right.innerHTML = G.battery;
          break;
        case 'punch':
          left.innerHTML = time;
          right.innerHTML = G.wifi + G.signal + G.battery;
          break;
        case 'tablet':
          left.innerHTML = `${time}<span class="sb-date"></span>`;
          right.innerHTML = G.wifi + G.battery;
          break;
        default:
          left.innerHTML = time;
          right.innerHTML = G.signal + G.wifi + G.battery;
      }
      updateClocks(this.el);
    }

    layout() {
      const g = D.geometry(this.preset, {
        landscape: this.entry.landscape,
        statusBar: state.statusBar,
        frame: state.frame,
      });
      this.g = g;
      const s = this.el.style;
      // Snap the screen width to whole device pixels and derive this device's exact scale
      // from it, so the scaled page fills the screen edge to edge at any zoom (no hairlines).
      const hostDpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(g.vw * zoomValue * hostDpr)) / hostDpr;
      this.scale = w / g.vw;
      const h = Math.max(1, Math.round(g.vh * this.scale * hostDpr)) / hostDpr;
      this.wv.style.width = `${w}px`;
      this.wv.style.height = `${h}px`;
      s.setProperty('--z', String(this.scale));
      const vars = {
        sw: g.sw, sh: g.sh, sb: g.sb, vw: g.vw, vh: g.vh,
        bt: g.bt, bb: g.bb, bl: g.bl, br: g.br, fw: g.frameW, fh: g.frameH, r: g.radius, sr: g.screenRadius,
      };
      for (const [k, v] of Object.entries(vars)) s.setProperty(`--${k}`, String(v));
      this.el.classList.toggle('is-landscape', !!this.entry.landscape);
      this.el.classList.toggle('no-frame', !state.frame);
      this.el.classList.toggle('no-statusbar', !g.sb);
      this.el.dataset.indicator = g.indicator || 'none';
      const dpr = Number(this.preset.dpr.toFixed(3));
      this.dims.textContent = `${g.vw}×${g.vh} · ${dpr}x`;
      this.dims.title = `${t('viewport')} ${g.vw}×${g.vh} · ${this.entry.landscape ? t('landscape') : t('portrait')} · DPR ${dpr}`;
    }

    emuParams() {
      const g = this.g;
      const ua = D.userAgentFor(this.preset, info.chromeMajor);
      return {
        width: g.vw,
        height: g.vh,
        dpr: this.preset.dpr,
        scale: this.scale || zoomValue,
        screenWidth: g.sw,
        screenHeight: g.sh,
        landscape: !!this.entry.landscape,
        userAgent: ua.userAgent,
        platform: ua.platform,
        uaMetadata: ua.metadata || undefined,
        colorScheme: state.scheme === 'auto' ? '' : state.scheme,
        safeArea: g.safeArea,
      };
    }

    async emulate(force = false) {
      if (!this.wcId) return;
      const params = this.emuParams();
      const key = JSON.stringify(params);
      if (!force && key === this.lastEmu) return;
      this.lastEmu = key;
      const res = await api.emulate(this.wcId, params);
      if (res && !res.ok) console.warn(`[emulation] ${this.preset.name}:`, res.errors);
    }

    async onDomReady() {
      if (this.ready) return;
      this.wcId = this.wv.getWebContentsId();
      await this.emulate(true);
      this.ready = true;
      const url = this.pending || startUrl();
      this.pending = null;
      this.programmatic = true;
      this.wv.loadURL(url).catch(() => { /* reported through did-fail-load */ });
    }

    load(url) {
      this.hideOverlay();
      if (!this.ready) {
        this.pending = url;
        return;
      }
      this.programmatic = true;
      this.wv.loadURL(url).catch(() => { /* reported through did-fail-load */ });
    }

    reload(hard) {
      if (!this.ready) return;
      this.hideOverlay();
      this.programmatic = true;
      if (hard) this.wv.reloadIgnoringCache();
      else this.wv.reload();
    }

    onNavigate(url) {
      if (!url || url === 'about:blank') return;
      this.url = isStart(url) ? '' : url;
      onDeviceNavigated(this, this.url);
      updateNavButtons();
    }

    setLoading(on) {
      clearTimeout(this.doneTimer);
      if (on) {
        this.el.classList.remove('is-done');
        this.el.classList.add('is-loading');
      } else {
        this.el.classList.remove('is-loading');
        this.el.classList.add('is-done');
        this.doneTimer = setTimeout(() => this.el.classList.remove('is-done'), 700);
      }
      updateGlobalLoading();
    }

    get isLoading() {
      return this.el.classList.contains('is-loading');
    }

    showError(url, description) {
      this.overlay.innerHTML = `
        ${icon('alert', 28)}
        <strong>${esc(t('loadFailed'))}</strong>
        <p>${esc(t('loadFailedHint'))}</p>
        <code>${esc(url || '')}${description ? ` — ${esc(description)}` : ''}</code>
        <button class="btn sm" data-retry>${icon('reload', 14)}${esc(t('retry'))}</button>`;
      this.overlay.hidden = false;
      $('[data-retry]', this.overlay).addEventListener('click', () => this.load(url || currentUrl || startUrl()));
    }

    showCrash() {
      this.overlay.innerHTML = `
        ${icon('alert', 28)}
        <strong>${esc(t('crashed'))}</strong>
        <button class="btn sm" data-retry>${icon('reload', 14)}${esc(t('retry'))}</button>`;
      this.overlay.hidden = false;
      $('[data-retry]', this.overlay).addEventListener('click', () => {
        this.lastEmu = '';
        this.emulate(true).then(() => this.reload(false));
      });
    }

    hideOverlay() {
      this.overlay.hidden = true;
    }

    async sampleColors() {
      if (!this.ready) return;
      try {
        const c = await this.wv.executeJavaScript(`(() => {
          const metas = Array.from(document.querySelectorAll('meta[name="theme-color"]'));
          const m = metas.find((x) => !x.media || matchMedia(x.media).matches);
          const pick = (el) => {
            if (!el) return null;
            const v = getComputedStyle(el).backgroundColor;
            return v && v !== 'rgba(0, 0, 0, 0)' && v !== 'transparent' ? v : null;
          };
          const cs = getComputedStyle(document.documentElement).colorScheme || '';
          return {
            theme: m ? m.content : null,
            bg: pick(document.body) || pick(document.documentElement),
            darkCanvas: /dark/.test(cs) && (!/light/.test(cs) || matchMedia('(prefers-color-scheme: dark)').matches),
          };
        })()`);
        this.applyChrome(c);
      } catch { /* page not scriptable (e.g. error page) */ }
    }

    applyChrome(c) {
      const fallback = c && c.darkCanvas ? 'rgb(18, 18, 18)' : 'rgb(255, 255, 255)';
      const page = parseColor(c && c.bg) || parseColor(fallback);
      const rgb = parseColor(c && c.theme) || page;
      const barLight = luminance(rgb) > 0.42;
      const pageLight = luminance(page) > 0.42;
      const s = this.el.style;
      s.setProperty('--page-bg', `rgb(${page.join(',')})`);
      s.setProperty('--sb-bg', `rgb(${rgb.join(',')})`);
      s.setProperty('--sb-fg', barLight ? '#000' : '#fff');
      // The home indicator sits over page content, so it contrasts with the page, not the bar.
      s.setProperty('--hi-color', pageLight ? 'rgba(0,0,0,0.82)' : 'rgba(255,255,255,0.88)');
    }

    rotate() {
      this.entry.landscape = !this.entry.landscape;
      persist('devices');
      if (state.zoom === 'fit') applyZoom();
      else {
        this.layout();
        this.emulate();
      }
    }

    toggleDevtools() {
      if (!this.ready) return;
      if (this.wv.isDevToolsOpened()) this.wv.closeDevTools();
      else this.wv.openDevTools();
    }

    async screenshot(withFrame) {
      const name = this.preset.name;
      let res;
      if (withFrame) {
        await nextFrame();
        const r = $('.frame', this.el).getBoundingClientRect();
        res = await api.screenshotRect({ x: r.left, y: r.top, width: r.width, height: r.height }, `${name}-frame`);
      } else {
        if (!this.wcId) return;
        res = await api.screenshot(this.wcId, name);
      }
      if (res && res.path) {
        toast(t('shotSaved'), { action: t('showInFolder'), onAction: () => api.showInFolder(res.path) });
      } else {
        toast(`${t('shotFailed')}${res && res.error ? `: ${res.error}` : ''}`, { tone: 'error' });
      }
    }

    destroy() {
      try {
        if (this.ready && this.wv.isDevToolsOpened()) this.wv.closeDevTools();
      } catch { /* already gone */ }
      this.el.remove();
    }
  }

  /* Color utilities for the status bar tint. */
  const colorCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  function parseColor(str) {
    if (!str || typeof str !== 'string') return null;
    colorCtx.fillStyle = '#010203';
    colorCtx.fillStyle = str;
    if (colorCtx.fillStyle === '#010203' && !/^#?010203$/i.test(str.trim())) return null;
    colorCtx.clearRect(0, 0, 1, 1);
    colorCtx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = colorCtx.getImageData(0, 0, 1, 1).data;
    const alpha = a / 255;
    // Composite translucent colors over white, which is what the browser canvas shows underneath.
    return [r, g, b].map((v) => Math.round(v * alpha + 255 * (1 - alpha)));
  }
  function luminance([r, g, b]) {
    const lin = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  const UZ_DAYS = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];
  const UZ_MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];

  function updateClocks(root = document) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    // Chromium's Uzbek locale data is incomplete, so format the tablet date by hand there.
    const date = i18n.lang === 'uz'
      ? `${UZ_DAYS[now.getDay()]}, ${now.getDate()}-${UZ_MONTHS[now.getMonth()]}`
      : new Intl.DateTimeFormat(i18n.lang === 'en' ? 'en-GB' : i18n.lang, { weekday: 'short', day: 'numeric', month: 'short' }).format(now);
    $$('.sb-time', root).forEach((el) => { el.textContent = time; });
    $$('.sb-date', root).forEach((el) => { el.textContent = date; });
  }

  /* ---------------------------------------------------------------- */
  /* Devices on the stage                                              */
  /* ---------------------------------------------------------------- */

  function renderDevices() {
    const stage = els.stage;
    const keep = new Set();
    for (const entry of state.devices) {
      if (!entry.uid) entry.uid = `d${++uidSeq}`;
      keep.add(entry.uid);
    }
    for (let i = views.length - 1; i >= 0; i--) {
      if (!keep.has(views[i].entry.uid)) {
        if (focused === views[i]) focused = null;
        views[i].destroy();
        views.splice(i, 1);
      }
    }
    state.devices.forEach((entry, index) => {
      let view = views.find((v) => v.entry.uid === entry.uid);
      if (!view) {
        view = new DeviceView(entry);
        view.pending = currentUrl || startUrl();
        views.splice(index, 0, view);
      }
      if (stage.children[index] !== view.el) stage.insertBefore(view.el, stage.children[index] || null);
    });
    els.empty.hidden = views.length > 0;
    els.deviceCount.textContent = String(views.length);
    applyZoom();
    if (!focused && views[0]) setFocused(views[0]);
  }

  function toggleDevice(id) {
    const exists = state.devices.some((d) => d.id === id);
    if (exists) state.devices = state.devices.filter((d) => d.id !== id);
    else state.devices.push({ id, landscape: false });
    persist('devices');
    renderDevices();
  }

  function removeDevice(view) {
    state.devices = state.devices.filter((d) => d.uid !== view.entry.uid);
    persist('devices');
    renderDevices();
    if (els.popDevices.matches(':popover-open')) renderDevicesPopover();
  }

  function setFocused(view) {
    if (focused === view) return;
    if (focused) focused.el.classList.remove('is-focused');
    focused = view;
    if (view) view.el.classList.add('is-focused');
    updateNavButtons();
  }

  /* ---------------------------------------------------------------- */
  /* Zoom                                                              */
  /* ---------------------------------------------------------------- */

  function computeFit() {
    const canvas = els.canvas;
    const availH = canvas.clientHeight - STAGE_PAD_Y - HEAD_H;
    const availW = canvas.clientWidth - STAGE_PAD_X;
    let maxH = 0;
    let maxW = 0;
    let totalW = 0;
    for (const v of views) {
      const g = D.geometry(v.preset, { landscape: v.entry.landscape, statusBar: state.statusBar, frame: state.frame });
      maxH = Math.max(maxH, g.frameH);
      maxW = Math.max(maxW, g.frameW);
      totalW += Math.max(g.frameW, 240);
    }
    if (!maxH) return 1;
    const zH = availH / maxH;
    const zRow = (availW - (views.length - 1) * GAP_X) / totalW;
    let z = Math.min(1, zH, Math.max(zRow, 0.5), availW / maxW);
    z = Math.floor(z * 100) / 100;
    return clamp(z, 0.2, 1.5);
  }

  function applyZoom() {
    zoomValue = state.zoom === 'fit' ? computeFit() : clamp(Number(state.zoom) || 1, 0.2, 1.5);
    for (const v of views) {
      v.layout();
      v.emulate();
    }
    els.zoomLabel.textContent = `${Math.round(zoomValue * 100)}%`;
    els.zoomFit.setAttribute('aria-pressed', String(state.zoom === 'fit'));
  }

  function setZoom(z) {
    state.zoom = z;
    persist('zoom');
    applyZoom();
  }

  function zoomStep(dir) {
    const cur = zoomValue;
    const next = dir > 0
      ? ZOOM_STEPS.find((s) => s > cur + 0.005) || ZOOM_STEPS[ZOOM_STEPS.length - 1]
      : [...ZOOM_STEPS].reverse().find((s) => s < cur - 0.005) || ZOOM_STEPS[0];
    setZoom(next);
  }

  /* ---------------------------------------------------------------- */
  /* Navigation                                                        */
  /* ---------------------------------------------------------------- */

  function normalizeInput(raw) {
    const s = String(raw || '').trim();
    if (!s) return { url: '' };
    if (/^[a-z]:[\\/]/i.test(s) || s.startsWith('\\\\')) return { local: s };
    if (/^file:\/\//i.test(s)) {
      try {
        const u = new URL(s);
        return { local: decodeURIComponent(u.pathname.replace(/^\/([a-z]:)/i, '$1')) };
      } catch { /* fall through */ }
    }
    if (/^\d{2,5}$/.test(s)) return { url: `http://localhost:${s}/` };
    if (/^:\d{2,5}(\/.*)?$/.test(s)) return { url: toHref(`http://localhost${s}`) };
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(s)) return { url: toHref(s) };
    if (/^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(s)
      || /^[\w.-]+:\d{2,5}(\/|$)/.test(s)) {
      return { url: toHref(`http://${s}`) };
    }
    if (/^[^\s]+\.[^\s]{2,}$/.test(s)) return { url: toHref(`https://${s}`) };
    return { url: toHref(`https://www.google.com/search?q=${encodeURIComponent(s)}`) };
  }

  async function navigate(raw) {
    closeSuggest();
    const n = typeof raw === 'object' && raw ? raw : normalizeInput(raw);
    if (n.local) {
      await openLocal(n.local);
      return;
    }
    setCurrent(n.url || '', null, true);
    for (const v of views) v.load(n.url || startUrl());
  }

  async function openLocal(p) {
    if (!p) return;
    const res = await api.openPath(p);
    if (!res || res.error) {
      toast(res && res.error === 'missing' ? `${t('errMissing')}: ${p}` : t('errServer'), { tone: 'error' });
      return;
    }
    servedOrigin = new URL(res.url).origin;
    setCurrent(res.url, res.path, true);
    for (const v of views) v.load(res.url);
  }

  function setCurrent(url, local, explicit) {
    currentUrl = url;
    currentLocal = local;
    renderUrl();
    state.last = url ? { url, local } : null;
    if (explicit && url) remember(url, local);
    persist('last');
  }

  function remember(url, local) {
    const key = local || url;
    const prev = state.recent.find((r) => (r.local || r.url) === key);
    const item = { url, local: local || null, title: prev ? prev.title : '' };
    state.recent = [item, ...state.recent.filter((r) => (r.local || r.url) !== key)].slice(0, 8);
    persist('recent');
  }

  function onPageTitle(view, title) {
    if (view !== (focused || views[0])) return;
    document.title = title ? `${title} — Mobile Preview` : 'Mobile Preview';
    const key = currentLocal || currentUrl;
    const item = state.recent.find((r) => (r.local || r.url) === key);
    if (item && title && item.title !== title) {
      item.title = title.slice(0, 120);
      persist('recent');
    }
  }

  function onDeviceNavigated(view, url) {
    // The address bar follows the focused screen, or any screen while navigation is synced.
    if (!state.sync && view !== (focused || views[0])) return;
    if (sameUrl(url, currentUrl)) return;
    let local = currentLocal;
    if (local && (!url || !servedOrigin || !url.startsWith(servedOrigin))) local = null;
    setCurrent(url, local, false);
  }

  function propagateFrom(view) {
    if (!state.sync) return;
    const url = view.url;
    for (const other of views) {
      if (other === view) continue;
      if (sameUrl(other.url, url) || (other.pending && sameUrl(other.pending, url))) continue;
      other.load(url || startUrl());
    }
  }

  function navTargets() {
    if (state.sync) return views.filter((v) => v.ready);
    const v = focused || views[0];
    return v && v.ready ? [v] : [];
  }

  function goBack() {
    navTargets().forEach((v) => {
      if (!v.wv.canGoBack()) return;
      v.programmatic = state.sync;
      v.wv.goBack();
    });
  }
  function goForward() {
    navTargets().forEach((v) => {
      if (!v.wv.canGoForward()) return;
      v.programmatic = state.sync;
      v.wv.goForward();
    });
  }
  function reloadAll(hard) {
    views.forEach((v) => v.reload(hard));
  }

  function updateNavButtons() {
    const v = focused || views[0];
    let back = false;
    let fwd = false;
    try {
      if (v && v.ready) {
        back = v.wv.canGoBack();
        fwd = v.wv.canGoForward();
      }
    } catch { /* not ready */ }
    els.back.disabled = !back;
    els.forward.disabled = !fwd;
  }

  let loadingDone = null;
  function updateGlobalLoading() {
    const loading = views.some((v) => v.isLoading);
    const wrap = els.urlWrap;
    clearTimeout(loadingDone);
    if (loading) {
      wrap.classList.remove('is-done');
      wrap.classList.add('is-loading');
    } else if (wrap.classList.contains('is-loading')) {
      wrap.classList.remove('is-loading');
      wrap.classList.add('is-done');
      loadingDone = setTimeout(() => wrap.classList.remove('is-done'), 700);
    }
  }

  function renderUrl() {
    const input = els.url;
    if (document.activeElement !== input) input.value = currentUrl;
    let kind = 'globe';
    let local = false;
    try {
      const u = new URL(currentUrl);
      if (currentLocal) {
        kind = 'folder';
        local = true;
      } else if (/^(localhost|127\.|\[::1\]|0\.0\.0\.0|192\.168\.|10\.)/.test(u.hostname)) {
        kind = 'server';
      }
    } catch { /* start page */ }
    els.urlIcon.innerHTML = icon(kind, 16);
    els.urlWrap.classList.toggle('is-local', local);
    els.urlIcon.title = currentLocal || '';
  }

  /* ---------------------------------------------------------------- */
  /* URL suggestions                                                   */
  /* ---------------------------------------------------------------- */

  let scanCache = { at: 0, list: null, promise: null };
  let suggestIndex = -1;

  function scanServers() {
    if (scanCache.list && Date.now() - scanCache.at < 4000) return Promise.resolve(scanCache.list);
    if (scanCache.promise) return scanCache.promise;
    scanCache.promise = api.scanPorts().then((list) => {
      scanCache = { at: Date.now(), list, promise: null };
      return list;
    }).catch(() => {
      scanCache.promise = null;
      return [];
    });
    return scanCache.promise;
  }

  function openSuggest() {
    els.suggest.hidden = false;
    renderSuggest(null);
    scanServers().then((list) => {
      if (!els.suggest.hidden) renderSuggest(list);
    });
  }

  function closeSuggest() {
    els.suggest.hidden = true;
    suggestIndex = -1;
  }

  function renderSuggest(servers) {
    const q = els.url.value.trim().toLowerCase();
    const filtering = q && !sameUrl(els.url.value.trim(), currentUrl);
    const match = (...fields) => !filtering || fields.some((f) => f && String(f).toLowerCase().includes(q));
    const parts = [];

    parts.push(`<div class="sg-label">${esc(t('localServers'))}</div>`);
    if (servers === null) {
      parts.push('<div class="sg-skeleton"></div><div class="sg-skeleton"></div>');
    } else {
      const list = servers.filter((s) => match(s.url, s.title, s.stack, String(s.port)));
      if (!list.length) parts.push(`<div class="sg-note">${esc(t('noServers'))}</div>`);
      for (const s of list) {
        parts.push(`<button class="sg-item" role="option" data-url="${esc(s.url)}">
          <span class="sg-port">:${s.port}</span>
          <span class="sg-main"><span class="sg-title">${esc(s.title || s.url)}</span><span class="sg-sub">${esc(s.url)}</span></span>
          ${s.stack ? `<span class="sg-tag">${esc(s.stack)}</span>` : ''}
        </button>`);
      }
    }

    const recent = state.recent.filter((r) => match(r.url, r.title, r.local));
    if (recent.length) {
      parts.push(`<div class="sg-sep"></div><div class="sg-label">${esc(t('recent'))}</div>`);
      for (const r of recent) {
        const title = r.title || (r.local ? r.local.split(/[\\/]/).filter(Boolean).pop() : r.url);
        parts.push(`<button class="sg-item" role="option" ${r.local ? `data-local="${esc(r.local)}"` : `data-url="${esc(r.url)}"`}>
          ${icon(r.local ? 'folder' : 'clock', 16)}
          <span class="sg-main"><span class="sg-title">${esc(title)}</span><span class="sg-sub">${esc(r.local || r.url)}</span></span>
        </button>`);
      }
    }

    parts.push('<div class="sg-sep"></div>');
    parts.push(`<button class="sg-item" role="option" data-pick="folder">${icon('folder', 16)}<span class="sg-main"><span class="sg-title">${esc(t('openFolder'))}</span></span></button>`);
    parts.push(`<button class="sg-item" role="option" data-pick="file">${icon('file', 16)}<span class="sg-main"><span class="sg-title">${esc(t('openFile'))}</span></span></button>`);

    els.suggest.innerHTML = parts.join('');
    suggestIndex = -1;
  }

  async function activateSuggestion(btn) {
    if (!btn) return;
    if (btn.dataset.url) {
      navigate(btn.dataset.url);
    } else if (btn.dataset.local) {
      closeSuggest();
      openLocal(btn.dataset.local);
    } else if (btn.dataset.pick) {
      closeSuggest();
      const p = await api.pickPath(btn.dataset.pick);
      if (p) openLocal(p);
    }
    els.url.blur();
  }

  function moveSuggest(dir) {
    const items = $$('.sg-item', els.suggest);
    if (!items.length) return;
    suggestIndex = (suggestIndex + dir + items.length) % items.length;
    items.forEach((el, i) => el.setAttribute('aria-selected', String(i === suggestIndex)));
    items[suggestIndex].scrollIntoView({ block: 'nearest' });
  }

  /* ---------------------------------------------------------------- */
  /* Popovers                                                          */
  /* ---------------------------------------------------------------- */

  let shotMenuTarget = null;

  function placeBelow(pop, anchor) {
    const r = anchor.getBoundingClientRect();
    pop.style.top = `${Math.round(r.bottom + 6)}px`;
    pop.style.right = `${Math.max(8, Math.round(window.innerWidth - r.right))}px`;
    pop.style.left = 'auto';
    pop.style.maxHeight = `${Math.max(200, window.innerHeight - r.bottom - 20)}px`;
  }

  function renderDevicesPopover() {
    const active = new Set(state.devices.map((d) => d.id));
    const opt = (p) => `
      <button class="dev-opt" data-id="${esc(p.id)}" aria-pressed="${active.has(p.id)}">
        <span class="dev-check">${icon('check', 12)}</span>
        <span class="dev-opt-name">${esc(p.name)}</span>
        <span class="dev-opt-dims">${p.w}×${p.h}</span>
        ${p.custom ? `<span class="dev-del" data-del="${esc(p.id)}" role="button" title="${esc(t('deleteCustom'))}">${icon('trash', 14)}</span>` : '<span></span>'}
      </button>`;
    const group = (key, list) => (list.length ? `
      <div class="dev-group">
        <div class="dev-group-label">${esc(t(key))}</div>
        ${list.map(opt).join('')}
      </div>` : '');
    const presets = D.PRESETS;
    els.popDevices.innerHTML = `
      <div class="pop-head">${esc(t('devicesTitle'))}</div>
      ${group('groupIos', presets.filter((p) => p.group === 'ios'))}
      ${group('groupAndroid', presets.filter((p) => p.group === 'android'))}
      ${group('groupTablet', presets.filter((p) => p.group === 'tablet'))}
      ${group('groupCustom', state.customDevices || [])}
      <div class="dev-group">
        <div class="dev-group-label">${esc(t('customTitle'))}</div>
        <form class="custom-form" id="custom-form">
          <label class="span-3">${esc(t('customName'))}<input class="field" name="name" maxlength="40" placeholder="My phone"></label>
          <label>${esc(t('customWidth'))}<input class="field" name="w" type="number" min="200" max="3000" value="390" required></label>
          <label>${esc(t('customHeight'))}<input class="field" name="h" type="number" min="200" max="3000" value="844" required></label>
          <label>${esc(t('customDpr'))}<input class="field" name="dpr" type="number" min="1" max="5" step="0.025" value="3" required></label>
          <label>${esc(t('customPlatform'))}<select class="field" name="platform"><option value="android">Android</option><option value="ios">iOS</option></select></label>
          <label class="span-2">${esc(t('customKind'))}<select class="field" name="kind"><option value="phone">${esc(t('kindPhone'))}</option><option value="tablet">${esc(t('kindTablet'))}</option></select></label>
          <div class="actions"><button class="btn btn-primary sm" type="submit">${icon('plus', 14)}${esc(t('add'))}</button></div>
        </form>
      </div>`;
  }

  function onDevicesPopoverClick(e) {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      const id = del.dataset.del;
      state.customDevices = state.customDevices.filter((p) => p.id !== id);
      state.devices = state.devices.filter((d) => d.id !== id);
      persist('customDevices', 'devices');
      renderDevices();
      renderDevicesPopover();
      return;
    }
    const opt = e.target.closest('.dev-opt');
    if (!opt) return;
    toggleDevice(opt.dataset.id);
    opt.setAttribute('aria-pressed', String(state.devices.some((d) => d.id === opt.dataset.id)));
  }

  function onCustomSubmit(e) {
    if (e.target.id !== 'custom-form') return;
    e.preventDefault();
    const f = new FormData(e.target);
    const w = Math.round(Number(f.get('w')));
    const h = Math.round(Number(f.get('h')));
    const dpr = Number(f.get('dpr'));
    if (!(w >= 200 && h >= 200 && dpr >= 1)) return;
    const preset = D.makeCustom({
      name: String(f.get('name') || '').trim(),
      w, h, dpr,
      platform: f.get('platform') === 'ios' ? 'ios' : 'android',
      kind: f.get('kind') === 'tablet' ? 'tablet' : 'phone',
    });
    state.customDevices = [...(state.customDevices || []), preset];
    state.devices.push({ id: preset.id, landscape: false });
    persist('customDevices', 'devices');
    renderDevices();
    renderDevicesPopover();
  }

  function renderSettingsPopover() {
    const seg = (name, value, options) => `
      <div class="seg" data-seg="${name}">
        ${options.map(([v, label]) => `<button data-value="${v}" aria-pressed="${value === v}">${esc(label)}</button>`).join('')}
      </div>`;
    els.popSettings.innerHTML = `
      <div class="pop-head">${esc(t('settings'))}</div>
      <div class="pop-body">
        <div class="set-col">
          <span class="set-label">${esc(t('language'))}</span>
          ${seg('lang', state.lang, i18n.LANGS.map((l) => [l.id, l.name]))}
        </div>
        <div class="set-col">
          <span class="set-label">${esc(t('appTheme'))}</span>
          ${seg('theme', state.theme, [['system', t('themeSystem')], ['dark', t('themeDark')], ['light', t('themeLight')]])}
        </div>
        <label class="set-row">
          <span class="set-label">${esc(t('showFrame'))}</span>
          <input type="checkbox" class="switch" role="switch" data-toggle="frame" ${state.frame ? 'checked' : ''}>
        </label>
        <label class="set-row">
          <span class="set-label">${esc(t('showStatusBar'))}</span>
          <input type="checkbox" class="switch" role="switch" data-toggle="statusBar" ${state.statusBar ? 'checked' : ''} ${state.frame ? '' : 'disabled'}>
        </label>
        <div class="set-row">
          <span class="set-label">${esc(t('shotsFolder'))}</span>
          <button class="btn sm" data-open-shots>${icon('folder', 14)}${esc(t('open'))}</button>
        </div>
        <div class="set-row">
          <span class="set-label">${esc(t('author'))}</span>
          <button class="btn sm" data-ext-link="${AUTHOR_URL}" title="${AUTHOR_URL}">${icon('github', 14)}ismoillooff</button>
        </div>
        <div class="set-row">
          <span class="set-meta">Mobile Preview · ${esc(t('version'))} ${esc(info.version)} · Chromium ${esc(info.chromeMajor)}</span>
        </div>
      </div>`;
  }

  function onSettingsClick(e) {
    const segBtn = e.target.closest('.seg button');
    if (segBtn) {
      const name = segBtn.parentElement.dataset.seg;
      const value = segBtn.dataset.value;
      if (name === 'lang') setLang(value);
      if (name === 'theme') {
        state.theme = value;
        persist('theme');
        applyTheme();
      }
      renderSettingsPopover();
      return;
    }
    if (e.target.closest('[data-open-shots]')) api.showInFolder(info.shotsDir);
    const ext = e.target.closest('[data-ext-link]');
    if (ext) api.openExternal(ext.dataset.extLink);
  }

  function onSettingsChange(e) {
    const key = e.target.dataset.toggle;
    if (!key) return;
    state[key] = e.target.checked;
    persist(key);
    applyZoom();
    renderSettingsPopover();
  }

  async function renderQrPopover() {
    const pop = els.popQr;
    if (!currentUrl) {
      pop.innerHTML = `<div class="pop-head">${esc(t('qr'))}</div><div class="pop-body"><p class="qr-empty">${esc(t('qrNothing'))}</p></div>`;
      return;
    }
    pop.innerHTML = `<div class="pop-head">${esc(t('qrTitle'))}</div><div class="pop-body"><div class="qr-box is-loading"></div></div>`;
    const res = await api.lanQr(currentUrl);
    if (!pop.matches(':popover-open')) return;
    if (!res || res.error) {
      const msg = res && res.error === 'nolan' ? t('qrNoLan') : (res && res.message) || t('qrNothing');
      pop.innerHTML = `<div class="pop-head">${esc(t('qr'))}</div><div class="pop-body"><p class="qr-empty">${esc(msg)}</p></div>`;
      return;
    }
    const hints = [];
    if (res.loopback) hints.push(esc(t('qrLocal')));
    if (res.shared) hints.push(esc(t('qrShared')));
    else if (res.loopback) hints.push(esc(t('qrDevServer')).replace(/(vite --host|next dev -H 0\.0\.0\.0)/g, '<code>$1</code>'));
    pop.innerHTML = `
      <div class="pop-head">${esc(t('qrTitle'))}</div>
      <div class="pop-body">
        <div class="qr-box"><img alt="QR" src="${res.dataUrl}"></div>
        <code class="qr-url">${esc(res.url)}</code>
        ${hints.map((h) => `<p class="qr-hint">${h}</p>`).join('')}
        <div class="qr-actions">
          <button class="btn sm" data-copy="${esc(res.url)}">${icon('copy', 14)}${esc(t('copyLink'))}</button>
          <button class="btn sm" data-ext="${esc(currentUrl)}">${icon('external', 14)}${esc(t('openBrowser'))}</button>
        </div>
      </div>`;
  }

  function onQrClick(e) {
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      navigator.clipboard.writeText(copy.dataset.copy).then(() => toast(t('copied'))).catch(() => {});
      return;
    }
    const ext = e.target.closest('[data-ext]');
    if (ext) api.openExternal(ext.dataset.ext);
  }

  function renderShotMenu() {
    els.popShot.innerHTML = `
      <button class="menu-item" data-shot="screen">${icon('phone', 16)}${esc(t('shotScreen'))}</button>
      <button class="menu-item" data-shot="frame">${icon('image', 16)}${esc(t('shotFrame'))}</button>`;
  }

  /* ---------------------------------------------------------------- */
  /* Theme, language, page scheme, sync                                */
  /* ---------------------------------------------------------------- */

  const darkQuery = matchMedia('(prefers-color-scheme: dark)');

  function applyTheme() {
    const dark = state.theme === 'dark' || (state.theme === 'system' && darkQuery.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    api.setTheme(dark);
  }

  function setLang(lang) {
    state.lang = lang;
    persist('lang');
    i18n.setLang(lang);
    translateStatic();
    views.forEach((v) => {
      v.translate();
      v.layout();
      if (!v.url && v.ready) v.load(startUrl());
    });
    updateClocks();
    if (els.popDevices.matches(':popover-open')) renderDevicesPopover();
  }

  function translateStatic() {
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
      el.setAttribute('aria-label', t(el.dataset.i18nTitle));
    });
    $$('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    $$('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
    renderSchemeButton();
  }

  const SCHEMES = ['auto', 'light', 'dark'];
  function renderSchemeButton() {
    const s = state.scheme;
    const key = s === 'light' ? 'schemeLight' : s === 'dark' ? 'schemeDark' : 'schemeAuto';
    els.scheme.innerHTML = icon(s === 'light' ? 'sun' : s === 'dark' ? 'moon' : 'contrast', 18);
    els.scheme.title = t(key);
    els.scheme.setAttribute('aria-label', t(key));
    els.scheme.setAttribute('aria-pressed', String(s !== 'auto'));
  }

  function cycleScheme() {
    state.scheme = SCHEMES[(SCHEMES.indexOf(state.scheme) + 1) % SCHEMES.length];
    persist('scheme');
    renderSchemeButton();
    views.forEach((v) => v.emulate().then(() => setTimeout(() => v.sampleColors(), 250)));
    toast(els.scheme.title);
  }

  function toggleSync() {
    state.sync = !state.sync;
    persist('sync');
    els.sync.setAttribute('aria-pressed', String(state.sync));
    toast(state.sync ? t('syncOn') : t('syncOff'));
  }

  /* ---------------------------------------------------------------- */
  /* Toasts                                                            */
  /* ---------------------------------------------------------------- */

  function toast(message, { action, onAction, tone, timeout = 3800 } = {}) {
    const el = html(`<div class="toast${tone === 'error' ? ' is-error' : ''}" role="status">
      <span class="toast-msg">${esc(message)}</span>
      ${action ? `<button class="toast-action">${esc(action)}</button>` : ''}
    </div>`);
    const close = () => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 220);
    };
    if (action) {
      $('.toast-action', el).addEventListener('click', () => {
        if (onAction) onAction();
        close();
      });
    }
    els.toasts.append(el);
    while (els.toasts.children.length > 3) els.toasts.firstElementChild.remove();
    setTimeout(close, action ? timeout + 2500 : timeout);
  }

  /* ---------------------------------------------------------------- */
  /* Drag and drop                                                     */
  /* ---------------------------------------------------------------- */

  function setupDrop() {
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    window.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      els.drop.hidden = false;
    });
    window.addEventListener('dragover', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    els.drop.addEventListener('dragleave', (e) => {
      if (!e.relatedTarget || !els.drop.contains(e.relatedTarget)) els.drop.hidden = true;
    });
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      els.drop.hidden = true;
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      const p = api.pathForFile(file);
      if (p) openLocal(p);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') els.drop.hidden = true;
    });
  }

  /* ---------------------------------------------------------------- */
  /* Wiring                                                            */
  /* ---------------------------------------------------------------- */

  function onShortcut(name, wcId) {
    const view = views.find((v) => v.wcId === wcId) || focused || views[0];
    switch (name) {
      case 'reload': reloadAll(false); break;
      case 'hardReload': reloadAll(true); break;
      case 'devtools': if (view) view.toggleDevtools(); break;
      case 'focusUrl': els.url.focus(); els.url.select(); break;
      case 'zoomIn': zoomStep(1); break;
      case 'zoomOut': zoomStep(-1); break;
      case 'zoomFit': setZoom('fit'); break;
      case 'back': goBack(); break;
      case 'forward': goForward(); break;
      default: break;
    }
  }

  function onFilesChanged(payload) {
    const origin = payload && payload.origin;
    views.forEach((v) => {
      if (origin && v.url && v.url.startsWith(origin)) v.reload(false);
    });
  }

  function wire() {
    els.back.innerHTML = icon('back');
    els.forward.innerHTML = icon('forward');
    els.reload.innerHTML = icon('reload');
    els.zoomIn.innerHTML = icon('plus', 16);
    els.zoomOut.innerHTML = icon('minus', 16);
    els.zoomFit.innerHTML = icon('fit', 16);
    els.sync.innerHTML = icon('link');
    els.qr.innerHTML = icon('qr');
    els.settings.innerHTML = icon('sliders');
    $('.tb-pill-icon').innerHTML = icon('phone', 16);
    $('#drop-icon').innerHTML = icon('folder', 32);

    els.back.addEventListener('click', goBack);
    els.forward.addEventListener('click', goForward);
    els.reload.addEventListener('click', (e) => reloadAll(e.shiftKey));
    els.zoomIn.addEventListener('click', () => zoomStep(1));
    els.zoomOut.addEventListener('click', () => zoomStep(-1));
    els.zoomFit.addEventListener('click', () => setZoom('fit'));
    els.zoomLabel.addEventListener('click', () => setZoom(1));
    els.scheme.addEventListener('click', cycleScheme);
    els.sync.addEventListener('click', toggleSync);
    els.sync.setAttribute('aria-pressed', String(state.sync));

    // URL field
    const input = els.url;
    input.addEventListener('focus', () => {
      input.select();
      openSuggest();
    });
    input.addEventListener('input', () => {
      renderSuggest(scanCache.list);
    });
    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (!els.urlWrap.contains(document.activeElement)) {
          closeSuggest();
          renderUrl();
        }
      }, 120);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSuggest(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveSuggest(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const sel = $('.sg-item[aria-selected="true"]', els.suggest);
        if (sel && !els.suggest.hidden) activateSuggestion(sel);
        else {
          navigate(input.value);
          input.blur();
        }
      } else if (e.key === 'Escape') {
        input.value = currentUrl;
        closeSuggest();
        input.blur();
      }
    });
    els.suggest.addEventListener('mousedown', (e) => e.preventDefault());
    els.suggest.addEventListener('click', (e) => activateSuggestion(e.target.closest('.sg-item')));

    // Popovers
    els.popDevices.addEventListener('beforetoggle', (e) => {
      els.devicesBtn.classList.toggle('is-open', e.newState === 'open');
      if (e.newState !== 'open') return;
      renderDevicesPopover();
      placeBelow(els.popDevices, els.devicesBtn);
    });
    els.popDevices.addEventListener('click', onDevicesPopoverClick);
    els.popDevices.addEventListener('submit', onCustomSubmit);

    els.popSettings.addEventListener('beforetoggle', (e) => {
      if (e.newState !== 'open') return;
      renderSettingsPopover();
      placeBelow(els.popSettings, els.settings);
    });
    els.popSettings.addEventListener('click', onSettingsClick);
    els.popSettings.addEventListener('change', onSettingsChange);

    els.popQr.addEventListener('beforetoggle', (e) => {
      if (e.newState !== 'open') return;
      placeBelow(els.popQr, els.qr);
      setTimeout(renderQrPopover, 0);
    });
    els.popQr.addEventListener('click', onQrClick);

    els.popShot.addEventListener('beforetoggle', (e) => {
      if (e.newState !== 'open' || !shotMenuTarget) return;
      renderShotMenu();
      placeBelow(els.popShot, $('[data-act="shot"]', shotMenuTarget.el));
    });
    els.popShot.addEventListener('click', (e) => {
      const item = e.target.closest('[data-shot]');
      if (!item || !shotMenuTarget) return;
      const target = shotMenuTarget;
      els.popShot.hidePopover();
      target.screenshot(item.dataset.shot === 'frame');
    });

    let lastDpr = window.devicePixelRatio;
    window.addEventListener('resize', debounce(() => {
      // Moving to a monitor with a different scale factor changes pixel snapping too.
      if (state.zoom === 'fit' || window.devicePixelRatio !== lastDpr) applyZoom();
      lastDpr = window.devicePixelRatio;
      $$('.pop').forEach((p) => p.matches(':popover-open') && p.hidePopover());
    }, 120));
    darkQuery.addEventListener('change', () => {
      if (state.theme === 'system') applyTheme();
    });

    api.onShortcut(onShortcut);
    api.onFilesChanged(onFilesChanged);
    setupDrop();
    setInterval(() => updateClocks(), 15000);
  }

  async function init() {
    info = await api.info();
    const saved = (await api.getSettings()) || {};
    state = { ...DEFAULTS, ...saved };
    if (info.smokeState) Object.assign(state, info.smokeState);
    state.devices = (state.devices || []).filter((d) => d && findPreset(d.id)).map((d) => ({ id: d.id, landscape: !!d.landscape }));
    state.recent = Array.isArray(state.recent) ? state.recent : [];
    state.customDevices = Array.isArray(state.customDevices) ? state.customDevices : [];

    Object.assign(els, {
      canvas: $('#canvas'),
      stage: $('#stage'),
      empty: $('#empty'),
      url: $('#url'),
      urlWrap: $('#url-wrap'),
      urlIcon: $('#url-icon'),
      suggest: $('#suggest'),
      back: $('#btn-back'),
      forward: $('#btn-forward'),
      reload: $('#btn-reload'),
      devicesBtn: $('#btn-devices'),
      deviceCount: $('#device-count'),
      zoomIn: $('#zoom-in'),
      zoomOut: $('#zoom-out'),
      zoomFit: $('#zoom-fit'),
      zoomLabel: $('#zoom-label'),
      scheme: $('#btn-scheme'),
      sync: $('#btn-sync'),
      qr: $('#btn-qr'),
      settings: $('#btn-settings'),
      popDevices: $('#pop-devices'),
      popSettings: $('#pop-settings'),
      popQr: $('#pop-qr'),
      popShot: $('#pop-shot'),
      drop: $('#drop'),
      toasts: $('#toasts'),
    });

    i18n.setLang(state.lang);
    applyTheme();
    wire();
    translateStatic();

    // Decide the first page before the devices mount so they load it directly.
    let initial = { url: '' };
    if (info.smokeUrl) initial = normalizeInput(info.smokeUrl);
    else if (state.last && state.last.local) initial = { local: state.last.local };
    else if (state.last && state.last.url) initial = { url: state.last.url };

    if (initial.url) currentUrl = initial.url;
    renderUrl();
    renderDevices();
    if (initial.local) openLocal(initial.local);
    else if (initial.url) setCurrent(initial.url, null, false);
  }

  init().catch((err) => {
    console.error(err);
    document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;bottom:0;left:0;right:0;margin:0;padding:12px;background:#300;color:#fcc;white-space:pre-wrap">${esc(err.stack || err)}</pre>`);
  });
})();
