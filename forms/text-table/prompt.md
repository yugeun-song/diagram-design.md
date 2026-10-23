# Text table

Rows and columns of short prose drawn in the memory-layout style: a header row on the area fill, body cells on the gap fill, and every cell wrapped inside its column. Use it for terms, comparisons and checklists that would otherwise be a Markdown table, when the table should look like the figures around it.

## Prompt

Write the table below as one JSON object. The tool sizes the columns, wraps each cell and draws every stroke. Colors follow the theme, light by default, and can be changed freely to suit any theme. The shapes, stroke weights and layout stay fixed.

- `label`: one sentence that says what the table shows. It becomes the `aria-label`.
- `columns`: the header of each column, one to eight.
- `rows`: one list per row with a cell for each column, in column order.
  - A cell is a string. It wraps at spaces to fit its column, so Korean words stay whole.
  - A list of strings starts each string on a new line.
  - `""` leaves the cell empty.
- Optional: `widths`, one relative width per column such as `[2, 5, 3]`, and `id`. Without `widths` the tool sizes the columns from their text so that the table is as short as it can be.
- The table is 668 units wide at most, and the text is set at the label size. A word wider than its column breaks after `-`, `/`, `·`, `_`, `.` or `,`, or before `(`, and only a piece still too wide breaks between characters. Keep terms and file names short, or give their column a larger width.
- Five columns of short phrases fit the blog column. A slide holds about seven rows of one line, or four rows of two lines; for a taller table write a shorter variant for slides.
- The tool draws every stroke and join. Do not edit the SVG it writes: its strokes meet on center lines or under a covering stroke, its corners are single mitered paths, and nothing touches edge to edge, so no seam, notch or hairline gap shows at any zoom.

Output only the JSON.
