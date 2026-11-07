# Archived FastAPI prototype

This directory preserves the original server-side prototype from the first
workspace import. **It is not built, not deployed, and not supported.**

The shipped application is the local-first PWA at the repository root. It has no
server, no API, and no remote data store.

## Known issues in this archive

- `main.py` imports a `database` module and a `routers` package that were never
  included in the workspace; the actual route files live in `routes/`.
- There is no authentication or authorization on any endpoint. A client-side
  PIN in the old frontend was the only lock, and it was stored in plaintext in
  `localStorage`.
- Financial amounts use `Float`; the replacement PWA uses exact decimal
  arithmetic.
- No input validation bounds, no CSRF protection, no security headers, no tests,
  and no dependency manifest originally existed.

## If this is ever revived

Treat it as an untrusted prototype: add server-side authentication and
per-user authorization, CSRF protection, strict input validation, migrations, a
real database, rate limiting, security headers, and a full security review
before exposing it to a network.

There is deliberately no dependency manifest here: the prototype was never
runnable, and pinning a stack would imply support. A temporary scan of its
intended FastAPI stack found known advisories in transitive `starlette` and
`anyio` releases with no Python 3.9-compatible fix; this is one more reason it
must not be deployed.

**Do not deploy this directory.**
