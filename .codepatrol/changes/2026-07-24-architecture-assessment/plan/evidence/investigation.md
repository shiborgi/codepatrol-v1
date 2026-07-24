# Plan investigation evidence

Baseline: `main` @ `415f779bde14e57ad0af7ac4cd25657bcea00fcd`; branch `codepatrol/2026-07-24-architecture-assessment`.

## Substrate

- `codepatrol graph sync`: 73 files, 1804 symbols, 397 imports / 3630 calls / 133 tests edges, 41ms.
- `codepatrol wiki status`: `exists:false` (valid absent substrate); uncovered sources include `bin/`, `scripts/`.
- `npm run verify` at baseline: **exit 0** (typecheck + 144 tests + build + smoke:cli + lint:skills). Background run id b1bcsxlmy.

## Session-ergonomics seam (F1, implemented)

- `src/change/session.ts:73` — `readySessionItems(session)` = open items whose every dependency is closed. Computed but never surfaced via CLI.
- `src/change/session.ts:60-72` — `primeStageSession` writes a fresh session when absent (`write(...)`); not a read-only source.
- `src/change/session.ts:74-80` — `claimSessionItem` throws `CHANGE_CONFLICT: Session item is not ready: <id>` with no reason.
- `src/cli/commands.ts:124-133` — `change.session` supports only `prime|claim|close|rebuild`; text output = `data.next_action` only.
- `grep` for the "not ready" string across `src/**/*.test.ts`: **no matches** → message safe to enrich.
- `scripts/skills-contract.test.mjs:30` — already asserts `SESSION.md` content (`/never own lifecycle/i`, runtime path) → natural place to lock new doc.
- `skills/_shared/SESSION.md:6-10` — mentions "claim … ready item before mutation"; no mention of a status projection.

## Telemetry (durable improvement reports)

- `docs/codepatrol/improvement-reports/2026-07-24-aggregate-and-push.md`: `change.session` invoked **109** times; top error `CHANGE_CONFLICT` "Session item is not ready" **×25**; `INVALID_WORKSPACE` on `prime` ×1.
- `docs/codepatrol/improvement-reports/2026-07-24-apply-verify-gate.md`: `change.session` invoked **18** times; `INVALID_WORKSPACE` ×2 (top code).

## Findings F2–F7 evidence (recorded as follow-ups)

- F2 usage hollow: `grep "status: unavailable|status: measured"` across `.codepatrol/changes/*/change.yaml` → **55 unavailable vs 3 measured**. `src/change/usage.ts`, `model.ts` `aggregateUsage`.
- F3 orchestrator density: `src/change/orchestrator.ts:200-287` `transitionChangeLocked` (~90 lines); compat migrations at `src/change/model.ts:59-61` (finalize→close) and `src/change/orchestrator.ts:292-298` (`recordFromYaml` tokens→characters).
- F4 persona consolidation: `src/change/orchestrator.ts:225-231` (CONSOLIDATION_AFTER_SUBEVENTS guard), `orchestrator.ts:281` (return reason aggregation), fold in `model.ts`.
- F5 CLI input ergonomics: `src/cli/commands.ts:46` `readJsonInput` resolves non-`-` input as a path → `INVALID_WORKSPACE` when JSON passed inline.
- F6 distribution: `scripts/install-lib.mjs` symlinks skills into the repo; `~/.claude/skills/codepatrol-*` are symlinks; `../_shared` resolves only through symlink-into-repo.
- F7 wiki unused: `wiki status` `exists:false`.
