/**
 * ChangeComposer unit tests (task 15.3): validation retains entered values on
 * error, and the Submit control is disabled while there are zero items
 * (Req 8.5, 8.6, 10.4). Also verifies the Delete type hides attachments (8.8).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ChangeType } from "@crp/shared";
import { ChangeComposer } from "../src/views/ChangeComposer.js";
import { endpoints } from "../src/api/endpoints.js";
import type { CapturedSelection } from "../src/inspector/WebsiteOpenController.js";

vi.mock("../src/api/endpoints.js", () => ({
  endpoints: {
    uploadScreenshot: vi.fn(),
    addItem: vi.fn(),
    uploadAttachment: vi.fn(),
    submit: vi.fn(),
  },
}));

const website = { id: "w1", projectId: "p", ownerClientId: "c", name: "Site", url: "https://s.example.com" };
const draft = { id: "cr1", websiteId: "w1", clientId: "c", status: "Draft", createdAt: "t" } as const;
const capture: CapturedSelection = {
  selector: "#hero",
  htmlMeta: null,
  screenshot: { dataUrl: "data:image/png;base64,AAAA", mime: "image/png", width: 100, height: 80 },
};

function renderComposer(latestCapture: CapturedSelection | null = capture) {
  return render(
    <ChangeComposer
      website={website}
      draft={draft as never}
      latestCapture={latestCapture}
      onConsumedCapture={() => {}}
      onDone={() => {}}
    />
  );
}

describe("ChangeComposer (Req 8.5, 8.6, 10.4)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("disables Submit while there are zero items", () => {
    renderComposer();
    const submit = screen.getByRole("button", { name: /submit change request/i });
    expect(submit).toBeDisabled();
  });

  it("rejects an empty description and retains entered content values", async () => {
    renderComposer();
    // Enter content but leave description blank.
    await userEvent.type(screen.getByLabelText(/content to add/i), "a new banner");
    await userEvent.click(screen.getByRole("button", { name: /done \(add item\)/i }));

    // Validation error shown, item not added, and the content value retained.
    expect(await screen.findByText(/description of 1 to 2000 characters is required/i)).toBeInTheDocument();
    expect(endpoints.addItem).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/content to add/i)).toHaveValue("a new banner");
    expect(screen.getByTestId("item-count")).toHaveTextContent("0");
  });

  it("adds a valid item, enabling Submit afterwards", async () => {
    (endpoints.uploadScreenshot as ReturnType<typeof vi.fn>).mockResolvedValue({
      storageKey: "sk-1",
    });
    (endpoints.addItem as ReturnType<typeof vi.fn>).mockResolvedValue({ item: { id: "i1" } });
    renderComposer();

    await userEvent.type(screen.getByLabelText(/description/i), "please add a banner");
    await userEvent.type(screen.getByLabelText(/content to add/i), "a banner");
    await userEvent.click(screen.getByRole("button", { name: /done \(add item\)/i }));

    // Item added -> count increments and Submit is enabled.
    expect(await screen.findByText("1")).toBeInTheDocument();
    // Screenshot uploaded first, then the item created with the real key.
    expect(endpoints.uploadScreenshot).toHaveBeenCalledTimes(1);
    expect(endpoints.addItem).toHaveBeenCalledTimes(1);
    const addItemBody = (endpoints.addItem as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(addItemBody.screenshot.storageKey).toBe("sk-1");
    const submit = screen.getByRole("button", { name: /submit change request/i });
    expect(submit).toBeEnabled();
  });

  it("hides the attachment control for Delete change type (Req 8.8)", async () => {
    renderComposer();
    // Add type shows attachments.
    expect(screen.getByLabelText(/attachments/i)).toBeInTheDocument();
    // Switch to Delete -> attachment control disappears.
    await userEvent.selectOptions(screen.getByLabelText(/change type/i), ChangeType.Delete);
    expect(screen.queryByLabelText(/attachments/i)).not.toBeInTheDocument();
  });
});
