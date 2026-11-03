import { createServer, type Server, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { Chrome } from './chrome.ts';
import type { Tokens } from './tokens.ts';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

interface Site { url: string; close(): Promise<void> }

function reply(res: ServerResponse, status: number): void {
  res.writeHead(status);
  res.end();
}

function serve(root: string | null, pages: Record<string, string>): Promise<Site> {
  const base = root === null ? null : resolve(root);
  const server: Server = createServer((req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
      if (Object.hasOwn(pages, path)) {
        res.writeHead(200, { 'content-type': TYPES['.html'] });
        res.end(pages[path]);
        return;
      }
      if (base === null) return reply(res, 404);
      const file = normalize(join(base, path.endsWith('/') ? path + 'index.html' : path));
      if (!file.startsWith(base + sep) || !existsSync(file) || !statSync(file).isFile()) return reply(res, 404);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(readFileSync(file));
    } catch {
      reply(res, 400);
    }
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      ok({ url: `http://127.0.0.1:${port}`, close: () => new Promise((done) => { server.closeAllConnections(); server.close(() => done()); }) });
    });
  });
}

function fontCSS(blogDir: string, tokens: Tokens): string {
  let css = ['fonts.css', 'fonts-subset.css'].map((f) => join(blogDir, 'styles', f)).filter(existsSync).map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const [alias, name] of Object.entries(tokens.fonts)) css = css.replaceAll(`'${alias}'`, `'${name}'`);
  return css.replaceAll('url(../fonts/', 'url(/fonts/');
}

const page = (head: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}${head}</style></head><body>${body}</body></html>`;

export async function staticPNGs(svgs: string[], blogDir: string, tokens: Tokens, scale = 2): Promise<Buffer[]> {
  const html = page(`${fontCSS(blogDir, tokens)}.d{display:inline-block;padding:0;margin:0 8px 8px 0;line-height:0}`,
    svgs.map((svg) => `<div class="d">${svg}</div>`).join(''));
  let site: Site | null = null;
  let chrome: Chrome | null = null;
  try {
    site = await serve(join(blogDir, 'static'), { '/dg.html': html });
    chrome = new Chrome();
    const tab = await chrome.open(`${site.url}/dg.html`, 2400);
    await tab.eval('await document.fonts.ready; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));');
    const out: Buffer[] = [];
    for (let i = 0; i < svgs.length; ++i) out.push(await tab.capture('.d > svg', i, scale));
    await tab.close();
    return out;
  } finally {
    await chrome?.close();
    await site?.close();
  }
}

export async function compose(columns: Buffer[][], backgrounds: string[], scale = 2): Promise<Buffer> {
  const img = (png: Buffer) => `<img src="data:image/png;base64,${png.toString('base64')}" style="display:block;zoom:${1 / scale}">`;
  const html = page('.m{display:inline-flex;align-items:stretch}.c{display:flex;flex-direction:column;justify-content:center;align-items:center;gap:48px;padding:64px}',
    `<div class="m">${columns.map((pngs, i) => `<div class="c" style="background:${backgrounds[i]}">${pngs.map(img).join('')}</div>`).join('')}</div>`);
  let site: Site | null = null;
  let chrome: Chrome | null = null;
  try {
    site = await serve(null, { '/dg.html': html });
    chrome = new Chrome();
    const tab = await chrome.open(`${site.url}/dg.html`, 4000);
    await tab.eval('await Promise.all([...document.images].map((i) => i.decode()));');
    const png = await tab.capture('.m', 0, scale);
    await tab.close();
    return png;
  } finally {
    await chrome?.close();
    await site?.close();
  }
}
