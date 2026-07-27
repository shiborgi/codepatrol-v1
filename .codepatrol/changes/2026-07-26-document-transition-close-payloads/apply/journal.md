# Apply Journal — Document transition.json and close.json payload shapes

### T1 — Add `transition.json` section

- Re-read `src/change/types.ts:45-51` (`TransitionIntent`) and
  `src/change/orchestrator.ts:47-72` (`assertTransitionIntent`) fresh
  immediately before writing.
- Inserted a field table (six variants × required/optional fields), seven
  fenced JSON examples (one per variant plus a second `checkpoint` on
  `stage: "apply"` demonstrating `changes`), and prose on `persona`/
  `reasons`/stage-locked `result` — all as top-level Markdown, no outer
  wrapper fence, matching the real `session.json` block's structure.
- Verification: fence-count check (below, T3) confirms 8/8 independently
  balanced JSON fences and no `` ```markdown `` wrapper.
- Result: complete

### T2 — Add `close.json` section

- Re-read `src/change/types.ts:54` (`CloseInput`) and
  `src/change/orchestrator.ts:76-79` (`assertCloseInput`) fresh.
- Inserted one intro sentence plus one fenced JSON example with all four
  fields (`outcome`, `actor`, `authority`, `push`), directly after T1's
  section, no wrapper fence.
- Result: complete

### T3 — Final verification

- `npm run lint:skills`: passed — "Skill catalog, frontmatter,
  dependencies, portability, and relative links are valid."
- Side-by-side comparison: every field name, required/optional status, and
  enum value in the new table and eight examples matches current
  `src/change/types.ts:11-12,45-51,54` and
  `src/change/orchestrator.ts:47-79` — transcribed directly from a fresh
  re-read, no divergence. `changes`, `persona`, `reasons` each appear (the
  apply-stage checkpoint example for `changes`; prose for `persona`/
  `reasons`).
- Structural fence check (plan.md's literal T3 step 3 command): ran against
  the real edited file —

  ```
  $ node --input-type=module -e '...'
  PASS opens=8 closes=8
  ```

  Exit 0. No `` ```markdown `` wrapper present; exactly 8 independently
  opened/closed `json` fences.
- `git diff --stat d088fdb -- . ':!.codepatrol'`: exactly one file,
  `skills/_shared/CODEPATROL-CLI.md`, +64 lines (within the ~90-line
  forecast's order of magnitude; forecast was approximate).
- Lines 1-38 (pre-existing command list and `session.json` block)
  byte-identical to base — confirmed via direct diff against
  `git show d088fdb:skills/_shared/CODEPATROL-CLI.md`.
- `npm run verify` (the Apply gate): typecheck clean, 215/215 tests, build
  clean, smoke-cli clean, lint-skills clean.
- Production delta: `skills/_shared/CODEPATROL-CLI.md` only. No code
  change, no test file, no config/schema change — matches spec's
  Compatibility and rollout section exactly.
- Result: complete
