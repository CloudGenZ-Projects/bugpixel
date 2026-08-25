/**
 * Injected inspector unit tests (task 16.3): capture-failure surfaces a
 * retryable error while retaining the selection (Req 7.4), plus the
 * enable-on-valid-token / disable gating (Req 6.2, 6.6, 15.2).
 */
import { describe, it, expect, vi } from "vitest";

import { Inspector, type ScreenshotResult } from "../src/inspector/inspector.js";

const PORTAL_ORIGIN = "https://portal.example.com";
const WEBSITE_ID = "w1";

function makeInspector(opts: {
  capture: () => Promise<ScreenshotResult>;
  validate?: () => Promise<boolean>;
}) {
  const openerPost = vi.fn();
  const listeners: Array<(e: MessageEvent) => void> = [];
  const win = {
    addEventListener: vi.fn((_t: string, h: (e: MessageEvent) => void) => listeners.push(h)),
    removeEventListener: vi.fn(),
    opener: { postMessage: openerPost },
  } as unknown as Window & typeof globalThis;

  const inspector = new Inspector({
    portalOrigin: PORTAL_ORIGIN,
    websiteId: WEBSITE_ID,
    captureScreenshot: opts.capture,
    validateToken: opts.validate ?? (() => Promise.resolve(true)),
    win,
    opener: { postMessage: openerPost } as unknown as Window,
  });
  inspector.start();
  return { inspector, openerPost, deliver: (e: MessageEvent) => listeners[0](e) };
}

async function enable(inspector: Inspector, deliver: (e: MessageEvent) => void) {
  deliver({ origin: PORTAL_ORIGIN, data: { type: "INSPECTOR_INIT", token: "tok" } } as MessageEvent);
  // Allow the async validate() to resolve.
  await Promise.resolve();
  await Promise.resolve();
  expect(inspector.isEnabled).toBe(true);
}

describe("Inspector capture-failure retry (Req 7.4)", () => {
  it("surfaces a retryable error and keeps the selection on capture failure", async () => {
    const capture = vi
      .fn()
      .mockRejectedValueOnce(new Error("rasterize boom"))
      .mockResolvedValueOnce({ dataUrl: "data:image/png;base64,AAA", mime: "image/png", width: 10, height: 10 });

    const { inspector, deliver, openerPost } = makeInspector({ capture });
    await enable(inspector, deliver);

    const el = document.createElement("div");
    el.id = "target";

    // First attempt fails -> retryable error, selection retained.
    await expect(inspector.selectElement(el)).rejects.toMatchObject({ retryable: true });
    expect(inspector.selectedElement).toBe(el);

    // Retry succeeds -> posts INSPECTOR_CAPTURE with the selection payload.
    const capturedResult = await inspector.selectElement(el);
    expect(capturedResult.selector).toBe("#target");
    expect(capturedResult.screenshot.mime).toBe("image/png");
    expect(openerPost).toHaveBeenCalledWith(
      expect.objectContaining({ type: "INSPECTOR_CAPTURE" }),
      PORTAL_ORIGIN
    );
  });
});

describe("Inspector gating (Req 6.2, 6.6, 15.2)", () => {
  it("stays inert until an origin-verified INSPECTOR_INIT validates", async () => {
    const { inspector, deliver } = makeInspector({
      capture: () => Promise.resolve({ dataUrl: "d", mime: "image/png", width: 1, height: 1 }),
      validate: () => Promise.resolve(true),
    });
    expect(inspector.isEnabled).toBe(false);

    // A foreign-origin INSPECTOR_INIT is ignored.
    deliver({ origin: "https://evil.example.com", data: { type: "INSPECTOR_INIT", token: "x" } } as MessageEvent);
    await Promise.resolve();
    expect(inspector.isEnabled).toBe(false);

    // A same-portal-origin INSPECTOR_INIT with a valid token enables it.
    await enable(inspector, deliver);
  });

  it("does not enable when token validation fails", async () => {
    const { inspector, deliver } = makeInspector({
      capture: () => Promise.resolve({ dataUrl: "d", mime: "image/png", width: 1, height: 1 }),
      validate: () => Promise.resolve(false),
    });
    deliver({ origin: PORTAL_ORIGIN, data: { type: "INSPECTOR_INIT", token: "bad" } } as MessageEvent);
    await Promise.resolve();
    await Promise.resolve();
    expect(inspector.isEnabled).toBe(false);

    // selectElement is refused while disabled.
    await expect(inspector.selectElement(document.createElement("div"))).rejects.toThrow();
  });

  it("deactivates on INSPECTOR_DISABLE", async () => {
    const { inspector, deliver } = makeInspector({
      capture: () => Promise.resolve({ dataUrl: "d", mime: "image/png", width: 1, height: 1 }),
    });
    await enable(inspector, deliver);

    deliver({ origin: PORTAL_ORIGIN, data: { type: "INSPECTOR_DISABLE" } } as MessageEvent);
    await Promise.resolve();
    expect(inspector.isEnabled).toBe(false);
  });
});
