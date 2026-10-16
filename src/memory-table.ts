import { checkText, FONT, round, textWidth, tighten, type ProfileName, type Scene, type Shape } from './scene.ts';
import type { Paint } from './tokens.ts';

export type Field = [string, number] | { pad: number } | { other: string; size: number };

export interface MemoryTable {
  id?: string;
  label: string;
  unit: 'byte' | 'bit';
  cols?: number;
  order?: 'asc' | 'desc';
  base?: string;
  fields: Field[];
}

export type Kind = 'field' | 'pad' | 'other' | 'gap';

export interface Cell {
  text: string;
  span: number;
  kind: Kind;
}

export interface Grid {
  label: string;
  headers: string[];
  rows: Array<{ offset?: string; cells: Cell[] }>;
  end?: string;
}

export interface Profile {
  row: number;
  sub: number;
  header: number;
  word: number;
  stack: number;
  frame: number;
}

export const PROFILES: Record<ProfileName, Profile> = {
  blog: { row: 68, sub: 12, header: 12, word: 15, stack: 12, frame: 24 },
  slide: { row: 64, sub: 12, header: 12, word: 15, stack: 12, frame: 12 },
};

const WIDTH = 700, MARGIN = 16, TOP = 44, TICK = 12, GAP = 14, SIZE = 15, OFFSET = 14, RULER = 24, RULER_ROOM = 4;
const KEYS = new Set(['id', 'label', 'unit', 'cols', 'order', 'base', 'fields']);
const HEX = /^0x[0-9a-f]+$/i;
const SPACE = 1n << 64n;

const offsetLabel = (n: bigint) => `0x${n.toString(16).padStart(2, '0')}`;

// A field that fills more than FOLD whole rows keeps its first and last rows, and
// one ⋮ row stands for the rows between; the offsets still count every unit.
const FOLD = 4;

// Identical whole rows are kept as one run with a count, so a huge field costs no more than a small one.
interface Run { first: number; count: number; cells: Cell[] }

function field(value: unknown, i: number): [string, number, Kind] {
  const where = `fields[${i}]`;
  const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).sort().join(',') : '';
  let text: unknown, size: unknown, kind: Kind;
  if (Array.isArray(value) && value.length === 2) [text, size, kind] = [value[0], value[1], 'field'];
  else if (keys === 'pad') [text, size, kind] = ['pad', (value as { pad: number }).pad, 'pad'];
  else if (keys === 'other,size') [text, size, kind] = [(value as { other: string }).other, (value as { size: number }).size, 'other'];
  else throw new Error(`${where}: expected ["name", size], {"pad": n} or {"other": "text", "size": n}`);
  if (typeof text !== 'string' || !text.trim()) throw new Error(`${where}: the name must be a non-empty string`);
  if (!Number.isSafeInteger(size) || (size as number) < 1) throw new Error(`${where}: the size must be a positive integer below 2^53`);
  checkText(text, where);
  return [text.trim(), size as number, kind];
}

