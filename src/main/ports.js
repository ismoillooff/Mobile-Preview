'use strict';

const net = require('node:net');
const http = require('node:http');

/** Ports used by common dev servers (Vite, Next, CRA, Angular, Astro, Live Server, Django, Flask, Expo web…). */
const COMMON_PORTS = [
  1234, 3000, 3001, 3002, 3003, 4000, 4173, 4200, 4321, 5000, 5001, 5173, 5174, 5175,
  5500, 5501, 6006, 7000, 8000, 8001, 8080, 8081, 8100, 8888, 9000, 9090, 19006,
];

function probe(host, port, timeout = 300) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeout, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

function guessStack(html, headers) {
  if (/@vite\/client/.test(html)) return 'Vite';
  if (/__NEXT_DATA__|\/_next\//.test(html)) return 'Next.js';
  if (/\/_nuxt\//.test(html)) return 'Nuxt';
  if (/ng-version|<app-root/i.test(html)) return 'Angular';
  if (/\/_astro\/|data-astro/.test(html)) return 'Astro';
  if (/svelte-kit|__sveltekit/.test(html)) return 'SvelteKit';
  if (/Live reload enabled|livereload\.js|Five Server/i.test(html)) return 'Live Server';
  if (/csrfmiddlewaretoken|django/i.test(html)) return 'Django';
  const poweredBy = headers['x-powered-by'];
  if (poweredBy) return String(poweredBy).slice(0, 24);
  const srv = headers.server;
  if (srv && !/^(node|nginx|apache)$/i.test(srv)) return String(srv).slice(0, 24);
  return '';
}

function fetchPage(host, port) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const req = http.get({
      host, port, path: '/', timeout: 1500,
      headers: { 'User-Agent': 'MobilePreview/1.0 (port scan)', Accept: 'text/html,*/*' },
    }, (res) => {
      let html = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        html += chunk;
        if (html.length > 96 * 1024) res.destroy();
      });
      const end = () => {
        const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        finish({
          status: res.statusCode,
          title: m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 80) : '',
          stack: guessStack(html, res.headers),
        });
      };
      res.on('end', end);
      res.on('close', end);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => finish(null));
  });
}

/**
 * Find HTTP servers running on this machine on well-known dev ports.
 * @returns {Promise<Array<{port:number,url:string,title:string,stack:string,status:number}>>}
 */
async function scanLocalServers({ exclude = [] } = {}) {
  const ports = COMMON_PORTS.filter((p) => !exclude.includes(p));
  const found = await Promise.all(ports.map(async (port) => {
    const [v4, v6] = await Promise.all([probe('127.0.0.1', port), probe('::1', port)]);
    if (!v4 && !v6) return null;
    const info = await fetchPage(v4 ? '127.0.0.1' : '::1', port);
    if (!info) return null;
    return { port, url: `http://localhost:${port}/`, ...info };
  }));
  return found.filter(Boolean);
}

module.exports = { scanLocalServers, COMMON_PORTS };
