/**
 * New change-request flow: pick a website (Req 4.1/4.4), create a draft bound to
 * that single website (Req 5.4/10.3), open it in a resizable popup with the
 * gated inspector (Req 5.1/5.2/6.1), then compose change items (task 15).
 */
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { ChangeRequest, Website } from "@crp/shared";
import { endpoints } from "../api/endpoints.js";
import { WebsitePicker } from "./WebsitePicker.js";
import { ChangeComposer } from "./ChangeComposer.js";
import {
  WebsiteOpenController,
  type CapturedSelection,
} from "../inspector/WebsiteOpenController.js";

export function NewChangeRequest() {
  const [website, setWebsite] = useState<Website | null>(null);
  const [draft, setDraft] = useState<ChangeRequest | null>(null);
  const [capture, setCapture] = useState<CapturedSelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<WebsiteOpenController | null>(null);
  const navigate = useNavigate();

  const onSelect = useCallback(async (w: Website) => {
    setError(null);
    try {
      const { changeRequest } = await endpoints.createChangeRequest(w.id);
      setWebsite(w);
      setDraft(changeRequest);

      const controller = new WebsiteOpenController({
        websiteId: w.id,
        websiteUrl: w.url,
        onCapture: (sel) => setCapture(sel),
      });
      controllerRef.current = controller;
      await controller.open();
    } catch {
      setError("Could not start a change request for this website.");
    }
  }, []);

  if (!website || !draft) {
    return (
      <div>
        {error && <p role="alert">{error}</p>}
        <WebsitePicker onSelect={onSelect} />
      </div>
    );
  }

  return (
    <ChangeComposer
      website={website}
      draft={draft}
      latestCapture={capture}
      onConsumedCapture={() => setCapture(null)}
      onDone={() => {
        controllerRef.current?.dispose();
        navigate("/", { replace: true });
      }}
    />
  );
}
