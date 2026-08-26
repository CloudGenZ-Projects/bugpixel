/**
 * New change-request flow: pick website → capture → annotate → compose items.
 */
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { ChangeRequest, Website } from "@crp/shared";
import { endpoints } from "../api/endpoints.js";
import { WebsitePicker } from "./WebsitePicker.js";
import { ChangeComposer } from "./ChangeComposer.js";
import { AnnotationCanvas } from "./AnnotationCanvas.js";
import {
  WebsiteOpenController,
  type CapturedSelection,
} from "../inspector/WebsiteOpenController.js";

export function NewChangeRequest() {
  const [website, setWebsite] = useState<Website | null>(null);
  const [draft, setDraft] = useState<ChangeRequest | null>(null);
  const [rawCapture, setRawCapture] = useState<CapturedSelection | null>(null);
  const [annotatedCapture, setAnnotatedCapture] = useState<CapturedSelection | null>(null);
  const [showAnnotator, setShowAnnotator] = useState(false);
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
        onCapture: (sel) => {
          setRawCapture(sel);
          setShowAnnotator(true);
        },
      });
      controllerRef.current = controller;
      await controller.open();
    } catch {
      setError("Could not start a change request for this website.");
    }
  }, []);

  function onAnnotationConfirm(annotatedDataUrl: string) {
    if (!rawCapture) return;
    // Replace the screenshot dataUrl with the annotated version
    setAnnotatedCapture({
      ...rawCapture,
      screenshot: { ...rawCapture.screenshot, dataUrl: annotatedDataUrl },
    });
    setShowAnnotator(false);
  }

  function onAnnotationSkip() {
    // Use the raw capture as-is
    setAnnotatedCapture(rawCapture);
    setShowAnnotator(false);
  }

  // Show annotation canvas as overlay
  if (showAnnotator && rawCapture) {
    return (
      <AnnotationCanvas
        imageDataUrl={rawCapture.screenshot.dataUrl}
        width={rawCapture.screenshot.width}
        height={rawCapture.screenshot.height}
        onConfirm={onAnnotationConfirm}
        onCancel={onAnnotationSkip}
      />
    );
  }

  if (!website || !draft) {
    return (
      <div>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}
        <WebsitePicker onSelect={onSelect} />
      </div>
    );
  }

  return (
    <ChangeComposer
      website={website}
      draft={draft}
      latestCapture={annotatedCapture}
      onConsumedCapture={() => {
        setAnnotatedCapture(null);
        setRawCapture(null);
      }}
      onDone={() => {
        controllerRef.current?.dispose();
        navigate("/", { replace: true });
      }}
    />
  );
}
