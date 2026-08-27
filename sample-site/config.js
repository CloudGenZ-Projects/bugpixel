/*
 * Deploy-time configuration for the sample client website.
 * portalOrigin = where the SPA runs (for postMessage origin checks)
 * apiOrigin = where the API runs (for fetch calls - same as portalOrigin in production)
 */
window.__BUGPIXEL__ = {
  portalOrigin: "http://localhost:5173",
  apiOrigin: "http://localhost:3000",
  websiteId: "b77a20c1-69a8-481a-9e24-e22b9d837344",
};
