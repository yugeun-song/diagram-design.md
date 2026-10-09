# Struct chain

Structures side by side, linked through a member each one embeds, such as a `struct list_head`. Use it when the point is that the links join only the embedded members, and that `container_of` steps back from a member to the structure around it: intrusive lists and the loops that walk them.

## Prompt

Write the chain below as one JSON object. The tool computes the boxes, the offsets, the arrows and the ring back to the head. Colors follow the theme, clean-light by default, and can be changed freely to suit any theme. The shapes, stroke weights and layout stay fixed.

- `label`: one sentence that says what the diagram shows. It becomes the `aria-label`.
- `id`: a short kebab-case name for exported files.
- `fields`: the structure's members from the lowest offset, as in a memory table: `["name", size]` or `{"pad": n}`, sizes in bytes. A row grows with the log of its size, so a big member draws taller without dwarfing the rest. A pad row reads `padding`. The sizes before the link add up to the `offsetof` that a dimension left of each box measures; the offsets are all equal, so only the first dimension carries the label.
- `link`: `{"field": "list", "cells": ["next", "prev"]}`. `field` names the embedded member that links the structures. `cells` are its pointers, the forward one first; the arrows leave from that cell and land on the next link, where the pointer points.
- `nodes`: the structures in list order, each `{"name": "users[0]", "values": {"username": "\"alice\""}}`. `values` prints a value under a member's name.
- Optional:
  - `head`: `{"name": "user_info_list", "sub": "(head)"}`, a bare link drawn on the left with its name under it. A head makes the chain a ring: the head points to the first node and the last node points back to the head. The head has no box around it and no `offsetof`, as `container_of` never applies to it.
  - `tones`: colors by role, `{"node": ..., "link": ..., "walk": ..., "offset": ...}`, for the node names, the link cells and the head, the forward arrows, and the `offsetof` dimension. A tone is `red`, `orange`, `blue` or `purple`. A toned link fills its cells with the tone's light wash and names the head in the tone. Without a tone the link cells take the area fill, and every other role takes the ink.
  - `code`: lines of runs under the chain, such as the loop that walks it. The lines share a left edge, so indentation shows. A run is `"text"` or `["text", tone]`.
- The canvas is as wide as the other forms. A head and three nodes fit; the tool says when a chain does not.
- Use one language in the whole diagram.
- The tool draws every stroke and join. Do not edit the SVG it writes: its strokes meet on center lines or under a covering stroke, its corners are single mitered paths, and nothing touches edge to edge, so no seam, notch or hairline gap shows at any zoom.

Output only the JSON.
