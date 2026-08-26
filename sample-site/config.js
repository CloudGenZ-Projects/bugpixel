/*
 * Deploy-time configuration for the sample client website.
 * portalOrigin = where the SPA runs (for postMessage origin checks)
 * apiOrigin = where the API runs (for fetch calls - same as portalOrigin in production)
 */
window.__BUGPIXEL__ = {
  portalOrigin: "http://localhost:5173",
  apiOrigin: "http://localhost:3000",
  websiteId: "06c45671-e1f9-479c-b02f-10e64ce1a6c0",
};
