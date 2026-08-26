# BugPixel — Sample Client Website

A plain static website used to test the BugPixel change-request inspector. It is
one of the "owner-hosted" client websites the portal targets. Deploys to
Cloudflare Pages (or any static host) with **no build step**.

## Files

- `index.html` — the page content (hero, features, pricing, contact)
- `styles.css` — styling
- `config.js` — **edit this on deploy**: your portal origin + this site's Website id
- `inspector-loader.js` — injects the inspector script from the portal origin

## Configure

Edit `config.js`:

```js
window.__BUGPIXEL__ = {
  portalOrigin: "https://portal.yourdomain.com", // where the BugPixel portal runs (HTTPS)
  websiteId: "the-website-id-from-the-portal",
};
```

- `portalOrigin` must be **HTTPS** in production — the inspector calls the portal
  with credentialed fetch, and browsers require HTTPS + proper CORS for that.
- `websiteId` is the id of the Website record you created in the portal for this
  site (the Client must own it).

Until both are set, the loader stays inert (no inspector), which is the safe
default for anonymous visitors.

## Deploy to Cloudflare Pages

1. Connect the `bugpixel-client-test` repo in the Cloudflare Pages dashboard.
2. Framework preset: **None**. Build command: **(empty)**. Build output
   directory: **/** (the repo root — these files are already static).
3. Deploy. Your site will be at `https://<project>.pages.dev` (or your domain).

## Important: cross-origin note

When the sample site is on a different origin than the portal (e.g. site on
Cloudflare Pages, portal on your VPS), the portal must send CORS headers that
allow the sample site's origin **with credentials**. The portal was built for a
same-origin SPA, so cross-origin CORS is not enabled by default — see the
"What's left for cross-origin deployment" section in the main project README /
the note the assistant provided.
