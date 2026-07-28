---
name: codepatrol-sync
description: (codepatrol) Push the local Change-related refs and terminal tags to origin and publish local Work records one-way to GitHub issues via gh. Use to publish a closed Change and to keep the remote aligned with local state; this is the only command that touches the network.
---

# Codepatrol Sync

Act as the read-only Dispatcher in [ROLES.md](../_shared/ROLES.md). This skill
wraps one CLI command and never touches Change lifecycle state.

Run `codepatrol sync [--target] [--branches] [--issues]
[--target-branch <name>] [--prune-closed] [--dry-run] --workspace "$PWD"`.

Reproduce the command's output verbatim. Do not construct, reorder, embellish
or repair the result.

## Scope

- `--target` pushes the resolved target branch to `origin` once. If
  `--target-branch <name>` is supplied, `<name>` is validated against the
  same safe-branch grammar the start command uses and pushed verbatim;
  otherwise the target resolves from `current` (`codepatrol/<work-id>` →
  that Change's recorded target; otherwise the current branch must be a
  known target for at least one Change). Branches that do not match either
  case are rejected with `INVALID_ARGUMENT` before any `git push`.
- `--branches` pushes every `refs/heads/codepatrol/*` and every
  `refs/tags/codepatrol/*` ref exactly once.
- `--issues` publishes local Work records to GitHub issues one-way via
  `syncIssues`. Local Work is the only authority: each record maps to one
  issue labeled `codepatrol-backlog` titled exactly `[pN] <work-id>`, whose
  body is the local description plus a generated `Codepatrol-Work: <work-id>`
  marker. Open work maps to an open issue, done to completed closure and
  dismissed to not-planned closure. Sync may create, edit, reopen or close
  remote issues and writes back only the issue number/URL into the local
  Work record; remote prose, priority or state never govern local Work or
  lifecycle state. There is no direction selector because there is no second
  authority to pull from.
- `--prune-closed` deletes the local `refs/heads/codepatrol/<work-id>` for a
  terminal Change **only after** its branch pushed successfully. The
  terminal tag is never deleted.
- Passing **any** of `--target`/`--branches`/`--issues` narrows to the
  selected subset; passing none selects all three (the permissive default).
- `--dry-run`: zero remote mutations and zero local writes — no `git push`,
  no `git deleteBranch`, no `gh` writes, no Work record updates. The `gh`
  reads `assertAvailable`/`listIssues` still run so the report names the
  exact create/edit/reopen/close/link actions that would execute.

## Preconditions

- The workspace must already be authenticated with `gh auth login`.
  `assertAvailable` fails loud and specific if `gh` is missing or
  unauthenticated — it never silently no-ops.
- This command is the only outbound network call in the entire CLI. Every
  other command — including `change close` — remains fully local.

## Out of scope

- No Change record, Plan/Review/Apply/Verify/Close artifact, or Pull Request is
  read from or written to GitHub by this skill other than what `syncIssues`
  already does.
- No fetch, rebase, force-push, or conflict resolution — `sync` only pushes
  refs that already exist locally and calls `gh` for issues.
- No automatic pruning of remote refs; pruning is local and opt-in.
