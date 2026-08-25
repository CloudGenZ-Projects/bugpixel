/**
 * Change request detail: shows the request's change items with their component
 * references, screenshots, and attachments (Req 3.3, 12.3).
 */
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

import { endpoints, type ChangeRequestDetail as Detail } from "../api/endpoints.js";

export function ChangeRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    endpoints
      .changeRequestDetail(id)
      .then(setDetail)
      .catch(() => setError("Unable to load this change request."));
  }, [id]);

  if (error) return <p role="alert">{error}</p>;
  if (!detail) return <div>Loading…</div>;

  return (
    <section aria-label="change request detail">
      <Link to="/">← Back</Link>
      <h2>Change Request {detail.request.id}</h2>
      <p>Status: {detail.request.status}</p>

      <ol>
        {detail.items.map(({ item, componentReference, screenshot, attachments }) => (
          <li key={item.id}>
            <h3>
              {item.changeType}: {item.description}
            </h3>
            {componentReference?.selector && (
              <p>Component: {componentReference.selector}</p>
            )}
            {screenshot && (
              <p data-testid="screenshot">
                Screenshot {screenshot.width}×{screenshot.height} ({screenshot.mime})
              </p>
            )}
            {attachments.length > 0 && (
              <ul>
                {attachments.map((a) => (
                  <li key={a.id}>
                    {a.filename} ({a.mime}, {a.sizeBytes} bytes)
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
