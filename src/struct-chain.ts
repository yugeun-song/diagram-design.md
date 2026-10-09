import { arrowhead, dimension, DIMENSION_MIN, shaftEnd } from './arrow.ts';
import { checkText, round, textWidth, type ProfileName, type Scene, type Shape } from './scene.ts';
import { checkTone, paint, pieces, WASHES, type Run, type Tone } from './tone.ts';
import type { Paint } from './tokens.ts';

export type Field = [string, number] | { pad: number };

export interface Link {
  field: string;
  cells: string[];
}

export interface ChainNode {
  name: string;
  values?: Record<string, string>;
}

export interface Head {
  name: string;
  sub?: string;
}

export type Role = 'node' | 'link' | 'walk' | 'offset';

export interface StructChain {
  id?: string;
  label: string;
  fields: Field[];
  link: Link;
  nodes: ChainNode[];
  head?: Head;
  tones?: Partial<Record<Role, Tone>>;
  code?: Run[][];
}

export interface Profile {
  base: number;
  step: number;
  max: number;
  cell: number;
  pad: number;
  sub: number;
  frame: number;
}

export const PROFILES: Record<ProfileName, Profile> = {
  blog: { base: 48, step: 5, max: 104, cell: 36, pad: 28, sub: 11, frame: 24 },
  slide: { base: 40, step: 1.5, max: 56, cell: 24, pad: 16, sub: 12, frame: 12 },
};

const WIDTH = 700, MARGIN = 10, LABEL = 28, TOP = 40, SIZE = 15, VALUE = 13, CELL = 13;
const BOX = 92, HEAD_BOX = 72, INSET = 8, GAP = 86, RADIUS = 12;
const ENTRY = 24, WRAP = 30, LOOP = 32, ARROW_LABEL = 20;
const DIM_X = 20, DIM_BAR = 10, DIM_LABEL = 14, CODE_TOP = 48, CODE_STEP = 28;
const SPEC_KEYS = new Set(['id', 'label', 'fields', 'link', 'nodes', 'head', 'tones', 'code']);
const ROLES: Role[] = ['node', 'link', 'walk', 'offset'];

