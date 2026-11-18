# ADR 0013: Browser History Routes

## Status

Accepted. Supersedes the hash history part of ADR 0006. Collect URLs superseded by ADR 0016, `/visualize` by ADR 0023, `/` by ADR 0025.

## Context

ADR 0006 chose hash URLs (`/#/trips`) so any static host serves deep links. Links now carry more than the section (the selected trip, the Review tab and photo), and `/#/` paths read badly when shared.

## Decision

- Browser history: `/import`, `/extract`, `/review`, `/trips`, `/visualize`, `/settings`; `/` redirects to `/import`.
- Selections that a link should restore live in the URL: `/trips/<tripId>` (a child route, so the Trips page stays mounted), and `/review?tab=photos|timeline&photo=<photoId>` (search params, checked by `validateSearch`). An unknown id shows the list, not an error.
- Old hash URLs are rewritten once on load (`/#/trips` → `/trips`) before the router starts.
- Vite `base` stays `/`: assets and `/demo/...` are absolute, so they load from nested routes.

## Consequences

- The production server must answer unknown paths with `index.html` (SPA fallback). Vite dev and preview already do.
- The app must be served from the domain root; a sub-path deploy needs `base` and the router `basepath` set together.
