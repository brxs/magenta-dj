---
# Loads when Claude edits frontend UI code. Adjust the globs to your project's
# component file types.
paths:
  - "**/*.{tsx,jsx,vue,svelte}"
  - "**/*.dart"
---

# Frontend architecture

- **Data flows in one direction.** State lives in a single owner and flows
  down; children signal change through events or callbacks, never by mutating
  shared or parent state. Avoid two-way bindings that hide where a value
  actually changes.
- **Build reactive interfaces.** The UI is a function of state - render from
  state and let it update declaratively. Don't imperatively poke the DOM or the
  widget tree.
- **One source of truth per piece of state.** Derive, don't duplicate; if two
  places need the same value, lift it rather than copy it.
- **Design responsively.** Every screen adapts to its viewport - use the
  project's breakpoints to produce a sensible layout for each device class
  (phone, tablet, desktop), and verify it holds at each. No fixed widths that
  assume one screen size.

Depth: the `engineering-standards` skill.
