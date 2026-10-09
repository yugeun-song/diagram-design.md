import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as memoryLayout from '../src/memory-layout.ts';
import * as memoryTable from '../src/memory-table.ts';
import { lintMermaid } from '../src/mermaid.ts';
import { lintStatic, toStatic, toWeb } from '../src/scene.ts';
import * as structChain from '../src/struct-chain.ts';
import { loadTokens, readBlogTokens } from '../src/tokens.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const layoutSpec: memoryLayout.MemoryLayout = JSON.parse(read('../forms/memory-layout/example.json'));
const tableSpecs: memoryTable.MemoryTable[] = JSON.parse(read('../forms/memory-table/example.json'));
const chainSpec: structChain.StructChain = JSON.parse(read('../forms/struct-chain/example.json'));
const tokens = loadTokens();

test('the memory layout example renders the reference svg', () => {
  assert.equal(toWeb(memoryLayout.layout(layoutSpec)) + '\n', read('golden/frame-chain.svg'));
});

test('a field longer than four whole rows folds to its first row, a gap row and its last row', () => {
  const g = memoryTable.grid({ unit: 'byte', fields: [['buf (char[256])', 256], ['len (int)', 4], { pad: 4 }] });
  assert.deepEqual(g.rows.map((r) => [r.offset, r.cells.map((c) => c.kind).join(',')]), [
    ['0x00', 'field'], ['0x08', 'gap'], ['0xf8', 'field'], ['0x100', 'field,pad'],
  ]);
  assert.equal(g.end, '0x108');
  const short = memoryTable.grid({ unit: 'byte', fields: [['buf (char[32])', 32]] });
  assert.equal(short.rows.length, 4);
  const html = `<table class="mem-layout"><tr><th>Offset</th>${g.headers.map((h) => `<th>${h}</th>`).join('')}</tr>`
    + g.rows.map((r) => `<tr><td class="offset">${r.offset}</td>${r.cells.map((c) => `<td${c.span > 1 ? ` colspan="${c.span}"` : ''} class="${c.kind}">${c.text}</td>`).join('')}</tr>`).join('') + '</table>';
  assert.deepEqual(memoryTable.parseTable(html).rows, g.rows);
});

test('the memory table examples render the reference svg, and a raw table gives the same grid', () => {
  for (const spec of tableSpecs) {
    const g = memoryTable.grid(spec);
    assert.equal(toWeb(memoryTable.layout(g, spec.label ?? '')) + '\n', read(`golden/${spec.id}.svg`));
    const header = (g.rows[0].offset !== undefined ? '<th>Offset</th>' : '') + g.headers.map((h) => `<th>${h}</th>`).join('');
    const rows = g.rows.map((r) => (r.offset !== undefined ? `<td class="offset">${r.offset}</td>` : '')
      + r.cells.map((c) => `<td${c.span > 1 ? ` colspan="${c.span}"` : ''} class="${c.kind}">${c.text}</td>`).join(''));
    const parsed = memoryTable.parseTable(`<table class="mem-layout"><tr>${header}</tr>${rows.map((r) => `<tr>${r}</tr>`).join('')}</table>`);
    assert.deepEqual(parsed, g);
  }
});

test('static svgs use presentation attributes only', () => {
  const scenes = (['blog', 'slide'] as const).flatMap((profile) => [
    memoryLayout.layout(layoutSpec, memoryLayout.PROFILES[profile]),
    ...tableSpecs.map((spec) => memoryTable.layout(memoryTable.grid(spec), spec.label ?? '', memoryTable.PROFILES[profile])),
    structChain.layout(chainSpec, structChain.PROFILES[profile]),
  ]);
  for (const scene of scenes) {
    for (const theme of Object.keys(tokens.themes)) assert.deepEqual(lintStatic(toStatic(scene, tokens, theme)), []);
  }
});

test('a pointer into a sized region lands in proportion', () => {
  const scene = memoryLayout.layout({
    label: 'x',
    regions: [{ id: 'buf', word: 'buffer', start: '0x1000', size: '0x100' }, { value: '0x1080', start: '0x800', to: 'buf' }],
  });
  const paths = scene.shapes.filter((shape) => shape.kind === 'path').map((shape) => shape.d);
  assert.ok(paths.some((d) => d.endsWith('Q 493 130 481 130 H 469')));
  assert.ok(paths.includes('M 460 130 L 472 124 L 472 136 Z'));
});

