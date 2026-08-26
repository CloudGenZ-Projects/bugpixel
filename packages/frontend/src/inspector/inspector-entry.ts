/**
 * Deployable injected inspector entry point with floating toolbar.
 *
 * Modes:
 *   - Navigate (default): clicks work normally, user browses the site
 *   - Select: hover highlights elements, click captures + sends to portal
 *
 * Stays inert until INSPECTOR_INIT handshake completes with valid token.
 */
import html2canvas from "html2canvas";

import {
  Inspector,
  computeSelector,
  type CaptureFn,
  type ScreenshotResult,
} from "./inspector.js";

function resolvePortalOrigin(): string {
  const el = document.currentScript as HTMLScriptElement | null;
  const attr = el?.getAttribute("data-portal-origin");
  if (attr) return attr;
  try {
    if (el?.src) return new URL(el.src).origin;
  } catch { /* ignore */ }
  return window.location.origin;
}

function resolveWebsiteId(): string {
  const el = document.currentScript as HTMLScriptElement | null;
  return el?.getAttribute("data-website-id") ?? "";
}

/** Parse user agent into readable browser + OS names */
function parseBrowserInfo() {
  const ua = navigator.userAgent;
  let browser = "Unknown";
  let os = "Unknown";

  // Browser detection
  if (ua.includes("Firefox/")) browser = "Firefox " + ua.split("Firefox/")[1]?.split(" ")[0];
  else if (ua.includes("Edg/")) browser = "Edge " + ua.split("Edg/")[1]?.split(" ")[0];
  else if (ua.includes("Chrome/")) browser = "Chrome " + ua.split("Chrome/")[1]?.split(" ")[0];
  else if (ua.includes("Safari/") && !ua.includes("Chrome")) browser = "Safari " + (ua.split("Version/")[1]?.split(" ")[0] ?? "");

  // OS detection
  if (ua.includes("Windows NT 10")) os = "Windows 10/11";
  else if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS X")) os = "macOS " + ua.split("Mac OS X ")[1]?.split(")")[0]?.replace(/_/g, ".");
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iOS") || ua.includes("iPhone")) os = "iOS";

  return { browser, os };
}

