# Bank Statement Analyzer – Plan Web-App

As of 2026-11-26 · Vincent. Started from the plan doc in claude.ai; this file is the current version.

## Goal and decisions

The frozen Python console app gets rebuilt as an offline web app. It runs from a static page, and all data lives as files in the Cryptomator vault. The feasibility test passed. It covered creating a file, overwriting it without "(1)" copies, reopening it after a restart, and a round trip from phone to laptop and back. That test used single files, not a folder.

| Topic | Decision |
| --- | --- |
| Phone | Vanadium on GrapheneOS; files through the Cryptomator Android 3.0 document provider |
| Laptop | Brave with the File System Access flag on; Chromium as fallback; vault mounted by Cryptomator desktop |
| Sync | pCloud, through the vault |
| Server | None. No app-level encryption, because the vault already encrypts |
| UI | German; App-Präferenzen applies in full |
| Python app | Frozen: only blocking fixes until the migration is done |
| Stack | Svelte + TypeScript + Vite; Vitest and Playwright; fonts and all code bundled |
| Implementation | A Claude Code project with a coordinator (beta), working in a new GitHub repo; cloud threads build, Vincent merges |

## Scope and stages

The first release is built in five stages. The phone is usable for daily categorizing after stage 1. Each stage ships on its own and uses the data files of the stages before it unchanged.

1. **Import and categorize.** Import DKB CSVs, keep the transaction identity stable, apply rules, categorize by hand, and migrate the Python app's state. Migration is in this stage on purpose: without it, the phone would start empty and the two apps would drift apart.
2. **Statistics.** Totals per category and period, derived from the data only and never stored.
3. **Rule suggestions.** The app proposes rules from manual categorizations. A proposal only takes effect after "Übernehmen".
4. **Follow-up and virtual transactions.** Mark transactions to follow up. Add transactions that are not on the statement, such as cash or an expected booking.
5. **Reimbursement tracking.** Group expenses with the reimbursements they should bring (business trips: employer; health costs: insurer), and show what is still open.

Not in scope: other banks, multi-user, any server or cloud API.

## Architecture and file layout

Each device writes only its own files. That way pCloud never has two versions of one file to reconcile. The app code comes from a static page (GitHub Pages) and is cached for offline use. The data never leaves the vault, and the page makes no network calls except loading itself.

Data flow: GitHub Pages (app code only) → phone (Vanadium) and laptop (Brave), each running offline → each reads all files and writes only its own through Cryptomator (Android document provider / desktop mount) → pCloud syncs the encrypted vault files.

**Proposed vault layout** (one app folder in the vault; depends on the folder test):

| Path | Written by | Content |
| --- | --- | --- |
| `import/<hash>.csv` | Device that imported it | DKB CSV exactly as downloaded; the name is the content hash, so the same file imported on both devices is one file |
| `log/<device>.jsonl` | That device only | Append-only list of changes: categorization, rule edit, follow-up, virtual transaction, reimbursement link, undo |
| `migration/` | Laptop, once | Python state files as copied, plus the import report |

- **Device names:** the first entry of each device's log holds its name. There is no shared `devices.json`, so no file is written by two devices. The browser remembers which log is its own.
- **Current state = all CSVs + all logs merged by time.** Nothing derived is stored, which follows App-Präferenzen (keep external data in the original, compute derived values).
- **Two devices change the same transaction before syncing:** the later change wins, and the transaction is marked so the conflict is visible. It is never resolved silently. Each change records which change it replaced, so a conflict is only marked when the writer had not seen the other device's change. A new entry's time is never earlier than the newest entry its device has read, so a clock that is behind can't reorder a deliberate change.
- **Size:** at about 200 transactions a month, the logs grow by a few hundred KB a year (estimate). No compaction is needed in the first release.
- **Sync conflict copies** that Cryptomator or pCloud create anyway get detected and reported with an error; they are not merged automatically.
- **Undo** (fixed "Rückgängig" button) appends an undo entry to the log; nothing is deleted from it.
- **Fallback if folder access fails on the phone:** one file per device (phone and laptop), each picked once on both devices. Imported CSVs are stored inside the importing device's file. Each device still writes only its own file.

## Data model

A transaction gets its ID once, at first import, and keeps it. Everything else refers to that ID, never to the bank's fields. That way a field DKB reformats can't break categorizations again.

**Identity on import:**

1. Normalize each row (whitespace, case, number and date format) and build a fingerprint from it. Rows that are identical on the same day get an occurrence number, so two identical coffees stay two transactions.
2. The fingerprint matches an existing transaction → same ID.
3. No exact match, but date, amount and counterparty IBAN match one transaction → re-link to its ID and record the old and new values.
4. Several candidates, or only a weak match → the user picks; the app never guesses.
5. No match → new ID.

The Python app's re-link fix should be ported as it is. Its exact matching rules are still unread (see Migration).

