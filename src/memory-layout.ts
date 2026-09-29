import { ADVANCE, checkText, type ProfileName, type Scene, type Shape } from './scene.ts';
import type { Paint } from './tokens.ts';

export interface Region {
  id?: string;
  value?: string;
  word?: string;
  gap?: boolean;
  sub?: string;
  start?: string;
  marker?: string;
  to?: string;
  size?: string;
  h?: number;
}

export interface MemoryLayout {
  id?: string;
  label: string;
  regions: Region[];
}

export interface Profile {
  value: number;
  word: number;
  gap: number;
  wordSize: number;
  subSize: number;
  frame: number;
}

export const PROFILES: Record<ProfileName, Profile> = {
  blog: { value: 156, word: 116, gap: 76, wordSize: 14, subSize: 11, frame: 24 },
  slide: { value: 56, word: 48, gap: 32, wordSize: 15, subSize: 12, frame: 12 },
};

const WIDTH = 700, TOP = 72, AXIS = 32, LEFT = 245, RIGHT = 455, MID = 350, ADDR = 231;
const RUN = 26, RADIUS = 12, LANE = 24, HEAD = 12, SIZE = 15;
const INSIDE = RIGHT - LEFT - 16, OUTSIDE = ADDR - AXIS - 16;
const SPEC_KEYS = new Set(['id', 'label', 'regions']);
const KEYS = new Set(['id', 'value', 'word', 'gap', 'sub', 'start', 'marker', 'to', 'size', 'h']);
const STRINGS = ['id', 'value', 'word', 'sub', 'start', 'marker', 'to', 'size'] as const;
const HEX = /^0x[0-9a-f]+$/i;

type Kind = 'value' | 'word' | 'gap';

const width = (text: string, size: number) => text.length * ADVANCE * size;
const name = (region: Region, i: number) => `regions[${i}]${region.id ? ` (${region.id})` : ''}`;
const kind = (region: Region): Kind => (region.gap ? 'gap' : region.value !== undefined ? 'value' : 'word');

function upper(spec: MemoryLayout, t: number): bigint | null {
  const target = spec.regions[t];
  if (target.size !== undefined) return BigInt(target.start!) + BigInt(target.size);
  const above = spec.regions[t - 1];
  return above?.start !== undefined ? BigInt(above.start) : null;
}

export function validate(spec: MemoryLayout): void {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('the spec must be a JSON object');
  for (const key of Object.keys(spec)) if (!SPEC_KEYS.has(key)) throw new Error(`unknown field "${key}"`);
  if (typeof spec.label !== 'string' || !spec.label.trim()) throw new Error('label: required');
  checkText(spec.label, 'label');
  if (!Array.isArray(spec.regions) || !spec.regions.length) throw new Error('regions: required');
  const ids = new Set<string>();
  let previous: bigint | null = null;
  spec.regions.forEach((region, i) => {
    if (!region || typeof region !== 'object' || Array.isArray(region)) throw new Error(`regions[${i}]: must be an object`);
    const where = name(region, i);
    for (const key of Object.keys(region)) if (!KEYS.has(key)) throw new Error(`${where}: unknown field "${key}"`);
    for (const key of STRINGS) {
      const value = region[key];
      if (value === undefined) continue;
      if (typeof value !== 'string' || !value.trim()) throw new Error(`${where}.${key}: must be a non-empty string`);
      checkText(value, `${where}.${key}`);
    }
    if (region.gap !== undefined && region.gap !== true) throw new Error(`${where}.gap: must be true`);
    const kinds = [region.value !== undefined, region.word !== undefined, region.gap === true].filter(Boolean).length;
    if (kinds !== 1) throw new Error(`${where}: needs exactly one of value, word or "gap": true`);
    if (region.h !== undefined && !(typeof region.h === 'number' && Number.isFinite(region.h) && region.h > 0)) throw new Error(`${where}.h: must be a positive number`);
    for (const key of ['start', 'size'] as const) {
      if (region[key] !== undefined && !HEX.test(region[key]!)) throw new Error(`${where}.${key}: "${region[key]}" is not a hex number such as 0x1000`);
    }
    if (region.id) {
      if (ids.has(region.id)) throw new Error(`${where}: duplicate id`);
      ids.add(region.id);
    }
    const text: Array<[string | undefined, number, number, string]> = [
      [region.value, SIZE, INSIDE, 'value'], [region.word, PROFILES.slide.wordSize, INSIDE, 'word'], [region.sub, PROFILES.slide.subSize, INSIDE, 'sub'],
      [region.start, SIZE, OUTSIDE, 'start'], [region.marker, SIZE, OUTSIDE, 'marker'],
    ];
    for (const [body, size, room, key] of text) if (body !== undefined && width(body, size) > room) throw new Error(`${where}.${key}: "${body}" is too long for its place`);
    if (region.start !== undefined) {
      const start = BigInt(region.start);
      if (previous !== null && start >= previous) throw new Error(`${where}.start: must be lower than the start above it`);
      previous = start;
    }
    if (region.marker !== undefined && region.start === undefined) throw new Error(`${where}.marker: needs start`);
    if (region.size !== undefined && region.start === undefined) throw new Error(`${where}.size: needs start`);
    if (region.to !== undefined && !HEX.test(region.value ?? '')) throw new Error(`${where}.value: a pointer needs a hex value`);
  });
  spec.regions.forEach((region, i) => {
    const where = name(region, i);
    const above = spec.regions[i - 1];
    if (region.size !== undefined && above?.start !== undefined && BigInt(region.start!) + BigInt(region.size) > BigInt(above.start)) throw new Error(`${where}.size: runs into the region above`);
    if (region.to === undefined) return;
    const t = spec.regions.findIndex((r) => r.id !== undefined && r.id === region.to);
    const target = spec.regions[t];
    if (t === -1) throw new Error(`${where}.to: "${region.to}" is not a region id`);
    if (target.start === undefined) throw new Error(`${where}.to: the target "${region.to}" has no start`);
    const value = BigInt(region.value!), start = BigInt(target.start);
    if (value === start) return;
    const end = upper(spec, t);
    if (end === null) throw new Error(`${where}.value: lies above the start of "${region.to}"; give the target a size or the region above it a start`);
    if (value < start || value >= end) throw new Error(`${where}.value: ${region.value} is outside ${target.start}..0x${end.toString(16)}`);
  });
}

