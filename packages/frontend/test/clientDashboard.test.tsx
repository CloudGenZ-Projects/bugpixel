/**
 * Client dashboard unit tests (task 13.3): empty-state indication and the New
 * control that prompts website selection (EXAMPLE criteria 3.4, 3.5).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import { ClientDashboard } from "../src/views/ClientDashboard.js";
import { endpoints } from "../src/api/endpoints.js";

vi.mock("../src/api/endpoints.js", () => ({
  endpoints: {
    listChangeRequests: vi.fn(),
  },
}));

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<ClientDashboard />} />
        <Route path="/new" element={<div>website picker page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ClientDashboard empty-state and New control (Req 3.4, 3.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an empty-state and a create control when there are no requests", async () => {
    (endpoints.listChangeRequests as ReturnType<typeof vi.fn>).mockResolvedValue({
      changeRequests: [],
    });
    renderDashboard();

    expect(await screen.findByText(/have not submitted any change requests/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create your first change request/i })
    ).toBeInTheDocument();
  });

  it("New control navigates to website selection", async () => {
    (endpoints.listChangeRequests as ReturnType<typeof vi.fn>).mockResolvedValue({
      changeRequests: [],
    });
    renderDashboard();

    const btn = await screen.findByRole("button", { name: /new change request/i });
    await userEvent.click(btn);
    expect(await screen.findByText(/website picker page/i)).toBeInTheDocument();
  });

  it("lists submitted requests with their status when present", async () => {
    (endpoints.listChangeRequests as ReturnType<typeof vi.fn>).mockResolvedValue({
      changeRequests: [
        { id: "cr-1", websiteId: "w", clientId: "c", status: "Submitted", createdAt: "t" },
      ],
    });
    renderDashboard();

    expect(await screen.findByText("cr-1")).toBeInTheDocument();
    expect(screen.getByTestId("status")).toHaveTextContent("Submitted");
  });
});
