import { chevron, DIMENSION_MIN, DIMENSION_TIP, head, HEAD, POINTER_OVERLAP, TIP, triangle, type Toward } from './arrow.ts';
import { checkText, FONT, LABEL, LINE_STEP, round, textWidth, tighten, type Anchor, type ProfileName, type Scene, type Shape } from './scene.ts';
import { checkTone, paint, WASHES, type Tone } from './tone.ts';
import type { Paint } from './tokens.ts';

export type { Tone } from './tone.ts';

export type Fill = 'plain' | 'area' | 'gap' | Tone;
export type Stroke = 'solid' | 'dashed' | 'none';
export type Side = 'above' | 'below' | 'left' | 'right';
export type Point = [number, number] | string | { at: string; dx?: number; dy?: number };

export interface Field { label: string; id?: string; w?: number; fill?: Fill; line?: Stroke }
export interface Cell { w?: number; h?: number; label?: string | string[]; id?: string; fill?: Fill; line?: Stroke; fields?: Field[] }
export interface Box { box: string; x: number; y: number; w: number; h: number; label?: string | string[]; title?: string; fill?: Fill; line?: Stroke; fields?: Field[] }
export interface Row { row: string; x: number; y: number; h: number; cells: Cell[] }
export interface Column { column: string; x: number; y: number; w: number; cells: Cell[] }
export interface Text { text: string | string[]; x: number; y: number; anchor?: Anchor; role?: 'label' | 'note' | 'title'; tone?: Tone; id?: string }
export interface Arrow { arrow: Point[]; head?: 'end' | 'start' | 'both' | 'none'; dash?: boolean; tone?: Tone; label?: { text: string; segment?: number; side?: Side } }
export interface Line { line: Point[]; dash?: boolean; tone?: Tone; weight?: 'border' | 'marker' }
export interface Dimension { dimension: [Point, Point]; label?: string | string[]; side?: Side; tone?: Tone }
export type Item = Box | Row | Column | Text | Arrow | Line | Dimension;

export interface Canvas {
  id?: string;
  label: string;
  title?: string;
  items: Item[];
}

export interface Profile { frame: number }

export const PROFILES: Record<ProfileName, Profile> = {
  blog: { frame: 24 },
  slide: { frame: 12 },
};

interface Rect { x: number; y: number; w: number; h: number }
type XY = [number, number];

const PAD_X = 10, PAD_Y = 6, FIELD_H = 28, FIELD_GAP = 6, FIELD_PAD = 12, FIELD_MIN = 48, TITLE_BASE = 22, FIELDS_TOP = 34;
const RADIUS = 12, ARROW_SIZE = 14, LABEL_GAP = 6, DIM_SIZE = 14, DIM_GAP = 8;
const NOTE_SIZE = 13, TITLE_SIZE = 17, MARGIN = 8, TOP = 24, TITLE_ROOM = 34, FOOT = 20, CAP = 0.35, TEXT_GAP = 6;
const ID = /^[A-Za-z_][\w-]*$/;
const KINDS = ['box', 'row', 'column', 'text', 'arrow', 'line', 'dimension'] as const;
const KEYS: Record<(typeof KINDS)[number], Set<string>> = {
  box: new Set(['box', 'x', 'y', 'w', 'h', 'label', 'title', 'fill', 'line', 'fields']),
  row: new Set(['row', 'x', 'y', 'h', 'cells']),
  column: new Set(['column', 'x', 'y', 'w', 'cells']),
  text: new Set(['text', 'x', 'y', 'anchor', 'role', 'tone', 'id']),
  arrow: new Set(['arrow', 'head', 'dash', 'tone', 'label']),
  line: new Set(['line', 'dash', 'tone', 'weight']),
  dimension: new Set(['dimension', 'label', 'side', 'tone']),
};
const CELL_KEYS = new Set(['w', 'h', 'label', 'id', 'fill', 'line', 'fields']);
const FIELD_KEYS = new Set(['label', 'id', 'w', 'fill', 'line']);
const SPEC_KEYS = new Set(['id', 'label', 'title', 'items']);
const FILLS = new Set(['plain', 'area', 'gap', 'red', 'orange', 'blue', 'purple']);
const STROKES = new Set(['solid', 'dashed', 'none']);
const SIDES = new Set(['above', 'below', 'left', 'right']);

