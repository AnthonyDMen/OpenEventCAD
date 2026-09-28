# Engine change log

This is the running record for behavior changes made in the engine checkout.
Add an entry while the change is still in the working tree, then update its
status when it is committed, pushed, or released downstream. Keep entries
short: what changed, why it matters, and how it was checked.

## Working changes — 2026-09-28

### Planner history, labels, colors, and line thickness

- Placing a table with an automatic label now records one undo step for the
  item and label together. Restoring a planner no longer erases or rewrites an
  attached label because its catalog default differs. Undo/redo retains the
  existing canvas nodes for objects unchanged by the action.
- Copy/paste and saved planner snapshots retain each ordinary item's color,
  including custom colors. Older named catalog items recover their catalog
  color when no color was saved.
- Labels without a saved layer ID restore to the Labels layer so copy/paste
  can find their attachment. A manual Settings control changes floorplan line
  thickness and remembers the browser preference.
- Checked with the focused browser regression for copy/paste, single-step
  undo/redo, unrelated objects, save/reload, and line thickness. Node unit,
  Inventory Key browser, and touch browser checks passed. Python tests had
  46 passes and one existing print-source assertion failure unrelated to
  these changes.

## Working changes — 2026-09-22

### Touch interaction

- Added touch-first canvas behavior while keeping the desktop interaction
  model intact: one finger selects or moves an item; two fingers pan and
  pinch-zoom the canvas.
- Added touch actions for rotation, placement, run-point undo, finish, cancel,
  and resuming an existing run.
- Verified with the touch browser regression, including touch panning,
  pinch-zooming, placement rotation, and run editing.

### Run cancellation

- Escape now cancels an unfinished fence, pipe-and-drape, standalone-light, or
  custom tent-bistro run. It removes only the temporary preview; it never
  creates or finalizes the run.
- Cancelling a resumed fence, pipe-and-drape, or standalone-light run restores
  the original run unchanged.
- The touch Cancel action uses the same cleanup path.
- Verified in the touch browser regression against the rebuilt local service.

### Inventory Key and tent setups

- Tent setup entries keep a custom setup label separate from the tent size and
  configuration details, so renaming does not erase setup facts.
- Tent summaries use the names assigned by their dedicated key sections and
  stay compact rather than repeating pipe-and-drape, fence, lighting, flooring,
  or seating detail rows.
- Grouped layout contents are included in report collection where appropriate.

## Adding the next entry

1. Add it under a dated **Working changes** heading.
2. State the affected user behavior, not just the file that changed.
3. Record the focused checks that passed and any check that still needs work.
4. When the work is pushed downstream, append the commit or release reference
   without rewriting the original behavior note.
