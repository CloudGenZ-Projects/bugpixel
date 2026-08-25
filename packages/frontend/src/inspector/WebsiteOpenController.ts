/**
 * WebsiteOpenController: opens a selected website in a resizable popup and
 * performs the origin-checked postMessage handshake that activates the injected
 * inspector.
 *
 * Flow (design "Inspector Injection, Token, and postMessage Handshake"):
 *   1. Mint a short-lived inspector token for the owned website.
 *   2. window.open(url, name, resizable features); retain the handle (Req 5.1,
 *      5.2).
 *   3. On INSPECTOR_READY from the popup (origin-checked), post INSPECTOR_INIT
 *      with the token (Req 6.1).
 *   4. Relay captured selections/screenshots to the caller (Req 7.3).
 *   5. On logout/idle-expiry or close, post INSPECTOR_DISABLE and stop (Req 6.6).
 *
 * All incoming messages are verified against the opened website's origin.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.6, 7.3, 10.3
 */
import { endpoints } from "../api/endpoints.js";

/** Popup features requesting a resizable window (Req 5.2). */
export const POPUP_FEATURES = "resizable=yes,scrollbars=yes,width=1024,height=768";

export interface CapturedSelection {
  selector: string | null;
  htmlMeta: string | null;
  screenshot: { dataUrl: string; mime: string; width: number; height: number };
}

export interface WebsiteOpenControllerOptions {
  websiteId: string;
  websiteUrl: string;
  /** Called when the inspector captures a component selection + screenshot. */
  onCapture?: (selection: CapturedSelection) => void;
  /** Called when the popup is closed by the user. */
  onClose?: () => void;
  /** Injected for tests; defaults to the global window. */
  win?: Window;
}

export class WebsiteOpenController {
  private popup: Window | null = null;
  private readonly expectedOrigin: string;
  private token: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private messageHandler: ((e: MessageEvent) => void) | null = null;
  private readonly win: Window;

  constructor(private readonly opts: WebsiteOpenControllerOptions) {
    this.win = opts.win ?? window;
    this.expectedOrigin = new URL(opts.websiteUrl).origin;
  }

  /** Mint the inspector token and open the website popup. */
  async open(): Promise<void> {
    const { token } = await endpoints.mintInspectorToken(this.opts.websiteId);
    this.token = token;

    this.popup = this.win.open(
      this.opts.websiteUrl,
      `crp-inspector-${this.opts.websiteId}`,
      POPUP_FEATURES
    );

    this.messageHandler = (event: MessageEvent) => this.onMessage(event);
    this.win.addEventListener("message", this.messageHandler);

    // Poll for popup close so we can clean up (Req 5.3 navigation is allowed;
    // we only react to closure, never block navigation).
    this.pollTimer = setInterval(() => {
      if (this.popup && this.popup.closed) {
        this.opts.onClose?.();
        this.dispose();
      }
    }, 500);
  }

  private onMessage(event: MessageEvent): void {
    // Only trust messages from the opened website's origin.
    if (event.origin !== this.expectedOrigin) return;
    const data = event.data as { type?: string; payload?: unknown } | null;
    if (!data || typeof data.type !== "string") return;

    switch (data.type) {
      case "INSPECTOR_READY":
        // The injected script is loaded and inert; hand it the token.
        this.postToPopup({ type: "INSPECTOR_INIT", token: this.token });
        break;
      case "INSPECTOR_CAPTURE":
        this.opts.onCapture?.(data.payload as CapturedSelection);
        break;
    }
  }

  private postToPopup(message: unknown): void {
    this.popup?.postMessage(message, this.expectedOrigin);
  }

  /** Deactivate the inspector (e.g. on logout / idle expiry) (Req 6.6). */
  disableInspector(): void {
    this.postToPopup({ type: "INSPECTOR_DISABLE" });
  }

  /** Tear down listeners/timers and close the popup. */
  dispose(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    if (this.messageHandler) this.win.removeEventListener("message", this.messageHandler);
    this.messageHandler = null;
    this.token = null;
  }

  get popupHandle(): Window | null {
    return this.popup;
  }
}
