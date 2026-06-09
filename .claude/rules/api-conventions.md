---
# Loads when Claude edits API code. Tune these globs to wherever this project's
# endpoints, routes, and handlers actually live.
paths:
  - "**/{api,apis,routes,controllers,handlers,endpoints,resources}/**"
---

# API conventions

- **Match the existing API surface.** Naming, versioning, status codes, error
  shape, pagination, and auth follow the patterns already in this codebase.
- **Validate every input at the boundary.** Treat all request data as
  untrusted; reject malformed input with a clear error that leaks nothing.
- **Use status codes honestly.** Success, client error, and server error are
  distinct - never return 200 with an error body.
- **One error shape across endpoints.** Never expose stack traces, secrets, or
  internal identifiers in a response.
- **Changes stay backward compatible** - or are explicitly versioned. A
  breaking change to a published endpoint needs an ADR.
- **Document the contract** with the change: request, response, and failure
  modes.

Depth: the `engineering-standards` skill.
