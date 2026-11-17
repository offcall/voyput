# voyput

![voyput: passport pages and photo locations become stays, a map and a replayed journey](docs/media/voyput.gif)

Passport stamps + iPhone photo locations → your travel history. Bring your own key. Runs in browser. Data stays in browser.

**Use:** https://voyput.app.offcall.link

## Bring your own key

No voyput AI, no account. Stamps read by AI you pick:

- **OpenRouter key.** Paste in Settings. Default Gemini 3.8 Flash, ~$0.015/page, billed to you.
- **Claude Code / Codex subscription, locally.** Run on your computer, open the pairing link it prints:

  ```bash
  curl -fsSL https://voyput.app.offcall.link/voyput-local.mjs -o voyput-local.mjs && node voyput-local.mjs
  ```

  Node 22.12+. 127.0.0.1 only. Requests signed, photos encrypted. Safari may block it; use Chrome or Firefox. Details: [ADR 0026](docs/adr/0026-local-ai-engine.md).

Photo locations need no AI.

## How it works

1. Add photos of passport stamp pages, iPhone photo locations CSV, or both.
2. AI reads stamps: country, date, direction. You check each against the page and your photo locations.
3. Get one-country stays. Edit, split, approve.
4. See Journey replay, map, calendar, stats.

No data at hand: demo passport inside the app.

## Private

- Everything in this browser (IndexedDB). No account, no voyput server, no analytics.
- Page images go only to the AI you pick, with your key or subscription.
- Photo locations CSV from your Mac: `curl -fsSL https://voyput.app.offcall.link/photo-locations.sh | sh` ([`tools/photos-export`](tools/photos-export)). Plain sh + macOS sqlite3, reads Photos library locally, uploads nothing.

## Dev

```bash
npm install
npm run dev     # http://127.0.0.1:5173
npm run check   # biome, tsc, tests
npm run build   # static site in apps/web/dist; serve index.html for unknown paths
```

Deploy: headers (CSP, HSTS, caching) for nginx, Coolify and `_headers` in [`docs/deploy.md`](docs/deploy.md).

Code: `apps/web` app · `packages/core` logic · `packages/ui` components · `packages/local` voyput-local · `tools/photos-export` CSV exporter. Decisions: [`docs/adr/`](docs/adr/README.md).

## License

[MIT](LICENSE). Wikimedia Commons sample pages in the demo keep their own licences: [credits](apps/web/public/demo/CREDITS.md).
