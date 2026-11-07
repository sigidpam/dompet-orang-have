# Security policy

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository
(**Security → Advisories → Report a vulnerability**). Do not open a public issue
for a suspected vulnerability.

Include the affected version, browser/device, reproduction steps, and impact. Do
not include real financial data or recovery codes in a report.

This is a personal project without a formal SLA. Reports will be acknowledged as
soon as possible.

## Supported versions

| Version | Supported |
|---|---|
| 2.x (current `main`) | Yes |
| 1.x FastAPI prototype (archived in `legacy/`) | No — never deploy |

## Security model

### Guarantees

- **Data at rest is encrypted.** Accounts, transactions, investments, rates, and
  settings are serialized and encrypted with AES-256-GCM before being written to
  IndexedDB.
- **The PIN is not stored.** A PIN-derived key (PBKDF2-HMAC-SHA-256, 600,000
  iterations, 16-byte random salt) unwraps a random 256-bit master key. The
  envelope contains only salt, IVs, ciphertext, and KDF parameters.
- **Wrong PINs fail cryptographically.** AES-GCM authentication rejects an
  incorrect unwrap or tampered ciphertext.
- **Recovery is explicit.** A 256-bit recovery code is generated at setup and shown
  once. It can unlock the vault and set a new PIN. Encrypted backups use a
  separate passphrase.
- **Local-only by default.** There is no financial-data network API. The only
  optional external request sends ISO currency codes to `api.frankfurter.dev` and
  is off by default.
- **No third-party runtime code.** Scripts and styles are bundled and served from
  the same origin; there are no CDN scripts, remote fonts, or analytics.
- **Strict rendering.** User data is rendered as text through Lit templates;
  `innerHTML` is not used for finance data. The CSV export neutralizes spreadsheet
  formulas.

### Non-goals and residual risks

- **A 6–12 digit PIN is low entropy.** PBKDF2 raises the cost of offline guessing,
  but it does not make a 6-digit PIN strong. Use at least 8 digits, avoid dates and
  repeated patterns, and rely on the device passcode/biometrics as the primary
  boundary.
- **Compromised device or browser profile.** Malware, a malicious extension, or
  an attacker with local code execution can read memory while the vault is
  unlocked, capture the PIN, or modify the app. Encryption at rest does not
  protect against this.
- **XSS would defeat the vault while unlocked.** The strict CSP, lack of external
  scripts, and text-only rendering reduce the likelihood, but a same-origin script
  injection would run with access to the master key. Report any injection path
  immediately.
- **Lost PIN and recovery code means permanent data loss.** There is no server,
  backdoor, or reset.
- **GitHub Pages cannot set response headers.** The build uses a strict CSP
  `<meta>` policy and a frame-buster. It cannot set `frame-ancestors`, HSTS, or
  `X-Frame-Options`; clickjacking and some transport-header hardening depend on the
  host. Use Cloudflare in front of Pages or another host that supports headers if
  those controls are required.
- **Browser storage eviction.** Persistent storage is requested, not guaranteed.
  Keep encrypted backups off-device.
- **Supply chain.** Dependencies are pinned with a lockfile, installed with a
  7-day minimum release age, and monitored by Dependabot, CodeQL, Semgrep, and
  `npm audit`. Build tooling advisories are still possible; see the security
  review for accepted dev-only findings.
- **Archived prototype.** `legacy/api/` is not built or deployed. It has no
  authentication and must never be exposed.

## Security controls

- AES-256-GCM with per-message random IVs and domain-separated AAD
- PBKDF2-SHA-256 600,000 iterations; 16-byte salt; 256-bit master key
- Recovery code and separate-passphrase encrypted backups
- Auto-lock on idle and after long backgrounding; raw key zeroization on lock
- Failed-attempt backoff (best-effort; encryption remains the real control)
- Content Security Policy with `default-src 'self'`, no `unsafe-inline`/`unsafe-eval`
- `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, Permissions-Policy,
  COOP/CORP in preview and header-capable hosts
- Input validation and length bounds; exact decimal money parsing
- CSV formula-injection neutralization
- PWA service worker precaches the app shell only; no financial responses are cached
- Cross-tab lock/change broadcasts and Web Locks-serialized writes; no sensitive data in analytics or logs
- PIN change copies the master key before PBKDF2 awaiting, preventing a racing lock from wrapping a zeroed key

## Verification

Last reviewed: **2026-11-07**.

| Layer | Tool | Result |
|---|---|---|
| SCA (runtime) | `npm audit --omit=dev` | 0 vulnerabilities |
| SCA (dev tooling) | `npm audit` | 15 advisories (2 low, 13 moderate); build/lint only |
| SCA (archived Python) | `pip-audit` on a temporary manifest | 7 transitive advisories; prototype not deployed, manifest removed |
| SAST | Semgrep (`p/default`, TypeScript, JavaScript, secrets) | 0 findings |
| SAST | Bandit on `legacy/api` | 0 findings |
| DAST | OWASP ZAP 2.17.0 quick scan | 0 High/Medium/Low; 3 informational |
| Browser security tests | Playwright + Chrome | XSS payload rendered inert; no external runtime requests; strict CSP present; offline reload works |
| Secret scan | `scripts/scan-secrets.mjs` | 0 findings |

Details and accepted risks: [docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md).

## Contributor checklist

- Never commit `.env`, credentials, recovery codes, or real financial data.
- Add new network origins to the CSP only with a documented reason.
- Keep `innerHTML` out of user-data paths.
- Add tests for parsing, export, and encryption changes.
- Run the full check suite and the secret scan before opening a PR.
- Security-sensitive changes require a second review; PRs are not merged without
  explicit owner approval.
