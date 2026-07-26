# Plan evidence — `transitionChangeLocked` decomposition

Verified by direct reads and commands during this Plan attempt. All paths
relative to repo root, checked against `main` @ `25b26fc`.

## Function boundary and size

```
$ grep -n "^async function transitionChangeLocked" src/change/orchestrator.ts
219:async function transitionChangeLocked(...)

$ awk '/^async function transitionChangeLocked/{start=NR} start && /^}/{print NR-start+1; exit}' src/change/orchestrator.ts
89
```

Full function body read (`orchestrator.ts:219-307`), confirming the exact
four block boundaries cited in `spec.md`'s Current evidence: recovery
(223-230), persona/stage match (231-242), consolidation guard (244-250),
checkpoint pipeline (252-294).

## Dead variable inside the touched block

```
$ grep -n "\bdeclared\b" src/change/orchestrator.ts
261:		const declared = new Set(intent.artifacts.map((item) => item.path)); const missing = ...
293:	if (unexpectedFinal.length || JSON.stringify(finalProduction) !== JSON.stringify(declaredProduction)) ...
```

Line 293's match is `declaredProduction`, a distinct identifier — the `\b`
word boundary correctly does not match `declared` as a substring of
`declaredProduction`. `declared` itself (line 261) is read nowhere else in
the file; confirmed by re-reading the full 89-line body once more with this
specific variable in mind.

## `persona` reuse across the function

```
$ grep -n "\bpersona\b" src/change/orchestrator.ts
231:	const persona = (intent as { persona?: string }).persona;
232:	if (persona && (intent.stage === "review" || intent.stage === "verify")) {
244:	if (!persona && intent.type === "checkpoint" && ...
260:		const personaCheckpoint = persona && (intent.stage === "review" || intent.stage === "verify");
291:		const checkpoint = await git.commit(personaCheckpoint ? `... ${persona} persona content ...` : ..., ...);
294:		event = { ..., ...(persona ? { persona } : {}) };
302:		event = { ..., ...(persona ? { persona } : {}) };
```

Confirms `persona`, once computed at line 231, is read by every one of the
blocks being extracted (and one that stays inline, the `return`-type event
branch at 302) — settling the design decision that
`assertPersonaStageMatch` must return `persona`, not just validate and
discard it.

## Self-containment of the checkpoint block's locals

Read `orchestrator.ts:295-307` (everything after the checkpoint block)
specifically checking for any reference to `required`, `personaCheckpoint`,
`missing`, `paths`, `allowed`, `prior`, `dirty`, `committed`, `candidate`,
`unexpected`, `actualProduction`, `declaredProduction`, `gateSummary`,
`committedPaths`, `checkpoint`, `tree`, `finalDelta`, `unexpectedFinal`,
`finalProduction` — zero matches for any of these names outside lines
252-294. Confirms `buildCheckpointEvent` can return just the constructed
`event` with no other state needing to leak back to the caller.

## Type shape for the checkpoint-variant parameter

```
$ grep -n "type: \"checkpoint\"" src/change/types.ts
48:	| { type: "checkpoint"; actor: string; stage: Exclude<Stage, "close">; result: StageCheckpointedEvent["result"]; artifacts: ArtifactBinding[]; changes?: string[]; nextAction: string; persona?: string }
```

`Extract<TransitionIntent, { type: "checkpoint" }>` resolves to exactly this
member — the type used for `buildCheckpointEvent`'s `intent` parameter.

## Regression surface

Files whose imports confirm they exercise `transitionChange` end-to-end
(read each file's top-of-file imports, not assumed from filename alone):
`src/change/change.test.ts`, `src/change/orchestrator-parallel.test.ts`,
`src/change/apply-gate.test.ts`, `src/change/apply-gate-enforcement.test.ts`,
`src/change/close-integration.test.ts`, `src/change/close-push.test.ts`,
`src/change/git.test.ts`, `src/change/backlog-close-integration.test.ts`,
`src/change/start-backlog-link.test.ts`. None require modification for a
pure internal refactor; each is named as the regression surface the
`npm run verify`/`npm test` gate after every task must keep green.

## Historical incident context

Project memory records a prior critical defect at exactly the
`CONSOLIDATION_AFTER_SUBEVENTS` error code this Change's T3 extracts
(`2026-07-24-aggregate-and-push`'s Apply/Verify round). No code citation
needed beyond the error code string itself, already present verbatim in the
current source (`orchestrator.ts:248`) — the plan's T3 step 4 adds an extra,
named re-confirmation step against `orchestrator-parallel.test.ts`
specifically because of this history, not as generic caution.

## Precedent

`2026-07-24-persona-subevent-helpers` (closed) already performed the same
class of behavior-preserving extraction (`personaSubEvents`,
`isDivergentPersonaEvent`) from this exact function for the same reason.
`2026-07-24-migration-normalizer` established the "characterization via the
existing suite, no new test file" pattern for a behavior-preserving internal
refactor elsewhere in `src/change/`. Both precedents read in full (their
`plan/spec.md`) to confirm the pattern before reusing it here.
