'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const PREFERRED_PORT = 4650;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
};

const IGNORE = /(^|[\\/])(node_modules|\.git|\.next|\.nuxt|\.cache|\.vite|\.turbo)([\\/]|$)|~$|\.swp$|\.tmp$/i;

function isInside(root, p) {
  const rel = path.relative(root, p);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function page(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>
:root{color-scheme:light dark;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
body{margin:0;padding:24px 20px;background:Canvas;color:CanvasText}
h1{font-size:20px;margin:0 0 4px}p{margin:0 0 16px;opacity:.7;word-break:break-all}
ul{list-style:none;margin:0;padding:0}li a{display:block;padding:12px 0;border-bottom:1px solid color-mix(in srgb,CanvasText 12%,transparent);color:inherit;text-decoration:none}
li a span{opacity:.55;margin-left:6px}
</style></head><body>${body}</body></html>`;
}

/**
 * A tiny static file server used to preview local folders over HTTP
 * (file:// breaks ES modules, fetch() and root-relative paths).
 * Listens on loopback only; LAN sharing is opt-in via shareOnLan().
 */
class StaticServer extends EventEmitter {
  constructor() {
    super();
    this.root = null;
    this.port = 0;
    this.server = null;
    this.lanServer = null;
    this.lanHost = null;
    this.watcher = null;
    this.timer = null;
    this.ready = Promise.resolve();
  }

  get origin() {
    return this.port ? `http://127.0.0.1:${this.port}` : '';
  }

  start() {
    this.ready = new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => this.handle(req, res));
      const listen = (port) => {
        srv.once('error', (err) => {
          if (err.code === 'EADDRINUSE' && port !== 0) listen(0);
          else reject(err);
        });
        srv.listen(port, '127.0.0.1', () => {
          this.port = srv.address().port;
          this.server = srv;
          srv.on('error', (err) => console.error('[server]', err.message));
          resolve();
        });
      };
      listen(PREFERRED_PORT);
    });
    return this.ready;
  }

  stop() {
    if (this.watcher) this.watcher.close();
    if (this.server) this.server.close();
    if (this.lanServer) this.lanServer.close();
    this.watcher = null;
    this.server = null;
    this.lanServer = null;
  }

  /** Map a local file or folder to a URL on this server, switching the served root if needed. */
  urlForPath(input) {
    if (!this.port) return { error: 'server' };
    const p = path.resolve(String(input || ''));
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      return { error: 'missing' };
    }
    const isDir = st.isDirectory();
    // An opened folder is the project root. An opened file keeps the current root when it
    // lives inside it (so root-relative links keep working), otherwise its folder becomes root.
    let root = isDir ? p : path.dirname(p);
    if (!isDir && this.root && isInside(this.root, p)) root = this.root;
    this.setRoot(root);
    let rel = path.relative(root, p);
    if (isDir && rel) rel += path.sep;
    const urlPath = rel.split(path.sep).map(encodeURIComponent).join('/');
    return { url: `${this.origin}/${urlPath}`, path: p, root };
  }

  setRoot(root) {
    const resolved = path.resolve(root);
    if (this.root === resolved) return;
    this.root = resolved;
    this.watch();
  }

  watch() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    try {
      this.watcher = fs.watch(this.root, { recursive: true }, (_event, file) => {
        if (file && IGNORE.test(file)) return;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.emit('change', file || ''), 150);
      });
      this.watcher.on('error', () => { /* folder removed or inaccessible */ });
    } catch (err) {
      console.warn('[server] watch failed:', err.message);
    }
  }

  shareOnLan(host) {
    if (this.lanServer && this.lanHost === host) return Promise.resolve();
    if (this.lanServer) this.lanServer.close();
    return new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => this.handle(req, res));
      srv.once('error', reject);
      srv.listen(this.port, host, () => {
        this.lanServer = srv;
        this.lanHost = host;
        resolve();
      });
    });
  }

  handle(req, res) {
    if (!this.root) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No folder is open in Mobile Preview.');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }
    let url;
    let rel;
    try {
      url = new URL(req.url, 'http://localhost');
      rel = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    const file = path.resolve(this.root, `.${rel}`);
    if (!isInside(this.root, file)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.stat(file, (err, st) => {
      if (!err && st.isDirectory()) {
        if (!url.pathname.endsWith('/')) {
          res.writeHead(301, { Location: `${url.pathname}/${url.search}` });
          res.end();
          return;
        }
        const index = ['index.html', 'index.htm'].map((f) => path.join(file, f)).find((f) => fs.existsSync(f));
        if (index) this.send(req, res, index);
        else this.listing(res, file, rel);
        return;
      }
      if (!err && st.isFile()) {
        this.send(req, res, file, st);
        return;
      }
      // SPA fallback: extension-less routes resolve to the root index.html.
      const rootIndex = path.join(this.root, 'index.html');
      if (!path.extname(rel) && fs.existsSync(rootIndex)) {
        this.send(req, res, rootIndex);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page('404', `<h1>404</h1><p>${escapeHtml(rel)}</p>`));
    });
  }

  send(req, res, file, st) {
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-store' };
    if (st) headers['Content-Length'] = st.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  }

  listing(res, dir, rel) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
        .filter((d) => !d.name.startsWith('.') && d.name !== 'node_modules')
        .sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name));
    } catch { /* unreadable */ }
    const items = entries.map((d) => {
      const name = d.isDirectory() ? `${d.name}/` : d.name;
      return `<li><a href="${encodeURIComponent(d.name)}${d.isDirectory() ? '/' : ''}">${escapeHtml(name)}</a></li>`;
    }).join('');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(page(rel, `<h1>${escapeHtml(path.basename(dir) || dir)}</h1><p>${escapeHtml(rel)}</p><ul>${items}</ul>`));
  }
}

module.exports = { StaticServer, isInside };
