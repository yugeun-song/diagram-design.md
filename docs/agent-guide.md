# diagram-design.md

Diagrams as code for vmfault.dev posts and slide decks. Each diagram is a short JSON source in one of five forms; the blog draws it at build time, and `dg.ts` exports it for slides.

- `README.md` states the design. "Form" fixes the shapes, stroke weights and layout of all five forms, and "Colors" takes every color from a role variable of the active theme. "Commands" and "Test" list the CLI and the checks.
- Each `forms/<form>/prompt.md` tells a person or a model how to write that form's source; `example.json` and `mockup.png` sit beside it. `node dg.ts mockup forms/<form>` redraws a mockup.
- Check a change with `npm run typecheck`, `npm run lint` and `npm test`, defined in `package.json`; they need `npm install` first. `npm run format` applies Prettier and the ESLint layout fixes. `.github/workflows/test.yml`, started by hand, repeats the checks on Linux, Windows and macOS and fails when they leave the checkout changed.
- The tests compare the examples of four forms with the reference SVGs in `test/golden/`, and run `lintJoins` (`src/joins.ts`) on every example. A change to what a form accepts or draws also updates that form's `prompt.md`, `README.md` and `test/dg.test.ts`. When the drawing changes, `test/golden/` and the form's `mockup.png` change with it.
- The blog mounts this repository as its `diagrams` submodule, lays each source out through `layoutOf` in `src/forms.ts`, and type-checks `src/` with its own `npm run typecheck`. `slide`, `mockup`, `tokens` and the `tokens.json` drift test read the blog checkout at `--blog`, default `../blog`.