test('tones, spans, a title and code lines take theme roles', () => {
  const spec: memoryLayout.MemoryLayout = {
    label: 'a struct whose member a span names',
    title: [['type: struct s', 'orange'], ' (s[0])'],
    regions: [
      { id: 'b', value: '0x2', sub: '(b, +0x008)', start: '0x1008' },
      { id: 'a', value: '0x1', sub: '(a, +0x000)', start: '0x1000', marker: 'ptr: p', tone: 'red' },
    ],
    spans: [{ from: 'b', to: 'b', label: 'member: b', sub: '(+0x008)', tone: 'purple' }],
    code: [[['p', 'red'], ' - 0x8 = ', ['0x1000', 'blue']]],
  };
  const scene = memoryLayout.layout(spec);
  const svg = toWeb(scene);
  assert.match(svg, /<tspan style="fill:var\(--diagram-orange\)">type: struct s<\/tspan><tspan style="fill:var\(--diagram-ink\)"> \(s\[0\]\)<\/tspan>/);
  assert.match(svg, /<line x1="475" y1="[\d.]+" x2="475" y2="[\d.]+" style="stroke:var\(--diagram-purple\)/);
  assert.match(svg, /<path d="M 475 [\d.]+ L 469 [\d.]+ L 481 [\d.]+ Z" style="fill:var\(--diagram-purple\)"\/>/);
  assert.match(svg, /style="fill:var\(--diagram-purple\)">member: b<\/text>/);
  assert.match(svg, /style="fill:var\(--diagram-red\)">ptr: p<\/text>/);
  assert.match(svg, /<tspan style="fill:var\(--diagram-red\)">p<\/tspan><tspan style="fill:var\(--diagram-ink\)"> - 0x8 = <\/tspan><tspan style="fill:var\(--diagram-blue\)">0x1000<\/tspan>/);
  assert.deepEqual(lintStatic(toStatic(scene, tokens, 'clean-light')), []);
  assert.throws(() => memoryLayout.layout({ ...spec, spans: [{ from: 'a', to: 'b', label: 'x' }] }), /from must be at or above to/);
  assert.throws(() => memoryLayout.layout({ ...spec, code: [[['p', 'teal' as memoryLayout.Tone]]] }), /unknown tone "teal"/);
  assert.throws(() => memoryLayout.layout({ ...spec, regions: [{ ...spec.regions[0], tone: 'orange' }, spec.regions[1]] }), /colors the marker; add one/);
  const bracket = toWeb(memoryLayout.layout({ ...spec, spans: [{ ...spec.spans![0], shape: 'bracket' }] }));
  assert.match(bracket, /<path d="M 461 [^"]*" fill="none" style="stroke:var\(--diagram-purple\)/);
  assert.throws(() => memoryLayout.layout({ ...spec, spans: [{ ...spec.spans![0], shape: 'arc' as 'bracket' }] }), /must be "dimension" or "bracket"/);
  const lines = toWeb(memoryLayout.layout({ ...spec, spans: [{ ...spec.spans![0], sub: ['struct s', '(s[0])'] }] }));
  assert.match(lines, /style="fill:var\(--diagram-purple\)">struct s<\/text>/);
  assert.match(lines, /style="fill:var\(--diagram-purple\)">\(s\[0\]\)<\/text>/);
  assert.throws(() => memoryLayout.layout({ ...spec, spans: [{ ...spec.spans![0], sub: [] }] }), /must be a non-empty string or a list of them/);
  assert.throws(() => memoryLayout.layout({ ...spec, spans: [{ ...spec.spans![0], sub: 'x'.repeat(30) }] }), /split it into lines/);
});

test('the struct chain example renders the reference svg', () => {
  assert.equal(toWeb(structChain.layout(chainSpec)) + '\n', read('golden/user-info-list.svg'));
});

