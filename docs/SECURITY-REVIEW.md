# Security review — 2026-11-07

## Scope

This review covers the local-first PWA in `src/`, `public/`, `scripts/`, the CI,
deploy, and gold-price workflows, and the archived FastAPI prototype in
`legacy/api/`. The dashboard valuation model, category-specific investment
inputs, and same-origin gold reference JSON are included. The prototype is
included for completeness but is not built or deployed.

The review combined static analysis (SAST), software composition analysis
(SCA), dynamic analysis (DAST), secret scanning, and browser-level security
tests. It is a best-effort review, not a formal third-party audit.

## Methodology and tools

| Layer | Tool / version | Scope |
|---|---|---|
| SCA (runtime) | npm 11.19.1, `npm audit --omit=dev` | Shipped npm dependencies |
| SCA (dev) | npm 11.19.1, `npm audit` | Build/lint/test tooling |
| SCA (archived) | pip-audit 2.9.0 against a temporary manifest | FastAPI prototype stack |
| SAST | Semgrep (`p/default`, `p/typescript`, `p/javascript`, `p/secrets`) | Tracked source, excluding `legacy/` |
| SAST | Bandit 1.8.6 | `legacy/api/` |
| DAST | OWASP ZAP 2.17.0 quick scan (spider + active scan) | Built PWA served by `vite preview` |
| Browser security tests | Playwright 1.65.0 + Chrome 156 | Setup, lock, offline, recovery, XSS, CSP, external requests |
| Secret scan | `scripts/scan-secrets.mjs` | All tracked text files |
| Unit/integration | Vitest 5.1.0 | Crypto, storage, domain logic, validation, CSV, rates |
| Workflow hardening | Semgrep GitHub Actions/Dependabot rules | CI, deploy, CodeQL, Dependabot |

## Results summary

| Check | Result |
|---|---|
| Production npm dependencies | **0 vulnerabilities** |
| Dev-only npm dependencies | 15 advisories (2 low, 13 moderate) — accepted, see below |
| Semgrep | **0 findings** |
| Bandit (archived Python) | **0 findings** |
| OWASP ZAP | **0 High, 0 Medium, 0 Low**, 3 informational |
| Secret scan | **0 findings** |
| Unit/integration tests | 68 passed |
| Browser E2E | 20 passed (desktop + Pixel 7) |
| Coverage | 84.60% lines, 75.88% branches, 83.24% functions |

## Findings and resolutions

### F1 — Original prototype had no API authentication (Critical, resolved by removal)

The FastAPI prototype exposed unauthenticated read/write endpoints and used a
client-side PIN stored in plaintext in `localStorage` (default `1234`). Anyone
who could reach the server could read or alter all financial data. The missing
`database`/`routers` modules meant it did not run as delivered, but fixing the
imports alone would have produced a critically exposed service.

**Resolution:** the shipped app has no server or API. The prototype is archived
under `legacy/api/` with a do-not-deploy warning and no dependency manifest.

### F2 — Input validation and money precision (High, resolved)

The prototype accepted arbitrary transaction types, negative/NaN amounts, and
used `Float` for money.

**Resolution:** strict normalization in `src/domain/validation.ts`, bounded
integers/amounts, exact decimal strings with `decimal.js`, and tests covering
negative values, excessive precision, invalid dates, and impossible dates such
as 2026-02-30.

### F3 — CSV formula injection (High, resolved)

Exported names were written raw, so a value such as
`=HYPERLINK("http://evil","x")` could execute in a spreadsheet.

**Resolution:** `src/domain/csv.ts` prefixes dangerous non-numeric cells with
`'`, quotes all fields, and neutralizes leading `=`, `+`, `-`, `@`, tab, and
carriage return. Plain numeric values (including negative balances) stay
numeric. Unit tests cover each pattern.

### F4 — Third-party CDN supply chain and CSP (High, resolved)

The old frontend loaded Tailwind, Alpine, html2pdf, and Google Fonts from four
CDNs without integrity attributes, and Alpine required `unsafe-eval`.

**Resolution:** all runtime code and styles are bundled and same-origin. No
remote fonts or scripts. The CSP forbids inline/eval scripts, and the app uses
Lit templates that escape data by default. ZAP's SRI findings disappeared once
the old `static/` directory was removed.

### F5 — CSP meta contained an ignored directive (Medium, fixed)

ZAP reported `CSP: Meta Policy Invalid Directive`: `frame-ancestors` is ignored
when delivered via `<meta>`.

**Resolution:** the meta policy no longer includes `frame-ancestors`; the HTTP
header used by the preview server and header-capable hosts keeps
`frame-ancestors 'none'`. A frame-buster in `src/main.ts` blocks framing on
GitHub Pages, which cannot send headers. A repeat ZAP scan returned 0 Medium
alerts.

### F6 — Node dev-dependency advisories (Moderate/Low, accepted)

