# ADR 0042: voyput-local Site Flag

## Status

Accepted. Amends ADR 0026 (which origin voyput-local trusts).

## Context

voyput-local allowed only `https://voyput.app.offcall.link` and localhost as `Origin`, and its pairing link opened that site. A copy of voyput on another domain got 403 from voyput-local, and the pairing link sent its user to the public site instead of their own.

## Decision

- voyput-local takes `--site <origin>`. The CORS check allows that origin (plus any localhost port, as before), and the pairing link and the page at `/` point to it. Without the flag it uses the public site.
- The value must be an origin: `https://` on any host, or `http://` on `localhost` or `127.0.0.1`; no path, query, fragment or credentials. Anything else stops voyput-local with exit code 2.
- The app builds every command it shows from `window.location.origin`, and adds `--site <origin>` to the voyput-local commands when that origin is not the public site.
- The wire protocol (`VERSION` 3, the `v3` auth header) does not change.

## Consequences

- A self-hosted copy works with voyput-local through the command its own pages show; nothing to rebuild.
- The public origin is written twice: `SITE_ORIGIN` in `packages/local/src/voyput-local.ts` and `DEFAULT_SITE_ORIGIN` in `apps/web/src/ai/local.ts`. A fork that changes the default changes both.
- A user who runs voyput-local by hand for a copy on another domain must pass `--site` themselves.
