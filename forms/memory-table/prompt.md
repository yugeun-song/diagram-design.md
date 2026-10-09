# Memory table

A byte or bit layout drawn as a grid in the memory-layout style, with offsets on its left edge and a ruler of column numbers along its top. Use it for data that is wide and flat: struct layouts, packet headers, register bitfields.

## Prompt

Write the layout below as one JSON object. The tool computes the rows, column spans, offsets and headers. Colors follow the theme, clean-light by default, and can be changed freely to suit any theme. The shapes, stroke weights and layout stay fixed.

- `unit`: `"byte"` or `"bit"`.
- `fields`: in order from the lowest offset.
  - `["name", size]` is a field. Name a C field `name (type)`, as in `["count (int)", 4]`; the type is drawn as a note under the name. A bit field takes the name alone.
  - `{"pad": n}` is padding. Pad the last row to its end.
  - `{"other": "text", "size": n}` is any other cell.
- Optional: `cols` (units per row, default 8 bytes or 32 bits), `"order": "desc"` to number bits from the top, `base` (hex offset of the first row), `id`, `label`.
- Keep names short. A field that crosses a row boundary repeats its name on each row.
- A field that fills more than four whole rows folds: its first and last rows stay, one `⋮` row stands for the rows between, and the offsets still count every byte.
- The tool draws every stroke and join. Do not edit the SVG it writes: its strokes meet on center lines or under a covering stroke, its corners are single mitered paths, and nothing touches edge to edge, so no seam, notch or hairline gap shows at any zoom.

Output only the JSON.
