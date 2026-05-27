import { describe, expect, it } from "vitest";
import {
  buildConfirmPayload,
  buildProblemRows,
  canConfirmImport,
  type PreviewResponse,
} from "./page-helpers";

function buildPreviewFixture(): PreviewResponse {
  return {
    ok: true,
    batchId: 1,
    summary: {
      totalClients: 2,
      readyClients: 1,
      reviewClients: 1,
      errorClients: 0,
      totalContracts: 1,
      readyContracts: 0,
      reviewContracts: 0,
      errorContracts: 1,
      totalInstallments: 1,
      readyInstallments: 0,
      skippedInstallments: 0,
      reviewInstallments: 1,
      errorInstallments: 0,
      blockedRecords: 1,
      warningsImportablesTotal: 1,
    },
    preview: {
      clients: [
        {
          rowNumber: 2,
          status: "REVIEW",
          rut: "9140815-5",
          issues: [
            {
              code: "EXISTING_CLIENT",
              message: "Cliente ya existe.",
              severity: "warning",
            },
          ],
          rawData: { rut: "9140815-5" },
          normalizedData: { rut: "9140815-5" },
        },
        {
          rowNumber: 3,
          status: "READY",
          rut: "12709188-9",
          issues: [],
          rawData: { rut: "12709188-9" },
          normalizedData: { rut: "12709188-9" },
        },
      ],
      contracts: [
        {
          rowNumber: 10,
          status: "ERROR",
          clienteRut: "9140815-5",
          issues: [
            {
              code: "CONTRACT_INSTALLMENTS_AMOUNT_MISMATCH",
              message: "Suma de cuotas no coincide.",
              severity: "error",
            },
          ],
          rawData: { monto_total: 1000000 },
          normalizedData: { montoTotal: 1000000 },
        },
      ],
      installments: [
        {
          rowNumber: 50,
          status: "REVIEW",
          contratoRef: "CT-1",
          issues: [
            {
              code: "INSTALLMENT_STATUS_DEFAULTED",
              message: "Estado normalizado.",
              severity: "warning",
            },
          ],
          rawData: { estado_cuota: "desconocido" },
          normalizedData: { estadoCuota: "PENDIENTE" },
        },
      ],
    },
  };
}

describe("clientes import page helpers", () => {
  it("la vista de problemas incluye clientes REVIEW y contratos ERROR", () => {
    const rows = buildProblemRows(buildPreviewFixture());
    expect(rows.some((row) => row.entity === "CLIENTE" && row.status === "REVIEW")).toBe(true);
    expect(rows.some((row) => row.entity === "CONTRATO" && row.status === "ERROR")).toBe(true);
  });

  it("expone codigo y mensaje de issue en la vista de problemas", () => {
    const rows = buildProblemRows(buildPreviewFixture());
    expect(rows.some((row) => row.code === "EXISTING_CLIENT")).toBe(true);
    expect(rows.some((row) => row.message.includes("Suma de cuotas no coincide"))).toBe(true);
  });

  it("el payload de confirmacion envía onlyReady y allowReview coherentes", () => {
    expect(buildConfirmPayload(true)).toEqual({ onlyReady: true, allowReview: false });
    expect(buildConfirmPayload(false)).toEqual({ onlyReady: false, allowReview: true });
  });

  it("deshabilita confirmacion cuando no hay items importables", () => {
    const preview = buildPreviewFixture();
    const noImportables: PreviewResponse = {
      ...preview,
      preview: {
        clients: [{ ...preview.preview.clients[0], status: "ERROR" }],
        contracts: [{ ...preview.preview.contracts[0], status: "ERROR" }],
        installments: [{ ...preview.preview.installments[0], status: "SKIPPED" }],
      },
    };

    expect(canConfirmImport(noImportables, true)).toBe(false);
    expect(canConfirmImport(noImportables, false)).toBe(false);
    expect(canConfirmImport(preview, true)).toBe(true);
  });
});

