---
# Loads when Claude edits frontend UI code. Adjust the globs to your project's
# component file types.
paths:
  - "**/*.{tsx,jsx,vue,svelte}"
  - "**/*.dart"
---

# Design system

This project has a design system, and the UI is assembled from it.

- **Build only from the design system.** Use its existing components, design
  tokens (colour, spacing, typography, radius, elevation), and layout patterns.
  Never hand-roll a one-off control, hard-code a colour or spacing value, or
  reinvent a pattern the system already defines.
- **Compose before you create.** If an existing component is close but not
  exact, configure or compose it rather than forking it.
- **When the design system cannot express the screen** - a needed component is
  missing, or the user asked for a new one - **do not improvise a substitute.**
  Stop and spec it with the user first: its purpose, variants, states, API, and
  the tokens it uses. Then build it as a reusable design-system component,
  consistent with the rest of the system - not as a screen-local one-off.
