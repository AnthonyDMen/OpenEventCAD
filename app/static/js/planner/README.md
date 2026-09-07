# Planner JavaScript modules

`app/static/js/floorplanner.js` is the stable browser entrypoint used by the
Flask template. It imports `planner/main.js`, which starts the planner.

The compatibility entrypoint remains in `legacy/runtime.js`; the application
engine is in `legacy/engine.js` while focused behavior moves into
one proven responsibility at a time into focused modules. This is intentional:
the planner's canvas interactions, saved-layout schema, and print output must
remain unchanged as its internal structure improves.

## Module boundaries

- `domain/` contains deterministic value and geometry helpers. These modules
  must not access the DOM, Konva, `window`, browser storage, or planner state.
  Add their Node tests under `tests/planner/`.
- `features/` holds focused placement, rendering, and editing behavior such as
  tents, flooring, fencing, lights, and room attachments.
- `legacy/` is temporary behavior-preserving code. Do not add new behavior to
  it when an appropriate focused module already exists; do not move code merely
  to make the file smaller.

## Safe extraction pattern

1. Identify one responsibility with a single caller-owned contract.
2. Write or retain a focused test when it has no browser/Konva dependency.
3. Move the implementation without changing its inputs, outputs, saved data,
   or public DOM behavior.
4. Verify syntax, unit tests, the existing pytest suite, and a manual canvas
   parity check before moving the next responsibility.

Empty folders are deliberately not committed. A directory is added only when a
real module belongs in it, so the tree remains a useful map for developers.
