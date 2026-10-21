# Memory layout

A column of memory regions, addresses on its left and pointer arrows on its right. Use it when the point is the addresses, the values stored at them and the pointers between them: stack frames, pointer chains, address spaces.

## Prompt

Write the layout below as one JSON object. The tool computes every coordinate, color and arrow. Colors follow the theme, light by default, and can be changed freely to suit any theme. The shapes, stroke weights and layout stay fixed.

- `label`: one sentence that says what the diagram shows. It becomes the `aria-label`.
- `id`: a short kebab-case name for exported files.
- `regions`: from the highest address to the lowest. Each region has exactly one of:
  - `value`: the value stored there. Copy addresses exactly as the tool printed them.
  - `word`: a plain word when the region holds no single value, such as `truncated`.
  - `"gap": true`: an omitted span, drawn as `...`.
- Optional region fields:
  - `sub`: a second line under the value, in the same size and color, such as `(caller frame)`. A gap takes none.
  - `start`: the region's lowest address, printed at its bottom edge. Starts fall from top to bottom.
  - `marker`: the register that holds `start`, such as `X29 = sp`.
  - `tone`: the color of `marker`: `red`, `orange`, `blue` or `purple`. Each theme shades the hue for its background, so a tone keeps one meaning across themes. Without a tone a marker takes the red tone.
  - `fill`: the region's fill: `area` (the default), `gap` for padding or unused bytes that still show their value, or a tone for its light wash, such as `purple` for the cells of an embedded `list_head`. A gap takes the gap fill.
  - `id`: a name for `to` to target.
  - `to`: the id of the region the value points into. The arrow and its `*(value)` label are derived. The value must equal the target's `start`, or lie above it when the target has a `size` or the region above it has a `start`.
  - `h`: a height as a multiple of the default row, which is the column width over 2.3 (a gap is 0.6 of it); 2 draws a row twice as tall. The row must stay at least 30 units tall, or 44 with a `sub`.
- Optional top-level fields:
  - `title`: one line of runs above the column, short enough to clear the `high` label of the address axis. A run is `"text"` or `["text", tone]`.
  - `spans`: marks on the right that name a run of regions, each `{"from": id, "to": id, "label": "...", "sub": "...", "tone": ..., "shape": ...}` with `from` the higher region. The default `"shape": "dimension"` draws a dimension line with an open arrowhead at each boundary, for sizes and offsets. `"bracket"` draws a bracket, for grouping. Nested spans take outer lanes. A span cannot share rows or a boundary with an arrow. A `sub` that does not fit one line can be a list of lines, such as `["struct user_info", "(users[0])"]`.
  - `code`: lines of runs under the column, such as a call whose arguments take the tones of the regions they name.
- Use one language in the whole diagram.
- The tool draws every stroke and join. Do not edit the SVG it writes: its strokes meet on center lines or under a covering stroke, its corners are single mitered paths, and nothing touches edge to edge, so no seam, notch or hairline gap shows at any zoom.

Output only the JSON.
