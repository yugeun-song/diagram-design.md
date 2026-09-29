import { color, type Tokens } from './tokens.ts';

export type Anchor = 'start' | 'middle' | 'end';

export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill: string; stroke?: string; cls?: string }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string }
  | { kind: 'path'; d: string; fill?: string; stroke?: string }
  | { kind: 'text'; x: number; y: number; text: string; size: number; bold?: boolean; anchor: Anchor; fill: string; cls?: string; central?: boolean; fit?: number };

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
const CENTRAL = 0.35;
const HANGUL = /([ᄀ-ᇿ㄰-㆏가-힣]+)/;

export function checkText(text: string, where: string): void {
  if (/[\u0000-\u001f\u007f]/.test(text)) throw new Error(`${where}: contains a control character or a line break`);
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const space = (s: string) => (/ {2}|^ | $/.test(s) ? ' xml:space="preserve"' : '');
const fill = (name: string) => `style="fill:var(--${name})"`;
const stroke = (name: string) => `style="stroke:var(--${name});stroke-width:var(--diagram-stroke)"`;

export function fitSize(shape: { text: string; size: number; fit?: number }): number {
  const natural = shape.text.length * ADVANCE * shape.size;
  if (!shape.fit || natural <= shape.fit) return shape.size;
  return Math.round((shape.fit / (shape.text.length * ADVANCE)) * 100) / 100;
}

export function toWebInline(scene: Scene, svgClass: string): string {
  const body = scene.shapes.map((s) => {
    switch (s.kind) {
      case 'rect': return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" ${fill(s.fill)}/>`;
      case 'line': return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" ${stroke(s.stroke)}/>`;
      case 'path': return s.fill ? `<path d="${s.d}" ${fill(s.fill)}/>` : `<path d="${s.d}" fill="none" ${stroke(s.stroke ?? '')}/>`;
      case 'text': return `<text x="${s.x}" y="${s.y}" font-size="${s.size}"${s.bold ? ' font-weight="700"' : ''} text-anchor="${s.anchor}"${space(s.text)} ${fill(s.fill)}>${esc(s.text)}</text>`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${svgClass}" viewBox="0 0 ${scene.width} ${scene.height}" font-family="${scene.font}, monospace" role="img" aria-label="${esc(scene.label)}">\n  ${body.join('\n  ')}\n</svg>`;
}

export function toWebClass(scene: Scene, style: string): string {
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scene.width} ${scene.height}"><style>${style}</style>`];
  for (const s of scene.shapes) {
    if (s.kind === 'rect') parts.push(`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" class="${s.cls}"/>`);
    if (s.kind === 'text') {
      const squeeze = s.fit ? ` textLength="${s.fit}" lengthAdjust="spacingAndGlyphs"` : '';
      parts.push(`<text x="${s.x}" y="${s.y}" class="st ${s.cls}" font-size="${s.size}"${squeeze}>${esc(s.text)}</text>`);
    }
  }
  parts.push('</svg>');
  return parts.join('');
}

export function toStatic(scene: Scene, tokens: Tokens, theme: string, options: StaticOptions = {}): string {
  const scale = options.scale ?? 1;
  const unit = options.unit ?? 'px';
  const paint = (name: string) => color(tokens, theme, name);
  const width = tokens.stroke;
  const family = (name: string) => tokens.fonts[name] ?? name;
  const pad = scene.frame ?? 0;
  const [vx, vy, vw, vh] = [-pad, -pad, scene.width + 2 * pad, scene.height + 2 * pad];
  const out: string[] = [];
  if (pad) out.push(`<rect x="${vx + 0.5}" y="${vy + 0.5}" width="${vw - 1}" height="${vh - 1}" rx="10" fill="${paint('code-bg')}" stroke="${paint('code-border')}" stroke-width="1"/>`);
  for (const s of scene.shapes) {
    switch (s.kind) {
      case 'rect':
        out.push(`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${paint(s.fill)}"${s.stroke ? ` stroke="${paint(s.stroke)}" stroke-width="1"` : ''}/>`);
        break;
      case 'line':
        out.push(`<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${paint(s.stroke)}" stroke-width="${width}"/>`);
        break;
      case 'path':
        out.push(s.fill ? `<path d="${s.d}" fill="${paint(s.fill)}"/>` : `<path d="${s.d}" fill="none" stroke="${paint(s.stroke ?? '')}" stroke-width="${width}"/>`);
        break;
      case 'text': {
        const size = fitSize(s);
        const y = s.central ? Math.round((s.y + CENTRAL * size) * 100) / 100 : s.y;
        const runs = s.text.split(HANGUL).filter(Boolean);
        const body = runs.length > 1 || HANGUL.test(s.text)
          ? runs.map((run) => `<tspan font-family="${family(HANGUL.test(run) ? 'hangul-sans' : scene.font)}">${esc(run)}</tspan>`).join('')
          : esc(s.text);
        out.push(`<text x="${s.x}" y="${y}" font-family="${family(scene.font)}" font-size="${size}"${s.bold ? ' font-weight="700"' : ''} text-anchor="${s.anchor}" fill="${paint(s.fill)}"${space(s.text)}>${body}</text>`);
        break;
      }
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
