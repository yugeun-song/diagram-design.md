import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as memoryLayout from './src/memory-layout.ts';
import * as memoryTable from './src/memory-table.ts';
import { lintMermaid } from './src/mermaid.ts';
import { compose, mermaidPNGs, staticPNGs } from './src/png.ts';
import { lintStatic, toStatic, toWeb, type ProfileName, type Scene } from './src/scene.ts';
import { loadTokens, readBlogTokens, TOKENS_FILE, type Tokens } from './src/tokens.ts';

const USAGE = `usage:
  node dg.ts render <spec.json> [--flavor static [--profile blog|slide] [--theme T]]
  node dg.ts slide <spec.json|diagram.mmd> [--theme T,T] [--out DIR] [--blog DIR]
  node dg.ts mockup <form-dir> [--blog DIR]
  node dg.ts tokens [--blog DIR] [--check]
  node dg.ts check <file>...`;

const SLIDE = { width: 880, height: 460, main: 18, minor: 14, max: 24 };
const ID = /^[a-z0-9][a-z0-9-]*$/;

type Spec = memoryLayout.MemoryLayout | memoryTable.MemoryTable;
interface Item { id: string; spec?: Spec; mermaid?: string }

class UsageError extends Error {}

const options = {
  flavor: { type: 'string' },
  profile: { type: 'string' },
  theme: { type: 'string' },
  out: { type: 'string', default: 'out' },
  blog: { type: 'string', default: process.env.BLOG_DIR ?? fileURLToPath(new URL('../blog', import.meta.url)) },
  check: { type: 'boolean', default: false },
} as const;

let values: ReturnType<typeof parseArgs<{ options: typeof options; allowPositionals: true }>>['values'];

function load(file: string): Item[] {
  const name = basename(file, extname(file));
  const text = readFileSync(file, 'utf8');
  let items: Item[];
  if (extname(file) === '.mmd') {
    items = [{ id: /%%\s*id:\s*(\S+)/.exec(text)?.[1] ?? name, mermaid: text }];
  } else {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch (error: any) { throw new Error(`${file}: ${error.message}`); }
    const specs = (Array.isArray(parsed) ? parsed : [parsed]) as Spec[];
    items = specs.map((spec, i) => ({ id: spec?.id ?? (specs.length > 1 ? `${name}-${i + 1}` : name), spec }));
  }
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item.id !== 'string' || !ID.test(item.id)) throw new Error(`${file}: id "${item.id}" must be kebab-case, such as frame-chain`);
    if (seen.has(item.id)) throw new Error(`${file}: id "${item.id}" is used twice`);
    seen.add(item.id);
  }
  return items;
}

const isLayout = (spec: Spec): spec is memoryLayout.MemoryLayout => !!spec && typeof spec === 'object' && 'regions' in spec;

const isProfile = (value: string): value is ProfileName => Object.hasOwn(memoryLayout.PROFILES, value);

function scene(spec: Spec, profile: ProfileName): Scene {
  if (isLayout(spec)) return memoryLayout.layout(spec, memoryLayout.PROFILES[profile]);
  return memoryTable.layout(memoryTable.grid(spec), spec?.label ?? spec?.id ?? '', memoryTable.PROFILES[profile]);
}

function themes(tokens: Tokens, list: string): string[] {
  const names = list.split(',');
  for (const name of names) if (!Object.hasOwn(tokens.themes, name)) throw new UsageError(`unknown theme ${name}; use ${Object.keys(tokens.themes).join(', ')}`);
  return names;
}

function fit(s: Scene): { scale: number; problems: string[] } {
  const pad = s.frame ?? 0;
  const width = s.width + 2 * pad, height = s.height + 2 * pad;
  const scale = Math.min(SLIDE.width / width, SLIDE.height / height, SLIDE.max / 15);
  const problems: string[] = [];
  for (const t of s.shapes) {
    if (t.kind !== 'text') continue;
    const pt = t.size * scale;
    const floor = t.size >= 15 ? SLIDE.main : SLIDE.minor;
    if (pt < floor - 0.05) problems.push(`"${t.text}" would be ${pt.toFixed(1)}pt, under ${floor}pt`);
  }
  return { scale, problems };
}

async function slide(file: string): Promise<void> {
  const tokens = loadTokens();
  const names = themes(tokens, values.theme ?? 'clean-light,spaceduck');
  const out = resolve(values.out!);
  let failed = false;
  for (const item of load(file)) {
    if (item.mermaid) {
      const lint = lintMermaid(item.mermaid);
      if (lint.length) throw new Error(`${file}:\n  ${lint.join('\n  ')}`);
      const shots = (await mermaidPNGs(values.blog!, [item.mermaid], names))[0];
      mkdirSync(out, { recursive: true });
      for (const shot of shots) {
        writeFileSync(join(out, `${item.id}.${shot.theme}.png`), shot.png);
        const scale = Math.min(SLIDE.width / shot.width, SLIDE.height / shot.height, SLIDE.max / shot.nodeFont);
        const node = shot.nodeFont * scale, edge = shot.edgeFont * scale;
        const ok = node >= SLIDE.main - 0.05 && (!shot.edgeFont || edge >= SLIDE.minor - 0.05);
        console.log(`${item.id}.${shot.theme}.png  ${Math.round(shot.width * scale)}x${Math.round(shot.height * scale)}pt  labels ${node.toFixed(1)}/${edge.toFixed(1)}pt${ok ? '' : `  too small: needs ${(SLIDE.main / shot.nodeFont).toFixed(2)}x, fits ${scale.toFixed(2)}x; write a shorter ${item.id}.slide.mmd`}`);
        failed ||= !ok;
      }
      continue;
    }
    const s = scene(item.spec!, 'slide');
    const { scale, problems } = fit(s);
    if (problems.length) {
      console.error(`${item.id}: does not fit a 16:9 slide at ${scale.toFixed(2)}x\n  ${problems.slice(0, 5).join('\n  ')}`);
      failed = true;
      continue;
    }
    const svgs = names.map((theme) => toStatic(s, tokens, theme, { scale, unit: 'pt' }));
    for (const svg of svgs) {
      const lint = lintStatic(svg);
      if (lint.length) throw new Error(`${item.id}: ${lint.join(', ')}`);
    }
    const pngs = await staticPNGs(svgs, values.blog!, tokens);
    mkdirSync(out, { recursive: true });
    names.forEach((theme, i) => {
      writeFileSync(join(out, `${item.id}.${theme}.svg`), svgs[i]);
      writeFileSync(join(out, `${item.id}.${theme}.png`), pngs[i]);
      console.log(`${item.id}.${theme}.svg/.png  ${Math.round((s.width + 2 * (s.frame ?? 0)) * scale)}x${Math.round((s.height + 2 * (s.frame ?? 0)) * scale)}pt`);
    });
  }
  if (failed) process.exitCode = 1;
}

