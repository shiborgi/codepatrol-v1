# Apply Journal

## T1 — Remove both dead functions

**Status**: Closed

**Evidence**:
- Verified `changeDirectory` has zero callers using `grep -rn "changeDirectory\b" src/ --include="*.ts"` (returned only the declaration line).
- Verified `changeRoot` has zero callers using `grep -rn "changeRoot\b" src/ --include="*.ts"` (returned only the declaration line).
- Deleted `changeDirectory` from `src/change/store.ts`.
- Deleted `changeRoot` from `src/shared/state.ts`.
- Ran `npm run typecheck`, producing 0 errors.
- Ran tests via `node --import jiti/register --test $(find src .pi scripts -name '*.test.ts' -o -name '*.test.mjs')`. Test count is 215/215, 0 failures.
- Ran `git diff --stat 948905dfd872b1ef31ec9b5fe5ba4a82cea05f46`, exactly two production files (`src/change/store.ts` and `src/shared/state.ts`) were changed.