const kindOf = (item: Item) => KINDS.find((kind) => Object.hasOwn(item, kind))!;
const nameOf = (item: Item, i: number) => {
  const kind = kindOf(item);
  const id = kind === 'box' || kind === 'row' || kind === 'column' ? (item as unknown as Record<string, string>)[kind] : (item as Text).id;
  return `items[${i}]${typeof id === 'string' ? ` (${id})` : ''}`;
};
const linesOf = (label: string | string[] | undefined) => (label === undefined ? [] : Array.isArray(label) ? label : [label]);
const fillPaint = (fill: Fill | undefined): Paint => (fill === undefined || fill === 'plain' ? 'code-bg' : fill === 'area' ? 'diagram-area' : fill === 'gap' ? 'diagram-gap' : WASHES[fill]);

function number(value: unknown, where: string, positive = false): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${where}: must be a number`);
  if (positive && value <= 0) throw new Error(`${where}: must be positive`);
}

function label(value: unknown, where: string): void {
  if (value === undefined) return;
  const lines = Array.isArray(value) ? value : [value];
  if (!lines.length || lines.some((line) => typeof line !== 'string' || !line.trim())) throw new Error(`${where}: must be a non-empty string or a list of them`);
  lines.forEach((line, j) => checkText(line as string, Array.isArray(value) ? `${where}[${j}]` : where));
}

function choice(value: unknown, allowed: Set<string>, where: string): void {
  if (value !== undefined && (typeof value !== 'string' || !allowed.has(value))) throw new Error(`${where}: must be one of ${[...allowed].join(', ')}`);
}

function keys(value: unknown, allowed: Set<string>, where: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${where}: must be an object`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${where}: unknown field "${key}"`);
}

function point(value: unknown, where: string): void {
  if (Array.isArray(value)) {
    if (value.length !== 2) throw new Error(`${where}: a point is [x, y], a reference or {"at": reference, "dx", "dy"}`);
    value.forEach((n, j) => number(n, `${where}[${j}]`));
    return;
  }
  if (typeof value === 'string') return;
  keys(value, new Set(['at', 'dx', 'dy']), where);
  const p = value as { at: unknown; dx?: unknown; dy?: unknown };
  if (typeof p.at !== 'string') throw new Error(`${where}.at: must be a reference such as "box.right"`);
  if (p.dx !== undefined) number(p.dx, `${where}.dx`);
  if (p.dy !== undefined) number(p.dy, `${where}.dy`);
}

export function validate(spec: Canvas): void {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('the spec must be a JSON object');
  for (const key of Object.keys(spec)) if (!SPEC_KEYS.has(key)) throw new Error(`unknown field "${key}"`);
  if (typeof spec.label !== 'string' || !spec.label.trim()) throw new Error('label: required');
  checkText(spec.label, 'label');
  if (spec.title !== undefined && (typeof spec.title !== 'string' || !spec.title.trim())) throw new Error('title: must be a non-empty string');
  if (spec.title !== undefined) checkText(spec.title, 'title');
  if (!Array.isArray(spec.items) || !spec.items.length) throw new Error('items: required');
  const ids = new Set<string>();
  const claim = (id: unknown, where: string) => {
    if (typeof id !== 'string' || !ID.test(id)) throw new Error(`${where}: an id is a name such as pt_regs or call-frame`);
    if (ids.has(id)) throw new Error(`${where}: duplicate id "${id}"`);
    ids.add(id);
  };
  const fields = (list: unknown, where: string) => {
    if (list === undefined) return;
    if (!Array.isArray(list) || !list.length) throw new Error(`${where}: must be a non-empty list`);
    list.forEach((field, k) => {
      const here = `${where}[${k}]`;
      keys(field, FIELD_KEYS, here);
      const f = field as Field;
      if (typeof f.label !== 'string' || !f.label.trim()) throw new Error(`${here}.label: required`);
      checkText(f.label, `${here}.label`);
      if (f.id !== undefined) claim(f.id, `${here}.id`);
      if (f.w !== undefined) number(f.w, `${here}.w`, true);
      choice(f.fill, FILLS, `${here}.fill`);
      choice(f.line, STROKES, `${here}.line`);
    });
  };
  spec.items.forEach((item, i) => {
    const where = `items[${i}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`${where}: must be an object`);
    const kinds = KINDS.filter((kind) => Object.hasOwn(item, kind));
    if (kinds.length !== 1) throw new Error(`${where}: needs exactly one of ${KINDS.join(', ')}`);
    const kind = kinds[0];
    keys(item, KEYS[kind], where);
    const here = nameOf(item, i);
    if (kind === 'box' || kind === 'row' || kind === 'column') claim((item as unknown as Record<string, unknown>)[kind], `${where}.${kind}`);
    if (kind === 'box') {
      const box = item as Box;
      (['x', 'y'] as const).forEach((key) => number(box[key], `${here}.${key}`));
      (['w', 'h'] as const).forEach((key) => number(box[key], `${here}.${key}`, true));
      label(box.label, `${here}.label`);
      if (box.title !== undefined) label(box.title, `${here}.title`);
      choice(box.fill, FILLS, `${here}.fill`);
      choice(box.line, STROKES, `${here}.line`);
      fields(box.fields, `${here}.fields`);
      if (box.label !== undefined && box.fields !== undefined) throw new Error(`${here}: a box with fields names itself with title, not label`);
    } else if (kind === 'row' || kind === 'column') {
      const group = item as Row & Column;
      (['x', 'y'] as const).forEach((key) => number(group[key], `${here}.${key}`));
      number(kind === 'row' ? group.h : group.w, `${here}.${kind === 'row' ? 'h' : 'w'}`, true);
      if (!Array.isArray(group.cells) || !group.cells.length) throw new Error(`${here}.cells: must be a non-empty list`);
      group.cells.forEach((cell, k) => {
        const at = `${here}.cells[${k}]`;
        keys(cell, CELL_KEYS, at);
        const size = kind === 'row' ? 'w' : 'h';
        number(cell[size], `${at}.${size}`, true);
        if (cell[kind === 'row' ? 'h' : 'w'] !== undefined) throw new Error(`${at}: a ${kind} cell sets only ${size}`);
        label(cell.label, `${at}.label`);
        if (cell.id !== undefined) claim(cell.id, `${at}.id`);
        choice(cell.fill, FILLS, `${at}.fill`);
        choice(cell.line, STROKES, `${at}.line`);
        fields(cell.fields, `${at}.fields`);
      });
    } else if (kind === 'text') {
      const text = item as Text;
      label(text.text, `${here}.text`);
      (['x', 'y'] as const).forEach((key) => number(text[key], `${here}.${key}`));
      choice(text.anchor, new Set(['start', 'middle', 'end']), `${here}.anchor`);
      choice(text.role, new Set(['label', 'note', 'title']), `${here}.role`);
      checkTone(text.tone, `${here}.tone`);
      if (text.id !== undefined) claim(text.id, `${here}.id`);
    } else if (kind === 'arrow' || kind === 'line') {
      const path = (item as unknown as Record<string, unknown>)[kind];
      if (!Array.isArray(path) || path.length < 2) throw new Error(`${here}.${kind}: needs at least 2 points`);
      path.forEach((p, k) => point(p, `${here}.${kind}[${k}]`));
      checkTone((item as Arrow).tone, `${here}.tone`);
      if ((item as Arrow).dash !== undefined && typeof (item as Arrow).dash !== 'boolean') throw new Error(`${here}.dash: must be true or false`);
      if (kind === 'arrow') {
        const arrow = item as Arrow;
        choice(arrow.head, new Set(['end', 'start', 'both', 'none']), `${here}.head`);
        if (arrow.label !== undefined) {
          keys(arrow.label, new Set(['text', 'segment', 'side']), `${here}.label`);
          label(arrow.label.text, `${here}.label.text`);
          if (typeof arrow.label.text !== 'string') throw new Error(`${here}.label.text: must be a string`);
          if (arrow.label.segment !== undefined && !(Number.isInteger(arrow.label.segment) && arrow.label.segment >= 0 && arrow.label.segment < path.length - 1)) {
            throw new Error(`${here}.label.segment: must name one of the ${path.length - 1} segments, counted from 0`);
          }
          choice(arrow.label.side, SIDES, `${here}.label.side`);
        }
      } else {
        choice((item as Line).weight, new Set(['border', 'marker']), `${here}.weight`);
      }
    } else {
      const dim = item as Dimension;
      if (!Array.isArray(dim.dimension) || dim.dimension.length !== 2) throw new Error(`${here}.dimension: needs exactly 2 points`);
      dim.dimension.forEach((p, k) => point(p, `${here}.dimension[${k}]`));
      label(dim.label, `${here}.label`);
      choice(dim.side, SIDES, `${here}.side`);
      checkTone(dim.tone, `${here}.tone`);
    }
  });
}