test('a struct chain links only the embedded members, rings back to its head and measures offsetof on each node', () => {
  const texts = (scene: ReturnType<typeof structChain.layout>) => scene.shapes.flatMap((shape) => (shape.kind === 'text' ? [shape.text] : []));
  const rings = (scene: ReturnType<typeof structChain.layout>) => scene.shapes.filter((shape) => shape.kind === 'path' && shape.stroke && shape.d.includes(' V ')).length;
  const ring = structChain.layout(chainSpec);
  assert.equal(rings(ring), 1);
  assert.equal(texts(ring).filter((t) => t === 'offsetof').length, 1);
  assert.equal(texts(ring).filter((t) => t === '= 0x100').length, 1);
  assert.equal(texts(ring).filter((t) => t === 'padding').length, 3);
  assert.equal(texts(ring).filter((t) => t === 'next').length, 4 + 4);
  const line = structChain.layout({ ...chainSpec, head: undefined });
  assert.equal(rings(line), 0);
  assert.equal(texts(line).filter((t) => t === 'next').length, 3 + 2);
  const first = structChain.layout({ ...chainSpec, fields: [['list', 16], ['username', 256], ['age', 1], { pad: 7 }] });
  assert.ok(!texts(first).includes('offsetof'));
  assert.match(toWeb(ring), /<rect x="[\d.]+" y="128" width="92" height="36" style="fill:var\(--diagram-purple-wash\)"\/>/);
});

test('invalid specs name the problem', () => {
  const spec = (patch: object): memoryLayout.MemoryLayout => ({
    label: 'x',
    regions: [{ id: 'a', value: '0x10', start: '0x10' }, { value: '0x10', start: '0x8', to: 'a', ...patch }],
  });
  assert.throws(() => memoryLayout.layout(spec({ to: 'b' })), /is not a region id/);
  assert.throws(() => memoryLayout.layout(spec({ start: '0x20' })), /start: must be lower/);
  assert.throws(() => memoryLayout.layout(spec({ value: '0x18' })), /give the target a size/);
  assert.throws(() => memoryLayout.layout(spec({ colour: 'red' })), /unknown field "colour"/);
  assert.throws(() => memoryLayout.layout({ label: 'x', regions: [{ id: 'a', word: 'w', start: '0x20', h: 20 }, { value: '0x20', start: '0x10', to: 'a', h: 20 }] }), /needs 24; raise h/);
  assert.throws(() => memoryTable.grid({ unit: 'byte', fields: [['a', 3]] }), /add \{"pad": 5\}/);

  const chain = (patch: object): structChain.StructChain => ({ ...chainSpec, ...patch });
  assert.throws(() => structChain.layout(chain({ link: { field: 'node', cells: ['next'] } })), /"node" is not one of the fields/);
  assert.throws(() => structChain.layout(chain({ link: { field: 'list', cells: [] } })), /one to three pointer names/);
  assert.throws(() => structChain.layout(chain({ nodes: [{ name: 'a', values: { list: '0x0' } }] })), /"list" is not a field outside the link/);
  assert.throws(() => structChain.layout(chain({ fields: [['a', 8], ['a', 8], ['list', 16]] })), /"a" is used twice/);
  assert.throws(() => structChain.layout(chain({ fields: [{ pad: 8 }, ['list', 16]], nodes: [{ name: 'a' }] })), /too short for the offsetof dimension/);
  assert.throws(() => structChain.layout(chain({ tones: { edge: 'red' } })), /tones: unknown field "edge"/);
  assert.throws(() => structChain.layout(chain({ tones: { walk: 'green' } })), /unknown tone "green"/);
  assert.throws(() => structChain.layout(chain({ nodes: [...chainSpec.nodes, { name: 'users[3]' }] })), /4 structures need \d+ units, past 700/);
  assert.throws(() => structChain.layout(chain({ head: { name: 'h', next: 'x' } })), /head: unknown field "next"/);
});

