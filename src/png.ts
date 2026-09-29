import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { Chrome, killGroup } from './chrome.ts';
import { onCleanup } from './cleanup.ts';
import type { Tokens } from './tokens.ts';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon',
};
const BUILD_TIMEOUT = 300000;

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

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, track: (child: ChildProcess | null) => void): Promise<void> {
  return new Promise((ok, fail) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
    track(child);
    let stderr = '';
    child.stderr!.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString('utf8')).slice(-4000); });
    const timer = setTimeout(() => killGroup(child), BUILD_TIMEOUT);
    child.on('error', (error) => { clearTimeout(timer); track(null); fail(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      track(null);
      if (code === 0) ok();
      else fail(new Error(stderr.trim().split('\n').slice(-5).join('\n') || `${command} ended with ${signal ?? `exit ${code}`}`));
    });
  });
}

export async function buildSite(blogDir: string, sources: string[]): Promise<{ dist: string; cleanup(): void }> {
  const blog = resolve(blogDir);
  const root = mkdtempSync(join(tmpdir(), 'dg-site-'));
  let child: ChildProcess | null = null;
  const remove = () => {
    killGroup(child);
    rmSync(root, { recursive: true, force: true });
  };
  const release = onCleanup(remove);
  const cleanup = () => { release(); remove(); };
  try {
    const engine = join(root, 'engine');
    const files = execFileSync('git', ['-C', blog, 'ls-files', '-z', '--', '.', ':(exclude)content'], { maxBuffer: 64 << 20 }).toString('utf8').split('\0').filter(Boolean);
    for (const file of files) {
      const from = join(blog, file);
      if (!existsSync(from) || !statSync(from).isFile()) continue;
      mkdirSync(dirname(join(engine, file)), { recursive: true });
      copyFileSync(from, join(engine, file));
    }
    symlinkSync(join(blog, 'node_modules'), join(engine, 'node_modules'));
    const post = join(root, 'content', 'dg');
    mkdirSync(post, { recursive: true });
    writeFileSync(join(post, 'index.md'), sources.map((source, i) => `## d${i}\n\n\`\`\`mermaid\n${source.trim()}\n\`\`\`\n`).join('\n'));
    writeFileSync(join(post, 'meta.json'), JSON.stringify({ title: 'dg', date: '2026-01-01', tags: ['dg'], excerpt: 'dg' }));
    await run('python3', ['build/build.py'], engine, { ...process.env, BLOG_CONTENT_DIR: join(root, 'content') }, (c) => { child = c; });
    return { dist: join(engine, 'dist'), cleanup };
  } catch (error: any) {
    cleanup();
    throw new Error(`blog build failed: ${error.message}`);
  }
}

export interface MermaidShot {
  theme: string;
  png: Buffer;
  width: number;
  height: number;
  nodeFont: number;
  edgeFont: number;
}

export async function mermaidPNGs(blogDir: string, sources: string[], themes: string[], scale = 2): Promise<MermaidShot[][]> {
  const site = await buildSite(blogDir, sources);
  let server: Site | null = null;
  let chrome: Chrome | null = null;
  try {
    server = await serve(site.dist, {});
    chrome = new Chrome();
    const shots: MermaidShot[][] = sources.map(() => []);
    const css = '.statusline,.site-header{visibility:hidden!important}.diagram-container{display:inline-block!important;width:max-content!important;max-width:none!important;overflow:visible!important}';
    for (const theme of themes) {
      const init = `try { localStorage.setItem('blog-theme', ${JSON.stringify(theme)}); } catch (e) {}`;
      const tab = await chrome.open(`${server.url}/posts/dg/`, 1280, init);
      const state = await tab.eval<{ ready: boolean; errors: number }>(`
        const style = document.createElement('style'); style.textContent = ${JSON.stringify(css)}; document.head.appendChild(style);
        await document.fonts.ready;
        const end = performance.now() + 20000;
        const done = () => [...document.querySelectorAll('.diagram-container')].every((c) => c.querySelector('svg') && c.style.cursor === 'pointer');
        while (!done() && performance.now() < end) await new Promise((r) => setTimeout(r, 100));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return { ready: done(), errors: document.querySelectorAll('.diagram-container svg[aria-roledescription="error"]').length };`);
      if (!state.ready || state.errors) throw new Error(`mermaid did not render in ${theme}${state.errors ? ` (${state.errors} syntax errors)` : ''}`);
      for (let i = 0; i < sources.length; ++i) {
        const info = await tab.eval<{ width: number; height: number; nodeFont: number; edgeFont: number }>(`
          const c = document.querySelectorAll('.diagram-container')[${i}];
          const r = c.getBoundingClientRect();
          const size = (sel) => { const el = c.querySelector(sel); return el ? parseFloat(getComputedStyle(el).fontSize) : 0; };
          return { width: r.width, height: r.height, nodeFont: size('.node .nodeLabel, .node text, text.actor, .actor tspan'), edgeFont: size('.edgeLabel text, .edgeLabel span, text.messageText') };`);
        shots[i].push({ theme, png: await tab.capture('.diagram-container', i, scale), ...info });
      }
      await tab.close();
    }
    return shots;
  } finally {
    await chrome?.close();
    await server?.close();
    site.cleanup();
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