export function grid(spec: MemoryTable): Grid {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('the spec must be a JSON object');
  for (const key of Object.keys(spec)) if (!KEYS.has(key)) throw new Error(`unknown field "${key}"`);
  if (typeof spec.label !== 'string' || !spec.label.trim()) throw new Error('label: required');
  checkText(spec.label, 'label');
  if (spec.unit !== 'byte' && spec.unit !== 'bit') throw new Error('unit: must be "byte" or "bit"');
  if (spec.order !== undefined && spec.order !== 'asc' && spec.order !== 'desc') throw new Error('order: must be "asc" or "desc"');
  if (!Array.isArray(spec.fields) || !spec.fields.length) throw new Error('fields: required');
  const bytes = spec.unit === 'byte';
  const cols = spec.cols ?? (bytes ? 8 : 32);
  if (!Number.isInteger(cols) || cols < 1 || cols > 64) throw new Error('cols: must be an integer from 1 to 64');
  if (spec.base !== undefined && (typeof spec.base !== 'string' || !HEX.test(spec.base) || BigInt(spec.base) >= SPACE)) throw new Error(`base: "${spec.base}" is not a 64-bit hex address such as 0x1000`);
  const base = BigInt(spec.base ?? 0);
  const desc = spec.order === 'desc';
  const numbers = Array.from({ length: cols }, (_, i) => (desc ? cols - 1 - i : i));
  const whole = (run: Run) => run.cells.length === 1 && run.cells[0].span === cols;
  const runs: Run[] = [];
  let rows = 0, used = 0, total = 0;
  let cells: Cell[] = [];
  const close = (count: number, list: Cell[]) => {
    const run = { first: rows, count, cells: desc ? list.reverse() : list };
    const last = runs.at(-1);
    if (last && whole(last) && whole(run) && last.cells[0].text === run.cells[0].text && last.cells[0].kind === run.cells[0].kind) last.count += count;
    else runs.push(run);
    rows += count;
  };
  spec.fields.forEach((value, i) => {
    const [text, size, kind] = field(value, i);
    if (size > Number.MAX_SAFE_INTEGER - total) throw new Error(`fields[${i}]: the sizes add up past 2^53`);
    total += size;
    let left = size;
    if (used > 0) {
      const span = Math.min(left, cols - used);
      cells.push({ text, span, kind });
      used += span;
      left -= span;
      if (used < cols) return;
      close(1, cells);
      cells = [];
      used = 0;
    }
    const count = Math.floor(left / cols);
    if (count) close(count, [{ text, span: cols, kind }]);
    left -= count * cols;
    if (left) [cells, used] = [[{ text, span: left, kind }], left];
  });
  if (used > 0) throw new Error(`fields end ${used} ${spec.unit}s into the last row; add {"pad": ${cols - used}}`);
  if (bytes && base + BigInt(rows) * BigInt(cols) > SPACE) throw new Error('fields: the table runs past the 64-bit address space');
  const offset = (row: number) => (bytes ? offsetLabel(base + BigInt(row) * BigInt(cols)) : undefined);
  const row = (at: number, list: Cell[]) => ({ offset: offset(at), cells: list.map((c) => ({ ...c })) });
  return {
    label: spec.label.trim(),
    headers: numbers.map((n) => (bytes ? `+${n}` : String(n))),
    rows: runs.flatMap(({ first, count, cells: list }) => (count > FOLD
      ? [row(first, list), { offset: offset(first + 1), cells: [{ text: '⋮', span: cols, kind: 'gap' as const }] }, row(first + count - 1, list)]
      : Array.from({ length: count }, (_, k) => row(first + k, list)))),
    end: offset(rows),
  };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };

function decode(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]+));/gi, (match, dec?: string, hex?: string, entity?: string) => {
    if (entity) return Object.hasOwn(ENTITIES, entity) ? ENTITIES[entity] : match;
    const code = dec ? Number(dec) : parseInt(hex!, 16);
    return code <= 0x10ffff ? String.fromCodePoint(code) : match;
  }).trim();
}

