# ADR 0032: Codex On by Default

## Status

Accepted. Supersedes the "Codex is off by default" part of ADR 0026; the rest of ADR 0026 stands.

## Context

ADR 0026 offered the Codex CLI only with `--codex`, because Codex keeps a few tools no flag turns off (a filesystem-less JavaScript sandbox, `apply_patch` under a read-only sandbox, sub-agent tools). In testing, the maintainer found Codex silently missing for a user who has it installed, and judged that risk acceptable: the job runs read-only, without a shell, in an empty temp dir, under the user's own account.

## Decision

- voyput-local offers every engine it finds on `PATH`, Codex included. `--no-codex` leaves Codex out. `--codex` is still accepted, so older commands keep working, and changes nothing.
- `auto` still prefers Claude Code, which runs with no tools, and falls back to Codex.
- Settings and the home page describe Codex as available, with `--no-codex` as the way to leave it out.
- The start banner puts the pairing link first and lists each engine as ready, off (`--no-codex`) or not installed. `GET /` without an `Origin` (a person opening the address) returns a static page that points back to Settings; it holds no token and its CSP forbids loading anything. Requests from other sites still get 404.

## Consequences

- A user with only Codex, or with Codex beside Claude Code, can pick it without restarting.
- Prompt injection through a photo can drive Codex's remaining tools whenever Codex is chosen, as ADR 0026 describes for `--codex`; `--no-codex` restores the old confinement.
