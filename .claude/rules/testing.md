---
# Loads when Claude edits test files. Tune these globs to your project's test
# layout and naming.
paths:
  - "**/*.{test,spec}.*"
  - "**/*_test.*"
  - "**/test_*.*"
  - "**/{test,tests,__tests__,spec,specs}/**"
---

# Testing

- **Test behaviour, not implementation.** Assert observable outcomes and
  contracts so tests survive refactors.
- **One scenario per test.** Arrange–Act–Assert; the name states the scenario
  and the expected outcome.
- **Cover the unhappy paths** - edge cases, invalid input, boundaries, and
  failure modes, not just the happy path.
- **Every bug fix has a test that fails without the fix.**
- **Deterministic and isolated.** No shared mutable state; no real clock,
  randomness, network, or filesystem; no dependence on test order.
- **Never weaken, skip, or delete a test to make a change pass.** If a test is
  wrong, fix it deliberately and say why.

Depth: the `engineering-standards` skill.
