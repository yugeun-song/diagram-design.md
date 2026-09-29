import { ADVANCE, checkText, esc, type Scene, type Shape } from './scene.ts';

export type Field = [string, number] | { pad: number } | { other: string; size: number };

export interface MemoryTable {
  id?: string;
  label?: string;
  unit: 'byte' | 'bit';
  cols?: number;
  order?: 'asc' | 'desc';
  base?: string;
  fields: Field[];
}

export interface Cell {
  text: string;
  span: number;
  tag: 'th' | 'td';
  cls: string;
}

export interface Profile {
  width: number;
  offset: number;
  minRow: number;
  header: number;
  line: number;
  pad: number;
  font: number;
  headerFont: number;
}

export const PROFILES: Record<string, Profile> = {
  blog: { width: 640, offset: 44, minRow: 30, header: 22, line: 14, pad: 4, font: 11, headerFont: 10 },
  slide: { width: 880, offset: 72, minRow: 49, header: 31, line: 23, pad: 6.5, font: 18, headerFont: 14 },
};

export const WEB_STYLE = '.st{font-family:"code-mono","Fira Code",monospace;text-anchor:middle;dominant-baseline:central}';

const KEYS = new Set(['id', 'label', 'unit', 'cols', 'order', 'base', 'fields']);

function field(value: unknown, i: number): [string, number, string] {
  const where = `fields[${i}]`;
  const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).sort().join(',') : '';
  let text: unknown, size: unknown, cls: string;
  if (Array.isArray(value) && value.length === 2) [text, size, cls] = [value[0], value[1], 'field'];
  else if (keys === 'pad') [text, size, cls] = ['pad', (value as { pad: number }).pad, 'pad'];
  else if (keys === 'other,size') [text, size, cls] = [(value as { other: string }).other, (value as { size: number }).size, ''];
  else throw new Error(`${where}: expected ["name", size], {"pad": n} or {"other": "text", "size": n}`);
  if (typeof text !== 'string' || !text.trim()) throw new Error(`${where}: the name must be a non-empty string`);
  if (!Number.isInteger(size) || (size as number) < 1) throw new Error(`${where}: the size must be a positive integer`);
  checkText(text, where);
  if (/[<&]/.test(text)) throw new Error(`${where}: the blog's table renderer does not escape < or &`);
  return [text.trim(), size as number, cls];
}

export function grid(spec: MemoryTable): Cell[][] {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('the spec must be a JSON object');
  for (const key of Object.keys(spec)) if (!KEYS.has(key)) throw new Error(`unknown field "${key}"`);
  if (spec.unit !== 'byte' && spec.unit !== 'bit') throw new Error('unit: must be "byte" or "bit"');
  if (spec.order !== undefined && spec.order !== 'asc' && spec.order !== 'desc') throw new Error('order: must be "asc" or "desc"');
  if (spec.label !== undefined) {
    if (typeof spec.label !== 'string') throw new Error('label: must be a string');
    checkText(spec.label, 'label');
  }
  if (!Array.isArray(spec.fields) || !spec.fields.length) throw new Error('fields: required');
  const bytes = spec.unit === 'byte';
  const cols = spec.cols ?? (bytes ? 8 : 32);
  if (!Number.isInteger(cols) || cols < 1 || cols > 64) throw new Error('cols: must be an integer from 1 to 64');
  if (spec.base !== undefined && (typeof spec.base !== 'string' || !/^0x[0-9a-f]+$/i.test(spec.base))) throw new Error(`base: "${spec.base}" is not a hex number such as 0x1000`);
  const base = BigInt(spec.base ?? 0);
  const desc = spec.order === 'desc';
  const numbers = Array.from({ length: cols }, (_, i) => (desc ? cols - 1 - i : i));
  const header: Cell[] = bytes
    ? [{ text: 'Offset', span: 1, tag: 'th', cls: '' }, ...numbers.map((n) => ({ text: `+${n}`, span: 1, tag: 'th' as const, cls: '' }))]
    : numbers.map((n) => ({ text: String(n), span: 1, tag: 'th' as const, cls: '' }));
  const rows: Cell[][] = [header];
  let row: Cell[] = [];
  let used = 0;
  const close = () => {
    const offset: Cell[] = bytes ? [{ text: `0x${(base + BigInt((rows.length - 1) * cols)).toString(16).padStart(2, '0')}`, span: 1, tag: 'td', cls: 'offset' }] : [];
    rows.push([...offset, ...(desc ? row.reverse() : row)]);
    row = [];
    used = 0;
  };
  spec.fields.forEach((value, i) => {
    const [text, size, cls] = field(value, i);
    let left = size;
    while (left > 0) {
      const span = Math.min(left, cols - used);
      row.push({ text, span, tag: 'td', cls });
      used += span;
      left -= span;
      if (used === cols) close();
    }
  });
  if (used > 0) throw new Error(`fields end ${used} ${spec.unit}s into the last row; add {"pad": ${cols - used}}`);
  return rows;
}

