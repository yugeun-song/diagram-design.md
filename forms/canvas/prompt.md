# Canvas

Boxes, rows and columns of cells, notes and arrows placed on coordinates. Use it when no semantic form fits: a structure beside the memory it points into, bit fields shifted and masked, bitmap words and the bit an index selects, structures drawn with their fields as inner boxes.

## Prompt

Write the figure below as one JSON object, or a list of them. You place every item; the tool draws the boxes, sets every label inside them, ends every arrow and checks that the text fits. Colors follow the theme, light by default, and can be changed freely to suit any theme. The shapes, stroke weights and text styles stay fixed.

- `label`: one sentence that says what the figure shows. It becomes the `aria-label`.
- `id`: a short kebab-case name for exported files.
- `title`: an optional bold line centered above the figure.
- `items`: drawn in layers, every fill first, then every outline, then arrows and lines, then all text. Coordinates are diagram units; the blog column holds about 700 units at the size of code text, and a wider figure scales down or scrolls. The tool moves the whole figure so its top sits under the title, so any origin works.
- Item kinds, each written with its kind as the key:
  - `{"box": id, "x", "y", "w", "h", "label", "fill", "line"}`: one box with its label centered. `label` is a string or a list of lines.
  - `{"box": id, "x", "y", "w", "h", "title", "fields": [...]}`: a structure, its name at the top inside and its members as inner boxes, each `{"label", "id", "w", "fill", "line"}`, 28 tall and 6 apart. Fields share the width of the widest label.
  - `{"row": id, "x", "y", "h", "cells": [{"w", "label", "id", "fill", "line"}, ...]}`: cells left to right sharing their borders, for arrays and bitfields.
  - `{"column": id, "x", "y", "w", "cells": [{"h", "label", "id", "fill", "line", "fields"}, ...]}`: cells top to bottom, for memory from the high end down. A cell's `fields` sit centered inside it.
  - `{"text": "..." | [...], "x", "y", "anchor", "role", "tone", "id"}`: a note outside the boxes. `(x, y)` is the anchor point at the middle of the block; `anchor` is `start` (default), `middle` or `end`. `role` is `label` (the default, for a name), `note` (smaller and gray, for prose) or `title`.
  - `{"arrow": [point, ...], "head", "dash", "tone", "label"}`: a pointer through the listed points. Bends get the rounded corner of every arrow; segments may also run diagonally. `head` is `end` (default), `start`, `both` or `none`. `label` is `{"text", "segment", "side"}`, set beside the middle of the chosen segment (default the longest).
  - `{"line": [point, ...], "dash", "tone", "weight"}`: a stroke without heads, square at its corners: extension lines, and with `"weight": "marker"` an emphasis line such as the origin of an index.
  - `{"dimension": [point, point], "label", "side", "tone"}`: a size between two points on one axis, with an open arrowhead at each end.
- A point is `[x, y]`, a reference, or `{"at": reference, "dx", "dy"}`. A reference is `"id.top"`, `"id.bottom"`, `"id.left"`, `"id.right"` or `"id.center"` of a box, cell, field or note, with an optional fraction along the side such as `"id.top@0.25"`; `"row|k.top"` or `"row|k.bottom"` for the k-th boundary of a row (0 is its left edge); `"column|k.left"` or `"column|k.right"` for the k-th boundary of a column. An arrow that ends at a note stops 6 units short of its text.
- `fill`: `plain` (default, the frame color), `area`, `gap` (gray, for unused or virtual space), or a tone `red`, `orange`, `blue`, `purple` for its pale wash. `line`: `solid` (default), `dashed` (partial or virtual regions) or `none`. A dashed cell dashes all four of its sides, and its row or column outline follows.
- Arrows: draw a straight or diagonal arrow when its ends face each other, and bend it at most once otherwise. Set the text of a bent arrow under its horizontal segment.
- `tone`: `red`, `orange`, `blue` or `purple`. Each theme shades the hue for its background, so a tone keeps one meaning across themes.
- Proportions: give a box about 2.3 to 3 times its height in width, and let its longest label fill about 60 to 75 % of the width. A one-line cell of 28 to 40 units suits an array; a one-line region of 60 to 70 units suits a memory column.
- Labels inside boxes are one style, the same size and color on every line. A label that does not fit is an error that names the width or height it needs.
- Use one language in the whole figure.
- The tool draws every stroke and join. Do not edit the SVG it writes: its strokes meet on center lines or under a covering stroke, its corners are single mitered paths, and nothing touches edge to edge, so no seam, notch or hairline gap shows at any zoom.

Output only the JSON.
