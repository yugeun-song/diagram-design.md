import { color, type Paint, type Tokens } from './tokens.ts';

export type Anchor = 'start' | 'middle' | 'end';

export type ProfileName = 'blog' | 'slide';

export type Weight = 'border' | 'stroke';

export type Corners = [boolean, boolean, boolean, boolean];

export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill: Paint; corners?: Corners }
  | { kind: 'outline'; x: number; y: number; w: number; h: number; stroke: Paint; rounded?: boolean }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: Paint; weight?: Weight }
  | { kind: 'path'; d: string; fill: Paint; stroke?: never }
  | { kind: 'path'; d: string; stroke: Paint; fill?: never; weight?: Weight }
  | { kind: 'text'; x: number; y: number; text: string; size: number; bold?: boolean; anchor: Anchor; fill: Paint }
  | { kind: 'runs'; x: number; y: number; runs: Array<{ text: string; fill: Paint }>; size: number; bold?: boolean; anchor: Anchor };

export interface Scene {
  width: number;
  height: number;
  label: string;
  font: string;
  shapes: Shape[];
  frame?: number;
  x?: number;
}

export interface StaticOptions {
  scale?: number;
  unit?: 'px' | 'pt';
}

export const FONT = 'code-mono';
export const BORDER = 1.6, STROKE = 2;
export const CORNER = 8;
const ADVANCE = 0.6, HANGUL_ADVANCE = 0.864;
const HANGUL = /([ᄀ-ᇿ㄰-㆏가-힣]+)/;
const HANGUL_CHAR = /[ᄀ-ᇿ㄰-㆏가-힣]/;

