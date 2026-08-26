/*
 * Injects the real inspector script from the portal origin with the required
 * data-* attributes, using the values from config.js (window.__BUGPIXEL__).
 *
 * Keeping the loader tiny and separate means the sample site never hardcodes
 * the portal origin/website id in HTML — you only edit config.js on deploy.
 */
(function () {
  var cfg = window.__BUGPIXEL__ || {};
  var portalOrigin = cfg.portalOrigin;
  var websiteId = cfg.websiteId;

  if (!portalOrigin || !websiteId || websiteId === "REPLACE_WITH_WEBSITE_ID") {
    // Not configured yet — stay completely inert (safe default).
    console.info(
      "[BugPixel] inspector not loaded: set portalOrigin and websiteId in config.js"
    );
    return;
  }

  var s = document.createElement("script");
  s.src = portalOrigin.replace(/\/$/, "") + "/inspector/inspector.js";
  s.async = true;
  s.setAttribute("data-portal-origin", portalOrigin);
  s.setAttribute("data-website-id", websiteId);
  document.head.appendChild(s);
})();
