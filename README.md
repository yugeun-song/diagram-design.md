# diagram-design.md

Diagrams as code for [vmfault.dev](https://vmfault.dev) posts and slide decks. Each diagram is a short text source. `dg.ts` turns it into the markup a post takes and into files a deck takes.

| Form | Source | Use it for |
|---|---|---|
| [memory-layout](forms/memory-layout/) | JSON | stack frames, pointer chains, address spaces |
| [memory-table](forms/memory-table/) | JSON | struct layouts, packet headers, register bitfields |
| [mermaid-flowchart](forms/mermaid-flowchart/) | Mermaid | pipelines, decisions, state machines |
| [mermaid-sequence](forms/mermaid-sequence/) | Mermaid | syscalls, handshakes, RPC |

Each folder holds `prompt.md` (how to write the source, for a person or a model), `example.*` and `mockup.png` (clean-light left, spaceduck right).

## Commands

Node 26 runs `dg.ts` as is. There is nothing to install.

| Command | Output |
|---|---|
| `node dg.ts render x.json` | post markup: `<svg class="mem-diagram">`, or `<table class="mem-layout">` (`--svg` for its SVG) |
| `node dg.ts render x.json --flavor static --theme spaceduck` | a standalone SVG in hex colors |
| `node dg.ts slide x.json` | per theme, a slide-sized static SVG and a 2x PNG in `out/` |
| `node dg.ts slide x.mmd` | per theme, a 2x PNG of the diagram as the blog draws it |
| `node dg.ts check x.json y.mmd` | validation, Mermaid lint and a slide-fit warning |
| `node dg.ts mockup forms/<form>` | the folder's `mockup.png` |
| `node dg.ts tokens [--check]` | `tokens.json` from the blog themes, or a drift check |

`slide`, `mockup` and `tokens` read the blog checkout at `--blog` (default `../blog`): theme CSS, fonts and, for Mermaid, a temporary build of the engine. Chrome renders the PNGs.

## Slides

- A static SVG uses presentation attributes and hex colors only, with no `<style>`, `var()`, classes, markers or `foreignObject`. PowerPoint can insert it and convert it to shapes. Google Slides takes the PNG.
- The slide profile shortens memory regions and enlarges table text. Text at the fitted size must reach 18pt, or 14pt for notes and headers. A diagram that falls short fails with the scale it needs; write a shorter variant such as `example.slide.mmd`.
- Editing in PowerPoint needs Cascadia Code, Atkinson Hyperlegible and Pretendard installed.

## Test

`node --test test/*.test.ts`
