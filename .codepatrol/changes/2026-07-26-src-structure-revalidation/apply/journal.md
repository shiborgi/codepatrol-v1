# Apply Journal

## T1 — File S1-S4 as backlog items

**Status**: Closed

**Evidence**:
- Added 4 items to the backlog using `codepatrol backlog add`.
- Python script output verifying the additions:
  ```
  4
  p2 candidate the-reject-unknown-keys-schema-guard-is-reimplemented-times-
  p2 candidate path-layout-knowledge-for-codepatrol-has-no-owning-module-ha
  p3 candidate graph-link-ts-lines-has-no-direct-test-extending-the-known-n
  p3 candidate cli-command-registration-is-split-across-three-parallel-regi
  ```
- Committed backlog changes: `0963a9c` with message `chore(codepatrol): backlog follow-ups from 2026-07-26-src-structure-revalidation (S1-S4)`.

## T2 — Final verification (no code touched)

**Status**: Closed

**Evidence**:
- `npm run verify` passed fully (215/215 tests, 0 failures).
- `git status --porcelain` showed only the untracked `apply/` directory.
- `git diff --stat 5f569dbbde70c060bcac566568bdb408732be0c1..HEAD -- ':!.codepatrol'` outputted exactly nothing.
- AC-1 and AC-2 re-confirmed (investigation method intact).
- No deferred constraints triggered.
- Graph sync skipped since no code changed.
- Rollback of the backlog commit would be entirely clean.