<!-- No `paths` frontmatter: security applies to all code, configuration, and
     infrastructure, so this rule loads unconditionally. -->

# Security

- **Never commit secrets.** No credentials, tokens, keys, or connection strings
  in code, config, fixtures, or history. Read configuration from the
  environment.
- **Validate and sanitise untrusted input** at every trust boundary - users,
  network, files, other services. Guard against injection (SQL, command, path,
  template, XSS) and unsafe deserialisation.
- **Enforce authentication and authorisation** on every protected path; check
  ownership, not just identity. No bypass for convenience.
- **Keep sensitive data out of logs and errors** - no secrets, no PII.
- **Treat destructive actions as dangerous.** Deletes, migrations, and bulk
  writes are scoped, reviewed, and reversible.
- **Justify every new dependency** - reputable, maintained, and pinned.

Depth: the `engineering-standards` skill.
