import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { requireSessionUser } from "@/server/auth/session";
import { ClientImportService } from "@/server/services/client-import.service";

vi.mock("@/server/auth/session", () => ({
  requireSessionUser: vi.fn(),
}));

describe("POST /api/importaciones/clientes/:batchId/confirm", () => {
  it("envia onlyReady y allowReview al servicio", async () => {
    vi.mocked(requireSessionUser).mockResolvedValueOnce({ id: 1 } as never);
    const confirmSpy = vi
      .spyOn(ClientImportService.prototype, "confirmImport")
      .mockResolvedValueOnce({ batch: {}, summary: {}, errors: {} } as never);

    const request = new Request("http://localhost/api/importaciones/clientes/10/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onlyReady: true, allowReview: false }),
    });
    const response = await POST(request, { params: Promise.resolve({ batchId: "10" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(confirmSpy).toHaveBeenCalledWith(10, { onlyReady: true, allowReview: false });
    confirmSpy.mockRestore();
  });

  it("acepta skipNonReady como alias de onlyReady", async () => {
    vi.mocked(requireSessionUser).mockResolvedValueOnce({ id: 1 } as never);
    const confirmSpy = vi
      .spyOn(ClientImportService.prototype, "confirmImport")
      .mockResolvedValueOnce({ batch: {}, summary: {}, errors: {} } as never);

    const request = new Request("http://localhost/api/importaciones/clientes/11/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skipNonReady: true }),
    });

    await POST(request, { params: Promise.resolve({ batchId: "11" }) });
    expect(confirmSpy).toHaveBeenCalledWith(11, { onlyReady: true, allowReview: undefined });
    confirmSpy.mockRestore();
  });
});

