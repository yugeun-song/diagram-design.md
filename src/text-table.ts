import { checkText, FONT, LABEL, LINE_STEP, round, textWidth, tighten, type ProfileName, type Scene, type Shape } from './scene.ts';

export type Cell = string | string[];

export interface TextTable {
  id?: string;
  label: string;
  columns: string[];
  widths?: number[];
  rows: Cell[][];
}

export interface Profile { frame: number }

export const PROFILES: Record<ProfileName, Profile> = {
  blog: { frame: 24 },
  slide: { frame: 12 },
};

const WIDTH = 700, MARGIN = 16, TOP = 16, PAD_X = 12, PAD_Y = 12, CAP = 0.35, MAX_COLUMNS = 8, WIDEN = 2, BREAK = 0.5;
const KEYS = new Set(['id', 'label', 'columns', 'widths', 'rows']);
const TABLE = WIDTH - 2 * MARGIN;

export const isTextTable = (spec: unknown): spec is TextTable => !!spec && typeof spec === 'object' && Object.hasOwn(spec, 'columns');

function cell(value: unknown, where: string): string[] {
  const lines = Array.isArray(value) ? value : [value];
  if (lines.some((line) => typeof line !== 'string')) throw new Error(`${where}: must be a string or a list of strings`);
  if (Array.isArray(value) && !value.length) throw new Error(`${where}: a list needs at least one line; use "" for an empty cell`);
  lines.forEach((line, j) => checkText(line as string, Array.isArray(value) ? `${where}[${j}]` : where));
  return (lines as string[]).map((line) => line.trim());
}

function validate(spec: TextTable): string[][][] {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('the spec must be a JSON object');
  for (const key of Object.keys(spec)) if (!KEYS.has(key)) throw new Error(`unknown field "${key}"`);
  if (typeof spec.label !== 'string' || !spec.label.trim()) throw new Error('label: required');
  checkText(spec.label, 'label');
  const { columns, rows, widths } = spec;
  if (!Array.isArray(columns) || !columns.length || columns.length > MAX_COLUMNS) throw new Error(`columns: must list 1 to ${MAX_COLUMNS} headers`);
  columns.forEach((header, i) => {
    if (typeof header !== 'string' || !header.trim()) throw new Error(`columns[${i}]: must be a non-empty string`);
    checkText(header, `columns[${i}]`);
  });
  if (widths !== undefined && (!Array.isArray(widths) || widths.length !== columns.length || widths.some((w) => typeof w !== 'number' || !Number.isFinite(w) || w <= 0))) {
    throw new Error(`widths: must list one positive number per column (${columns.length})`);
  }
  if (!Array.isArray(rows) || !rows.length) throw new Error('rows: required');
  return [columns.map((header) => [header.trim()]), ...rows.map((row, r) => {
    if (!Array.isArray(row)) throw new Error(`rows[${r}]: must be a list of cells`);
    if (row.length !== columns.length) throw new Error(`rows[${r}]: has ${row.length} cells, the columns are ${columns.length}`);
    return row.map((value, c) => cell(value, `rows[${r}][${c}]`));
  })];
}

const words = (line: string) => line.split(/\s+/).filter(Boolean);

// Before ( rather than after it, so a parenthesis stays with what it encloses.
const SOFT = /(?<=[-/·_.,])|(?=\()/u;
const segments = (word: string) => word.split(SOFT).filter(Boolean);

function pack(pieces: string[], room: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const piece of pieces) {
    if (line && textWidth(line + piece, LABEL) > room) {
      out.push(line);
      line = piece;
    } else {
      line += piece;
    }
  }
  return line ? [...out, line] : out;
}

const breakWord = (word: string, room: number) =>
  pack(segments(word).flatMap((segment) => (textWidth(segment, LABEL) > room ? pack([...segment], room) : [segment])), room);

