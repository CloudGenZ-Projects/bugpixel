/**
 * Smoke tests (task 14.3): the website popup is opened with resizable features
 * and in-site navigation is allowed (SMOKE criteria 5.2, 5.3).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  WebsiteOpenController,
  POPUP_FEATURES,
} from "../src/inspector/WebsiteOpenController.js";
import { endpoints } from "../src/api/endpoints.js";

vi.mock("../src/api/endpoints.js", () => ({
  endpoints: { mintInspectorToken: vi.fn() },
}));

describe("WebsiteOpenController popup (Req 5.2, 5.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (endpoints.mintInspectorToken as ReturnType<typeof vi.fn>).mockResolvedValue({
      token: "tok",
      expiresIn: 300,
    });
  });

  it("opens the website with resizable popup features", async () => {
    const fakePopup = { closed: false, postMessage: vi.fn() } as unknown as Window;
    const open = vi.fn().mockReturnValue(fakePopup);
    const fakeWin = {
      open,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window;

    const controller = new WebsiteOpenController({
      websiteId: "w1",
      websiteUrl: "https://site.example.com/page",
      win: fakeWin,
    });
    await controller.open();

    expect(endpoints.mintInspectorToken).toHaveBeenCalledWith("w1");
    expect(open).toHaveBeenCalledTimes(1);
    const [url, name, features] = open.mock.calls[0];
    expect(url).toBe("https://site.example.com/page");
    expect(name).toContain("crp-inspector-w1");
    // Resizable features are requested (Req 5.2).
    expect(features).toBe(POPUP_FEATURES);
    expect(features).toMatch(/resizable=yes/);

    controller.dispose();
  });

  it("does not block navigation: no navigation guards are installed on the popup", async () => {
    // The controller only listens for postMessage + polls popup.closed; it never
    // overrides location or intercepts navigation, so in-site navigation is
    // allowed (Req 5.3). We assert it registers exactly one message listener and
    // touches only the message channel.
    const fakePopup = { closed: false, postMessage: vi.fn() } as unknown as Window;
    const addEventListener = vi.fn();
    const fakeWin = {
      open: vi.fn().mockReturnValue(fakePopup),
      addEventListener,
      removeEventListener: vi.fn(),
    } as unknown as Window;

    const controller = new WebsiteOpenController({
      websiteId: "w2",
      websiteUrl: "https://site.example.com",
      win: fakeWin,
    });
    await controller.open();

    // Only a 'message' listener is added; nothing that could block navigation.
    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(addEventListener.mock.calls[0][0]).toBe("message");

    controller.dispose();
  });

  it("origin-checks inbound messages and replies INSPECTOR_INIT with the token", async () => {
    const postMessage = vi.fn();
    const fakePopup = { closed: false, postMessage } as unknown as Window;
    let handler: ((e: MessageEvent) => void) | null = null;
    const fakeWin = {
      open: vi.fn().mockReturnValue(fakePopup),
      addEventListener: vi.fn((_type: string, h: (e: MessageEvent) => void) => {
        handler = h;
      }),
      removeEventListener: vi.fn(),
    } as unknown as Window;

    const controller = new WebsiteOpenController({
      websiteId: "w3",
      websiteUrl: "https://site.example.com",
      win: fakeWin,
    });
    await controller.open();

    // A message from a foreign origin is ignored.
    handler!({ origin: "https://evil.example.com", data: { type: "INSPECTOR_READY" } } as MessageEvent);
    expect(postMessage).not.toHaveBeenCalled();

    // A message from the correct origin triggers INSPECTOR_INIT with the token.
    handler!({ origin: "https://site.example.com", data: { type: "INSPECTOR_READY" } } as MessageEvent);
    expect(postMessage).toHaveBeenCalledWith(
      { type: "INSPECTOR_INIT", token: "tok" },
      "https://site.example.com"
    );

    controller.dispose();
  });
});