function fitLines(lines: string[], r: Rect, where: string, top = 0): void {
  for (const line of lines) {
    const need = Math.ceil(textWidth(line, LABEL) + 2 * PAD_X);
    if (need > r.w) throw new Error(`${where}: "${line}" needs ${need} units of width; it has ${round(r.w)}`);
  }
  const need = Math.ceil((lines.length - 1) * LINE_STEP + LABEL + 2 * PAD_Y + top);
  if (lines.length && need > r.h) throw new Error(`${where}: ${lines.length === 1 ? 'the label needs' : `${lines.length} lines need`} ${need} units of height; it has ${round(r.h)}`);
}

function fieldRects(container: Rect, titled: boolean, fields: Field[], where: string): Rect[] {
  const widest = Math.max(...fields.map((f) => textWidth(f.label, LABEL)));
  const shared = Math.max(FIELD_MIN, Math.ceil(widest + 2 * FIELD_PAD));
  const block = fields.length * FIELD_H + (fields.length - 1) * FIELD_GAP;
  const need = Math.ceil((titled ? FIELDS_TOP : PAD_Y) + block + PAD_Y);
  if (need > container.h) throw new Error(`${where}: ${fields.length} fields need ${need} units of height; it has ${round(container.h)}`);
  const top = titled ? container.y + FIELDS_TOP : container.y + (container.h - block) / 2;
  return fields.map((f, k) => {
    const w = f.w ?? shared;
    if (textWidth(f.label, LABEL) + 2 * PAD_X > w) throw new Error(`${where}[${k}]: "${f.label}" needs a field ${Math.ceil(textWidth(f.label, LABEL) + 2 * PAD_X)} wide; it is ${w}`);
    if (w + 2 * PAD_X > container.w) throw new Error(`${where}[${k}]: a field ${w} wide needs a box ${w + 2 * PAD_X} wide; it is ${round(container.w)}`);
    return { x: round(container.x + (container.w - w) / 2), y: round(top + k * (FIELD_H + FIELD_GAP)), w, h: FIELD_H };
  });
}

