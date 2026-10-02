import { round, type Shape } from './scene.ts';
import type { Paint } from './tokens.ts';

export const HEAD = 12, TIP = 5;
const POINTER_OVERLAP = 3, DIMENSION_OVERLAP = 2;
export const DIMENSION_MIN = 2 * (HEAD + TIP) + 8;

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

export function dimension(edge: number, x: number, bar: number, top: number, end: number, stroke: Paint): Shape[] {
  return [
    { kind: 'line', x1: round(edge), y1: round(top), x2: round(x + bar), y2: round(top), stroke: 'diagram-ink' },
    { kind: 'line', x1: round(edge), y1: round(end), x2: round(x + bar), y2: round(end), stroke: 'diagram-ink' },
    { kind: 'line', x1: round(x), y1: round(top + TIP + HEAD - DIMENSION_OVERLAP), x2: round(x), y2: round(end - TIP - HEAD + DIMENSION_OVERLAP), stroke },
    arrowhead(top, x, 'up', stroke),
    arrowhead(end, x, 'down', stroke),
  ];
}
