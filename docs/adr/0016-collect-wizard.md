# ADR 0016: Collect Wizard

## Status

Accepted. Supersedes the Collect part of ADR 0015 and the Collect URLs of ADR 0013.

## Context

Collect had four menu items (Import, Extract, Review, Trips), each a page with its own header and a "Step N of 5" eyebrow, plus a "Your plan" card on Import. The maintainer wants the first steps to read as one procedure — passports, location history, stamp extraction, review, trips — with the success of the whole procedure on top.

## Decision

- Collect is one wizard behind one menu item. It shows a success header (progress, totals, one next action, a celebration when all is done), a stepper, one step, and Back/Next.
- Steps: `passports`, `locations`, `extract`, `review`, `trips`. Their order is `STEP_IDS` in `features/import/plan/planProgress.ts`; labels, titles and step content are the registry in `features/collect/steps.tsx`. The plan (`buildPlan`, `usePlan`) decides done / needs attention / to do and is the single source for the header, the stepper and the nav.
- URLs: `/collect/<step>`, plus `/collect/trips/<tripId>`. One `$step` route carries the Review search params (`tab`, `photo`, `stamp`); an unknown step redirects to `/collect`. `/` and `/collect` open the first step that is not done (the last one when all are). The `/collect` layout renders the step itself, so a step stays mounted while its own URL part changes.
- Old URLs redirect with `replace`: `/import` → `/collect/passports`, `/extract`, `/review` (search kept), `/trips`, `/trips/<id>` → their `/collect/...` paths.
- Step components render no page header; the wizard renders the step title.
- Nav: desktop sidebar lists Collect, then the Visualize tabs; phones show Collect and a Visualize link in Collect, and every tab with Collect pinned in Visualize. Settings stays in the footer. The Collect item shows "N/5"; per-step counts are in the stepper. Visualize is no longer a plan step.

## Consequences

- Adding a Collect step is one `STEP_IDS` entry, one registry entry and its done rule in `buildPlan`.
- Old links keep working, but each costs a redirect.
- The `plan:visualized` key in `db.kv` is no longer read or written.
