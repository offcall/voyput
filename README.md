# voyput

![voyput: passport pages and photo locations become stays, a map and a replayed journey](docs/media/voyput.gif)

Passport stamps + iPhone photo locations → your travel history. Bring your own key. Runs in browser. Data stays in this browser, except page images and AI check details, which go only to the AI you pick.

**Use:** https://voyput.app.offcall.link

## Bring your own key

No voyput AI, no account. Stamps read by AI you pick:

- **OpenRouter key.** Paste in Settings. Default Gemini 3.8 Flash, ~$0.015/page, billed to you.
- **Claude Code / Codex subscription, locally.** Copy the command from Settings > AI, run it on your computer, open the pairing link it prints. It downloads `voyput-local.mjs`, checks its SHA-256 against this build of the site, then runs it:

  ```bash
  curl -fsSLo voyput-local.mjs https://voyput.app.offcall.link/voyput-local.mjs && echo "<sha256 from Settings> *voyput-local.mjs" | shasum -a 256 -c - && node voyput-local.mjs
  ```

  Hash comes from same site: catches a corrupted or tampered file, cache or proxy, not a takeover of the site ([ADR 0035](docs/adr/0035-download-verify-run.md)).

  Node 22.12+. 127.0.0.1 only. Requests signed, photos encrypted. Safari may block it; use Chrome or Firefox. Details: [ADR 0026](docs/adr/0026-local-ai-engine.md).

Photo locations need no AI.

## How it works

1. Add photos of passport stamp pages, iPhone photo locations CSV, or both.
2. AI reads stamps: country, date, direction. You check each against the page and your photo locations.
3. Get one-country stays. Edit, split, approve.
4. See Journey replay, map, calendar, stats.

No data at hand: demo passport inside the app.

## How the AI part works

- **Prompt:** one vision call per page ([`stamps/prompt.ts`](packages/core/src/stamps/prompt.ts)): stamp format guide + strict JSON answer (`notes`, `stamps[]` with direction, crossing, printed date text, date, country, code, location, confidence). Text in the image is data, not instructions.
- **Validated at the boundary:** every field checked ([`stamps/parse.ts`](packages/core/src/stamps/parse.ts)). Bad field → unknown + warning on its stamp. Not stamps at all → error with raw answer, old stamps kept.
- **Printed-date check:** date must match the printed date text and the passport's validity dates ([`stamps/dates.ts`](packages/core/src/stamps/dates.ts)).
- **GPS cross-check:** each stamp against your photo locations around its date ([`review/checks.ts`](packages/core/src/review/checks.ts)). You approve every stamp.
- **Validate with AI / Rescan with AI:** second look at one stamp (its fields + countries and dates of nearby photo locations), or the whole page for missed stamps ([`review/prompts.ts`](packages/core/src/review/prompts.ts)).
- **Two engines:** OpenRouter with your key, or local Claude Code / Codex CLI via voyput-local. Same prompts, same parser.
- **Default model:** picked in a small trial against hand-read ground truth: [docs/model-trial-2026-11.md](docs/model-trial-2026-11.md).

## Private

- Everything in this browser (IndexedDB). No account, no voyput server, no analytics.
- Sent only to the AI you pick, with your key or subscription: page images. Validate with AI also sends that stamp's fields and the countries and dates of nearby photo locations (no coordinates); Rescan with AI the stamps already read from that page.
- Photo locations CSV from your Mac: copy the command from Collect > iPhone photo locations (download, check SHA-256, run; [`tools/photos-export`](tools/photos-export)). Plain sh + macOS sqlite3, reads Photos library locally, uploads nothing.

## Dev

Node >= 22.22.2 to develop (jsdom and undici need it; voyput-local itself runs on 22.12+). `npm ci` for a clean install.

```bash
npm ci
npm run dev     # http://127.0.0.1:5173 (Vite picks the next free port if 5173 is busy)
npm run check   # biome, tsc, tests
npm run build   # static site in apps/web/dist; serve index.html for unknown paths
```

voyput-local against a dev server: `node --experimental-strip-types packages/local/src/voyput-local.ts --site http://127.0.0.1:5173` (the port Vite printed; open the app at the same origin).

The download-and-verify commands need `shasum` (macOS, Linux). Windows: use WSL, or check the hash with `certutil -hashfile <file> SHA256`.

Deploy: headers (CSP, HSTS, caching) for nginx, Coolify and `_headers`, and running a copy on your own domain, in [`docs/deploy.md`](docs/deploy.md).

Code: `apps/web` app · `packages/core` logic · `packages/ui` components · `packages/local` voyput-local · `tools/photos-export` CSV exporter. Decisions: [`docs/adr/`](docs/adr/README.md).

Not affiliated with Apple, Anthropic, OpenAI or OpenRouter.

## License

[MIT](LICENSE). Map data, fonts and the Wikimedia Commons sample pages in the demo keep their own terms: [THIRD_PARTY.md](THIRD_PARTY.md) ([demo credits](apps/web/public/demo/CREDITS.md)).
