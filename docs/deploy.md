# Deploy

voyput is static files: `npm run build` writes `apps/web/dist`. Serve it over HTTPS with the headers below, and serve `index.html` for unknown paths (the app routes in the browser: `/collect/review`, `/insights/map`, …).

## What the headers allow

| Directive | Value | Why |
| --- | --- | --- |
| `default-src` | `'self'` | Everything ships with the app. |
| `script-src` | `'self'` + one hash | The bundle, and the inline theme script in `index.html` (sets the theme before the first paint). |
| `style-src` | `'self'` | Only CSS files. The early page colour is `/boot.css`, not an inline `<style>`; React's `style` props go through the CSSOM, which CSP does not block. |
| `img-src` | `'self' blob: data:` | Page photos are shown from `blob:` URLs; the CSS has small `data:` images. |
| `font-src` | `'self' data:` | Inter files, and Silkscreen inlined into the CSS as `data:`. |
| `connect-src` | `'self' https://openrouter.ai http://127.0.0.1:*` | Demo data from this site, OpenRouter (model list and stamp reads), voyput-local on 127.0.0.1 at any port (ADR 0026). The app never calls `localhost`. |
| `worker-src` | `'none'` | No workers. |
| `manifest-src` | `'self'` | `manifest.webmanifest`. |
| `object-src`, `base-uri` | `'none'` | Not used. |
| `form-action` | `'self'` | Forms never post anywhere. |
| `frame-ancestors` | `'none'` | Not framed (also `X-Frame-Options: DENY`). |

No `upgrade-insecure-requests`: it would rewrite the `http://127.0.0.1` calls to voyput-local to `https` and break them.

### The inline script hash

`script-src` names the inline theme script in `apps/web/index.html` by its SHA-256. After changing that script, print the new hash and replace it in every block below:

```bash
node --experimental-strip-types scripts/csp-hash.ts
```

`apps/web/test/site-head.test.tsx` fails while this file holds a different hash.

## Caching

- `/assets/*`: file names carry a content hash; cache for a year, immutable.
- Everything else (`index.html` and the app's routes, `voyput-local.mjs`, `photo-locations.sh`, icons, demo data): `no-cache`, so a deploy shows up on the next load.
- The app's bundle carries the SHA-256 of `voyput-local.mjs` and `photo-locations.sh`, and the commands it shows refuse to run a file that does not match (ADR 0035). Deploy the bundle and the scripts together, from one build.
- `/voyput-local.mjs` is served as `text/javascript`, `/photo-locations.sh` as `text/plain` (shown, not downloaded, when opened in a browser).

## nginx

All `add_header` lines sit on the `server` block. A `location` with its own `add_header` would drop them (nginx does not merge `add_header` across levels), so the locations set caching with `expires` only.

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'sha256-4IaRe3Xf1Uk897iyvH41uezItoDmwosJ3dt6cbdAmys='; style-src 'self'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' https://openrouter.ai http://127.0.0.1:*; worker-src 'none'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header X-Frame-Options "DENY" always;

    # Hashed file names: Cache-Control max-age=315360000.
    location /assets/ {
        expires max;
        try_files $uri =404;
    }

    location = /voyput-local.mjs {
        types { }
        default_type "text/javascript; charset=utf-8";
        expires epoch;
    }

    location = /photo-locations.sh {
        types { }
        default_type "text/plain; charset=utf-8";
        expires epoch;
    }

    # expires epoch: Cache-Control no-cache. Unknown paths get index.html.
    location / {
        expires epoch;
        try_files $uri $uri/ /index.html;
    }
}
```

## Coolify

Coolify v4 serves a static build with nginx. In the application: build pack **Static** (or Nixpacks with "Is it a static site?"), publish directory `apps/web/dist`, build command `npm run build`. Then under **Configuration → General**, generate the nginx configuration and replace its `server { … }` block with the nginx block above (keep the `root` Coolify generated). The configuration is baked into the image: **Redeploy**, a restart keeps the old one. TLS ends at Coolify's proxy; HSTS from nginx passes through.

Not verified against a live Coolify instance; check the response headers after the first deploy:

```bash
curl -sI https://voyput.app.offcall.link/ && curl -sI https://voyput.app.offcall.link/voyput-local.mjs
```

## `_headers` (Cloudflare Pages)

The same rules for hosts that read a `_headers` file from the publish directory. `! Cache-Control` drops the value set by `/*` before `/assets/*` sets its own (Cloudflare Pages joins repeated headers otherwise). Netlify reads the same file but has no `!`; there, drop the `Cache-Control` line from `/*`.

```text
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-4IaRe3Xf1Uk897iyvH41uezItoDmwosJ3dt6cbdAmys='; style-src 'self'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' https://openrouter.ai http://127.0.0.1:*; worker-src 'none'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
  Strict-Transport-Security: max-age=63072000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  X-Frame-Options: DENY
  Cache-Control: no-cache
/assets/*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
/voyput-local.mjs
  Content-Type: text/javascript; charset=utf-8
/photo-locations.sh
  Content-Type: text/plain; charset=utf-8
```

The SPA fallback (unknown paths → `index.html`) is the host's own setting; Cloudflare Pages does it when the build has no `404.html`.
