import { BORDER, STROKE, type Scene, type Shape } from './scene.ts';

type Point = [number, number];

interface Piece {
  index: number;
  color: string;
  half: number;
  points: Point[];
  closed: boolean;
  area: boolean;
}

interface End {
  piece: Piece;
  at: Point;
  out: Point;
}

const EPS = 0.05, NEAR = 1, CURVE = 6;

function trace(d: string): { points: Point[]; closed: boolean } {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const points: Point[] = [];
  let command = '', closed = false, x = 0, y = 0;
  const push = (p: Point) => {
    const last = points[points.length - 1];
    if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1e-6) points.push(p);
  };
  for (let i = 0; i < tokens.length;) {
    if (/[A-Za-z]/.test(tokens[i])) command = tokens[i++].toUpperCase();
    const take = (n: number) => tokens.slice(i, (i += n)).map(Number);
    if (command === 'Z') {
      closed = true;
      continue;
    }
    if (command === 'M' || command === 'L') [x, y] = take(2);
    else if (command === 'H') [x] = take(1);
    else if (command === 'V') [y] = take(1);
    else if (command === 'Q') {
      const [cx, cy, ex, ey] = take(4);
      for (let k = 1; k < CURVE; ++k) {
        const t = k / CURVE;
        push([(1 - t) ** 2 * x + 2 * (1 - t) * t * cx + t ** 2 * ex, (1 - t) ** 2 * y + 2 * (1 - t) * t * cy + t ** 2 * ey]);
      }
      [x, y] = [ex, ey];
    } else if (command === 'A') [x, y] = take(7).slice(5) as Point;
    else {
      ++i;
      continue;
    }
    push([x, y]);
  }
  return { points, closed };
}

function piece(shape: Shape, index: number): Piece | null {
  const half = (weight: 'border' | 'stroke' | undefined, fallback: 'border' | 'stroke') => ((weight ?? fallback) === 'border' ? BORDER : STROKE) / 2;
  switch (shape.kind) {
    case 'rect': {
      const { x, y, w, h } = shape;
      return { index, color: shape.fill, half: 0, points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true, area: true };
    }
    case 'outline': {
      const { x, y, w, h } = shape;
      return { index, color: shape.stroke, half: BORDER / 2, points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true, area: false };
    }
    case 'line':
      return { index, color: shape.stroke, half: half(shape.weight, 'border'), points: [[shape.x1, shape.y1], [shape.x2, shape.y2]], closed: false, area: false };
    case 'path': {
      const { points, closed } = trace(shape.d);
      if (shape.fill) return { index, color: shape.fill, half: 0, points, closed: true, area: true };
      return { index, color: shape.stroke, half: half(shape.weight, 'stroke'), points, closed, area: false };
    }
    default:
      return null;
  }
}

function segments(p: Piece): Array<[Point, Point]> {
  const out: Array<[Point, Point]> = [];
  for (let i = 1; i < p.points.length; ++i) out.push([p.points[i - 1], p.points[i]]);
  if (p.closed && p.points.length > 2) out.push([p.points[p.points.length - 1], p.points[0]]);
  return out;
}

function covers(p: Piece, [x, y]: Point): boolean {
  if (p.area) {
    let inside = false;
    for (const [[ax, ay], [bx, by]] of segments(p)) {
      if (ay > y !== by > y && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) inside = !inside;
    }
    return inside;
  }
  for (const [[ax, ay], [bx, by]] of segments(p)) {
    const length = Math.hypot(bx - ax, by - ay);
    if (!length) continue;
    const ux = (bx - ax) / length, uy = (by - ay) / length;
    const along = (x - ax) * ux + (y - ay) * uy, across = Math.abs((x - ax) * uy - (y - ay) * ux);
    if (along >= 0 && along <= length && across <= p.half) return true;
  }
  const joints = p.closed ? p.points : p.points.slice(1, -1);
  return joints.some(([jx, jy]) => Math.max(Math.abs(x - jx), Math.abs(y - jy)) <= p.half);
}

function ends(p: Piece): End[] {
  if (p.area || p.closed || p.points.length < 2) return [];
  const make = (at: Point, from: Point): End => {
    const length = Math.hypot(at[0] - from[0], at[1] - from[1]);
    return { piece: p, at, out: [(at[0] - from[0]) / length, (at[1] - from[1]) / length] };
  };
  return [make(p.points[0], p.points[1]), make(p.points[p.points.length - 1], p.points[p.points.length - 2])];
}

