---
# Loads when Claude edits source files. Tune these globs to your project's
# languages.
paths:
  - "**/*.{js,jsx,ts,tsx,mjs,cjs,vue,svelte,dart}"
  - "**/*.{py,rb,go,rs,java,kt,cs,php,swift,scala,ex,exs}"
---

# Localisation

Every application uses a localisation solution, and all user-facing text goes
through it.

- **Never hardcode user-facing strings.** Labels, messages, errors, empty
  states, placeholders, and notifications - every string a user can see is
  referenced from the localisation solution by key, never written inline.
- **Reuse an existing key** when one already covers the text. Match the
  project's key naming and file structure.
- **When a needed string has no key, add one.** Tell the user the key you are
  introducing and its value, add the `key: value` pair to the localisation
  source, then reference it - never fall back to a hardcoded string.
- **Name keys for intent,** not for the literal text, so the copy can change
  without the key churning.
- Non-user-facing strings - log lines, internal identifiers, config keys - are
  not localised.