`npm audit` reports 15 advisories across 2 low and 13 moderate, all in
development/build tooling:

- `deepmerge <=4.3.1` (low, prototype poisoning) via `vite-plugin-pwa`/Workbox
  build tooling.
- `glob <=14.0.1` (moderate, AbortSignal cancellation bypass) via build tooling.
- `minimatch <11.0.1` (moderate, ReDoS via globparts amplification) via ESLint,
  typescript-eslint, and Workbox build tooling.

These packages are not in the shipped bundle; `npm audit --omit=dev` reports 0.
The build processes repository-controlled configuration, not untrusted user
input, which lowers exploitability. Fixing them requires major-version changes
to the lint/build chain that are not currently compatible. Dependabot monitors
updates, and `.npmrc` sets `min-release-age=7` to reduce newly-published package
risk. **Risk accepted; revisit when upstream-compatible fixes land.**

### F7 — Archived Python stack advisories (High if deployed, not deployed)

A temporary manifest for the archived prototype (`fastapi 0.128.8`) resolved
`starlette 0.49.3` and `anyio 4.12.1`; pip-audit reported 7 advisories. Fixes
require `starlette` 1.x / `anyio` 4.14.2, which require Python >= 3.10 and are
incompatible with the archived FastAPI pin and the local Python 3.9 toolchain.

**Resolution:** the prototype is not deployed, has no supported dependency
manifest, and is documented as untrusted. No action is taken on its transitive
stack. If the backend is ever revived, rebuild it on a supported Python version
with a fresh dependency and security review.

### F8 — GitHub Pages header limitations (Medium residual)

GitHub Pages cannot set custom response headers. The build ships a strict CSP
`<meta>`, `Referrer-Policy` is set via `<meta name="referrer">`, and a
frame-buster blocks framing, but HSTS, `X-Frame-Options`, `frame-ancestors`, and
`Permissions-Policy` cannot be enforced by the host. Clickjacking protection is
therefore best-effort.

**Recommendation:** put Cloudflare in front of Pages or deploy the same `dist/`
to Cloudflare Pages/Netlify with the headers from `vite.config.ts` when strict
header enforcement is required.

### F9 — PIN entropy (Medium residual, user-dependent)

A 6–12 digit PIN is low entropy even with 600,000 PBKDF2 iterations. A 6-digit
PIN has 1,000,000 candidates; an attacker with the encrypted envelope and local
compute can attempt offline guessing.

**Mitigation:** 600k PBKDF2-SHA-256, per-vault random salt, AES-GCM
authentication, attempt backoff, auto-lock, and a recovery code for backup.
**Guidance:** use at least 8 digits, avoid dates/patterns, enable device
biometrics/passcode, and treat the device lock as the primary boundary.

### F10 — ZAP informational items (No action)

- **CSP: Header & Meta** — the preview server sends both; production GitHub Pages
  ships only the meta policy. Expected.
- **Information Disclosure — Suspicious Comments** — false positive from the
  minified base64url decoder (`replace(/-/g, '+')...` contains the token
  `from`). No source comments or credentials are exposed.
- **Modern Web Application** — a `<noscript>` notice; no action.

### F11 — Cross-tab lost updates (Medium, fixed)

Each tab kept an in-memory dataset snapshot and persisted the whole dataset on
every write. Two tabs writing near-simultaneously could overwrite each other's
changes (last-writer-wins).

**Resolution:** every mutation now runs inside an exclusive Web Locks critical
section (`dompet-orang-have-write`), reloads and decrypts the latest ciphertext
from IndexedDB, applies the change, and persists. Browsers without Web Locks fall
back to reload-before-write. A regression test uses two repository instances
sharing one store and verifies the second write sees the first.

### F12 — PIN-change key zeroization race (High, fixed)