interface Arrow { index: number; name: string; tail: number; head: number; top: number; bottom: number; leg: number; label: string }

const round = (n: number) => Math.round(n * 100) / 100;

export function layout(spec: MemoryLayout, profile: Profile = PROFILES.blog): Scene {
  validate(spec);
  const shapes: Shape[] = [];
  const text = (x: number, y: number, body: string, size: number, bold: boolean, anchor: 'start' | 'middle' | 'end', fill: Paint = 'diagram-ink') =>
    shapes.push({ kind: 'text', x, y, text: body, size, bold, anchor, fill });
  const line = (x1: number, y1: number, x2: number, y2: number) => shapes.push({ kind: 'line', x1, y1, x2, y2, stroke: 'diagram-ink' });

  let y = TOP;
  const rows = spec.regions.map((region) => {
    const k = kind(region);
    const h = round(region.h === undefined ? profile[k] : (region.h * profile[k]) / PROFILES.blog[k]);
    const row = { region, top: y, bottom: round(y + h), center: round(y + h / 2) };
    y = row.bottom;
    return row;
  });
  const bottom = y;

  const arrows: Arrow[] = [];
  rows.forEach((row, i) => {
    const source = row.region;
    if (source.to === undefined) return;
    const t = spec.regions.findIndex((r) => r.id === source.to);
    const target = rows[t];
    const value = BigInt(source.value!), start = BigInt(target.region.start!);
    const end = value === start ? null : upper(spec, t)!;
    const head = end === null ? target.bottom : round(target.bottom - (Number(((value - start) * 10000n) / (end - start)) / 10000) * (target.bottom - target.top));
    const tail = row.center;
    if (Math.abs(head - tail) < 2 * RADIUS) throw new Error(`${name(source, i)}: the arrow is ${round(Math.abs(head - tail))} units long and needs ${2 * RADIUS}; raise h`);
    arrows.push({ index: i, name: name(source, i), tail, head, top: Math.min(tail, head), bottom: Math.max(tail, head), leg: 0, label: `*(${source.value})` });
  });
  const lanes: Array<Array<[number, number]>> = [];
  for (const arrow of [...arrows].sort((a, b) => a.bottom - a.top - (b.bottom - b.top) || b.index - a.index)) {
    let lane = lanes.findIndex((used) => used.every(([top, end]) => arrow.bottom < top || arrow.top > end));
    if (lane === -1) lane = lanes.push([]) - 1;
    lanes[lane].push([arrow.top, arrow.bottom]);
    arrow.leg = RIGHT + RUN + RADIUS + lane * LANE;
  }
  for (const a of arrows) {
    for (const b of arrows) {
      if (b.leg < a.leg && [a.tail, a.head].some((level) => level > b.top && level < b.bottom)) throw new Error(`${a.name} and ${b.name}: the arrows cross; reorder the regions or split the diagram`);
    }
    const x1 = a.leg + 8, x2 = x1 + width(a.label, SIZE), level = (a.tail + a.head) / 2 + 3;
    if (x2 > WIDTH) throw new Error(`${a.name}: the label "${a.label}" ends at x=${Math.round(x2)}, past ${WIDTH}; overlapping arrows leave no room for long labels`);
    for (const b of arrows) {
      if (b === a) continue;
      const leg = b.leg > x1 && b.leg < x2 && level - SIZE < b.bottom && level + 4 > b.top;
      const run = b.leg > x1 && [b.tail, b.head].some((l) => l > level - SIZE && l < level + 4);
      if (leg || run) throw new Error(`${a.name}: the label "${a.label}" runs into the arrow from ${b.name}`);
    }
  }

  text(AXIS, TOP - 18, 'high', SIZE, true, 'middle');
  line(AXIS, bottom, AXIS, TOP + 10);
  shapes.push({ kind: 'path', d: `M ${AXIS} ${TOP + 2} L ${AXIS - 6} ${TOP + 14} L ${AXIS + 6} ${TOP + 14} Z`, fill: 'diagram-ink' });
  text(AXIS, bottom + 24, 'low', SIZE, true, 'middle');

  for (const row of rows) shapes.push({ kind: 'rect', x: LEFT, y: row.top, w: RIGHT - LEFT, h: round(row.bottom - row.top), fill: row.region.gap ? 'diagram-gap' : 'diagram-area' });
  shapes.push({ kind: 'outline', x: LEFT, y: TOP, w: RIGHT - LEFT, h: round(bottom - TOP), stroke: 'diagram-ink' });
  for (const row of rows.slice(0, -1)) line(LEFT, row.bottom, RIGHT, row.bottom);

  for (const row of rows) {
    const { start, marker } = row.region;
    if (start === undefined) continue;
    line(ADDR + 2, row.bottom, LEFT, row.bottom);
    if (marker !== undefined) text(ADDR, round(row.bottom - 12), marker, SIZE, true, 'end', 'syntax-keyword');
    text(ADDR, round(row.bottom + (marker !== undefined ? 6 : 4)), start, SIZE, true, 'end');
  }

  for (const row of rows) {
    const { region, center } = row;
    if (region.gap) {
      text(MID, round(center + 10), '⋮', 26, true, 'middle', 'text-secondary');
      continue;
    }
    const isValue = region.value !== undefined;
    const baseline = round(region.sub !== undefined ? center - 4 : center + 5);
    text(MID, baseline, isValue ? region.value! : region.word!, isValue ? SIZE : profile.wordSize, isValue, 'middle');
    if (region.sub !== undefined) text(MID, round(baseline + (isValue ? 24 : 22)), region.sub, profile.subSize, false, 'middle');
  }

  for (const a of [...arrows].sort((p, q) => q.index - p.index)) {
    const dir = a.head < a.tail ? -1 : 1;
    shapes.push({ kind: 'path', d: `M ${RIGHT} ${a.tail} H ${a.leg - RADIUS} Q ${a.leg} ${a.tail} ${a.leg} ${round(a.tail + dir * RADIUS)} V ${round(a.head - dir * RADIUS)} Q ${a.leg} ${a.head} ${a.leg - RADIUS} ${a.head} H ${RIGHT + HEAD - 3}`, stroke: 'diagram-ink' });
    shapes.push({ kind: 'path', d: `M ${RIGHT - 1} ${a.head} L ${RIGHT - 1 + HEAD} ${round(a.head - HEAD / 2)} L ${RIGHT - 1 + HEAD} ${round(a.head + HEAD / 2)} Z`, fill: 'diagram-ink' });
    text(a.leg + 8, round((a.tail + a.head) / 2 + 3), a.label, SIZE, true, 'start');
  }

  return { width: WIDTH, height: round(bottom + 40), label: spec.label, font: 'code-mono', shapes, frame: profile.frame };
}
