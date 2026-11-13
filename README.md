# voyput

Reconstructs a travel history from passport stamp photos, cross-checked against Apple Photos location data. Everything runs in the browser: the user brings photos and a CSV, reads stamps with their own OpenRouter key, reviews them, builds a history of one-country stays (trips are the stays between home stays) and sees it on charts.

## Commands

```bash
npm install
npm run dev        # app at http://127.0.0.1:5173
npm run storybook  # component kit at http://127.0.0.1:6006
npm run check      # biome, tsc, tests
npm run build      # static app in apps/web/dist
npm run demo:generate  # rebuild demo pages, stamps and CSV in apps/web/public/demo
```

## Deploy

`apps/web/dist` is a static site with path routes (`/collect/trips/<stay id>`, see [ADR 0013](docs/adr/0013-browser-history-routes.md)). The server (Coolify, nginx, any static host) must serve `index.html` for unknown paths, and the app must live at the domain root. Files that exist (`/assets/...`, `/demo/...`) are served as they are.

## Navigation

- **Collect** (`/collect/<step>`): one wizard — passports, photo locations, extract, review, trips — with a success header and a stepper on top. `/` opens the first step that is not done. Old URLs (`/import`, `/review?photo=…`, `/trips/<id>`, …) redirect. See [ADR 0016](docs/adr/0016-collect-wizard.md).
- **Visualize** (`/visualize/<tab>`): one route per tab ([ADR 0015](docs/adr/0015-collect-and-visualize-navigation.md)).
- **Settings** (`/settings`).

## Stamp reading

Stamps are read through OpenRouter with the user's own key. The default model is `google/gemini-3.8-flash`, which scored best on real stamp pages for about $0.015 per page ([model trial](docs/model-trial-2026-11.md), [ADR 0020](docs/adr/0020-gemini-flash-default-model.md)). Any image model can be picked in Settings. To compare models again, run `node scripts/model-trial/run.mjs` (see its header; it spends real credits).

The demo includes 10 real stamp pages from Wikimedia Commons with that model's output left unreviewed, so you can try Review without a key ([credits](apps/web/public/demo/CREDITS.md)).

## Layout

- `apps/web` — the app: routes, sections in `src/features/`, IndexedDB, AI client.
- `packages/ui` — shared components and theme, with Storybook.
- `packages/core` — domain types and pure logic.

Decisions are in [`docs/adr/`](docs/adr/README.md).
