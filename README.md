# diagram-design.md

Diagrams as code for [vmfault.dev](https://vmfault.dev) posts and slide decks. Each diagram is a short text source; the blog draws it at build time, and `dg.ts` exports it for slides.

| Form | Source | Use it for |
|---|---|---|
| [memory-layout](forms/memory-layout/) | JSON | stack frames, pointer chains, address spaces |
| [memory-table](forms/memory-table/) | JSON | struct layouts, packet headers, register bitfields |
| [struct-chain](forms/struct-chain/) | JSON | intrusive lists: structures linked through an embedded member, and `container_of` |
| [canvas](forms/canvas/) | JSON | free figures on coordinates: a structure and the memory it points into, bit fields shifted and masked, bitmap words, structures with field boxes |
| [mermaid-flowchart](forms/mermaid-flowchart/) | Mermaid | pipelines, decisions, state machines |
| [mermaid-sequence](forms/mermaid-sequence/) | Mermaid | syscalls, handshakes, RPC |

Each folder holds `prompt.md` (how to write the source, for a person or a model), `example.*` and `mockup.png` (light left, dark right).

## Form

All six share the form of the memory-layout figure. The form, the stroke weights and the layout are the design and stay fixed.

- Strokes: ink lines 2 wide, box borders 1.6 wide, marker lines 2.4, radius-12 bends on arrows while boxes keep square corners, dashes 6 on 4, in the code-block frame.
- Boxes: about 2.3 times as wide as tall, the longest label filling about 60 to 70 % of the width; opaque area and gap fills. A memory-layout row takes its height from the column width, and `h` scales it.
- Text: bold labels in the code font, in one style inside every box: a second line keeps the size and color, and an omitted region reads `...`. The blog renders the 15-unit label at the size of its code text. Code lines are set like the page's code blocks: regular weight, 13.4 units on a 22.1-unit step.
- Arrowheads: a pointer ends in a 12-unit triangle 5 units short of the line or box it points at, a dimension line in an open right angle 1.5 units short of its extension line, so neither touches it.
- Joins: no seams, notches or hairline gaps at any zoom, since anti-aliasing shows each. A stroke ends on the center line of the shape it meets or under it, never on its edge; a corner is one mitered path. A reference line (outline, separator, extension line) is painted over the bracket or shaft that touches it, which rests on its edge. No gap is narrower than 1 unit, and two fills meet only under a stroke. `lintJoins` (`src/joins.ts`) finds each of these, and the tests run it on every example.
- Mermaid: the blog's script holds arrowheads at the same distance and routes flowchart edges orthogonally, straight when the boxes line up, otherwise with one bend between ranks, entering a box at least 16 units from its corners. It starts sequence messages at the lifeline's center, squares frame dashes so their corners close, and clears the lifelines behind frame conditions and message labels.

## Colors

Colors are not part of the form. Each comes from a role variable of the active theme and can be changed freely. In the blog the role variables point into the palette families that `build/palette.py` writes to `styles/themes/palette.css`; `tokens.json` stores what they resolve to. The default is light, the left half of each mockup:

| Role | Variable | light |
|---|---|---|
| frame | `--code-bg`, `--code-border` | `#f6f8fa`, `#d0d7de` |
| strokes, labels, `accent` nodes | `--diagram-ink` | `#1a1a1a` |
| regions, participants, nodes, untoned link cells | `--diagram-area` | `#b3e4cd` |
| gaps, padding (memory-layout `"fill": "gap"`), `muted` nodes | `--diagram-gap` | `#eef0f3` |
| tones (memory-layout `tone`, `title`, `spans`, `code`; struct-chain `tones`, `code`); red also for untoned markers, `alt` frames and `danger` nodes | `--diagram-red`, `--diagram-orange`, `--diagram-blue`, `--diagram-purple` | `#c42551`, `#fd7e14`, `#1971c2`, `#7950f2` |
| struct-chain link cells of a toned `link`, memory-layout regions with a tone `fill` | `--diagram-red-wash`, `--diagram-orange-wash`, `--diagram-blue-wash`, `--diagram-purple-wash` | `#ffd8db`, `#fddbc8`, `#cfe6ff`, `#e1dfff` |
| headers, padding labels, region and field notes, `⋮` | `--text-secondary` | `#4a4a4a` |
| Mermaid notes | `--box-warn-bg`, `--box-warn-border` | `#f4e0c2`, `#fd7e14` |

`tokens.json` holds the other themes' values, except the note colors, which only the blog's styles define.

## Posts

The blog mounts this repository as its `diagrams` submodule. A post writes the source in a fenced block (` ```memory-layout `, ` ```memory-table `, ` ```struct-chain `, ` ```canvas ` or ` ```mermaid `). The build draws the four JSON forms as SVG and fails on an invalid spec; the page draws Mermaid.

## Commands

Node 26 runs `dg.ts` as is; there is nothing to install.

| Command | Output |
|---|---|
| `node dg.ts check x.json y.mmd` | validation, Mermaid lint and a slide-fit warning |
| `node dg.ts render x.json` | the `<svg class="mem-diagram">` the blog builds |
| `node dg.ts render x.json --flavor static --theme spaceduck` | a standalone SVG in hex colors |
| `node dg.ts slide x.json` | per theme, a slide-sized static SVG and a 2x PNG in `out/` |
| `node dg.ts slide x.mmd` | per theme, a 2x PNG of the diagram as the blog draws it |
| `node dg.ts mockup forms/<form>` | the folder's `mockup.png` |
| `node dg.ts tokens [--check]` | `tokens.json` from the blog themes, or a drift check |

`slide`, `mockup` and `tokens` read the blog checkout at `--blog` (default `../blog`): theme CSS, fonts and, for Mermaid, a temporary build of the engine. `slide` and `mockup` draw their PNGs in a headless browser that `src/png.ts` drives through `src/chrome.ts`; `render`, `check`, `tokens` and the tests need no browser.

## Slides

- A static SVG uses presentation attributes and hex colors only: no `<style>`, `var()`, classes, markers or `foreignObject`. A slide editor that imports SVG can convert it to shapes; one that takes only images gets the PNG.
- The slide profile shortens memory regions and enlarges small text. At the fitted size, text must reach 18pt, or 14pt below 15 units (notes, headers, code lines). A diagram that falls short fails with the scale it needs; write a shorter variant such as `example.slide.mmd`.
- Editing the converted shapes needs the three font families that `tokens.json` names installed.

## Test

`npm test` runs the tests. With the blog checked out next to this repo, `../blog/node_modules/.bin/tsc -p . --typeRoots ../blog/node_modules/@types` type-checks it in strict mode; the blog's `npm run typecheck` covers `src/` too.
