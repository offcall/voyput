# ADR 0015: Collect and Visualize Navigation

## Status

Accepted. Extends ADR 0013. Collect part (pages, URLs, area switch for Collect) superseded by ADR 0016.

## Context

Visualize grows from one page with in-page tabs to a dozen views, two of them full dashboards. Mixed into one list with the data-collection steps, the nav no longer tells "build my history" apart from "look at it".

## Decision

- The shell has two areas: **Collect** (Import, Extract, Review, Trips) and **Visualize**. Settings stays at the bottom, outside both. The desktop sidebar shows them as two groups with a switch between them; the mobile tab bar shows the active area's pages plus a switch to the other area.
- Collect URLs stay as in ADR 0013: `/import`, `/extract`, `/review`, `/trips`, `/settings`.
- Each Visualize tab is its own route: `/visualize/<tab>`, e.g. `/visualize/route`, `/visualize/explore`, `/visualize/map`. `/visualize` redirects to the first tab; an unknown tab redirects to it too. Back and forward move between tabs.
- The tab list lives in one registry in `features/visualize`; the router and the tab strip both read it.

## Consequences

- A Visualize tab link can be shared and restores that view.
- The tab strip is navigation (links), not Base UI `Tabs` state.
- Adding a tab is one registry entry.
