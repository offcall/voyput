# voyput

Reconstructs a travel history from passport stamp photos, cross-checked against Apple Photos location data. Everything runs in the browser: the user brings photos and a CSV, reads stamps with their own OpenRouter key, reviews them, builds trips and sees them on charts.

## Commands

```bash
npm install
npm run dev        # app at http://127.0.0.1:5173
npm run storybook  # component kit at http://127.0.0.1:6006
npm run check      # biome, tsc, tests
npm run build      # static app in apps/web/dist
```

## Layout

- `apps/web` — the app: routes, sections in `src/features/`, IndexedDB, AI client.
- `packages/ui` — shared components and theme, with Storybook.
- `packages/core` — domain types and pure logic.

Decisions are in [`docs/adr/`](docs/adr/README.md).
