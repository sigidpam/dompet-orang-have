# Dompet Orang Have

A local-first, encrypted personal wealth and cashflow PWA. It tracks accounts,
transactions, investments, and FX-converted totals without sending financial
data to a server.

The UI is in Indonesian; the codebase and docs are in English.

## Why local-first

The original workspace was a FastAPI prototype with no runnable database module,
no authentication, and a client-side PIN stored in plaintext. Hosting that shape
of app means exposing every account and transaction to anyone who can reach the
API.

This rebuild removes the server from the data path:

- Financial data is encrypted with AES-256-GCM and stored in IndexedDB.
- The PIN is never stored. It derives a key with PBKDF2-SHA-256 (600,000
  iterations), which wraps a random 256-bit data key.
- The app shell is served as static files and cached by a service worker.
- There is no analytics, telemetry, or financial-data API.

## Features

- Encrypted vault with 6–12 digit PIN, auto-lock, and configurable timeout
- Recovery code generated once at setup, plus encrypted JSON backups
- Accounts (bank, cash, e-wallet), income/expense transactions with automatic
  balance updates, and investment portfolio with estimated monthly returns
- Dashboard after unlock: net worth hero, liquid cash, portfolio value, cost
  basis, unrealized gain, estimated monthly return, allocation and 6-month
  cashflow charts (inline SVG with table fallbacks)
- Category-aware investment editor: Saham lots + current price per share,
  Reksa Dana NIB + NAB + units, Emas purchase price/grams/current price, and
  tenor only for Deposito/Obligasi; edit an asset to refresh its current value
- Market-priced holdings are grouped on the dashboard: Saham by code, Reksa Dana
  and Emas by name. “Nilai Investasi” follows the current value for these
  assets; the cost basis remains visible as “Harga beli”.
- Same-name accounts with the same type and currency are combined into one
  dashboard card with the summed balance; individual records stay available in
  the card’s details.
- Transactions can target an account or buy/sell an investment. A buy moves cash
  out and adds lots/units/grams; a sell moves cash in and reduces the holding, so
  asset fluctuations stay reflected in the dashboard. Account pickers are
  grouped by Bank, Tunai, and E-Wallet.
- Daily gold reference price from a scheduled GitHub Action, with a manual
  per-asset override when you want the ANTAM retail price instead of spot; the
  gold form can prefill the purchase price from the reference with “Pakai acuan”
- Daily full-universe IDX stock snapshot from `fzn0x/idx` (no API key); enter a
  Saham code, press “Ambil harga”, and lot × fetched price auto-calculates
  “Nilai Saat Ini”. Reksa Dana uses manual NAB × unit with a live preview
- Exact decimal arithmetic (`decimal.js`) instead of floating-point money
- FX rates to IDR with manual entry and optional, opt-in Frankfurter sync; missing
  rates are surfaced instead of silently treated as 1.0
- CSV export with spreadsheet formula-injection protection, print-to-PDF,
  Web Share, and clipboard fallback
- Installable PWA with offline app shell, update prompt, and local maskable icons
- Strict CSP (no third-party scripts/fonts), frame-buster, no `innerHTML` for
  user data, and cross-tab lock/change notifications, and serialized cross-tab writes
- Cross-browser test coverage: Chromium desktop and Pixel 7 emulation, including
  offline reload and recovery

## Security snapshot

| Check | Result |
|---|---|
| Production npm dependencies | 0 known vulnerabilities |
| Semgrep (TypeScript/JavaScript/secrets) | 0 findings |
| Bandit (archived Python prototype) | 0 findings |
| OWASP ZAP quick scan (DAST) | 0 High, 0 Medium, 0 Low; 3 informational |
| Secret scan | 0 findings |
| Unit/integration tests | 73 passing |
| Browser E2E tests | 24 passing (desktop + mobile) |

See [SECURITY.md](SECURITY.md) and the full
[security review](docs/SECURITY-REVIEW.md) for scope, residual risks, and the
dev-only dependency advisories.

## Requirements

- Node.js >= 22.12 (CI uses Node 24)
- A modern browser with Web Crypto (HTTPS or localhost)

## Development

```bash
npm ci
npm run dev          # http://localhost:5173
```

### Checks

```bash
npm run lint
npm run typecheck
npm test             # unit/integration
npm run test:coverage
npm run test:e2e     # builds, previews, and drives Chrome
npm run build
npm run scan:secrets
npm run audit:sca:prod
```