async function mockup(dir: string): Promise<void> {
  const tokens = loadTokens();
  const names = ['clean-light', 'spaceduck'];
  const example = ['example.json', 'example.mmd'].find((f) => existsSync(join(dir, f)));
  if (!example) throw new Error(`${dir}: no example.json or example.mmd`);
  const items = load(join(dir, example));
  let columns: Buffer[][];
  if (items[0].mermaid) {
    const shots = await mermaidPNGs(values.blog!, items.map((item) => item.mermaid!), names);
    columns = names.map((_, t) => shots.map((per) => per[t].png));
  } else {
    columns = [];
    for (const theme of names) columns.push(await staticPNGs(items.map((item) => toStatic(scene(item.spec!, 'blog'), tokens, theme)), values.blog!, tokens));
  }
  writeFileSync(join(dir, 'mockup.png'), await compose(columns, names.map((theme) => tokens.themes[theme]['bg-base'])));
  console.log(join(dir, 'mockup.png'));
}

function check(files: string[]): void {
  let failed = false;
  for (const file of files) {
    try {
      const warnings: string[] = [];
      for (const item of load(file)) {
        if (item.mermaid) {
          const problems = lintMermaid(item.mermaid);
          if (problems.length) throw new Error(problems.join('\n  '));
          continue;
        }
        scene(item.spec!, 'blog');
        try {
          const { scale, problems } = fit(scene(item.spec!, 'slide'));
          if (problems.length) warnings.push(`${item.id}: too dense for a slide at ${scale.toFixed(2)}x; ${problems[0]}`);
        } catch (error: any) {
          warnings.push(`${item.id}: ${error.message}`);
        }
      }
      console.log(`${file}: ok`);
      for (const warning of warnings) console.warn(`  slide warning: ${warning}`);
    } catch (error: any) {
      console.error(`${file}: ${error.message}`);
      failed = true;
    }
  }
  if (failed) process.exitCode = 1;
}

function tokensCommand(): void {
  const fresh = readBlogTokens(values.blog!);
  const text = JSON.stringify(fresh, null, 2) + '\n';
  if (values.check) {
    const current = existsSync(TOKENS_FILE) ? readFileSync(TOKENS_FILE, 'utf8') : '';
    if (current !== text) {
      console.error('tokens.json differs from the blog themes; run node dg.ts tokens');
      process.exitCode = 1;
    } else {
      console.log('tokens.json matches the blog themes');
    }
    return;
  }
  writeFileSync(TOKENS_FILE, text);
  console.log(`tokens.json: ${Object.keys(fresh.themes).join(', ')}`);
}

function render(file: string): void {
  const flavor = values.flavor ?? 'web';
  if (flavor !== 'web' && flavor !== 'static') throw new UsageError(`unknown flavor ${flavor}; use web or static`);
  if (flavor === 'web' && (values.profile || values.theme)) throw new UsageError('--profile and --theme apply to --flavor static');
  const profile = values.profile ?? 'blog';
  if (!isProfile(profile)) throw new UsageError(`unknown profile ${profile}; use blog or slide`);
  const tokens = loadTokens();
  const theme = flavor === 'static' ? themes(tokens, values.theme ?? 'clean-light')[0] : '';
  for (const item of load(file)) {
    if (!item.spec) throw new UsageError('render takes a .json spec; use slide for Mermaid');
    process.stdout.write((flavor === 'static' ? toStatic(scene(item.spec, profile), tokens, theme) : toWeb(scene(item.spec, 'blog'))) + '\n');
  }
}

process.stdout.on('error', (error: NodeJS.ErrnoException) => { if (error.code === 'EPIPE') process.exit(0); throw error; });
try {
  const parsed = parseArgs({ options, allowPositionals: true });
  values = parsed.values;
  const [command, ...args] = parsed.positionals;
  if (command === 'render' && args.length === 1) render(args[0]);
  else if (command === 'slide' && args.length === 1) await slide(args[0]);
  else if (command === 'mockup' && args.length === 1) await mockup(args[0]);
  else if (command === 'tokens' && !args.length) tokensCommand();
  else if (command === 'check' && args.length) check(args);
  else throw new UsageError('');
} catch (error: any) {
  const usage = error instanceof UsageError || String(error?.code ?? '').startsWith('ERR_PARSE_ARGS');
  if (error?.message) console.error(`dg: ${error.message}`);
  if (usage) console.error(USAGE);
  process.exitCode = usage ? 2 : 1;
}
