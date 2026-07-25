---
name: codepatrol-git
description: (codepatrol) Two-way sync the local backlog with GitHub issues on the current origin remote via the gh CLI. Use to pull open issues into backlog candidates and push unlinked candidates as new issues.
---

# Codepatrol Git (issues sync)

Act as the read-only Dispatcher in [ROLES.md](../_shared/ROLES.md). This skill
wraps one CLI command and never touches Change lifecycle state.

Run `codepatrol issues sync [--direction pull|push|both] [--dry-run]
--workspace "$PWD"`.

Reproduce the command's output verbatim. Do not construct, reorder, embellish
or repair the result.

## Direction semantics

- `pull` (default half of `both`): for every GitHub issue on the current
  `origin` remote, reflect its state into `.codepatrol/backlog/items.yaml`.
  Open unlinked issues become new `candidate` backlog entries sourced from
  `github-issue` (no `workId`); linked issues flip a `candidate` to `dismissed`
  when closed, or a `dismissed` back to `candidate` when reopened; `scheduled`
  and `done` items are never auto-flipped. Closed unlinked issues are never
  imported.
- `push` (default half of `both`): for every `candidate` backlog item with no
  `externalRef`, create a GitHub issue labeled `codepatrol-backlog` and record
  its `externalRef`; for every `done` or `dismissed` item whose linked issue is
  still open, close the issue with reason `completed` or `not planned`.
- `--dry-run`: report the would-be result with zero `gh` write calls and zero
  `items.yaml` writes.

## Preconditions

- The workspace must already be authenticated with `gh auth login`.
  `assertAvailable` fails loud and specific if `gh` is missing or
  unauthenticated — it never silently no-ops.
- This command makes the first outbound network call in the entire CLI. Every
  other command remains fully local.

## Out of scope

- No Change record, Plan/Review/Apply/Verify/Close artifact, or Pull Request is
  read from or written to GitHub by this skill.
- No label-based pull filter; no per-item push opt-in; no pagination beyond
  `gh`'s single `--limit 1000` call; no remote other than `origin`.
