# AGENTS.md

Rules for anyone (human or agent) working in this repo.

## What this is

Bank Statement Analyzer: an offline web app for DKB bank statements. It replaces a Python console app ("Agent Scope"). It is a static site on GitHub Pages; all data lives as files in a folder the user picks (a Cryptomator vault synced by pCloud). The plan is `docs/plan.md`; keep it up to date when a decision changes it.

- `src/`: the app (Svelte + TypeScript + Vite).
- `tests/unit/`: Vitest unit tests. `tests/e2e/`: Playwright browser tests.
- `lab/`: feasibility tests, published unchanged under `/lab/`. Each lab page is self-contained.
- `docs/plan.md`: the plan.

## Privacy

- Synthetic data only. Never look for, ask for, upload, open or commit real bank data, IBANs or names.
- Test data is generated or hand-written and obviously fake (e.g. `DE00 0000 …`, "Muster GmbH").
- The app makes no network calls except loading itself. No analytics, no telemetry, no error reporting.
- The Python app is read only in its own folder, read-only.

## UI

- The UI is German. App-Präferenzen (Vincent's doc in claude.ai) applies in full: Material 3 Expressive, Roboto Flex / Roboto Mono, fixed "Rückgängig" button in the header, no confirmation toasts, errors only at the bottom, explicit over automatic, "≈" for estimated values.
- Category names use the enforced spelling (hyphen-joined, each word capitalized), see `src/lib/names.ts`.

## Security

- No CDN and no third-party scripts at runtime. Every dependency is pinned exactly (`.npmrc` has `save-exact`) and bundled into the build.
- The Content Security Policy in `index.html` allows only the page's own origin and no outgoing connections. Don't loosen it.
- The service worker never activates a new version on its own. A new version only takes over after the user taps "Aktualisieren", which shows the version and its changes.
- The service worker does not handle requests under `/lab/`.
- GitHub Actions: only GitHub's own actions, pinned by commit SHA, with the smallest permissions.

## How to work

- Work as hands-off as possible and go through the plan's stages in order. Ask only when a decision can't be undone or needs something only Vincent can do (phone tests, GitHub settings).
- Ask open decisions as multiple choice.
- If access or information is missing, say exactly what and stop. Don't guess or work around it.
- Branch from `main`, one pull request per piece of work. Merge it yourself once tests pass.
- Done means: tests pass (paste the summary line), the build works, and the PR description says in 3 lines or fewer what to check on the phone.
- No version numbers in todos or plans; the build assigns the version.
- Never change repo settings, Pages settings or branch protection, and never force-push. Say exactly what to click instead.
- If a decision would apply to future apps too, propose a generic line for App-Präferenzen.

## Commands

```
npm ci            # install (exact versions from package-lock.json)
npm test          # unit tests
npm run build     # type check + production build to dist/
npm run test:e2e  # browser tests (Chromium) against a test build with an in-memory file layer
```