export function parseTable(html: string): Grid {
  const open = /^<table\b([^>]*)>/i.exec(html)?.[1] ?? '';
  const named = /\baria-label=(?:"([^"]*)"|'([^']*)')/i.exec(open);
  const label = decode(named ? named[1] ?? named[2] : /<caption\b[^>]*>([\s\S]*?)<\/caption>/i.exec(html)?.[1] ?? '');
  if (!label) throw new Error('a mem-layout table needs an aria-label or a <caption> that names it');
  checkText(label, 'label');
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi)].map(([, tag, attrs, body]) => ({
      tag: tag.toLowerCase(),
      cls: /\bclass="([^"]*)"/i.exec(attrs)?.[1] ?? '',
      span: Number(/\bcolspan="(\d+)"/i.exec(attrs)?.[1] ?? 1),
      text: decode(body),
    })));
  if (rows.length < 2 || rows[0].some((c) => c.tag !== 'th')) throw new Error('a mem-layout table needs a header row of <th> and at least one data row');
  const withOffset = rows[0][0].text === 'Offset';
  const headers = rows[0].slice(withOffset ? 1 : 0).map((c) => c.text);
  headers.forEach((h, i) => checkText(h, `header ${i + 1}`));
  const out: Grid['rows'] = rows.slice(1).map((row, r) => {
    const offset = withOffset ? row[0]?.text : undefined;
    if (offset !== undefined) checkText(offset, `row ${r + 1} offset`);
    const cells = row.slice(withOffset ? 1 : 0).map((c) => {
      const kind: Kind = /\bfield\b/.test(c.cls) ? 'field' : /\bpad\b/.test(c.cls) ? 'pad' : /\bgap\b/.test(c.cls) ? 'gap' : 'other';
      checkText(c.text, `row ${r + 1}`);
      return { text: c.text, span: c.span, kind };
    });
    const span = cells.reduce((sum, c) => sum + c.span, 0);
    if (span !== headers.length) throw new Error(`row ${r + 1} spans ${span} columns, the header has ${headers.length}`);
    return { offset, cells };
  });
  const last = out.at(-1)?.offset;
  const end = last !== undefined && HEX.test(last) ? offsetLabel(BigInt(last) + BigInt(headers.length)) : undefined;
  return { label, headers, rows: out, end };
}

interface Placed { lines: Array<{ text: string; size: number; bold: boolean; fill: Paint; dy: number }>; height: number }

function place(cell: Cell, w: number, p: Profile): Placed {
  const stack = (text: string, bold: boolean, fill: Paint): Placed => {
    const chars = [...text.replace(/\s+/g, '')];
    const step = p.stack + 2;
    const top = -((chars.length - 1) * step) / 2 + p.stack * 0.35;
    return { lines: chars.map((ch, i) => ({ text: ch, size: p.stack, bold, fill, dy: top + i * step })), height: chars.length * step + 16 };
  };
  if (cell.kind === 'gap') return { lines: [{ text: '⋮', size: 26, bold: true, fill: 'text-secondary', dy: 10 }], height: 0 };
  if (cell.kind === 'pad') {
    return textWidth(cell.text, p.sub) <= w - 6 ? { lines: [{ text: cell.text, size: p.sub, bold: false, fill: 'text-secondary', dy: 4 }], height: 0 } : { lines: [], height: 0 };
  }
  if (cell.kind === 'other') {
    if (textWidth(cell.text, p.word) <= w - 12) return { lines: [{ text: cell.text, size: p.word, bold: false, fill: 'diagram-ink', dy: 5 }], height: 0 };
    return stack(cell.text, false, 'diagram-ink');
  }
  const match = /^(.*?)\s*(\([^()]*\))$/.exec(cell.text);
  const [name, type] = match && match[1] ? [match[1], match[2]] : [cell.text, ''];
  if (textWidth(name, SIZE) <= w - 12 && (!type || textWidth(type, p.sub) <= w - 8)) {
    return type
      ? { lines: [{ text: name, size: SIZE, bold: true, fill: 'diagram-ink', dy: -6 }, { text: type, size: p.sub, bold: false, fill: 'text-secondary', dy: 15 }], height: 0 }
      : { lines: [{ text: name, size: SIZE, bold: true, fill: 'diagram-ink', dy: 5 }], height: 0 };
  }
  if (textWidth(cell.text, p.stack) <= w - 6) return { lines: [{ text: cell.text, size: p.stack, bold: true, fill: 'diagram-ink', dy: 4 }], height: 0 };
  return stack(cell.text, true, 'diagram-ink');
}