test('review regressions stay fixed', () => {
  const desc = memoryTable.grid({ unit: 'bit', cols: 8, order: 'desc', fields: [['EN', 1], ['MODE', 3], { pad: 4 }] });
  assert.deepEqual(desc.headers, ['7', '6', '5', '4', '3', '2', '1', '0']);
  assert.deepEqual(desc.rows[0].cells.map((c) => c.text), ['pad', 'MODE', 'EN']);
  assert.throws(() => memoryTable.grid({ unit: 'bit', order: 'DESC' as 'desc', fields: [['a', 32]] }), /order/);
  const based = memoryTable.grid({ unit: 'byte', base: '0xffff800083fcbc30', fields: [['a', 8], ['b', 8]] });
  assert.deepEqual([...based.rows.map((r) => r.offset), based.end], ['0xffff800083fcbc30', '0xffff800083fcbc38', '0xffff800083fcbc40']);
  assert.throws(() => memoryTable.grid({ unit: 'byte', base: 4096 as unknown as string, fields: [['a', 8]] }), /base/);
  assert.ok(toWeb(memoryTable.layout(memoryTable.grid({ unit: 'byte', fields: [['map (std::map<int,int>)', 8]] }), 'x')).includes('std::map&lt;int,int&gt;'));
  assert.throws(() => memoryTable.grid({ unit: 'byte', cols: 200, fields: [['a', 200]] }), /cols/);
  assert.throws(() => memoryTable.grid({ unit: 'byte', fields: [null as unknown as memoryTable.Field] }), /expected/);
  assert.throws(() => memoryTable.parseTable('<table class="mem-layout"><tr><th>0</th><th>1</th></tr><tr><td class="field">a</td></tr></table>'), /spans 1 columns/);

  const sized = memoryLayout.layout({ label: 'x', regions: [
    { id: 'hi', word: 'other', start: '0x8000' },
    { id: 'buf', word: 'buffer', start: '0x1000', size: '0x100' },
    { value: '0x1080', start: '0x800', to: 'buf' },
  ] });
  assert.ok(sized.shapes.some((shape) => shape.kind === 'path' && shape.d === 'M 460 246 L 472 240 L 472 252 Z'));
  assert.throws(() => memoryLayout.layout({ label: 'x', regions: [{ id: 'a', word: 'a', h: '50' as unknown as number, start: '0x20' }] }), /h: must be a positive number/);
  assert.throws(() => memoryLayout.layout({ label: 'x', regions: [{ value: 4096 as unknown as string }] }), /must be a non-empty string/);
  assert.throws(() => memoryLayout.layout({ label: 'x', regions: [{ word: 'a\nb' }] }), /control character/);
  assert.throws(() => memoryLayout.layout({ label: 'x', regions: [
    { id: 'r0', word: 'r0', start: '0x60' }, { id: 'r1', word: 'r1', start: '0x50' }, { value: '0x50', start: '0x40', to: 'r1' },
    { gap: true }, { gap: true }, { value: '0x60', start: '0x10', to: 'r0' },
  ] }), /runs into the arrow|cross/);

  const table = memoryTable.layout(memoryTable.grid({ unit: 'byte', fields: [['code (u16)', 2], ['jt (u8)', 1], ['jf (u8)', 1], ['k (u32)', 4]], label: 'struct sock_filter' }), 'struct sock_filter');
  assert.deepEqual(lintStatic(toStatic(table, tokens, 'clean-light')), []);
  assert.deepEqual(lintStatic('<svg><text fill="#000">filter opacity transform var(x)</text></svg>'), []);
  assert.equal(lintStatic('<svg><rect style="fill:red"/></svg>').length, 1);
});

test('the mermaid lint flags what the page would break', () => {
  assert.deepEqual(lintMermaid('flowchart TD\n    a --> b'), []);
  assert.deepEqual(lintMermaid('flowchart TD\n    a -.-> b'), []);
  assert.equal(lintMermaid('flowchart TD\n    a:::info').length, 1);
  assert.equal(lintMermaid('flowchart TD\n    classDef x fill:red').length, 1);
  assert.equal(lintMermaid('flowchart TD\n    a:::accent:::muted').length, 1);
});

const blog = fileURLToPath(new URL('../../blog/', import.meta.url));
test('tokens.json matches the blog themes', { skip: !existsSync(blog) && 'no blog checkout' }, () => {
  assert.deepEqual(readBlogTokens(blog), tokens);
});