export function checkText(text: string, where: string): void {
  if (/[\u0000-\u001f\u007f]/.test(text)) throw new Error(`${where}: contains a control character or a line break`);
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const round = (n: number) => Math.round(n * 100) / 100;

function pathXs(d: string): number[] {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  const xs: number[] = [];
  let command = '';
  for (let i = 0; i < tokens.length;) {
    if (/[A-Za-z]/.test(tokens[i])) command = tokens[i++];
    const take = (n: number) => tokens.slice(i, (i += n)).map(Number);
    if (command === 'M' || command === 'L') xs.push(take(2)[0]);
    else if (command === 'H') xs.push(take(1)[0]);
    else if (command === 'V') take(1);
    else if (command === 'Q') { const [cx, , x] = take(4); xs.push(cx, x); }
    else if (command === 'A') xs.push(take(7)[5]);
    else if (command !== 'Z') ++i;
  }
  return xs;
}

export function tighten(scene: Scene, margin: number): Scene {
  let low = Infinity, high = -Infinity;
  const add = (...xs: number[]) => xs.forEach((x) => { low = Math.min(low, x); high = Math.max(high, x); });
  for (const s of scene.shapes) {
    if (s.kind === 'rect' || s.kind === 'outline') add(s.x, s.x + s.w);
    else if (s.kind === 'line') add(s.x1, s.x2);
    else if (s.kind === 'path') add(...pathXs(s.d));
    else {
      const w = textWidth(s.kind === 'text' ? s.text : s.runs.map((r) => r.text).join(''), s.size);
      const start = s.anchor === 'start' ? s.x : s.anchor === 'middle' ? s.x - w / 2 : s.x - w;
      add(start, start + w);
    }
  }
  return { ...scene, x: round(low - margin), width: round(high - low + 2 * margin) };
}

export function textWidth(text: string, size: number): number {
  let em = 0;
  for (const ch of text) em += HANGUL_CHAR.test(ch) ? HANGUL_ADVANCE : ADVANCE;
  return em * size;
}

export const corners = (top: boolean, bottom: boolean, left = true, right = true): Corners => [top && left, top && right, bottom && right, bottom && left];

function cornerPath(x: number, y: number, w: number, h: number, [tl, tr, br, bl]: Corners): string {
  const [a, b, c, d] = [tl, tr, br, bl].map((on) => (on ? CORNER : 0));
  const arc = (r: number, ex: number, ey: number) => (r ? ` A ${r} ${r} 0 0 1 ${round(ex)} ${round(ey)}` : '');
  return `M ${round(x + a)} ${round(y)} H ${round(x + w - b)}${arc(b, x + w, y + b)} V ${round(y + h - c)}${arc(c, x + w - c, y + h)}`
    + ` H ${round(x + d)}${arc(d, x, y + h - d)} V ${round(y + a)}${arc(a, x + a, y)} Z`;
}

const rounded = (s: { corners?: Corners }) => !!s.corners?.some(Boolean);

const space = (s: string) => (/ {2}|^ | $/.test(s) ? ' xml:space="preserve"' : '');
const fill = (name: Paint) => `style="fill:var(--${name})"`;
const stroke = (name: Paint, weight: Weight) => `style="stroke:var(--${name});stroke-width:var(--diagram-${weight})"`;
const lineWeight = (s: Shape): Weight => (s.kind === 'outline' ? 'border' : s.kind === 'line' ? s.weight ?? 'border' : s.kind === 'path' && !s.fill ? s.weight ?? 'stroke' : 'stroke');

export function toWeb(scene: Scene): string {
  const body = scene.shapes.map((s) => {
    switch (s.kind) {
      case 'rect': return rounded(s) ? `<path d="${cornerPath(s.x, s.y, s.w, s.h, s.corners!)}" ${fill(s.fill)}/>` : `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" ${fill(s.fill)}/>`;
      case 'outline': return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"${s.rounded ? ` rx="${CORNER}"` : ''} fill="none" ${stroke(s.stroke, 'border')}/>`;
      case 'line': return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" ${stroke(s.stroke, lineWeight(s))}/>`;
      case 'path': return s.fill ? `<path d="${s.d}" ${fill(s.fill)}/>` : `<path d="${s.d}" fill="none" ${stroke(s.stroke, lineWeight(s))}/>`;
      case 'text': return `<text x="${s.x}" y="${s.y}" font-size="${s.size}" text-anchor="${s.anchor}"${space(s.text)} ${fill(s.fill)}>${esc(s.text)}</text>`;
      case 'runs': return `<text x="${s.x}" y="${s.y}" font-size="${s.size}" text-anchor="${s.anchor}" xml:space="preserve">${s.runs.map((r) => `<tspan ${fill(r.fill)}>${esc(r.text)}</tspan>`).join('')}</text>`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" class="mem-diagram" viewBox="${scene.x ?? 0} 0 ${scene.width} ${scene.height}" style="--diagram-width:${scene.width}" font-family="${scene.font}, hangul-sans, monospace" font-weight="700" role="img" aria-label="${esc(scene.label)}">\n  ${body.join('\n  ')}\n</svg>`;
}

export function toStatic(scene: Scene, tokens: Tokens, theme: string, options: StaticOptions = {}): string {
  const scale = options.scale ?? 1;
  const unit = options.unit ?? 'px';
  const paint = (name: Paint) => color(tokens, theme, name);
  const width = (weight: Weight) => (weight === 'border' ? tokens.border : tokens.stroke);
  const family = (name: string) => tokens.fonts[name] ?? name;
  const pad = scene.frame ?? 0;
  const [vx, vy, vw, vh] = [round((scene.x ?? 0) - pad), -pad, round(scene.width + 2 * pad), round(scene.height + 2 * pad)];
  const out: string[] = [];
  if (pad) out.push(`<rect x="${vx + 0.5}" y="${vy + 0.5}" width="${round(vw - 1)}" height="${round(vh - 1)}" rx="10" fill="${paint('code-bg')}" stroke="${paint('code-border')}" stroke-width="1"/>`);
  for (const s of scene.shapes) {
    switch (s.kind) {
      case 'rect':
        out.push(rounded(s) ? `<path d="${cornerPath(s.x, s.y, s.w, s.h, s.corners!)}" fill="${paint(s.fill)}"/>` : `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${paint(s.fill)}"/>`);
        break;
      case 'outline':
        out.push(`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"${s.rounded ? ` rx="${CORNER}"` : ''} fill="none" stroke="${paint(s.stroke)}" stroke-width="${width('border')}"/>`);
        break;
      case 'line':
        out.push(`<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${paint(s.stroke)}" stroke-width="${width(lineWeight(s))}"/>`);
        break;
      case 'path':
        out.push(s.fill ? `<path d="${s.d}" fill="${paint(s.fill)}"/>` : `<path d="${s.d}" fill="none" stroke="${paint(s.stroke)}" stroke-width="${width(lineWeight(s))}"/>`);
        break;
      case 'text': {
        const runs = s.text.split(HANGUL).filter(Boolean);
        const body = HANGUL.test(s.text)
          ? runs.map((run) => `<tspan font-family="${family(HANGUL.test(run) ? 'hangul-sans' : scene.font)}">${esc(run)}</tspan>`).join('')
          : esc(s.text);
        out.push(`<text x="${s.x}" y="${s.y}" font-family="${family(scene.font)}" font-size="${s.size}" text-anchor="${s.anchor}" fill="${paint(s.fill)}"${space(s.text)}>${body}</text>`);
        break;
      }
      case 'runs':
        out.push(`<text x="${s.x}" y="${s.y}" font-family="${family(scene.font)}" font-size="${s.size}" text-anchor="${s.anchor}" xml:space="preserve">${s.runs.map((r) => `<tspan fill="${paint(r.fill)}">${esc(r.text)}</tspan>`).join('')}</text>`);
        break;
    }
  }
  const size = (n: number) => `${Math.round(n * scale * 100) / 100}${unit === 'pt' ? 'pt' : ''}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size(vw)}" height="${size(vh)}" viewBox="${vx} ${vy} ${vw} ${vh}" font-weight="700" role="img" aria-label="${esc(scene.label)}">\n  ${out.join('\n  ')}\n</svg>\n`;
}

export function lintStatic(svg: string): string[] {
  const problems = new Set<string>();
  for (const [, tag, attrs] of svg.matchAll(/<([\w:-]+)([^>]*)>/g)) {
    if (/^(style|marker|foreignObject|filter|mask|pattern|image|script)$/i.test(tag)) problems.add(`<${tag}>`);
    for (const [, attr, value] of attrs.matchAll(/\s([\w:-]+)="([^"]*)"/g)) {
      if (/^(style|class|filter|opacity|fill-opacity|stroke-opacity|transform|dominant-baseline|textLength|lengthAdjust|mask|clip-path)$|^marker-/.test(attr)) problems.add(attr);
      if (attr !== 'aria-label' && /var\(|rgba?\(|url\(/.test(value)) problems.add(`${attr}="${value}"`);
    }
  }
  return [...problems].map((p) => `static svg uses ${p}`);
}
