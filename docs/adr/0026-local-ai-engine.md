# ADR 0026: Local AI Engine

## Status

Accepted. Adds a second provider next to OpenRouter (ADR 0008); OpenRouter stays the default.

## Context

Many users already pay for ChatGPT (Codex CLI) or Claude (Claude Code). They should be able to read stamps with that subscription instead of buying OpenRouter credits. A browser cannot run those CLIs, and the site is static (ADR 0003), so something has to run on the user's own computer. The maintainer chose a downloadable script (not npm, not Docker) that supports whichever of the two CLIs is installed and logged in.

## Decision

- **Where it lives.** `packages/local/src/voyput-local.ts`, one file using only Node built-ins (Node 22 or newer). A package, not a root `local/` folder, because the existing workspace globs already type-check and test `packages/*/src` and `packages/*/test`. The file is written with erasable TypeScript only; a small Vite plugin in `apps/web/vite.config.ts` turns it into JavaScript with Node's `module.stripTypeScriptTypes` and serves it as `/voyput-local.mjs` (dev server and build output). No bundler step, no runtime dependency.
- **How it is run.** Settings shows the command, built from the page's origin: `curl -fsSL https://voyput.app.offcall.link/voyput-local.mjs -o voyput-local.mjs && node voyput-local.mjs`, or from a clone `node packages/local/src/voyput-local.ts` (Node 22.18+ strips the types itself). `--port` changes the port.
- **Server.** HTTP on `127.0.0.1` only, default port 47615. `GET /health` returns `{ app, version, engines }`; `POST /extract` takes `{ engine: auto|codex|claude, system, text, image }` (image a JPEG or PNG data URL) and returns `{ text, engine }`. The app builds the same prompts it sends to OpenRouter and parses the answer with the same core parsers; the script only relays. `auto` uses Codex if found, else Claude Code. At most two CLI runs at once, 10 minutes each, then the process is killed.
- **CLIs.** Found by walking `PATH` (with `PATHEXT` on Windows). Each job gets a fresh temp dir (image and system prompt written mode 0600), deleted afterwards. Flags verified on this machine against `codex exec --help` (codex-cli 0.169.0) and `claude --help` (Claude Code 2.1.325), and with one real run each:
  - `codex exec --sandbox read-only --skip-git-repo-check --ephemeral --ignore-user-config --ignore-rules --color never --cd <tmp> --output-last-message <tmp>/answer.txt --image <tmp>/page.jpg`, prompt (system + text) on stdin.
  - `claude -p --input-format stream-json --output-format stream-json --verbose --tools "" --system-prompt-file <tmp>/system.txt --no-session-persistence --safe-mode --strict-mcp-config`, one user message with the image as a base64 block and the text on stdin; the answer is the `result` event. Claude gets no tools at all. `--system-prompt-file` is listed only in the help text of `--bare`, not as its own entry; it worked in the smoke run.
- **Security.** Any website the user visits can send requests to localhost, so:
  - A pairing token (24 random bytes, base64url) is required on every request except CORS preflights, in the `X-Voyput-Token` header, compared in constant time; otherwise 401. It is stored in `$XDG_CONFIG_HOME/voyput-local/token` (default `~/.config`), mode 0600, so the app stays paired across restarts; `--new-token` replaces it.
  - On start the script prints `https://voyput.app.offcall.link/settings#local=<token>` (plus `&port=` when not default). Settings reads the hash, stores token and port, selects Local and removes the hash from the address bar. The token can also be pasted.
  - CORS allows only `https://voyput.app.offcall.link` and `http://localhost:*` / `http://127.0.0.1:*`; other origins get 403 with no CORS headers. Requests whose `Host` is not `127.0.0.1:<port>` or `localhost:<port>` get 403 (DNS rebinding). Private Network Access preflights get `Access-Control-Allow-Private-Network: true`.
  - Bodies over 30 MB get 413. The log prints method, path, status and seconds only, never bodies, images or answers.
- **Where the photo goes.** Browser → voyput-local on the same computer → a temp file → the CLI → OpenAI (Codex) or Anthropic (Claude Code) under the user's own account and that provider's terms. Nothing goes to voyput. Settings says so.
- **App.** `Settings` gains `aiProvider` (`openrouter` | `local`), `localEngine`, `localToken`, `localPort`. `ai/client.ts` dispatches each `askAboutImage` to `ai/openrouter.ts` or `ai/local.ts` by `aiProvider`, so Extract, Validate and Rescan follow the choice without their own branches. `aiSetupNeeded` replaces the "has an OpenRouter key" checks on Extract and Review. An extraction made locally records `local/codex` or `local/claude` as its model. The Settings AI card shows the choice, the commands with Copy, the status from `/health` (Found, Not running, Wrong token) and the engine.
- **Mixed content.** An https page calling `http://127.0.0.1` is allowed in Chromium and Firefox (loopback is potentially trustworthy). Recent Chromium asks the user for local network access the first time. Safari has long treated it as mixed content (WebKit bugs 171934, 279249) and behaviour has changed between versions; not verified here. The script does not serve the app (the built app is not one file). Safari users use Chrome or Firefox, or run the app from a clone (`npm run dev`, an http page on 127.0.0.1). Settings says this in one line.

## Alternatives

- npm package or Docker image: rejected by the maintainer; a single file is easier to read before running.
- A root `local/` folder: needs its own test and type-check globs.
- Image as a file plus Claude's `Read` tool: gives the model a file tool; inline base64 needs none.
- A new token on every start: safer if the token leaks, but pairing again after every restart; `--new-token` covers a leak.

## Consequences

- Local works only where the script runs: the same computer as the browser. Phones use OpenRouter.
- The script can only reach engines found at start; installing a CLI later needs a restart.
- Codex runs read-only but may still run read-only shell commands in its sandbox; a prompt injected through a photo could make it read local files into its answer, which goes back only to the paired browser. Claude Code gets no tools.
- `--ignore-user-config` means Codex uses its default model, not the one in the user's config. There is no model or effort choice for Local.
- Windows: `.cmd` shims are started through the shell with quoted arguments. Not tested.
- Costs are the subscription's limits; the app shows no cost for local runs.