export function layout(g: Grid, p: Profile = PROFILES.blog): Scene {
  const cols = g.headers.length;
  const offsets = g.rows.some((r) => r.offset !== undefined);
  const labels = [...g.rows.map((r) => r.offset ?? ''), g.end ?? ''];
  const left = offsets ? Math.ceil(MARGIN + Math.max(...labels.map((l) => textWidth(l, OFFSET))) + GAP) : MARGIN;
  const right = WIDTH - MARGIN;
  const unit = (right - left) / cols;
  const number = g.headers.reduce((a, b) => (textWidth(b, p.header) >= textWidth(a, p.header) ? b : a), '');
  if (textWidth(number, p.header) + RULER_ROOM > unit) throw new Error(`the ${cols} columns are ${round(Math.max(0, unit))} units wide, too narrow for the column number "${number}"; use fewer columns`);
  const placed = g.rows.map((row) => {
    let x = left;
    return row.cells.map((cell) => {
      const w = cell.span * unit;
      const item = { cell, x: round(x), w: round(w), placed: place(cell, w, p) };
      x += w;
      return item;
    });
  });
  const heights = placed.map((cells) => Math.max(p.row, ...cells.map((c) => c.placed.height)));
  const shapes: Shape[] = [];
  const text = (x: number, y: number, body: string, size: number, bold: boolean, anchor: 'start' | 'middle' | 'end', fill: Paint) =>
    shapes.push({ kind: 'text', x, y, text: body, size, bold, anchor, fill });

  g.headers.forEach((h, i) => text(round(left + (i + 0.5) * unit), round(TOP - RULER / 2 + p.header * 0.35), h, p.header, false, 'middle', 'text-secondary'));
  for (let i = 1; i < cols; ++i) shapes.push({ kind: 'line', x1: round(left + i * unit), y1: TOP - RULER, x2: round(left + i * unit), y2: TOP, stroke: 'diagram-ink' });
  shapes.push({ kind: 'path', d: `M ${left} ${TOP} V ${TOP - RULER} H ${round(right)} V ${TOP}`, stroke: 'diagram-ink', weight: 'border' });
  let y = TOP;
  const tops = heights.map((h) => { const top = y; y = round(y + h); return top; });
  const bottom = y;
  placed.forEach((cells, r) => cells.forEach((c) => shapes.push({ kind: 'rect', x: c.x, y: tops[r], w: c.w, h: heights[r], fill: c.cell.kind === 'pad' || c.cell.kind === 'gap' ? 'diagram-gap' : 'diagram-area' })));
  shapes.push({ kind: 'outline', x: left, y: TOP, w: round(right - left), h: round(bottom - TOP), stroke: 'diagram-ink' });
  tops.slice(1).forEach((top) => shapes.push({ kind: 'line', x1: left, y1: top, x2: right, y2: top, stroke: 'diagram-ink' }));
  placed.forEach((cells, r) => cells.slice(1).forEach((c) => shapes.push({ kind: 'line', x1: c.x, y1: tops[r], x2: c.x, y2: round(tops[r] + heights[r]), stroke: 'diagram-ink' })));
  if (offsets) {
    [...tops, bottom].forEach((at, i) => {
      if (!labels[i]) return;
      shapes.push({ kind: 'line', x1: left - TICK, y1: at, x2: left, y2: at, stroke: 'diagram-ink' });
      text(left - GAP, round(at + 5), labels[i], OFFSET, false, 'end', 'diagram-ink');
    });
  }
  placed.forEach((cells, r) => cells.forEach((c) => {
    const center = tops[r] + heights[r] / 2;
    for (const line of c.placed.lines) text(round(c.x + c.w / 2), round(center + line.dy), line.text, line.size, line.bold, 'middle', line.fill);
  }));
  return tighten({ width: WIDTH, height: round(bottom + (offsets ? 20 : 16)), label: g.label, font: FONT, shapes, frame: p.frame }, MARGIN);
}
