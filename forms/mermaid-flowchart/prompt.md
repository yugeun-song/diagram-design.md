# Mermaid flowchart

Boxes and orthogonal arrows in the memory-layout style: area fills, ink strokes, bold code labels. Use it for pipelines and decisions, and with rank-pinned subgraphs for state machines.

## Prompt

Write the flow below as a Mermaid `flowchart TD` (or `LR`).

- A pipeline or decision tree keeps one direction and no cycles. A state machine or any other cyclic flow pins each rank with a `subgraph` instead of `stateDiagram-v2`, so back edges stay short.
- A node label is one function name, or a few words at most. Explanations go in the prose.
- Edge labels are one to three words. `-->` is the main path; `-.->` draws a dashed edge for an optional or asynchronous one.
- Give a node at most one class:
  - `:::accent` the result, or the point of the diagram
  - `:::muted` something off the main path
  - `:::danger` an error
- Quote any label with a character other than letters, digits, spaces and `_`, as in `read["read()"]`.
- Use one language in all labels.
- Add no `%%{init}%%`, `classDef` or `style` lines. The page supplies the look. Its colors follow the theme, clean-light by default, and can be changed freely to suit any theme. Its shapes, stroke weights and layout stay fixed.
- Put `%% id: <name>` right after the diagram type to name exported files.
- Do not steer edges with invisible links, `linkStyle` or spacer nodes. The page routes every edge itself: straight when the two boxes line up, otherwise with one bend between ranks, entering a box at least 16 units from its corners, so no edge runs along a border or hides a jog behind its label.

Output only the Mermaid source.

## Slides

A slide needs node labels of 18pt or more. When `dg.ts slide` reports them smaller, write `<id>.slide.mmd`: fewer ranks, shorter labels, often `LR`. It never goes into a post.
