/*
 * Deploy-time configuration for the sample client website.
 *
 * Set these to your hosted portal's origin and the Website id you created in
 * the portal for this site. On Cloudflare Pages you can either edit this file
 * before deploying, or override it with an environment-specific copy.
 *
 *   portalOrigin: the HTTPS origin where the BugPixel portal is hosted
 *                 (e.g. "https://portal.yourdomain.com"). Must be HTTPS in
 *                 production because the inspector uses credentialed fetch.
 *   websiteId:    the Website id from the portal that this page corresponds to.
 */
window.__BUGPIXEL__ = {
  portalOrigin: "http://localhost:3000",
  websiteId: "REPLACE_WITH_WEBSITE_ID",
};
