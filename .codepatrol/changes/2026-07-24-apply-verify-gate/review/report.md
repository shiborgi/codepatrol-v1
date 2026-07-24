# Review Report — Enforce Apply checkpoint verify gate

- Change: `2026-07-24-apply-verify-gate`
- Reviewer: opencode (codepatrol-review)
- Verdict: `approve`

## Assessment

The specification successfully identifies the root cause of the previous Change's Verify failures (a false claim of "all tests passed" without machine enforcement) and proposes a well-bounded, opt-in enforcement at the orchestrator layer. The plan correctly breaks down the implementation into safe, sequential tasks that reuse existing seams (e.g., `execFile`, `exactKeys` in `model.ts`, and test harnesses). 

### Plan Conformance and Validation
- **Simplicity**: The introduction of an optional `.codepatrol/config.json` avoids global schema breakage. The `GateRunner` seam keeps tests deterministic.
- **Safety**: The execution context is securely scoped using `execFile` without shell interpolation. The gate only triggers for Apply `implemented` checkpoints.
- **Coverage**: The acceptance criteria fully map to new unit tests covering passing, failing, and non-configured states.

### Findings
None. The plan is robust, the tasks are ordered safely, and there are no speculative deviations.

## Next steps
Proceed with Apply.