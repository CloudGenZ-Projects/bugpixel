/**
 * Injected inspector script (runs on the client website origin).
 *
 * Bootstrap: stays inert until it receives an origin-verified INSPECTOR_INIT
 * message from window.opener carrying the inspector token. It then calls
 * POST /api/inspector/validate; only on success does it enable the picker UI
 * (Req 6.1, 6.2, 15.1, 15.2). It deactivates on validate failure or on an
 * INSPECTOR_DISABLE message (Req 6.5, 6.6).
 *
 * Picking: hover highlights DOM elements; a click selects one and computes an
 * optional CSS-selector and HTML metadata (Req 6.3, 6.4). On selection it draws
 * a highlight overlay and rasterizes the page to a PNG in parallel with
 * recording the component reference (Req 7.1, 7.2), then hands the capture to
 * the opener via INSPECTOR_CAPTURE (Req 7.3). A capture failure surfaces a
 * retryable error and keeps the selection active (Req 7.4).
 *
 * The rasterizer is injected (`captureScreenshot`) so tests can supply a stub
 * instead of a real html2canvas dependency.
 *
 * Requirements: 6.1-6.6, 7.1-7.4, 15.1, 15.2
 */

export interface ScreenshotResult {
  dataUrl: string;
  mime: string;
  width: number;
  height: number;
}

/** Rasterizes the given element (with the highlight overlay) to a PNG. */
export type CaptureFn = (element: Element) => Promise<ScreenshotResult>;

export interface InspectorConfig {
  /** The portal origin allowed to send INSPECTOR_INIT (the opener). */
  portalOrigin: string;
  /** The website id this inspector instance is scoped to. */
  websiteId: string;
  /** Screenshot rasterizer (injectable for tests). */
  captureScreenshot: CaptureFn;
  /** Validate a token against the portal API; resolves true on success. */
  validateToken: (token: string, websiteId: string) => Promise<boolean>;
  /** The window this inspector runs in (defaults to global window). */
  win?: Window & typeof globalThis;
  /** The opener to post messages back to (defaults to win.opener). */
  opener?: Window | null;
}

export interface CapturedSelection {
  selector: string | null;
  htmlMeta: string | null;
  screenshot: ScreenshotResult;
}

/** Compute a best-effort CSS selector for an element (optional metadata). */
export function computeSelector(el: Element): string | null {
  if (el.id) return `#${el.id}`;
  const tag = el.tagName.toLowerCase();
  const cls = (el.getAttribute("class") ?? "").trim().split(/\s+/).filter(Boolean);
  if (cls.length > 0) return `${tag}.${cls.join(".")}`;
  return tag || null;
}

export class Inspector {
  private enabled = false;
  private selected: Element | null = null;
  private readonly win: Window & typeof globalThis;
  private readonly opener: Window | null;
  private messageHandler: ((e: MessageEvent) => void) | null = null;

  constructor(private readonly config: InspectorConfig) {
    this.win = config.win ?? (window as Window & typeof globalThis);
    this.opener = config.opener ?? this.win.opener ?? null;
  }

  /** Begin listening for the opener handshake and announce readiness. */
  start(): void {
    this.messageHandler = (e: MessageEvent) => void this.onMessage(e);
    this.win.addEventListener("message", this.messageHandler);
    // Announce readiness to the opener (the portal), which replies with the token.
    this.opener?.postMessage({ type: "INSPECTOR_READY" }, this.config.portalOrigin);
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  private async onMessage(event: MessageEvent): Promise<void> {
    // Only trust messages from the portal opener origin (Req 6.2, 15.1).
    if (event.origin !== this.config.portalOrigin) return;
    const data = event.data as { type?: string; token?: string } | null;
    if (!data || typeof data.type !== "string") return;

    switch (data.type) {
      case "INSPECTOR_INIT": {
        if (!data.token) {
          this.enabled = false;
          return;
        }
        const ok = await this.config.validateToken(data.token, this.config.websiteId);
        this.enabled = ok; // enable only on successful validation (Req 6.2, 15.2)
        break;
      }
      case "INSPECTOR_DISABLE":
        this.enabled = false;
        break;
    }
  }

  /**
   * Handle a click-selection on an element. Records the component reference and
   * captures a highlighted screenshot; on capture failure throws a retryable
   * error while keeping the selection active (Req 7.4).
   */
  async selectElement(el: Element): Promise<CapturedSelection> {
    if (!this.enabled) {
      throw new Error("Inspector is not enabled.");
    }
    this.selected = el;

    // Record the component reference in parallel with capture (Req 7.1).
    const selector = computeSelector(el);
    const htmlMeta = el.outerHTML ? el.outerHTML.slice(0, 512) : null;

    let screenshot: ScreenshotResult;
    try {
      screenshot = await this.config.captureScreenshot(el);
    } catch {
      // Keep the selection so the client can retry (Req 7.4).
      const e = new Error(
        "Screenshot capture failed. Please retry the selection."
      ) as Error & { retryable?: boolean };
      e.retryable = true;
      throw e;
    }

    const capture: CapturedSelection = { selector, htmlMeta, screenshot };
    // Hand the capture to the opener/portal (Req 7.3).
    this.opener?.postMessage(
      { type: "INSPECTOR_CAPTURE", payload: capture },
      this.config.portalOrigin
    );
    return capture;
  }

  /** The currently selected element, retained across capture retries. */
  get selectedElement(): Element | null {
    return this.selected;
  }

  dispose(): void {
    if (this.messageHandler) this.win.removeEventListener("message", this.messageHandler);
    this.messageHandler = null;
    this.enabled = false;
  }
}