function rounded(points: XY[], radius: number): string {
  let d = `M ${round(points[0][0])} ${round(points[0][1])}`;
  for (let i = 1; i < points.length - 1; ++i) {
    const [px, py] = points[i - 1], [cx, cy] = points[i], [nx, ny] = points[i + 1];
    const inLength = Math.hypot(cx - px, cy - py), outLength = Math.hypot(nx - cx, ny - cy);
    const turn = Math.abs((cx - px) * (ny - cy) - (cy - py) * (nx - cx));
    if (turn < 1e-6) {
      d += ` L ${round(cx)} ${round(cy)}`;
      continue;
    }
    const r = Math.min(radius, inLength / 2, outLength / 2);
    d += ` L ${round(cx - ((cx - px) / inLength) * r)} ${round(cy - ((cy - py) / inLength) * r)}`;
    d += ` Q ${round(cx)} ${round(cy)} ${round(cx + ((nx - cx) / outLength) * r)} ${round(cy + ((ny - cy) / outLength) * r)}`;
  }
  const [ex, ey] = points[points.length - 1];
  return `${d} L ${round(ex)} ${round(ey)}`;
}

const polyline = (points: XY[]) => points.map(([x, y], i) => `${i ? 'L' : 'M'} ${round(x)} ${round(y)}`).join(' ');

function toward(ux: number, uy: number): Toward | null {
  if (Math.abs(uy) < 1e-9) return ux > 0 ? 'right' : 'left';
  if (Math.abs(ux) < 1e-9) return uy > 0 ? 'down' : 'up';
  return null;
}

function arrowHead(tip: XY, ux: number, uy: number, fill: Paint): Shape {
  const axis = toward(ux, uy);
  if (axis === 'up' || axis === 'down') return triangle(tip[1], tip[0], axis, fill);
  if (axis === 'left' || axis === 'right') return triangle(tip[0], tip[1], axis, fill);
  return head(tip[0], tip[1], Math.atan2(uy, ux), fill);
}

function shiftPath(d: string, dy: number): string {
  let index = 0;
  return d.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (n) => (index++ % 2 ? String(round(Number(n) + dy)) : n));
}

function extent(shape: Shape): [number, number] {
  switch (shape.kind) {
    case 'rect':
    case 'outline':
      return [shape.y, shape.y + shape.h];
    case 'line':
      return [Math.min(shape.y1, shape.y2), Math.max(shape.y1, shape.y2)];
    case 'path': {
      const ys = (shape.d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).filter((_, i) => i % 2).map(Number);
      return [Math.min(...ys), Math.max(...ys)];
    }
    default:
      return [shape.y - shape.size * 0.8, shape.y + shape.size * 0.25];
  }
}

function shift(shape: Shape, dy: number): Shape {
  switch (shape.kind) {
    case 'rect':
    case 'outline':
      return { ...shape, y: round(shape.y + dy) };
    case 'line':
      return { ...shape, y1: round(shape.y1 + dy), y2: round(shape.y2 + dy) };
    case 'path':
      return { ...shape, d: shiftPath(shape.d, dy) };
    default:
      return { ...shape, y: round(shape.y + dy) };
  }
}

