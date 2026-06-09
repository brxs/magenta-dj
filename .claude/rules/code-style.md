---
# Loads when Claude edits source files. Tune these globs to your project's
# languages - add or remove extensions as needed.
paths:
  - "**/*.{js,jsx,ts,tsx,mjs,cjs,vue,svelte}"
  - "**/*.{py,rb,go,rs,java,kt,cs,php,swift,scala,ex,exs}"
---

# Code style

- **Match the surrounding code.** Naming, formatting, file layout, and idioms
  follow what the file and its neighbours already do - even where you would
  choose differently. Consistency beats personal taste.
- **Names carry intent.** A reader should understand a name without chasing its
  definition. Avoid abbreviations the codebase does not already use.
- **Keep changes surgical.** Touch only what the task needs. Do not reformat,
  reorder, or "tidy" adjacent code - it buries the real change.
- **Prefer the simple, boring construct.** No cleverness the next reader has to
  decode; no abstraction for single-use code.
- **Comment the why, not the what.** Explain intent and non-obvious decisions;
  do not narrate what the code plainly states.
- **Leave no residue.** No commented-out code, no stray debug output, no `TODO`
  without an owner and a tracking reference.

Depth: the `engineering-standards` skill.
