# Security

## What voyput handles

- **Passport page photos** and the stamps read from them. Stored in the browser (IndexedDB); sent only to the AI the user picks.
- **AI check details**: "Validate with AI" also sends that stamp's fields and the countries and dates of the nearest photo locations (no coordinates); "Rescan with AI" sends the stamps already read from that page. Only to the AI the user picks.
- **Photo locations**: dates and coordinates from the user's Apple Photos library, exported on their Mac by [`tools/photos-export`](tools/photos-export) (reads the library, uploads nothing) and imported as a CSV.
- **An OpenRouter API key**, kept in the browser and sent only to `https://openrouter.ai`.
- **voyput-local** ([`packages/local`](packages/local)): a helper the user runs on their own computer. It listens on `127.0.0.1`, accepts only requests signed with its pairing token, decrypts the photo, and passes it to the Claude Code or Codex CLI ([ADR 0026](docs/adr/0026-local-ai-engine.md)).

There is no voyput server, account or analytics. The site is static files with a strict Content-Security-Policy ([`docs/deploy.md`](docs/deploy.md)).

## Reporting a vulnerability

Please report privately through GitHub: **Security → Report a vulnerability** on [offcall/voyput](https://github.com/offcall/voyput/security/advisories/new). Do not open a public issue.

Include what is affected, how to reproduce it, and what an attacker gains. You will get an answer when the report has been read; there is no bug bounty.

## In scope

- Anything that sends passport photos, stamps, photo locations or the API key somewhere the user did not choose (another site, a log, a third party).
- voyput-local: pairing, request signing and encryption, origin and host checks, replay, how it starts the CLIs, temp files, anything another website or another local user can make it do.
- `photo-locations.sh`: anything that writes to the Photos library or leaves data behind.
- The web app: XSS, CSP bypasses, a crafted CSV, photo, demo file or AI answer that runs code or reaches other stored data.
- The download-and-verify commands the app shows ([ADR 0035](docs/adr/0035-download-verify-run.md)), beyond the stated limit that the hash comes from the same site.

## Out of scope

- What the chosen AI provider (OpenRouter and its models, Anthropic, OpenAI) does with the images it receives.
- Attacks that need control of the user's browser profile, operating system account or the site's hosting.
- Missing hardening headers on a copy someone else hosts.
