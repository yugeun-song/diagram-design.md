import { checkText, textWidth } from './scene.ts';
import type { Paint } from './tokens.ts';

export type Tone = 'red' | 'orange' | 'blue' | 'purple';
export type Run = string | [string, Tone];
export interface Piece { text: string; tone?: Tone }

// A tone is a hue that each theme shades for its background, so one diagram can tell several things apart by color.
export const TONES: Record<Tone, Paint> = {
  red: 'diagram-red',
  orange: 'diagram-orange',
  blue: 'diagram-blue',
  purple: 'diagram-purple',
};

export const WASHES: Record<Tone, Paint> = {
  red: 'diagram-red-wash',
  orange: 'diagram-orange-wash',
  blue: 'diagram-blue-wash',
  purple: 'diagram-purple-wash',
};

export const isTone = (value: unknown): value is Tone => typeof value === 'string' && Object.hasOwn(TONES, value);
export const paint = (tone: Tone | undefined, fallback: Paint): Paint => (tone === undefined ? fallback : TONES[tone]);

export function checkTone(value: unknown, where: string): void {
  if (value !== undefined && !isTone(value)) throw new Error(`${where}: unknown tone "${String(value)}"; use ${Object.keys(TONES).join(', ')}`);
}

export function pieces(value: unknown, where: string, room: number, size: number): Piece[] {
  if (!Array.isArray(value) || !value.length) throw new Error(`${where}: must be a non-empty list of runs`);
  const out = value.map((run: unknown, i: number): Piece => {
    const here = `${where}[${i}]`;
    const [text, tone] = typeof run === 'string' ? [run, undefined] : Array.isArray(run) && run.length === 2 ? [run[0], run[1]] : [undefined, undefined];
    if (typeof text !== 'string' || !text) throw new Error(`${here}: a run is "text" or ["text", tone]`);
    checkTone(tone, here);
    checkText(text, here);
    return { text, tone: tone as Tone | undefined };
  });
  const all = out.map((p) => p.text).join('');
  if (textWidth(all, size) > room) throw new Error(`${where}: "${all}" is too long for its place`);
  return out;
}
