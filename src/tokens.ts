import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export type Theme = Record<string, string>;

export interface Tokens {
  stroke: number;
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
  const themes: Record<string, Theme> = {};
  const dir = join(blogDir, 'styles/themes');
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.css')).sort()) {
    const css = readFileSync(join(dir, file), 'utf8');
    for (const [, name, body] of css.matchAll(/\[data-theme="([^"]+)"\]\s*\{([^}]*)\}/g)) {
      const vars = new Map([...body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
      themes[name] = Object.fromEntries(VARS.map((v) => {
        const value = vars.get(v);
        if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${file}: --${v} must be a #rrggbb color, got ${value}`);
        return [v, value.toLowerCase()];
      }));
    }
  }
  const stroke = Number(/--diagram-stroke:\s*([\d.]+)/.exec(readFileSync(join(blogDir, 'styles/base.css'), 'utf8'))?.[1]);
  const aliases = /FAMILY_ALIASES = \{([^}]*)\}/.exec(readFileSync(join(blogDir, 'build/download-fonts.py'), 'utf8'))?.[1] ?? '';
  const fonts = Object.fromEntries([...aliases.matchAll(/"([^"]+)":\s*"([\w-]+)"/g)].map((m) => [m[2], m[1]]));
  if (!stroke || !fonts['code-mono']) throw new Error(`${blogDir}: cannot read the stroke width or the font aliases`);
  return { stroke, fonts, themes };
}

export function color(tokens: Tokens, theme: string, name: Paint): string {
  const value = tokens.themes[theme]?.[name];
  if (!value) throw new Error(`unknown theme or token: ${theme} --${name}`);
  return value;
}
