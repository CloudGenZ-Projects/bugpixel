/**
 * Deployable injected inspector entry point.
 *
 * This is the script the portal owner includes on client websites via
 * `<script src="https://portal/inspector/inspector.js">`. It wires the tested
 * `Inspector` class (bootstrap + token gating + capture handshake) to the real
 * DOM: hover-highlighting, click-to-select, and an html2canvas-based screenshot
 * capturer that draws a highlight overlay before rasterizing.
 *
 * It stays inert for anonymous visitors — nothing activates until an
 * origin-verified INSPECTOR_INIT arrives from the opener with a valid token.
 *
 * Requirements: 6.1-6.6, 7.1-7.4, 15.1, 15.2
 */
import html2canvas from "html2canvas";

import {
  Inspector,
  computeSelector,
  type CaptureFn,
  type ScreenshotResult,
} from "./inspector.js";

/** The portal origin is injected at include time via a data attribute, else same-origin opener. */
function resolvePortalOrigin(): string {
  const el = document.currentScript as HTMLScriptElement | null;
  const attr = el?.getAttribute("data-portal-origin");
  if (attr) return attr;
  // Fall back to the script's own origin (it is served from the portal).
  try {
    if (el?.src) return new URL(el.src).origin;
  } catch {
    /* ignore */
  }
  return window.location.origin;
}

/** The website id this page corresponds to, injected via data attribute. */
function resolveWebsiteId(): string {
  const el = document.currentScript as HTMLScriptElement | null;
  return el?.getAttribute("data-website-id") ?? "";
}

/** Draw a highlight overlay over an element, run html2canvas, then remove it. */
const captureWithHighlight: CaptureFn = async (
  el: Element
): Promise<ScreenshotResult> => {
  const rect = el.getBoundingClientRect();
  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    outline: "3px solid #ff3b30",
    background: "rgba(255,59,48,0.15)",
    zIndex: "2147483647",
    pointerEvents: "none",
  });
  document.body.appendChild(overlay);
  try {
    const canvas = await html2canvas(document.body, { logging: false, useCORS: true });
    const dataUrl = canvas.toDataURL("image/png");
    return { dataUrl, mime: "image/png", width: canvas.width, height: canvas.height };
  } finally {
    overlay.remove();
  }
};

/** Validate a token against the portal API (called by the Inspector). */
async function validateToken(
  portalOrigin: string,
  token: string,
  websiteId: string
): Promise<boolean> {
  try {
    const res = await fetch(`${portalOrigin}/api/inspector/validate`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, websiteId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function main(): void {
  const portalOrigin = resolvePortalOrigin();
  const websiteId = resolveWebsiteId();

  const inspector = new Inspector({
    portalOrigin,
    websiteId,
    captureScreenshot: captureWithHighlight,
    validateToken: (token, wid) => validateToken(portalOrigin, token, wid),
  });
  inspector.start();

  // Hover highlight (only visible while enabled).
  let hovered: HTMLElement | null = null;
  const HL_CLASS = "__crp_inspector_hover__";
  const style = document.createElement("style");
  style.textContent = `.${HL_CLASS}{outline:2px dashed #007aff !important;cursor:crosshair !important;}`;
  document.head.appendChild(style);

  document.addEventListener(
    "mouseover",
    (e) => {
      if (!inspector.isEnabled) return;
      const t = e.target as HTMLElement;
      if (hovered) hovered.classList.remove(HL_CLASS);
      hovered = t;
      t.classList.add(HL_CLASS);
    },
    true
  );

  document.addEventListener(
    "click",
    (e) => {
      if (!inspector.isEnabled) return;
      // Intercept the selection click so the site doesn't navigate.
      e.preventDefault();
      e.stopPropagation();
      const el = e.target as Element;
      if (hovered) hovered.classList.remove(HL_CLASS);
      void inspector.selectElement(el).catch((err) => {
        // Retryable capture error: leave selection active, log for the client.
        console.warn("Inspector capture failed, please retry:", err?.message ?? err);
      });
      // computeSelector is exported for parity/testing; selection uses it internally.
      void computeSelector(el);
    },
    true
  );
}

main();
