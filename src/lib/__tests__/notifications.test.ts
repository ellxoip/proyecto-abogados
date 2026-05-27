import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueEmail, enqueueWhatsApp } from "@/lib/notifications";
import { processEmailJob, processWhatsAppJob } from "@/lib/processing/dispatch";

vi.mock("@/lib/processing/dispatch", () => ({
  processWhatsAppJob: vi.fn(),
  processEmailJob: vi.fn(),
}));

describe("notifications inline best-effort", () => {
  const originalProcessingMode = process.env.PROCESSING_MODE;
  const originalVercel = process.env.VERCEL;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.PROCESSING_MODE = "inline";
    delete process.env.VERCEL;
    vi.mocked(processWhatsAppJob).mockReset();
    vi.mocked(processEmailJob).mockReset();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalProcessingMode === undefined) {
      delete process.env.PROCESSING_MODE;
    } else {
      process.env.PROCESSING_MODE = originalProcessingMode;
    }
    if (originalVercel === undefined) {
      delete process.env.VERCEL;
    } else {
      process.env.VERCEL = originalVercel;
    }
    vi.restoreAllMocks();
  });

  it("no propaga errores de WhatsApp inline", async () => {
    vi.mocked(processWhatsAppJob).mockRejectedValueOnce(new Error("meta down"));

    await expect(
      enqueueWhatsApp({ kind: "overdue_notice", caseId: "case-1" }),
    ).resolves.toBeUndefined();

    expect(processWhatsAppJob).toHaveBeenCalledWith({ kind: "overdue_notice", caseId: "case-1" });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[whatsapp:inline:failed]",
      { kind: "overdue_notice", caseId: "case-1" },
      "meta down",
    );
  });

  it("no propaga errores de Email inline", async () => {
    vi.mocked(processEmailJob).mockRejectedValueOnce(new Error("resend down"));

    await expect(
      enqueueEmail({ kind: "non_payment_warning", caseId: "case-2" }),
    ).resolves.toBeUndefined();

    expect(processEmailJob).toHaveBeenCalledWith({ kind: "non_payment_warning", caseId: "case-2" });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[email:inline:failed]",
      { kind: "non_payment_warning", caseId: "case-2" },
      "resend down",
    );
  });
});
