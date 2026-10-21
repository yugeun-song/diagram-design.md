import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export type Theme = Record<string, string>;

export interface Tokens {
  stroke: number;
  border: number;
  marker: number;
  fonts: Record<string, string>;
  themes: Record<string, Theme>;
}

export const VARS = ['bg-base', 'code-bg', 'code-border', 'diagram-ink', 'diagram-area', 'diagram-gap', 'diagram-red', 'diagram-orange', 'diagram-blue', 'diagram-purple', 'diagram-red-wash', 'diagram-orange-wash', 'diagram-blue-wash', 'diagram-purple-wash', 'text-secondary'] as const;
export type Paint = (typeof VARS)[number];

export const TOKENS_FILE = new URL('../tokens.json', import.meta.url);

export function loadTokens(): Tokens {
  return JSON.parse(readFileSync(TOKENS_FILE, 'utf8'));
}

export function readBlogTokens(blogDir: string): Tokens {
  const declared: Record<string, Map<string, string>> = {};
  const shared = new Map<string, string>();
  const dir = join(blogDir, 'styles/themes');
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.css')).sort()) {
    const css = readFileSync(join(dir, file), 'utf8');
    for (const [, selector, body] of css.matchAll(/(:root|\[data-theme="[^"]+"\])\s*\{([^}]*)\}/g)) {
      const vars = selector === ':root' ? shared : (declared[/"([^"]+)"/.exec(selector)![1]] ??= new Map());
      for (const m of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) vars.set(m[1], m[2].trim());
    }
  }
  const themes: Record<string, Theme> = {};
  for (const [name, own] of Object.entries(declared)) {
    const vars = new Map([...shared, ...own]);
    const resolve = (v: string, seen: string[]): string | undefined => {
      const ref = /^var\(--([\w-]+)\)$/.exec(vars.get(v) ?? '');
      if (!ref) return vars.get(v);
      if (seen.includes(ref[1])) throw new Error(`${name}: --${seen[0]} refers to itself through --${seen.join(', --')}`);
      return resolve(ref[1], [...seen, ref[1]]);
    };
    themes[name] = Object.fromEntries(VARS.map((v) => {
      const value = resolve(v, [v]);
      if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name}: --${v} must resolve to a #rrggbb color, got ${value}`);
      return [v, value.toLowerCase()];
    }));
  }
  const base = readFileSync(join(blogDir, 'styles/base.css'), 'utf8');
  const stroke = Number(/--diagram-stroke:\s*([\d.]+)/.exec(base)?.[1]);
  const border = Number(/--diagram-border:\s*([\d.]+)/.exec(base)?.[1]);
  const marker = Number(/--diagram-marker:\s*([\d.]+)/.exec(base)?.[1]);
  const aliases = /FAMILY_ALIASES = \{([^}]*)\}/.exec(readFileSync(join(blogDir, 'build/download-fonts.py'), 'utf8'))?.[1] ?? '';
  const fonts = Object.fromEntries([...aliases.matchAll(/"([^"]+)":\s*"([\w-]+)"/g)].map((m) => [m[2], m[1]]));
  if (!stroke || !border || !marker || !fonts['latin-sans']) throw new Error(`${blogDir}: cannot read the stroke and border widths or the font aliases`);
  return { stroke, border, marker, fonts, themes };
}

export function color(tokens: Tokens, theme: string, name: Paint): string {
  const value = tokens.themes[theme]?.[name];
  if (!value) throw new Error(`unknown theme or token: ${theme} --${name}`);
  return value;
}
