/**
 * Change composer placeholder (fully implemented in task 15).
 */
import type { ChangeRequest, Website } from "@crp/shared";
import type { CapturedSelection } from "../inspector/WebsiteOpenController.js";

export interface ChangeComposerProps {
  website: Website;
  draft: ChangeRequest;
  latestCapture: CapturedSelection | null;
  onConsumedCapture: () => void;
  onDone: () => void;
}

export function ChangeComposer({ website, draft }: ChangeComposerProps) {
  return (
    <section aria-label="change composer">
      <h2>Compose changes for {website.name}</h2>
      <p>Draft {draft.id}</p>
    </section>
  );
}
