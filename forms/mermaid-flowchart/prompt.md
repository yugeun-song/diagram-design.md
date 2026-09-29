# Mermaid flowchart

Rounded nodes with a hard offset shadow, thick edges and short labels. Use it for pipelines and decisions, and with rank-pinned subgraphs for state machines.

## Prompt

Write the flow below as a Mermaid `flowchart TD` (or `LR`).

- A pipeline or decision tree keeps one direction and no cycles. A state machine or any other cyclic flow pins each rank with a `subgraph` instead of `stateDiagram-v2`, so back edges stay short.
- A node label is one function name, or a few words at most. Explanations go in the prose.
- Edge labels are one to three words. Draw solid arrows only (`-->`, `-- label -->`).
- Give a node at most one class:
  - `:::accent` the result, or the point of the diagram
  - `:::info` the normal or fast path
  - `:::warn` a slow or risky step
  - `:::danger` an error
  - `:::muted` something off the main path
  - `:::code` a label that is entirely a code token: signature, variable, flag, hex value. A bare function name is not one. A code token that fits a role above takes the role class.
- Quote any label with a character other than letters, digits, spaces and `_`, as in `read["read()"]`.
- Use one language in all labels, and no `<` or `&`.
- Add no `%%{init}%%`, `classDef` or `style` lines. The page supplies the look.
- Put `%% id: <name>` right after the diagram type to name exported files.

Output only the Mermaid source.

## Slides

A slide needs node labels of 18pt or more. When `dg.ts slide` reports them smaller, write `<id>.slide.mmd`: fewer ranks, shorter labels, often `LR`. It never goes into a post.