/** Capture screenshot with highlight overlay */
const captureWithHighlight: CaptureFn = async (el: Element): Promise<ScreenshotResult> => {
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

/** Validate token against portal API */
async function validateToken(portalOrigin: string, token: string, websiteId: string): Promise<boolean> {
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

  if (!portalOrigin || !websiteId || websiteId === "REPLACE_WITH_WEBSITE_ID") {
    console.info("[BugPixel] inspector not loaded: set portalOrigin and websiteId in config.js");
    return;
  }

  // Capture console errors for debugging context
  const consoleErrors: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(" ").slice(0, 500));
    if (consoleErrors.length > 10) consoleErrors.shift();
    originalError.apply(console, args);
  };
  window.addEventListener("error", (e) => {
    consoleErrors.push(`${e.message} at ${e.filename}:${e.lineno}`);
    if (consoleErrors.length > 10) consoleErrors.shift();
  });

  const inspector = new Inspector({
    portalOrigin,
    websiteId,
    captureScreenshot: captureWithHighlight,
    validateToken: (token, wid) => validateToken(portalOrigin, token, wid),
  });
  inspector.start();

  // --- Floating toolbar + mode management ---
  let mode: "navigate" | "select" = "navigate";
  let hovered: HTMLElement | null = null;
  const HL_CLASS = "__crp_inspector_hover__";

  // Inject styles
  const style = document.createElement("style");
  style.textContent = `
    .${HL_CLASS} { outline: 2px dashed #6366f1 !important; cursor: crosshair !important; }
    #__bugpixel_toolbar__ {
      position: fixed; bottom: 20px; right: 20px; z-index: 2147483646;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      background: #1e1b4b; color: white; border-radius: 12px;
      padding: 8px 12px; display: flex; align-items: center; gap: 8px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.3); font-size: 13px;
      user-select: none; transition: opacity 0.2s;
    }
    #__bugpixel_toolbar__ button {
      border: none; border-radius: 8px; padding: 6px 14px; font-size: 12px;
      font-weight: 600; cursor: pointer; transition: all 0.15s;
    }
    #__bugpixel_toolbar__ .bp-nav {
      background: ${mode === "navigate" ? "#6366f1" : "#374151"}; color: white;
    }
    #__bugpixel_toolbar__ .bp-sel {
      background: ${mode === "select" ? "#ef4444" : "#374151"}; color: white;
    }
    #__bugpixel_toolbar__ .bp-active { transform: scale(1.05); }
  `;
  document.head.appendChild(style);

  // Create toolbar (hidden until inspector is enabled)
  const toolbar = document.createElement("div");
  toolbar.id = "__bugpixel_toolbar__";
  toolbar.style.display = "none";
  toolbar.innerHTML = `
    <span style="font-weight:700;font-size:11px;opacity:0.7;">🐛 BugPixel</span>
    <button class="bp-nav bp-active" id="__bp_nav_btn__">🔗 Navigate</button>
    <button class="bp-sel" id="__bp_sel_btn__">🎯 Select</button>
  `;
  document.body.appendChild(toolbar);

  const navBtn = document.getElementById("__bp_nav_btn__")!;
  const selBtn = document.getElementById("__bp_sel_btn__")!;

  function setMode(m: "navigate" | "select") {
    mode = m;
    navBtn.style.background = m === "navigate" ? "#6366f1" : "#374151";
    selBtn.style.background = m === "select" ? "#ef4444" : "#374151";
    if (m === "navigate" && hovered) {
      hovered.classList.remove(HL_CLASS);
      hovered = null;
    }
  }

  navBtn.addEventListener("click", (e) => { e.stopPropagation(); setMode("navigate"); });
  selBtn.addEventListener("click", (e) => { e.stopPropagation(); setMode("select"); });

  // Show toolbar when inspector becomes enabled (poll)
  const showPoll = setInterval(() => {
    if (inspector.isEnabled) {
      toolbar.style.display = "flex";
      clearInterval(showPoll);
    }
  }, 200);

  // Hover highlight (only in select mode)
  document.addEventListener("mouseover", (e) => {
    if (!inspector.isEnabled || mode !== "select") return;
    const t = e.target as HTMLElement;
    if (toolbar.contains(t)) return;
    if (hovered) hovered.classList.remove(HL_CLASS);
    hovered = t;
    t.classList.add(HL_CLASS);
  }, true);

  // Click handler (only intercepts in select mode)
  document.addEventListener("click", (e) => {
    if (!inspector.isEnabled || mode !== "select") return;
    const t = e.target as HTMLElement;
    if (toolbar.contains(t)) return;

    e.preventDefault();
    e.stopPropagation();

    if (hovered) hovered.classList.remove(HL_CLASS);

    // Gather full browser metadata
    const { browser, os } = parseBrowserInfo();
    const metadata = {
      browser,
      os,
      userAgent: navigator.userAgent,
      screenWidth: screen.width,
      screenHeight: screen.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      url: window.location.href,
      path: window.location.pathname,
      referrer: document.referrer,
      language: navigator.language,
      cookiesEnabled: navigator.cookieEnabled,
      timestamp: new Date().toISOString(),
    };

    void inspector.selectElement(t).then((capture) => {
      // Augment the capture with full metadata before posting
      const enriched = {
        ...capture,
        browserInfo: metadata,
        consoleErrors: [...consoleErrors],
      };
      // Re-post enriched version (the Inspector class already posts basic, we override)
      window.opener?.postMessage(
        { type: "INSPECTOR_CAPTURE", payload: enriched },
        portalOrigin
      );
      // Switch back to navigate mode after capture
      setMode("navigate");
    }).catch((err) => {
      console.warn("[BugPixel] Capture failed, please retry:", err?.message ?? err);
    });

    void computeSelector(t);
  }, true);
}

main();