// Lines break at spaces, as the blog keeps Korean words whole; only a word wider than the column breaks inside.
function wrap(line: string, room: number): { lines: string[]; breaks: number } {
  const out: string[] = [];
  let current = '', breaks = 0;
  for (const word of words(line)) {
    if (textWidth(word, LABEL) > room) {
      if (current) out.push(current);
      const pieces = breakWord(word, room);
      out.push(...pieces.slice(0, -1));
      current = pieces.at(-1)!;
      breaks += pieces.length - 1;
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (current && textWidth(next, LABEL) > room) {
      out.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  return { lines: current ? [...out, current] : out, breaks };
}

const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);

// Whole units that add up to the total, the spare units going to the largest remainders.
function apportion(shares: number[], total: number): number[] {
  const exact = shares.map((s) => (s / sum(shares)) * total);
  const out = exact.map(Math.floor);
  const order = exact.map((e, i) => [e - Math.floor(e), i]).sort((a, b) => b[0] - a[0]);
  const short = total - sum(out);
  for (let k = 0; k < short; ++k) out[order[k][1]] += 1;
  return out;
}

interface Fit { lines: number; breaks: number }

const fits = (table: string[][][], c: number, width: number): Fit[] => table.map((row) => row[c].reduce((fit, line) => {
  if (!line) return fit;
  const wrapped = wrap(line, width - 2 * PAD_X);
  return { lines: fit.lines + wrapped.lines.length, breaks: fit.breaks + wrapped.breaks };
}, { lines: 0, breaks: 0 }));

// A row is as tall as its tallest cell; a word split across lines costs part of a line.
const cost = (perColumn: Fit[][]) =>
  sum(perColumn[0].map((_, r) => Math.max(1, ...perColumn.map((col) => col[r].lines)))) + BREAK * sum(perColumn.flatMap((col) => col.map((f) => f.breaks)));

function columnWidths(table: string[][][], widths: number[] | undefined): number[] {
  if (widths) return apportion(widths, TABLE);
  const cols = table[0].length;
  const least = Array.from({ length: cols }, (_, c) => Math.ceil(Math.max(...table.flatMap((row) => row[c].flatMap(words).flatMap(segments).map((w) => textWidth(w, LABEL)))) + 2 * PAD_X));
  const most = Array.from({ length: cols }, (_, c) => Math.ceil(Math.max(...table.map((row) => Math.max(0, ...row[c].map((line) => textWidth(line, LABEL))))) + 2 * PAD_X));
  if (sum(most) <= TABLE) return most;
  if (sum(least) >= TABLE) return apportion(least, TABLE);
  // From the narrowest widths, each step widens the column that saves the most per unit.
  const out = [...least];
  const perColumn = out.map((w, c) => fits(table, c, w));
  let current = cost(perColumn);
  for (;;) {
    const spare = TABLE - sum(out);
    let best: { c: number; d: number; cost: number; column: Fit[] } | null = null;
    for (let c = 0; c < cols; ++c) {
      for (let d = WIDEN; d <= spare && out[c] + d <= most[c] + WIDEN; d += WIDEN) {
        const column = fits(table, c, out[c] + d);
        const next = cost(perColumn.map((col, k) => (k === c ? column : col)));
        if (next >= current) continue;
        if (!best || (current - next) / d > (current - best.cost) / best.d) best = { c, d, cost: next, column };
        break;
      }
    }
    if (!best) break;
    out[best.c] += best.d;
    perColumn[best.c] = best.column;
    current = best.cost;
  }
  // The units that no longer save a line go to the columns that still wrap, so their lines run longer.
  const rest = TABLE - sum(out);
  const wraps = out.map((w, c) => Math.max(0, most[c] - w));
  if (rest > 0 && sum(wraps) > 0) apportion(wraps, rest).forEach((extra, c) => { out[c] += extra; });
  return out;
}

export function layout(spec: TextTable, p: Profile = PROFILES.blog): Scene {
  const table = validate(spec);
  const widths = columnWidths(table, spec.widths);
  const room = widths.map((w) => w - 2 * PAD_X);
  if (room.some((r) => r < LABEL)) throw new Error(`a column ${Math.min(...widths)} units wide cannot hold a character; widen it or use fewer columns`);
  const xs = widths.reduce<number[]>((acc, w) => [...acc, acc.at(-1)! + w], [MARGIN]);
  const lines = table.map((row) => row.map((value, c) => value.flatMap((line) => (line ? wrap(line, room[c]).lines : []))));
  const heights = lines.map((row) => (Math.max(1, ...row.map((l) => l.length)) - 1) * LINE_STEP + LABEL + 2 * PAD_Y);
  const tops = heights.reduce<number[]>((acc, h) => [...acc, acc.at(-1)! + h], [TOP]);
  const left = xs[0], right = xs.at(-1)!, bottom = tops.at(-1)!;
  const shapes: Shape[] = [
    { kind: 'rect', x: left, y: TOP, w: right - left, h: heights[0], fill: 'diagram-area' },
    { kind: 'rect', x: left, y: tops[1], w: right - left, h: bottom - tops[1], fill: 'diagram-gap' },
    { kind: 'outline', x: left, y: TOP, w: right - left, h: bottom - TOP, stroke: 'diagram-ink' },
  ];
  for (const y of tops.slice(1, -1)) shapes.push({ kind: 'line', x1: left, y1: y, x2: right, y2: y, stroke: 'diagram-ink' });
  for (const x of xs.slice(1, -1)) shapes.push({ kind: 'line', x1: x, y1: TOP, x2: x, y2: bottom, stroke: 'diagram-ink' });
  lines.forEach((row, r) => row.forEach((block, c) => {
    const center = tops[r] + heights[r] / 2;
    block.forEach((text, j) => shapes.push({
      kind: 'text', x: xs[c] + PAD_X, y: round(center + (j - (block.length - 1) / 2) * LINE_STEP + CAP * LABEL),
      text, size: LABEL, bold: true, anchor: 'start', fill: 'diagram-ink',
    }));
  }));
  return tighten({ width: WIDTH, height: bottom + MARGIN, label: spec.label.trim(), font: FONT, shapes, frame: p.frame }, MARGIN);
}