Optional scanners:

```bash
npm run scan:sast    # requires semgrep on PATH
npm run scan:bandit  # requires bandit on PATH
```

### PWA icons

```bash
npm run icons
```

Source SVG is generated in `scripts/generate-icons.mjs`; output lives in
`public/icons/`.

## Deployment

The production target is GitHub Pages with a project path
(`https://<user>.github.io/<repo>/`).

1. Push the repository to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Merge to `main`. `.github/workflows/deploy.yml` waits for the `CI` workflow
   to succeed, builds the merged commit with `BASE_PATH=/<repo>/`, and deploys
   `dist/`.
4. The daily `Update gold price` workflow commits a fresh reference price;
   CI and Pages deployment run for that commit as usual.

CI on pull requests runs lint, typecheck, coverage, build, secret scan, E2E,
Semgrep, Bandit, and a production dependency audit. CodeQL runs on `main`, PRs,
and weekly.

### Host header limitation

GitHub Pages cannot set custom response headers. The build ships a strict CSP
`<meta>` policy and a frame-buster, but `frame-ancestors`, HSTS, and
`X-Frame-Options` cannot be enforced by the host. If you need those headers, put
Cloudflare in front of Pages or deploy the same `dist/` to Cloudflare Pages /
Netlify with the headers documented in `vite.config.ts`.

## Architecture

```text
PIN ──PBKDF2(600k, salt)──> KEK ──unwrap──> 256-bit master key
                                               │
                                    AES-256-GCM │
                                               ▼
                                  IndexedDB ciphertext blob
```

The master key and decrypted dataset live in memory only while unlocked. On lock,
the raw key buffer is zeroed and references are dropped. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the trust boundaries, data model,
and PWA caching strategy.

## Data and backups

- `localStorage` holds only the vault envelope (salt, wrapped key, KDF parameters,
  a verification ciphertext).
- IndexedDB holds one encrypted blob with accounts, transactions, investments,
  rates, and settings.
- The app requests persistent storage to reduce browser eviction, but no browser
  guarantees it. Export encrypted backups regularly.
- Losing both the PIN and the recovery code means the data cannot be recovered.
  There is no reset server.

## Repository layout

```text
src/crypto/       PBKDF2/AES-GCM vault, recovery code, encrypted backups
src/db/           IndexedDB store + repository
src/domain/       money, validation, summary, CSV, rate/gold/stock snapshot feeds, types
src/ui/           Lit views: lock/setup, dashboard, charts, modals, icons
public/data/      same-origin gold and IDX stock snapshots consumed by the PWA
scripts/          icon generation, secret scan, gold price fetch
src/app.ts        application controller (state, actions, focus, auto-lock)
tests/            Vitest unit/integration tests
e2e/              Playwright desktop/mobile tests
legacy/api/       archived FastAPI prototype — do not deploy
docs/             architecture and security review
```

## Optional FX and gold sync

FX rate sync is off by default. When enabled, it sends only ISO currency codes
(no amounts, accounts, or identifiers) to `api.frankfurter.dev`, the only
external runtime origin allowed by the CSP. Manual rates always remain available
offline.

Gold has a daily reference feed. `.github/workflows/gold-price.yml` fetches
XAU/USD spot and USD/IDR, writes `public/data/gold-price.json` on the same origin,
and commits it. The PWA reads that file with a NetworkFirst service-worker cache;
offline it falls back to localStorage. ANTAM's retail page returns 403 to
automated requests, so the feed is explicitly labeled **spot**, not retail ANTAM.
Each gold asset can override the reference with a manual current price per gram.

Stock prices come from a daily full-universe snapshot produced by
`.github/workflows/stock-prices.yml` using the public `fzn0x/idx` API
(`ihsg.midoriresearch.com`). The Action fetches all ~913 quoted codes and commits
`public/data/stock-prices.json`; the PWA reads it same-origin, with NetworkFirst
caching. **No API key is needed.** The refresh button reads the latest snapshot,
not intraday live data; enter a price manually if you need something newer.
Reksa Dana has no stock endpoint, so NAB is entered manually and the app
calculates units × NAB (or uses NIB when filled).

## License

No license has been added yet. Unless the repository owner adds one, the code is
all rights reserved.
