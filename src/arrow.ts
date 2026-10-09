import { BORDER, round, STROKE, type Shape } from './scene.ts';
import type { Paint } from './tokens.ts';

export const HEAD = 12, TIP = 5;
const POINTER_OVERLAP = 3, OPEN = 7, DIMENSION_GAP = 1.5;
const DIMENSION_TIP = BORDER / 2 + DIMENSION_GAP + (STROKE / 2) * Math.SQRT2;
export const DIMENSION_MIN = 2 * (OPEN + DIMENSION_TIP) + 8;

export type Toward = 'up' | 'down' | 'left' | 'right';

const back = (toward: Toward) => (toward === 'up' || toward === 'left' ? 1 : -1);

export function triangle(tip: number, across: number, toward: Toward, fill: Paint): Shape {
  const t = round(tip), base = round(t + back(toward) * HEAD);
  const c = round(across), a = round(across - HEAD / 2), b = round(across + HEAD / 2);
  const d = toward === 'up' || toward === 'down' ? `M ${c} ${t} L ${a} ${base} L ${b} ${base} Z` : `M ${t} ${c} L ${base} ${a} L ${base} ${b} Z`;
  return { kind: 'path', d, fill };
}

export const arrowhead = (at: number, across: number, toward: Toward, fill: Paint): Shape => triangle(at + back(toward) * TIP, across, toward, fill);

export const shaftEnd = (at: number, toward: Toward): number => round(at + back(toward) * (TIP + HEAD - POINTER_OVERLAP));

export function chevron(tip: number, across: number, toward: Toward, stroke: Paint): Shape {
  const t = round(tip), base = round(t + back(toward) * OPEN);
  const c = round(across), a = round(across - OPEN), b = round(across + OPEN);
  const d = toward === 'up' || toward === 'down' ? `M ${a} ${base} L ${c} ${t} L ${b} ${base}` : `M ${base} ${a} L ${t} ${c} L ${base} ${b}`;
  return { kind: 'path', d, stroke };
}

export function dimension(edge: number, x: number, bar: number, top: number, end: number, stroke: Paint): Shape[] {
  const upper = round(top + DIMENSION_TIP), lower = round(end - DIMENSION_TIP);
  return [
    { kind: 'line', x1: round(edge), y1: round(top), x2: round(x + bar), y2: round(top), stroke: 'diagram-ink' },
    { kind: 'line', x1: round(edge), y1: round(end), x2: round(x + bar), y2: round(end), stroke: 'diagram-ink' },
    { kind: 'line', x1: round(x), y1: round(upper), x2: round(x), y2: round(lower), stroke, weight: 'stroke' },
    chevron(upper, x, 'up', stroke),
    chevron(lower, x, 'down', stroke),
  ];
}
