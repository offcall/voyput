# ADR 0035: Download, Verify, Run

## Status

Accepted. Amends ADR 0026 (how voyput-local is run) and ADR 0033 (how the photo export is run).

## Context

The site tells users to run two scripts it serves: `photo-locations.sh` (`curl -fsSL <site>/photo-locations.sh | sh`, in a terminal with Full Disk Access) and `voyput-local.mjs` (`curl … -o voyput-local.mjs && node voyput-local.mjs`). Nothing checked that the file that arrived is the file this build of the app was made with. A truncated download, a stale or poisoned cache, a proxy, or a tampered file on the host would run as is.

## Decision

- **Hashes at build time.** `apps/web/vite.config.ts` provides `virtual:script-hashes`: the SHA-256 of each served script, computed from exactly the text the serving plugins emit (the oxc output for `voyput-local.mjs`, the file for `photo-locations.sh`). The dev server computes it the same way and reloads it when a source changes. `vitest.config.ts` uses the same plugin, so tests see real hashes.
- **One-line commands that verify before running.** `verifiedCommand` (`apps/web/src/app/servedScripts.ts`) builds, for Collect, Settings and the home page:
  `curl -fsSLo <file> <site>/<file> && echo "<sha256>  <file>" | shasum -a 256 -c - && <sh|node> <file> [options]`.
  `curl` and `shasum` ship with macOS and most Linux systems. A mismatch stops the line before the script runs. The file stays in the current folder, where the user can read it.
- **The export writes its CSV with `umask 077`** (mode 0600), so other users of the computer cannot read where the user has been.

## Consequences

- **What the hash protects against, and what it does not.** The hash is served by the same site as the script (it is in the app's bundle). It catches a corrupted or truncated download, and a script file that was changed, cached or replaced on its own (a stale CDN or proxy, a tampered file in the deploy output). It does **not** protect against someone who controls the whole site or the deploy pipeline: they can change the script and the hash together. Pinning against that would need a hash or signature published somewhere the site cannot change, which this static, single-origin project does not have.
- The hash differs between builds, so commands in Markdown cannot pin it; `README.md` and `tools/photos-export/README.md` show the shape and send users to the app for the current line.
- A deploy must publish the bundle and the scripts together. Both are `no-cache` (`docs/deploy.md`), so a mismatch after a deploy shows as a failed check, not as an unchecked run.
- The command is longer than `curl … | sh`, and options go after `sh photo-locations.sh` instead of `sh -s --`.