`changePin()` awaited PBKDF2 before reading the session's raw master key. A
concurrent lock (auto-lock or another tab's lock broadcast) zeroes that buffer,
so the function could wrap 32 zero bytes and overwrite the only PIN-wrapped copy
of the master key.

**Resolution:** `changePin()` validates and copies the key before any `await`,
wraps the copy, zeroes it in `finally`, and refuses an already-zeroed session.
Auto-lock also pauses while a modal operation is in flight. A regression test
zeroes the live session while PIN change is running and verifies the data key is
preserved.

### F13 — Mutation paths missed dataset caps (Medium, fixed)

Collection caps were enforced when loading/importing a dataset, but repository
add methods did not enforce them. A user could add enough records that the next
unlock failed validation and could no longer read the vault.

**Resolution:** shared `MAX_ACCOUNTS`, `MAX_TRANSACTIONS`, `MAX_INVESTMENTS`,
and `MAX_RATES` limits are now enforced on every write inside the repository,
matching the import/load validator. A cap regression test covers imports.

### F14–F23 — Additional review pass (fixed)

A second review pass surfaced and verified these correctness/security issues;
all are fixed and the key paths have regression tests:

- **F14 Setup rollback data loss** — if a vault envelope was missing (or another
  tab had created one) but ciphertext survived, a failed setup could delete the
  ciphertext. Setup now runs under the write lock, refuses when any envelope or
  ciphertext exists, and rolls back only its own envelope. E2E loses the
  envelope, attempts setup, restores it, and confirms the data survives.
- **F15 Recovery-code modal auto-lock** — auto-lock could fire while the
  once-only code was displayed and clear it. Auto-lock now pauses for that
  modal in both idle and visibility paths.
- **F16 Reload after lock** — a cross-tab reload could repopulate plaintext
  after locking. It now captures the session/repository and re-checks after
  decryption; pending reloads flush after modal operations.
- **F17 PIN visibility persisted** — revealing the PIN once left later lock
  screens in plaintext. The flag resets on lock.
- **F18 Old-PIN counter pollution** — mistyped old PINs in Settings incremented
  the lock-screen lockout. Verification now uses `registerFailure: false` and
  reports corrupt-vs-wrong errors distinctly.
- **F19 Reset confirmation** — the destructive button never re-rendered and was
  case-sensitive. It re-renders and accepts case-insensitive `HAPUS`; E2E covers
  the forgotten-PIN reset path.
- **F20 FX response handling** — the timeout was cleared before reading the
  body, and an invalid provider date could corrupt every rate's `updatedAt`,
  making the vault unopenable. The timeout now spans body reading, size is
  stream-limited, and dates are calendar-validated.
- **F21 Malformed IndexedDB record** — a malformed or null record was treated as
  an empty vault and overwritten. The store now throws and leaves it intact;
  transient IndexedDB open failures no longer poison the cached promise.
- **F22 Deploy before CI** — Pages deployed independently of CI. Deployment now
  triggers from a successful `CI` workflow run for the merged commit.
- **F23 Async lifecycle races** — recovery verification now locks modal
  controls, backup import re-checks the repository after PBKDF2, silent rate
  sync renders updated totals, and cross-tab reloads retry after modals close.

## Positive controls verified

- AES-256-GCM encryption at rest; ciphertext-only IndexedDB; no plaintext in
  `localStorage`; PIN never stored.
- Wrong PIN rejection, tamper detection, recovery-code unlock, PIN change, and
  backup passphrase failure paths are covered by tests.
- XSS regression test: an `<img onerror=...>` account name is rendered as text,
  creates no image element, executes no handler, and raises no dialog.
- No external runtime requests during onboarding, account/transaction entry,
  lock/unlock, and offline reload.
- Service worker serves the app shell offline; data remains readable after an
  offline reload and unlock.
- CSP meta present in production build; local icons; manifest installability
  verified via browser tests.
- Opt-in FX sync only reaches the CSP-allowlisted origin and updates IDR totals;
  the browser test intercepts the response and verifies the displayed rate.
- Category valuations (Saham lots × price, Reksa Dana NIB/NAB/units, Emas
  grams × price) are validated numerically and rendered as text; no new HTML
  sink was introduced.
- Stock quotes come from a same-origin daily snapshot of the public `fzn0x/idx`
  quote board. The updater validates the universe size, quote count, symbol
  format, and price bounds before writing; the client validates again before use.
  No API key is stored or sent from the browser.
- Gold reference data is read from a same-origin JSON file, so the client CSP
  remains `connect-src 'self'`. The scheduled updater has only `contents: write`,
  validates source ranges before writing, and never executes scraped markup.
- A manual per-asset gold price overrides the feed and is validated like every
  other amount.
- Cross-tab writes are serialized with Web Locks; PIN change copies the master key before any await so a racing lock cannot zero it.
- Production dependency audit is clean; Actions are pinned to commit SHAs;
  Dependabot has a 7-day cooldown; `.npmrc` enforces a 7-day minimum release age.
- DAST was re-run after the dashboard, category-aware forms, charts, gold feed,
  and IDX snapshot lookup were added: 0 High / 0 Medium / 0 Low, 3 informational.

## Reproduction

```bash
npm ci
npm run lint
npm run typecheck
npm run test:coverage
npm run test:e2e
npm run build
npm run scan:secrets
npm run audit:sca:prod
npm run scan:sast      # semgrep installed separately
npm run scan:bandit    # bandit installed separately
npm audit              # dev-only advisories remain
```

DAST (with ZAP installed):

```bash
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort &
zap.sh -cmd -quickurl http://127.0.0.1:4173/ \
  -quickout /tmp/zap-report.html -quickprogress
```

The ZAP report from this review is local-only and not committed because it
contains a snapshot of a preview URL. Re-run the command after changes.

## Residual risk acceptance

The owner must explicitly approve the residual risks above as part of the pull
request review, particularly F6 (dev-only npm advisories), F8 (GitHub Pages
headers), and F9 (PIN entropy). No merge or deployment occurs before that
approval.
