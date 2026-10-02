import { color, type Paint, type Tokens } from './tokens.ts';

export type Anchor = 'start' | 'middle' | 'end';

export type ProfileName = 'blog' | 'slide';

export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill: Paint }
  | { kind: 'outline'; x: number; y: number; w: number; h: number; stroke: Paint }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: Paint }
  | { kind: 'path'; d: string; fill: Paint; stroke?: never }
  | { kind: 'path'; d: string; stroke: Paint; fill?: never }
  | { kind: 'text'; x: number; y: number; text: string; size: number; bold?: boolean; anchor: Anchor; fill: Paint }
  | { kind: 'runs'; x: number; y: number; runs: Array<{ text: string; fill: Paint }>; size: number; bold?: boolean; anchor: Anchor };

export interface Scene {
  width: number;
  height: number;
  label: string;
  font: string;
  shapes: Shape[];
  frame?: number;
}

export interface StaticOptions {
  scale?: number;
  unit?: 'px' | 'pt';
}

export const ADVANCE = 0.62;
const HANGUL = /([ᄀ-ᇿ㄰-㆏가-힣]+)/;

export function checkText(text: string, where: string): void {
  if (/[\u0000-\u001f\u007f]/.test(text)) throw new Error(`${where}: contains a control character or a line break`);
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const textWidth = (text: string, size: number) => text.length * ADVANCE * size;
export const round = (n: number) => Math.round(n * 100) / 100;
const space = (s: string) => (/ {2}|^ | $/.test(s) ? ' xml:space="preserve"' : '');
const fill = (name: Paint) => `style="fill:var(--${name})"`;
const stroke = (name: Paint) => `style="stroke:var(--${name});stroke-width:var(--diagram-stroke)"`;

export function toWeb(scene: Scene): string {
  const body = scene.shapes.map((s) => {
    switch (s.kind) {
      case 'rect': return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" ${fill(s.fill)}/>`;
      case 'outline': return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="none" ${stroke(s.stroke)}/>`;
      case 'line': return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" ${stroke(s.stroke)}/>`;
      case 'path': return s.fill ? `<path d="${s.d}" ${fill(s.fill)}/>` : `<path d="${s.d}" fill="none" ${stroke(s.stroke)}/>`;
      case 'text': return `<text x="${s.x}" y="${s.y}" font-size="${s.size}"${s.bold ? ' font-weight="700"' : ''} text-anchor="${s.anchor}"${space(s.text)} ${fill(s.fill)}>${esc(s.text)}</text>`;
      case 'runs': return `<text x="${s.x}" y="${s.y}" font-size="${s.size}"${s.bold ? ' font-weight="700"' : ''} text-anchor="${s.anchor}" xml:space="preserve">${s.runs.map((r) => `<tspan ${fill(r.fill)}>${esc(r.text)}</tspan>`).join('')}</text>`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" class="mem-diagram" viewBox="0 0 ${scene.width} ${scene.height}" font-family="${scene.font}, monospace" role="img" aria-label="${esc(scene.label)}">\n  ${body.join('\n  ')}\n</svg>`;
}

export function toStatic(scene: Scene, tokens: Tokens, theme: string, options: StaticOptions = {}): string {
  const scale = options.scale ?? 1;
  const unit = options.unit ?? 'px';
  const paint = (name: Paint) => color(tokens, theme, name);
  const width = tokens.stroke;
  const family = (name: string) => tokens.fonts[name] ?? name;
  const pad = scene.frame ?? 0;
  const [vx, vy, vw, vh] = [-pad, -pad, scene.width + 2 * pad, scene.height + 2 * pad];
  const out: string[] = [];
  if (pad) out.push(`<rect x="${vx + 0.5}" y="${vy + 0.5}" width="${vw - 1}" height="${vh - 1}" rx="10" fill="${paint('code-bg')}" stroke="${paint('code-border')}" stroke-width="1"/>`);
  for (const s of scene.shapes) {
    switch (s.kind) {
      case 'rect':
        out.push(`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${paint(s.fill)}"/>`);
        break;
      case 'outline':
        out.push(`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="none" stroke="${paint(s.stroke)}" stroke-width="${width}"/>`);
        break;
      case 'line':
        out.push(`<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${paint(s.stroke)}" stroke-width="${width}"/>`);
        break;
      case 'path':
        out.push(s.fill ? `<path d="${s.d}" fill="${paint(s.fill)}"/>` : `<path d="${s.d}" fill="none" stroke="${paint(s.stroke)}" stroke-width="${width}"/>`);
        break;
      case 'text': {
        const runs = s.text.split(HANGUL).filter(Boolean);
        const body = HANGUL.test(s.text)
          ? runs.map((run) => `<tspan font-family="${family(HANGUL.test(run) ? 'hangul-sans' : scene.font)}">${esc(run)}</tspan>`).join('')
          : esc(s.text);
        out.push(`<text x="${s.x}" y="${s.y}" font-family="${family(scene.font)}" font-size="${s.size}"${s.bold ? ' font-weight="700"' : ''} text-anchor="${s.anchor}" fill="${paint(s.fill)}"${space(s.text)}>${body}</text>`);
        break;
      }
      case 'runs':
        out.push(`<text x="${s.x}" y="${s.y}" font-family="${family(scene.font)}" font-size="${s.size}"${s.bold ? ' font-weight="700"' : ''} text-anchor="${s.anchor}" xml:space="preserve">${s.runs.map((r) => `<tspan fill="${paint(r.fill)}">${esc(r.text)}</tspan>`).join('')}</text>`);
        break;
    }
  }
  const size = (n: number) => `${Math.round(n * scale * 100) / 100}${unit === 'pt' ? 'pt' : ''}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size(vw)}" height="${size(vh)}" viewBox="${vx} ${vy} ${vw} ${vh}" role="img" aria-label="${esc(scene.label)}">\n  ${out.join('\n  ')}\n</svg>\n`;
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
