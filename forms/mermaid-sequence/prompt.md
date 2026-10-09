# Mermaid sequence

Participants, messages and frames in the memory-layout style: area fills, ink strokes, bold code labels. Use it for ordered interactions: syscall traces, packet flows, handshakes, RPC, lifecycles. Its grid layout cannot collide.

## Prompt

Write the interaction below as a Mermaid `sequenceDiagram`.

- Declare the participants in the order they first act, each with a short lowercase alias and `as <name>` when the name has spaces.
- `->>` is a call or request, `-->>` a reply or completion.
- A message label is the function, syscall, value or event (an IRQ, a signal) that crosses, on one line.
- Branches use `alt` / `else`, repetition `loop` and optional steps `opt`. Name each branch in one or two words.
- `Note over <participant>` marks work done without a message. Use it sparingly.
- Add no `%%{init}%%` or styling lines. The page supplies the look. Its colors follow the theme, clean-light by default, and can be changed freely to suit any theme. Its shapes, stroke weights and layout stay fixed.
- Put `%% id: <name>` right after the diagram type to name exported files.
- Do not pad labels with spaces to dodge lifelines. The page centers each branch name in its frame, clears the lifelines behind branch names and message labels, starts each message at its lifeline's center and closes the frame's dashed corners.

Output only the Mermaid source.

## Slides

A slide needs labels of 18pt or more. When `dg.ts slide` reports them smaller, write `<id>.slide.mmd` with fewer participants and shorter labels. Its frontmatter may narrow the layout, as in `sequence: {mirrorActors: false, width: 130, actorMargin: 40}`. It never goes into a post.
