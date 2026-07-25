# Stage Session contract

A Stage Session is disposable operational progress for exactly one Change
stage attempt. It lives at
`.codepatrol/runtime/sessions/<work-id>/<stage>/<attempt>.json` and may contain
bounded tasks, dependencies, claims, concise results, artifact paths and the
projected next action.

Prime it with `codepatrol change session --id <work-id> --input -`. Query the read-only `status` action to list claimable (ready) items and blocked items with their unclosed dependencies before claiming. Claim one
ready item before mutation and close it only after its acceptance evidence
passes. A failed claim will report the blocking dependency. If the file is missing or corrupt, use action `rebuild`; the accepted
Change artifacts reconstruct it.

Priming and `rebuild` derive items from the stage's declared artifacts and
reconcile each against the Change's durable artifacts on disk: delivered work
returns `closed`, and an unbacked claim does not survive a rebuild. A harness
resuming a stage another harness began must re-prime the session first and treat
its `status` projection as the resume point.

A session must never own lifecycle, revision, approval, terminal outcome,
project-wide decisions, conversations or logs. Losing it cannot change the
Change stage or invalidate a checkpoint.