export function html(rows: Cell[][]): string {
  const cell = (c: Cell) => `<${c.tag}${c.span > 1 ? ` colspan="${c.span}"` : ''}${c.cls ? ` class="${c.cls}"` : ''}>${esc(c.text)}</${c.tag}>`;
  return `<table class="mem-layout">\n${rows.map((r) => `<tr>${r.map(cell).join('')}</tr>`).join('\n')}\n</table>`;
}

export function wrapCellText(text: string, maxWidth: number, fontSize: number, padding: number): string[] {
  const charWidth = fontSize * ADVANCE;
  const maxChars = Math.max(1, Math.floor((maxWidth - padding * 2) / charWidth));
  if (text.length <= maxChars) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  if (words.length > 1) {
    let current = '';
    for (const word of words) {
      const candidate = current ? current + ' ' + word : word;
      if (candidate.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines;
  }
  for (let i = 0; i < text.length; i += maxChars) lines.push(text.substring(i, i + maxChars));
  return lines;
}

const PAINT: Record<string, [string, string, string]> = {
  header: ['svg-cell-header', 'table-header-bg', 'sh'],
  field: ['svg-cell-field', 'bg-elevated', 'sf'],
  pad: ['svg-cell-pad', 'bg-sunken', 'sp'],
  other: ['svg-cell-default', 'bg-surface', 'sd'],
};
const TEXT: Record<string, string> = { sh: 'table-header-text', sf: 'accent-primary', sp: 'text-muted', sd: 'text-secondary' };

export function layout(rows: Cell[][], label: string, p: Profile = PROFILES.blog): Scene {
  const hasOffset = rows[0][0] && (rows[0][0].text === 'Offset' || rows[0][0].cls.includes('offset'));
  const totalSpan = rows[0].slice(hasOffset ? 1 : 0).reduce((sum, cell) => sum + cell.span, 0);
  const unitW = (p.width - (hasOffset ? p.offset : 0)) / totalSpan;
  const cellWidth = (cell: Cell, column: number) => (hasOffset && column === 0 ? p.offset : cell.span * unitW);
  const rowHeights = rows.map((row, rowIndex) => {
    if (rowIndex === 0) return p.header;
    let maxLines = 1;
    row.forEach((cell, column) => {
      if (cell.cls.includes('offset')) return;
      maxLines = Math.max(maxLines, wrapCellText(cell.text, cellWidth(cell, column), p.font, p.pad).length);
    });
    return Math.max(p.minRow, maxLines * p.line + p.pad * 2);
  });
  const height = rowHeights.reduce((sum, h) => sum + h, 0);
  const shapes: Shape[] = [];
  let y = 0;
  rows.forEach((row, rowIndex) => {
    const h = rowHeights[rowIndex];
    let x = 0;
    row.forEach((cell, column) => {
      const w = cellWidth(cell, column);
      const isHeader = cell.tag === 'th' || cell.cls.includes('offset');
      const [cls, fill, textCls] = PAINT[isHeader ? 'header' : cell.cls.includes('field') ? 'field' : cell.cls.includes('pad') ? 'pad' : 'other'];
      shapes.push({ kind: 'rect', x, y, w, h, fill, stroke: 'border-default', cls });
      const size = isHeader ? p.headerFont : p.font;
      const put = (text: string, ty: number, squeeze: boolean) =>
        shapes.push({ kind: 'text', x: x + w / 2, y: ty, text, size, anchor: 'middle', fill: TEXT[textCls], cls: textCls, central: true, fit: squeeze ? w - p.pad : undefined });
      if (isHeader) {
        put(cell.text, y + h / 2, cell.text.length * size * ADVANCE > w - p.pad);
      } else {
        const lines = wrapCellText(cell.text, w, size, p.pad);
        const firstY = y + (h - lines.length * p.line) / 2 + p.line / 2;
        lines.forEach((line, i) => put(line, firstY + i * p.line, line.length * size * ADVANCE > w - p.pad && line.length <= 12));
      }
      x += w;
    });
    y += h;
  });
  return { width: p.width, height, label, font: 'code-mono', shapes };
}