interface Row { name: string; size: number; offset: number; kind: 'field' | 'pad' | 'link' }

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function word(value: unknown, where: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${where}: must be a non-empty string`);
  checkText(value, where);
  return value;
}

function only(value: Record<string, unknown>, keys: string[], where: string): void {
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`${where}: unknown field "${key}"`);
}

function parse(spec: StructChain): { rows: Row[]; at: number } {
  if (!isObject(spec)) throw new Error('the spec must be a JSON object');
  for (const key of Object.keys(spec)) if (!SPEC_KEYS.has(key)) throw new Error(`unknown field "${key}"`);
  word(spec.label, 'label');
  if (!isObject(spec.link)) throw new Error('link: required, such as {"field": "list", "cells": ["next", "prev"]}');
  only(spec.link, ['field', 'cells'], 'link');
  const field = word(spec.link.field, 'link.field');
  const cells: unknown = spec.link.cells;
  if (!Array.isArray(cells) || !cells.length || cells.length > 3) throw new Error('link.cells: one to three pointer names, the forward pointer first');
  cells.forEach((cell, i) => word(cell, `link.cells[${i}]`));
  if (!Array.isArray(spec.fields) || !spec.fields.length) throw new Error('fields: required');
  const names = new Set<string>();
  let offset = 0;
  const rows = spec.fields.map((value: unknown, i): Row => {
    const where = `fields[${i}]`;
    let row: Row;
    if (isObject(value) && Object.keys(value).join() === 'pad') {
      row = { name: 'pad', size: value.pad as number, offset, kind: 'pad' };
    } else if (Array.isArray(value) && value.length === 2) {
      const name = word(value[0], `${where}[0]`);
      if (names.has(name)) throw new Error(`${where}: "${name}" is used twice`);
      names.add(name);
      row = { name, size: value[1], offset, kind: name === field ? 'link' : 'field' };
    } else {
      throw new Error(`${where}: expected ["name", size] or {"pad": n}`);
    }
    if (!Number.isInteger(row.size) || row.size < 1) throw new Error(`${where}: the size must be a positive integer`);
    offset += row.size;
    return row;
  });
  const at = rows.findIndex((row) => row.kind === 'link');
  if (at === -1) throw new Error(`link.field: "${field}" is not one of the fields`);
  if (!Array.isArray(spec.nodes) || !spec.nodes.length) throw new Error('nodes: required');
  spec.nodes.forEach((node: unknown, i) => {
    const where = `nodes[${i}]`;
    if (!isObject(node)) throw new Error(`${where}: must be an object`);
    only(node, ['name', 'values'], where);
    word(node.name, `${where}.name`);
    if (node.values === undefined) return;
    if (!isObject(node.values)) throw new Error(`${where}.values: must map field names to values`);
    for (const [name, value] of Object.entries(node.values)) {
      if (!rows.some((row) => row.kind === 'field' && row.name === name)) throw new Error(`${where}.values: "${name}" is not a field outside the link`);
      word(value, `${where}.values.${name}`);
    }
  });
  if (spec.head !== undefined) {
    if (!isObject(spec.head)) throw new Error('head: must be {"name": "...", "sub": "..."}');
    only(spec.head, ['name', 'sub'], 'head');
    word(spec.head.name, 'head.name');
    if (spec.head.sub !== undefined) word(spec.head.sub, 'head.sub');
  }
  if (spec.tones !== undefined) {
    if (!isObject(spec.tones)) throw new Error('tones: must map roles to tones');
    only(spec.tones, ROLES, 'tones');
    for (const role of ROLES) checkTone(spec.tones[role], `tones.${role}`);
  }
  if (spec.code !== undefined && (!Array.isArray(spec.code) || !spec.code.length)) throw new Error('code: must be a non-empty list of lines');
  return { rows, at };
}

// Each structure is a column of its fields, lowest offset on top. The forward pointers run
// from link to link at the height of the first cell, and with a head the last one rings back
// under the columns. A dimension left of each column measures offsetof, the step container_of
// takes; they are all the same, so only the first one carries the label.
export function layout(spec: StructChain, profile: Profile = PROFILES.blog): Scene {
  const { rows, at } = parse(spec);
  const tones = spec.tones ?? {};
  const cells = spec.link.cells;
  const ink: Paint = 'diagram-ink';
  const fill: Paint = tones.link === undefined ? 'diagram-area' : WASHES[tones.link];
  const walk = paint(tones.walk, ink), measure = paint(tones.offset, ink);

  const heights = rows.map((row) =>
    row.kind === 'link' ? cells.length * profile.cell : row.kind === 'pad' ? profile.pad : round(Math.min(profile.max, profile.base + profile.step * Math.log2(row.size))));
  const tops: number[] = [];
  let y = TOP;
  for (const h of heights) {
    tops.push(y);
    y = round(y + h);
  }
  const bottom = y, linkTop = tops[at], linkBottom = round(linkTop + cells.length * profile.cell), forward = round(linkTop + profile.cell / 2);
  const offset = rows[at].offset;
  const dimSub = `= 0x${offset.toString(16)}`;
  const dimLabel = offset ? DIM_X + DIM_LABEL + Math.max(textWidth('offsetof', SIZE), textWidth(dimSub, profile.sub)) : 0;
  const dimBaseline = Math.min((TOP + linkTop) / 2 - 4, linkTop - 31);
  if (offset && (linkTop - TOP < DIMENSION_MIN || dimBaseline < 19)) throw new Error('fields: the fields above the link are too short for the offsetof dimension');

  const values = spec.nodes.flatMap((node) => Object.values(node.values ?? {}));
  const inner = Math.max(
    ...rows.filter((row) => row.kind === 'field').map((row) => textWidth(row.name, SIZE)),
    ...values.map((value) => textWidth(value, VALUE)),
    ...cells.map((cell) => textWidth(cell, CELL)),
  );
  const box = Math.max(BOX, Math.ceil(inner + 2 * INSET), ...spec.nodes.map((node) => Math.ceil(textWidth(node.name, SIZE))));
  const gap = Math.max(GAP, Math.ceil(textWidth(cells[0], SIZE) + 16));

  let x = MARGIN + dimLabel, headX = 0, headW = 0;
  const head = spec.head;
  if (head) {
    headW = Math.max(HEAD_BOX, Math.ceil(Math.max(...cells.map((cell) => textWidth(cell, CELL))) + 2 * INSET));
    const labelW = Math.max(textWidth(head.name, SIZE), head.sub ? textWidth(head.sub, profile.sub) : 0);
    headX = Math.max(MARGIN + RADIUS + ENTRY, MARGIN + 10 + (labelW - headW) / 2);
    x = Math.max(x, headX + headW + gap, headX + (headW + labelW) / 2 + 10);
  }
  const xs = spec.nodes.map(() => {
    const here = x;
    x = here + box + gap;
    return here;
  });
  const lastRight = xs[xs.length - 1] + box;
  const right = head ? lastRight + WRAP + 2 : lastRight;
  if (right + MARGIN > WIDTH) throw new Error(`nodes: ${spec.nodes.length} structures need ${Math.ceil(right + MARGIN)} units, past ${WIDTH}; draw fewer or use shorter names`);
  const shift = (WIDTH - MARGIN - right) / 2;
  const sx = (n: number) => round(n + shift);

  const shapes: Shape[] = [];
  const text = (tx: number, ty: number, body: string, size: number, bold: boolean, anchor: 'start' | 'middle' | 'end', color: Paint) =>
    shapes.push({ kind: 'text', x: round(tx), y: round(ty), text: body, size, bold, anchor, fill: color });
  const line = (x1: number, y1: number, x2: number, y2: number, stroke: Paint = ink) => shapes.push({ kind: 'line', x1: round(x1), y1: round(y1), x2: round(x2), y2: round(y2), stroke });
  const cellsAt = (left: number, w: number) => {
    cells.forEach((_, j) => shapes.push({ kind: 'rect', x: left, y: round(linkTop + j * profile.cell), w, h: profile.cell, fill }));
    for (let j = 1; j < cells.length; ++j) line(left, linkTop + j * profile.cell, left + w, linkTop + j * profile.cell);
  };
  const cellText = (center: number) => cells.forEach((cell, j) => text(center, linkTop + (j + 0.5) * profile.cell + 4.5, cell, CELL, true, 'middle', ink));
  const arrow = (from: number, to: number) => {
    shapes.push({ kind: 'path', d: `M ${from} ${forward} H ${shaftEnd(to, 'right')}`, stroke: walk });
    shapes.push(arrowhead(to, forward, 'right', walk));
    text((from + to) / 2, forward + ARROW_LABEL, cells[0], SIZE, true, 'middle', walk);
  };

  xs.forEach((left0, n) => {
    const node = spec.nodes[n];
    const left = sx(left0), center = left + box / 2;
    rows.forEach((row, i) => {
      if (row.kind === 'link') cellsAt(left, box);
      else shapes.push({ kind: 'rect', x: left, y: tops[i], w: box, h: heights[i], fill: row.kind === 'pad' ? 'diagram-gap' : 'diagram-area' });
    });
    tops.slice(1).forEach((top) => line(left, top, left + box, top));
    shapes.push({ kind: 'outline', x: left, y: TOP, w: box, h: round(bottom - TOP), stroke: ink });
    text(center, LABEL, node.name, SIZE, true, 'middle', paint(tones.node, ink));
    rows.forEach((row, i) => {
      const middle = tops[i] + heights[i] / 2;
      if (row.kind === 'link') return cellText(center);
      if (row.kind === 'pad') {
        if (heights[i] >= 20) text(center, middle + 4, 'padding', profile.sub, false, 'middle', 'text-secondary');
        return;
      }
      const value = node.values?.[row.name];
      if (value === undefined) return text(center, middle + 5, row.name, SIZE, true, 'middle', ink);
      text(center, middle - 5, row.name, SIZE, true, 'middle', ink);
      text(center, middle + 13, value, VALUE, false, 'middle', ink);
    });
    if (offset) {
      const dx = round(left - DIM_X);
      shapes.push(...dimension(left, dx, -DIM_BAR, TOP, linkTop, measure));
      if (n === 0) {
        text(dx - DIM_LABEL, dimBaseline, 'offsetof', SIZE, true, 'end', measure);
        text(dx - DIM_LABEL, dimBaseline + 22, dimSub, profile.sub, false, 'end', measure);
      }
    }
    if (n > 0) arrow(sx(xs[n - 1] + box), left);
  });

  let after = bottom;
  if (head) {
    const hx = sx(headX), mark = paint(tones.link, ink);
    cellsAt(hx, headW);
    shapes.push({ kind: 'outline', x: hx, y: linkTop, w: headW, h: cells.length * profile.cell, stroke: ink });
    cellText(hx + headW / 2);
    text(hx + headW / 2, linkBottom + 20, head.name, SIZE, true, 'middle', mark);
    if (head.sub) text(hx + headW / 2, linkBottom + 37, head.sub, profile.sub, false, 'middle', mark);
    arrow(round(hx + headW), sx(xs[0]));
    const l = sx(MARGIN), r = sx(lastRight + WRAP), start = sx(lastRight);
    const yb = round(Math.max(bottom + LOOP, linkBottom + (head.sub ? 37 : 20) + 24));
    shapes.push({
      kind: 'path',
      d: `M ${start} ${forward} H ${round(r - RADIUS)} Q ${r} ${forward} ${r} ${round(forward + RADIUS)} V ${round(yb - RADIUS)} Q ${r} ${yb} ${round(r - RADIUS)} ${yb} `
        + `H ${round(l + RADIUS)} Q ${l} ${yb} ${l} ${round(yb - RADIUS)} V ${round(forward + RADIUS)} Q ${l} ${forward} ${round(l + RADIUS)} ${forward} H ${shaftEnd(hx, 'right')}`,
      stroke: walk,
    });
    shapes.push(arrowhead(hx, forward, 'right', walk));
    text((l + r) / 2, yb + ARROW_LABEL, cells[0], SIZE, true, 'middle', walk);
    after = round(yb + ARROW_LABEL);
  }

  const code = (spec.code ?? []).map((list, i) => pieces(list, `code[${i}]`, WIDTH - 32, SIZE));
  const widest = Math.max(0, ...code.map((list) => textWidth(list.map((p) => p.text).join(''), SIZE)));
  code.forEach((list, i) => shapes.push({
    kind: 'runs', x: round((WIDTH - widest) / 2), y: round(after + CODE_TOP + i * CODE_STEP), size: SIZE, bold: true, anchor: 'start',
    runs: list.map((p) => ({ text: p.text, fill: paint(p.tone, ink) })),
  }));
  const height = code.length ? round(after + CODE_TOP + (code.length - 1) * CODE_STEP + 24) : round(after + 24);
  return { width: WIDTH, height, label: spec.label, font: 'code-mono', shapes, frame: profile.frame };
}