| Entity | Stored as | Rule |
| --- | --- | --- |
| Transaction | CSV row + ID entry in the log | The bank data stays unchanged; corrections are separate log entries |
| Category | Name in log entries | Normalized spelling per App-Präferenzen (e.g. "Lebensmittel", "Öpnv-Abo") |
| Rule | Log entry: condition chips → category | A manual categorization always beats a rule; a rule never overwrites it |
| Follow-up | Log entry on a transaction: note + optional date | Shown until it is marked done |
| Virtual transaction | Log entry with its own ID | Marked with "≈" while it is expected rather than booked; can later be linked to the real booking |
| Reimbursement case | Log entry grouping expense IDs and reimbursement IDs | Shows the expected amount, the received amount and the difference; open until the difference is 0 or closed by hand |

## Migration of the Python app

The migration is one-time and runs in the web app. Afterwards the Python app is no longer used to edit. Two apps writing the same data would bring back the conflicts the file layout avoids.

1. Copy the Python state files into `migration/` in the vault.
2. The web app reads them and writes one log entry per item (categorization, rule, re-link), each marked as migrated.
3. An import report compares the number of transactions, the number of categorized transactions and the total per category against the Python app. It stops on any difference.
4. Rehearse first with synthetic CSVs and state files that the Python app itself produced, then run it once on the real vault.

Still open: the state file formats, the rule language (TOML) and the exact re-link logic. They are in AGENTS.md, PROJECT_MEMORY.md and the code of the Python app (local folder "Agent Scope", not on GitHub so far).

## Hosting and safe updates

The app is a static page on GitHub Pages. The biggest remaining risk is someone taking over the GitHub account: a malicious update could read everything the app can open. Account security is therefore the main protection. The update gate below only narrows the risk.

- **Account:** 2FA with a hardware key or TOTP, branch protection on the main branch, and no third-party GitHub Actions with write rights.
- **Code:** no CDN and no third-party scripts at runtime. Dependencies are bundled and pinned in the repo. A Content Security Policy allows only the page's own origin and no outgoing connections.
- **No silent updates:** a service worker caches the app. A new version is downloaded but only activated after a tap on "Aktualisieren", which shows the version and its changes. Limit: browsers run a new service worker's install code before that tap, so this gate doesn't protect against a compromised account.
- **Version visible:** Settings show the version and commit, so phone and laptop can be compared. The version is the commit count of `main`; the update bar lists the latest commit subjects as its changes.
- **Repo:** a public repo is fine, since it contains no data. GitHub Pages from a private repo needs a paid plan.

## UI rules

App-Präferenzen applies in full, and the UI is German. The rules below shape this app the most. Where a rule had to be adapted to this app, that is marked as a proposal.

- **Rückgängig:** a fixed button in the header, no confirmation messages, errors only at the bottom. Deleting works through selection mode (long press).
- **Rules:** conditions are entered as a chip line with UND / ODER / NICHT, not as free text. Category names get the enforced spelling.
- **Explicit over automatic:** rules never overwrite a manual categorization, and the app never groups transactions into reimbursement cases by itself.
- **Rule suggestions** (proposal): they follow the pattern for Claude's suggestions. They appear prefilled and editable and only count after "Übernehmen", even though the app, not Claude, makes them.
- **Estimated values** (virtual or expected transactions, open reimbursements) are marked with "≈".
- **Lists:** name, the key number (amount, in the middle and large) and the status, in three columns. Dates show the year only when it isn't the current one.
- **Phone:** bottom bar with at most 5 views, settings as a gear at the top right, buttons 56 px, text at least 16 px.
- **On opening** (proposal): there is no server, so the vault files are the confirmed state. The app shows data only after it has read them.

## Testing and workflow

All tests run on synthetic data only. Real bank data never enters the repo, Claude or any project.

- **Synthetic DKB CSVs:** a generator covers the formats the Python parser accepts, plus the known traps: a reformatted field, identical rows on the same day, umlauts and encoding, and header changes.
- **Unit tests:** identity and re-link, merging the device logs (including a conflict), rules, undo, and migration against the import report.
- **Browser tests:** run in Chromium with the file layer replaced by a test double. The real phone is checked by Vincent as he goes, so there are no "check on the phone" todos.
- **Workflow:** a coordinator project in Claude Code splits each stage into threads. Every thread opens a pull request, and Vincent merges. A merge to the app repo deploys to the phone, so it stays his step. In the test repo, threads may merge themselves.
- **Todos carry no version numbers;** the build assigns the version.

## Open questions

- [ ] Does folder access work in Vanadium with the Cryptomator vault? Chromium on Android supports a folder picker, but Cryptomator doesn't document folder access by other apps, so a folder test is needed. Fallback: see "Architecture and file layout".
- [ ] Read the Python app (Agent Scope) for the state file formats, the rule language and the re-link logic.
- [x] Tech stack: Svelte + TypeScript + Vite, tests with Vitest and Playwright (Vincent, 2026-11-26).
- [ ] Python app after migration: read-only or retired?
- [ ] Names of the views in the bottom bar.
- [ ] Does the Android document provider keep folder access after a phone restart without asking again?