export function layout(spec: Canvas, profile: Profile = PROFILES.blog): Scene {
  validate(spec);
  const fills: Shape[] = [], strokes: Shape[] = [], marks: Shape[] = [], texts: Shape[] = [];
  const rects = new Map<string, Rect>();
  const rows = new Map<string, { xs: number[]; y: number; h: number }>();
  const columns = new Map<string, { ys: number[]; x: number; w: number }>();
  const notes = new Set<string>();
  const ink: Paint = 'diagram-ink';

  const write = (x: number, y: number, body: string, size: number, anchor: Anchor, fill: Paint) =>
    texts.push({ kind: 'text', x: round(x), y: round(y), text: body, size, anchor, fill });
  const block = (cx: number, cy: number, lines: string[], size: number, anchor: Anchor, fill: Paint, step = LINE_STEP) =>
    lines.forEach((line, j) => write(cx, cy + (j - (lines.length - 1) / 2) * step + CAP * size, line, size, anchor, fill));
  const area = (r: Rect, fill: Fill | undefined) => fills.push({ kind: 'rect', x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h), fill: fillPaint(fill) });
  const outline = (r: Rect, line: Stroke | undefined) => {
    if (line === 'none') return;
    strokes.push({ kind: 'outline', x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h), stroke: ink, ...(line === 'dashed' ? { dash: true } : {}) });
  };
  const boxed = (r: Rect, item: { label?: string | string[]; title?: string; fill?: Fill; line?: Stroke; fields?: Field[] }, where: string, framed = true) => {
    if (framed) {
      area(r, item.fill);
      outline(r, item.line);
    }
    if (item.fields) {
      const title = item.title ?? (typeof item.label === 'string' ? item.label : undefined);
      if (title !== undefined) {
        fitLines([title], { ...r, h: TITLE_BASE + PAD_Y }, `${where}.title`);
        write(r.x + r.w / 2, r.y + TITLE_BASE, title, LABEL, 'middle', ink);
      }
      fieldRects(r, title !== undefined, item.fields, `${where}.fields`).forEach((f, k) => {
        const field = item.fields![k];
        if (field.id) rects.set(field.id, f);
        area(f, field.fill);
        outline(f, field.line);
        block(f.x + f.w / 2, f.y + f.h / 2, [field.label], LABEL, 'middle', ink);
      });
      return;
    }
    const lines = linesOf(item.label);
    if (item.title !== undefined) {
      fitLines([item.title], { ...r, h: TITLE_BASE + PAD_Y }, `${where}.title`);
      write(r.x + r.w / 2, r.y + TITLE_BASE, item.title, LABEL, 'middle', ink);
    }
    fitLines(lines, r, `${where}.label`, item.title === undefined ? 0 : TITLE_BASE);
    const top = item.title === undefined ? r.y : r.y + TITLE_BASE;
    block(r.x + r.w / 2, (top + r.y + r.h) / 2, lines, LABEL, 'middle', ink);
  };

  const groupEdges = (r: Rect, cuts: number[], dashed: boolean[], vertical: boolean) => {
    if (!dashed.some(Boolean) || dashed.every(Boolean)) {
      outline(r, dashed[0] ? 'dashed' : 'solid');
      const dash = dashed[0] ? { dash: true } : {};
      cuts.slice(1, -1).forEach((c) => strokes.push(vertical
        ? { kind: 'line', x1: round(r.x), y1: round(c), x2: round(r.x + r.w), y2: round(c), stroke: ink, ...dash }
        : { kind: 'line', x1: round(c), y1: round(r.y), x2: round(c), y2: round(r.y + r.h), stroke: ink, ...dash }));
      return;
    }
    const segments: Array<{ from: XY; to: XY; dash: boolean }> = [];
    const n = dashed.length;
    if (vertical) {
      segments.push({ from: [r.x, r.y], to: [r.x + r.w, r.y], dash: dashed[0] });
      for (let k = 0; k < n; ++k) segments.push({ from: [r.x + r.w, cuts[k]], to: [r.x + r.w, cuts[k + 1]], dash: dashed[k] });
      segments.push({ from: [r.x + r.w, r.y + r.h], to: [r.x, r.y + r.h], dash: dashed[n - 1] });
      for (let k = n - 1; k >= 0; --k) segments.push({ from: [r.x, cuts[k + 1]], to: [r.x, cuts[k]], dash: dashed[k] });
    } else {
      for (let k = 0; k < n; ++k) segments.push({ from: [cuts[k], r.y], to: [cuts[k + 1], r.y], dash: dashed[k] });
      segments.push({ from: [r.x + r.w, r.y], to: [r.x + r.w, r.y + r.h], dash: dashed[n - 1] });
      for (let k = n - 1; k >= 0; --k) segments.push({ from: [cuts[k + 1], r.y + r.h], to: [cuts[k], r.y + r.h], dash: dashed[k] });
      segments.push({ from: [r.x, r.y + r.h], to: [r.x, r.y], dash: dashed[0] });
    }
    const start = segments.findIndex((s, k) => s.dash !== segments[(k + segments.length - 1) % segments.length].dash);
    const loop = [...segments.slice(start), ...segments.slice(0, start)];
    let run: XY[] = [], dash = loop[0].dash;
    const reach = (from: XY, to: XY): XY => {
      const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
      return [to[0] + (to[0] - from[0]) / length, to[1] + (to[1] - from[1]) / length];
    };
    const flush = () => {
      if (run.length >= 2 && dash) run = [reach(run[1], run[0]), ...run.slice(1, -1), reach(run[run.length - 2], run[run.length - 1])];
      if (run.length >= 2) strokes.push({ kind: 'path', d: polyline(run), stroke: ink, weight: 'border', ...(dash ? { dash: true } : {}) });
      run = [];
    };
    for (const s of loop) {
      if (s.dash !== dash) {
        flush();
        dash = s.dash;
      }
      if (!run.length) run.push(s.from);
      run.push(s.to);
    }
    flush();
    cuts.slice(1, -1).forEach((c, k) => {
      const dash = dashed[k] || dashed[k + 1];
      strokes.push(vertical
        ? { kind: 'line', x1: round(r.x), y1: round(c), x2: round(r.x + r.w), y2: round(c), stroke: ink, ...(dash ? { dash: true } : {}) }
        : { kind: 'line', x1: round(c), y1: round(r.y), x2: round(c), y2: round(r.y + r.h), stroke: ink, ...(dash ? { dash: true } : {}) });
    });
  };

  const placed: Array<() => void> = [];
  spec.items.forEach((item, i) => {
    const where = nameOf(item, i);
    const kind = kindOf(item);
    if (kind === 'box') {
      const box = item as Box;
      const r = { x: box.x, y: box.y, w: box.w, h: box.h };
      rects.set(box.box, r);
      placed.push(() => boxed(r, box, where));
    } else if (kind === 'row') {
      const row = item as Row;
      const xs = row.cells.reduce((acc, cell) => [...acc, acc[acc.length - 1] + cell.w!], [row.x]);
      const r = { x: row.x, y: row.y, w: xs[xs.length - 1] - row.x, h: row.h };
      rects.set(row.row, r);
      rows.set(row.row, { xs, y: row.y, h: row.h });
      row.cells.forEach((cell, k) => cell.id && rects.set(cell.id, { x: xs[k], y: row.y, w: cell.w!, h: row.h }));
      placed.push(() => {
        row.cells.forEach((cell, k) => {
          const c = { x: xs[k], y: row.y, w: cell.w!, h: row.h };
          area(c, cell.fill);
          if (cell.fields) boxed(c, cell, `${where}.cells[${k}]`, false);
          else {
            const lines = linesOf(cell.label);
            fitLines(lines, c, `${where}.cells[${k}]`);
            block(c.x + c.w / 2, c.y + c.h / 2, lines, LABEL, 'middle', ink);
          }
        });
        groupEdges(r, xs, row.cells.map((cell) => cell.line === 'dashed'), false);
      });
    } else if (kind === 'column') {
      const column = item as Column;
      const ys = column.cells.reduce((acc, cell) => [...acc, acc[acc.length - 1] + cell.h!], [column.y]);
      const r = { x: column.x, y: column.y, w: column.w, h: ys[ys.length - 1] - column.y };
      rects.set(column.column, r);
      columns.set(column.column, { ys, x: column.x, w: column.w });
      column.cells.forEach((cell, k) => cell.id && rects.set(cell.id, { x: column.x, y: ys[k], w: column.w, h: cell.h! }));
      placed.push(() => {
        column.cells.forEach((cell, k) => {
          const c = { x: column.x, y: ys[k], w: column.w, h: cell.h! };
          area(c, cell.fill);
          if (cell.fields) boxed(c, cell, `${where}.cells[${k}]`, false);
          else {
            const lines = linesOf(cell.label);
            fitLines(lines, c, `${where}.cells[${k}]`);
            block(c.x + c.w / 2, c.y + c.h / 2, lines, LABEL, 'middle', ink);
          }
        });
        groupEdges(r, ys, column.cells.map((cell) => cell.line === 'dashed'), true);
      });
    } else if (kind === 'text') {
      const text = item as Text;
      const lines = linesOf(text.text);
      const size = text.role === 'note' ? NOTE_SIZE : text.role === 'title' ? TITLE_SIZE : LABEL;
      const anchor = text.anchor ?? 'start';
      const width = Math.max(...lines.map((line) => textWidth(line, size)));
      const left = anchor === 'start' ? text.x : anchor === 'middle' ? text.x - width / 2 : text.x - width;
      const height = (lines.length - 1) * LINE_STEP + size;
      if (text.id) {
        rects.set(text.id, { x: left, y: text.y - height / 2, w: width, h: height });
        notes.add(text.id);
      }
      const fill = text.tone ? paint(text.tone, ink) : text.role === 'note' ? 'text-secondary' : ink;
      placed.push(() => block(text.x, text.y, lines, size, anchor, fill));
    }
  });
  placed.forEach((draw) => draw());

  const resolve = (value: Point, where: string): XY => {
    if (Array.isArray(value)) return [value[0], value[1]];
    const ref = typeof value === 'string' ? value : value.at;
    const m = /^([A-Za-z_][\w-]*)(?:\|(\d+))?\.(top|bottom|left|right|center)(?:@(\d*\.?\d+))?$/.exec(ref);
    if (!m) throw new Error(`${where}: "${ref}" is not a reference such as "box.right", "box.top@0.25", "row|2.bottom" or "column|1.left"`);
    const [, id, k, side, t] = m;
    const f = t === undefined ? 0.5 : Number(t);
    if (!(f >= 0 && f <= 1)) throw new Error(`${where}: "${ref}" takes a fraction from 0 to 1 after @`);
    let xy: XY;
    if (k !== undefined) {
      const row = rows.get(id), column = columns.get(id), at = Number(k);
      if (row) {
        if (at >= row.xs.length) throw new Error(`${where}: "${ref}" names boundary ${at}, but ${id} has ${row.xs.length - 1} cells`);
        if (side !== 'top' && side !== 'bottom') throw new Error(`${where}: "${ref}": a row boundary has a top and a bottom`);
        xy = [row.xs[at], side === 'top' ? row.y : row.y + row.h];
      } else if (column) {
        if (at >= column.ys.length) throw new Error(`${where}: "${ref}" names boundary ${at}, but ${id} has ${column.ys.length - 1} cells`);
        if (side !== 'left' && side !== 'right') throw new Error(`${where}: "${ref}": a column boundary has a left and a right`);
        xy = [side === 'left' ? column.x : column.x + column.w, column.ys[at]];
      } else throw new Error(`${where}: "${id}" is not a row or column id`);
    } else {
      const r = rects.get(id);
      if (!r) throw new Error(`${where}: "${id}" is not an id`);
      const gap = notes.has(id) ? TEXT_GAP : 0;
      xy = side === 'top' ? [r.x + f * r.w, r.y - gap] : side === 'bottom' ? [r.x + f * r.w, r.y + r.h + gap]
        : side === 'left' ? [r.x - gap, r.y + f * r.h] : side === 'right' ? [r.x + r.w + gap, r.y + f * r.h] : [r.x + r.w / 2, r.y + r.h / 2];
    }
    return typeof value === 'object' && !Array.isArray(value) ? [xy[0] + (value.dx ?? 0), xy[1] + (value.dy ?? 0)] : xy;
  };

  spec.items.forEach((item, i) => {
    const where = nameOf(item, i);
    const kind = kindOf(item);
    if (kind === 'arrow' || kind === 'line') {
      const source = (item as unknown as Record<string, Point[]>)[kind];
      const points = source.map((p, k) => resolve(p, `${where}.${kind}[${k}]`));
      points.slice(1).forEach((p, k) => {
        if (Math.hypot(p[0] - points[k][0], p[1] - points[k][1]) < 1) throw new Error(`${where}.${kind}: segment ${k} is shorter than 1 unit`);
      });
      const stroke = paint((item as Arrow).tone, ink);
      const dash = (item as Arrow).dash ? { dash: true } : {};
      if (kind === 'line') {
        marks.push({ kind: 'path', d: polyline(points), stroke, weight: (item as Line).weight ?? 'border', ...dash });
        return;
      }
      const arrow = item as Arrow;
      const ends = arrow.head ?? 'end';
      const trimmed = points.map((p) => [...p] as XY);
      const cut = (tipAt: number, fromAt: number) => {
        const [tx, ty] = points[tipAt], [fx, fy] = points[fromAt];
        const length = Math.hypot(tx - fx, ty - fy);
        if (length < HEAD + TIP + 4) throw new Error(`${where}.arrow: the segment into the head is ${round(length)} units long and needs ${HEAD + TIP + 4}`);
        const ux = (tx - fx) / length, uy = (ty - fy) / length;
        marks.push(arrowHead([tx - ux * TIP, ty - uy * TIP], ux, uy, stroke));
        trimmed[tipAt] = [tx - ux * (TIP + HEAD - POINTER_OVERLAP), ty - uy * (TIP + HEAD - POINTER_OVERLAP)];
      };
      if (ends === 'end' || ends === 'both') cut(points.length - 1, points.length - 2);
      if (ends === 'start' || ends === 'both') cut(0, 1);
      marks.unshift({ kind: 'path', d: rounded(trimmed, RADIUS), stroke, ...dash });
      if (arrow.label) {
        const lengths = points.slice(1).map((p, k) => Math.hypot(p[0] - points[k][0], p[1] - points[k][1]));
        const s = arrow.label.segment ?? lengths.indexOf(Math.max(...lengths));
        const [ax, ay] = points[s], [bx, by] = points[s + 1];
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        const side = arrow.label.side ?? (Math.abs(by - ay) > Math.abs(bx - ax) ? 'right' : 'above');
        const [x, y, anchor]: [number, number, Anchor] = side === 'above' ? [mx, my - LABEL_GAP, 'middle'] : side === 'below' ? [mx, my + LABEL_GAP + 0.7 * ARROW_SIZE, 'middle']
          : side === 'left' ? [mx - LABEL_GAP, my + CAP * ARROW_SIZE, 'end'] : [mx + LABEL_GAP, my + CAP * ARROW_SIZE, 'start'];
        write(x, y, arrow.label.text, ARROW_SIZE, anchor, stroke);
      }
    } else if (kind === 'dimension') {
      const dim = item as Dimension;
      const [a, b] = dim.dimension.map((p, k) => resolve(p, `${where}.dimension[${k}]`));
      const vertical = Math.abs(a[0] - b[0]) < 1e-6, horizontal = Math.abs(a[1] - b[1]) < 1e-6;
      if (!vertical && !horizontal) throw new Error(`${where}.dimension: the two points must share x or y`);
      const length = vertical ? Math.abs(b[1] - a[1]) : Math.abs(b[0] - a[0]);
      if (length < DIMENSION_MIN) throw new Error(`${where}.dimension: is ${round(length)} units long and needs ${round(DIMENSION_MIN)} for its heads`);
      const stroke = paint(dim.tone, ink);
      if (vertical) {
        const [top, end] = a[1] < b[1] ? [a[1], b[1]] : [b[1], a[1]];
        const upper = round(top + DIMENSION_TIP), lower = round(end - DIMENSION_TIP);
        marks.push({ kind: 'line', x1: round(a[0]), y1: upper, x2: round(a[0]), y2: lower, stroke, weight: 'stroke' }, chevron(upper, a[0], 'up', stroke), chevron(lower, a[0], 'down', stroke));
      } else {
        const [left, right] = a[0] < b[0] ? [a[0], b[0]] : [b[0], a[0]];
        const near = round(left + DIMENSION_TIP), far = round(right - DIMENSION_TIP);
        marks.push({ kind: 'line', x1: near, y1: round(a[1]), x2: far, y2: round(a[1]), stroke, weight: 'stroke' }, chevron(near, a[1], 'left', stroke), chevron(far, a[1], 'right', stroke));
      }
      const lines = linesOf(dim.label);
      if (lines.length) {
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const side = dim.side ?? (vertical ? 'right' : 'above');
        const height = (lines.length - 1) * LINE_STEP;
        if (side === 'right') block(mx + DIM_GAP, my, lines, DIM_SIZE, 'start', stroke);
        else if (side === 'left') block(mx - DIM_GAP, my, lines, DIM_SIZE, 'end', stroke);
        else if (side === 'above') block(mx, my - DIM_GAP - height / 2 - DIM_SIZE * CAP, lines, DIM_SIZE, 'middle', stroke);
        else block(mx, my + DIM_GAP + height / 2 + DIM_SIZE * 0.7, lines, DIM_SIZE, 'middle', stroke);
      }
    }
  });

  let shapes = [...fills, ...strokes, ...marks, ...texts];
  const low = Math.min(...shapes.map((s) => extent(s)[0]));
  const dy = (spec.title === undefined ? TOP : TOP + TITLE_ROOM) - low;
  shapes = shapes.map((s) => shift(s, dy));
  if (spec.title !== undefined) {
    const titled = tighten({ width: 0, height: 0, label: '', font: FONT, shapes }, 0);
    shapes.push({ kind: 'text', x: round((titled.x ?? 0) + titled.width / 2), y: TOP + TITLE_SIZE * 0.8, text: spec.title, size: TITLE_SIZE, anchor: 'middle', fill: ink });
  }
  const high = Math.max(...shapes.map((s) => extent(s)[1]));
  return tighten({ width: 0, height: round(high + FOOT), label: spec.label, font: FONT, shapes, frame: profile.frame }, MARGIN);
}

export const isCanvas = (spec: unknown): spec is Canvas => !!spec && typeof spec === 'object' && Object.hasOwn(spec, 'items');
