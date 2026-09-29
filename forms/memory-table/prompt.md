# Memory table

A byte or bit layout drawn as a grid in the memory-layout style, with offsets on its left edge. Use it for data that is wide and flat: struct layouts, packet headers, register bitfields.

## Prompt

Write the layout below as one JSON object. The tool computes the rows, column spans, offsets and headers.

- `unit`: `"byte"` or `"bit"`.
- `fields`: in order from the lowest offset.
  - `["name", size]` is a field. Name a C field `name (type)`, as in `["count (int)", 4]`; the type is drawn as a note under the name. A bit field takes the name alone.
  - `{"pad": n}` is padding. Pad the last row to its end.
  - `{"other": "text", "size": n}` is any other cell.
- Optional: `cols` (units per row, default 8 bytes or 32 bits), `"order": "desc"` to number bits from the top, `base` (hex offset of the first row), `id`, `label`.
- Keep names short. A field that crosses a row boundary repeats its name on each row.

Output only the JSON.
