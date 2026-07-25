# Apply Journal

### T1 — Replace the duplicate reader with a canonical-delegating wrapper
- Implemented thin wrapper around `readChangeRecord`.
- Removed `yaml` import and old manual parser.
- Result: complete

### T2 — Add regression tests for legacy-stage folding and corrupt-file failure
- Verified existing added tests for legacy `finalize` stage parsing and corrupted `change.yaml` throwing in `improvement-report.test.ts`.
- Ran `npm test` successfully.
- Result: complete

### T3 — Full verification and graph refresh
- Confirmed full test suite runs successfully with `npm run verify`.
- Reconciled changes.
- Graph synced internally and successfully checks out.
- Result: complete