const probe = (e: End, along: number, across: number): Point => [
  e.at[0] + e.out[0] * along - e.out[1] * across,
  e.at[1] + e.out[1] * along + e.out[0] * across,
];

export function lintJoins(scene: Scene): string[] {
  const pieces = scene.shapes.map(piece).filter((p): p is Piece => p !== null);
  const name = (p: Piece) => `${scene.shapes[p.index].kind} #${p.index} (${p.color})`;
  const problems = new Set<string>();
  const allEnds = pieces.flatMap(ends);

  for (const e of allEnds) {
    const s = e.piece, side = Math.max(0, s.half - EPS);
    const ahead = [probe(e, EPS, 0), probe(e, EPS, side), probe(e, EPS, -side)];
    const behind = [probe(e, -EPS, 0), probe(e, -EPS, side), probe(e, -EPS, -side)];
    const hidden = (others: Piece[]) => pieces.some((k) => !others.includes(k) && k !== s
      && (k.index > Math.max(...others.map((o) => o.index), s.index) || k.color === s.color)
      && [...ahead, ...behind].every((q) => covers(k, q)));
    let touched = false;
    for (const j of pieces) {
      if (j === s) continue;
      const into = ahead.every((q) => covers(j, q)), from = behind.some((q) => covers(j, q));
      if (into || covers(j, ahead[0])) touched = true;
      if (into && !from && !hidden([j])) problems.add(`${name(s)} ends on the edge of ${name(j)}`);
      if (from && j.color !== s.color && s.index > j.index && !j.area && !hidden([j])) problems.add(`${name(s)} is painted over ${name(j)}`);
    }
    if (!touched) {
      for (let gap = 0.1; gap < NEAR; gap += 0.1) {
        const hit = pieces.find((j) => j !== s && covers(j, probe(e, gap, 0)));
        if (hit) {
          problems.add(`${name(s)} stops ${gap.toFixed(1)} short of ${name(hit)}`);
          break;
        }
      }
    }
  }

  for (let a = 0; a < allEnds.length; ++a) {
    for (let b = a + 1; b < allEnds.length; ++b) {
      const e = allEnds[a], f = allEnds[b];
      if (e.piece === f.piece || Math.hypot(e.at[0] - f.at[0], e.at[1] - f.at[1]) > EPS) continue;
      if (Math.abs(e.out[0] * f.out[0] + e.out[1] * f.out[1]) > 0.99) continue;
      const corner: Point = [
        e.at[0] + e.out[0] * (f.piece.half / 2) + f.out[0] * (e.piece.half / 2),
        e.at[1] + e.out[1] * (f.piece.half / 2) + f.out[1] * (e.piece.half / 2),
      ];
      if (!pieces.some((k) => covers(k, corner))) problems.add(`${name(e.piece)} and ${name(f.piece)} meet at a corner without a join`);
    }
  }

  const areas = pieces.filter((p) => p.area && p.points.length === 4);
  for (let a = 0; a < areas.length; ++a) {
    for (let b = a + 1; b < areas.length; ++b) {
      for (const [[ax, ay], [bx, by]] of segments(areas[a])) {
        for (const [[cx, cy], [dx, dy]] of segments(areas[b])) {
          const vertical = ax === bx && cx === dx && ax === cx, horizontal = ay === by && cy === dy && ay === cy;
          if (!vertical && !horizontal) continue;
          const [lo, hi] = vertical
            ? [Math.max(Math.min(ay, by), Math.min(cy, dy)), Math.min(Math.max(ay, by), Math.max(cy, dy))]
            : [Math.max(Math.min(ax, bx), Math.min(cx, dx)), Math.min(Math.max(ax, bx), Math.max(cx, dx))];
          if (hi - lo <= EPS) continue;
          const top = Math.max(areas[a].index, areas[b].index);
          const sealed = [0.1, 0.5, 0.9].every((t) => {
            const q: Point = vertical ? [ax, lo + (hi - lo) * t] : [lo + (hi - lo) * t, ay];
            return pieces.some((k) => !k.area && k.index > top && covers(k, q));
          });
          if (!sealed) problems.add(`${name(areas[a])} and ${name(areas[b])} share an edge no stroke covers`);
        }
      }
    }
  }
  return [...problems];
}
