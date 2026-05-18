import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { ImportBatchStatus } from "@prisma/client";
import { ClientImportService } from "../client-import.service";

function buildWorkbookBuffer({
  rut = "9140815-5",
  includeInstallment = true,
  contractAmount = 1000000,
  contractInstallmentCount = 1,
  contractAmountHeader = "monto_total *",
  installmentAmount = 1000000,
  installmentAmountHeader = "monto *",
  installmentStatus = "Pagada",
  installmentExtraColumns = {},
  installmentRows,
}: {
  rut?: string;
  includeInstallment?: boolean;
  contractAmount?: unknown;
  contractInstallmentCount?: number;
  contractAmountHeader?: string;
  installmentAmount?: unknown;
  installmentAmountHeader?: string;
  installmentStatus?: string;
  installmentExtraColumns?: Record<string, unknown>;
  installmentRows?: Array<Record<string, unknown>>;
}) {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        "cliente_id_interno (opcional)": "CL-00001",
        "rut *": rut,
        "nombre_razon_social *": "ALDO CORDERO",
        "tipo_persona *": "Natural",
        "estado_cliente *": "Activo",
        "fecha_ingreso *": "04/06/2025",
      },
    ]),
    "CLIENTES",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        "cliente_id_interno o rut *": "CL-00001",
        "nombre_contacto *": "ALDO CORDERO",
        telefono: null,
        "es_contacto_principal *": "SI",
        "recibe_notificaciones *": "SI",
        "recibe_comprobantes *": "SI",
        whatsapp: "SI",
      },
    ]),
    "CONTACTOS",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        "cliente_id_interno o rut *": "CL-00001",
        "rut_facturacion *": rut,
        "razon_social_facturacion *": "ALDO CORDERO",
        requiere_oc: "NO",
      },
    ]),
    "FACTURACION",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        "contrato_id (opcional)": "CT-00001",
        "cliente_id_interno o rut *": "CL-00001",
        "servicio *": "Prescripción",
        "area *": "Tributario",
        [contractAmountHeader]: contractAmount,
        "cantidad_cuotas *": contractInstallmentCount,
        "fecha_inicio *": "04/06/2025",
        "estado_contrato *": "Activo",
      },
    ]),
    "CONTRATOS",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      includeInstallment
        ? installmentRows ?? [
            {
              "contrato_id o cliente_id/rut *": "CT-00001",
              "numero_cuota *": 1,
              [installmentAmountHeader]: installmentAmount,
              "fecha_vencimiento *": "06/06/2025",
              "estado_cuota *": installmentStatus,
              ...installmentExtraColumns,
            },
          ]
        : [],
    ),
    "CUOTAS_OPCIONAL",
  );

  const content = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(content);
}

function buildPreviewDbMock({
  existingClient = false,
  existingContract = false,
}: {
  existingClient?: boolean;
  existingContract?: boolean;
}) {
  const batchCreate = vi.fn().mockResolvedValue({ id: 101 });
  const createMany = vi.fn().mockResolvedValue({ count: 1 });
  return {
    cliente: {
      findMany: vi.fn().mockResolvedValue(
        existingClient ? [{ id: 9, rut: "9140815-5" }] : [],
      ),
    },
    contrato: {
      findFirst: vi.fn().mockResolvedValue(existingContract ? { id: 55 } : null),
    },
    clientImportBatch: {
      create: batchCreate,
    },
    clientImportItem: {
      createMany,
    },
    contractImportItem: {
      createMany,
    },
    installmentImportItem: {
      createMany,
    },
  };
}

describe("ClientImportService preview", () => {
  it("Preview de Excel válido", async () => {
    const db = buildPreviewDbMock({});
    const service = new ClientImportService(db as never);

    const result = await service.previewImport({
      fileName: "clientes.xlsx",
      fileBuffer: buildWorkbookBuffer({}),
      createdBy: 1,
    });

    expect(result.batchId).toBe(101);
    expect(result.summary.totalClients).toBe(1);
    expect(result.summary.errorClients).toBe(0);
    expect(result.summary.totalContracts).toBe(1);
  });

  it("Cliente sin teléfono pasa validación", async () => {
    const db = buildPreviewDbMock({});
    const service = new ClientImportService(db as never);

    const result = await service.previewImport({
      fileName: "clientes.xlsx",
      fileBuffer: buildWorkbookBuffer({}),
      createdBy: 1,
    });

    expect(result.preview.clients[0].status).not.toBe("ERROR");
    const joinedIssues = result.preview.clients[0].issues.map((issue) => issue.message).join(" ");
    expect(joinedIssues.toLowerCase()).not.toContain("telefono");
  });

  it("RUT inválido queda en error", async () => {
    const db = buildPreviewDbMock({});
    const service = new ClientImportService(db as never);

    const result = await service.previewImport({
      fileName: "clientes.xlsx",
      fileBuffer: buildWorkbookBuffer({ rut: "1234" }),
      createdBy: 1,
    });

    expect(result.preview.clients[0].status).toBe("ERROR");
    expect(
      result.preview.clients[0].issues.some((issue) => issue.code === "INVALID_RUT"),
    ).toBe(true);
  });

  it("Cliente existente no se duplica", async () => {
    const db = buildPreviewDbMock({ existingClient: true });
    const service = new ClientImportService(db as never);

    const result = await service.previewImport({
      fileName: "clientes.xlsx",
      fileBuffer: buildWorkbookBuffer({}),
      createdBy: 1,
    });

    expect(result.preview.clients[0].status).toBe("REVIEW");
    expect(
      result.preview.clients[0].issues.some((issue) => issue.code === "EXISTING_CLIENT"),
    ).toBe(true);
  });

  it("Contrato existente no se duplica", async () => {
    const db = buildPreviewDbMock({ existingClient: true, existingContract: true });
    const service = new ClientImportService(db as never);

    const result = await service.previewImport({
      fileName: "clientes.xlsx",
      fileBuffer: buildWorkbookBuffer({}),
      createdBy: 1,
    });

    expect(result.preview.contracts[0].status).toBe("REVIEW");
    expect(
      result.preview.contracts[0].issues.some((issue) => issue.code === "EXISTING_CONTRACT"),
    ).toBe(true);
  });

  it("Importación con cuotas opcionales", async () => {
    const db = buildPreviewDbMock({});
    const service = new ClientImportService(db as never);

    const result = await service.previewImport({
      fileName: "clientes.xlsx",
      fileBuffer: buildWorkbookBuffer({ includeInstallment: true }),
      createdBy: 1,
    });

    expect(result.summary.totalInstallments).toBe(1);
    expect(result.preview.installments[0].normalizedData).not.toBeNull();
  });

  it("Acepta montos con formato chileno en texto", async () => {
    const db = buildPreviewDbMock({});
    const service = new ClientImportService(db as never);

    const result = await service.previewImport({
      fileName: "clientes.xlsx",
      fileBuffer: buildWorkbookBuffer({
        contractAmount: "350.000,00",
        installmentAmount: "$350.000",
      }),
      createdBy: 1,
    });

    expect(result.preview.contracts[0].status).not.toBe("ERROR");
    expect(result.preview.installments[0].status).not.toBe("ERROR");
  });

  it("Muestra header detectado y rawValue cuando monto es invalido", async () => {
    const db = buildPreviewDbMock({});
    const service = new ClientImportService(db as never);

    const result = await service.previewImport({
      fileName: "clientes.xlsx",
      fileBuffer: buildWorkbookBuffer({
        contractAmount: "abc",
      }),
      createdBy: 1,
    });

    const issue = result.preview.contracts[0].issues.find(
      (item) => item.code === "INVALID_TOTAL_AMOUNT",
    );

    expect(issue).toBeDefined();
    expect(issue?.message).toContain("header=monto_total *");
    expect(issue?.message).toContain("rawValue=abc");
  });

  it("tipo_persona vacio con RUT 76466945-2 infiere JURIDICA con warning", async () => {
    const db = buildPreviewDbMock({});
    const service = new ClientImportService(db as never);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          "cliente_id_interno (opcional)": "CL-1",
          "rut *": "76466945-2",
          "nombre_razon_social *": "EMPRESA TEST",
          "tipo_persona *": "",
          "estado_cliente *": "Activo",
          "fecha_ingreso *": "01/01/2025",
        },
      ]),
      "CLIENTES",
    );
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([]), "CONTACTOS");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([]), "FACTURACION");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([]), "CONTRATOS");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([]), "CUOTAS_OPCIONAL");

    const result = await service.previewImport({
      fileName: "clientes.xlsx",
      fileBuffer: Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })),
      createdBy: 1,
    });

    expect(result.preview.clients[0].normalizedData?.tipoCliente).toBe("EMPRESA");
    expect(
      result.preview.clients[0].issues.some(
        (issue) => issue.code === "PERSON_TYPE_INFERRED_FROM_RUT",
      ),
    ).toBe(true);
    expect(result.preview.clients[0].status).toBe("REVIEW");
  });

  it("tipo_persona vacio con RUT 12709188-9 infiere NATURAL con warning", async () => {
    const db = buildPreviewDbMock({});
    const service = new ClientImportService(db as never);

    const result = await service.previewImport({
      fileName: "clientes.xlsx",
      fileBuffer: buildWorkbookBuffer({ rut: "12709188-9" }),
      createdBy: 1,
    });

    expect(result.preview.clients[0].normalizedData?.tipoCliente).toBe("PERSONA");
  });

  it("tipo_persona Juridica y persona natural son aceptados", async () => {
    const db = buildPreviewDbMock({});
    const service = new ClientImportService(db as never);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        {
          "cliente_id_interno (opcional)": "C1",
          "rut *": "76466945-2",
          "nombre_razon_social *": "EMPRESA A",
          "tipo_persona *": "Jurídica",
          "estado_cliente *": "Activo",
          "fecha_ingreso *": "01/01/2025",
        },
        {
          "cliente_id_interno (opcional)": "C2",
          "rut *": "12709188-9",
          "nombre_razon_social *": "PERSONA B",
          "tipo_persona *": "persona natural",
          "estado_cliente *": "Activo",
          "fecha_ingreso *": "01/01/2025",
        },
      ]),
      "CLIENTES",
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "CONTACTOS");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "FACTURACION");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "CONTRATOS");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "CUOTAS_OPCIONAL");

    const result = await service.previewImport({
      fileName: "clientes.xlsx",
      fileBuffer: Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" })),
      createdBy: 1,
    });

    expect(result.preview.clients[0].normalizedData?.tipoCliente).toBe("EMPRESA");
    expect(result.preview.clients[1].normalizedData?.tipoCliente).toBe("PERSONA");
  });

  it("cuota con estado desconocido y datos validos queda READY con warning", async () => {
    const db = buildPreviewDbMock({});
    const service = new ClientImportService(db as never);

    const result = await service.previewImport({
      fileName: "clientes.xlsx",
      fileBuffer: buildWorkbookBuffer({
        installmentAmount: "350.000",
        contractAmount: 350000,
        installmentStatus: "desconocido_x",
      }),
      createdBy: 1,
    });

    const withUnknown = result.preview.installments[0];
    expect(withUnknown.issues.some((i) => i.code === "INSTALLMENT_STATUS_DEFAULTED")).toBe(true);
    expect(withUnknown.status).toBe("READY");
  });

  it("cuota CT-00011 se relaciona a contrato CT-00011 aunque contrato tenga error", async () => {
    const db = buildPreviewDbMock({});
    const service = new ClientImportService(db as never);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        {
          "cliente_id_interno (opcional)": "CL-00001",
          "rut *": "9140815-5",
          "nombre_razon_social *": "ALDO CORDERO",
          "tipo_persona *": "Natural",
          "estado_cliente *": "Activo",
          "fecha_ingreso *": "04/06/2025",
        },
      ]),
      "CLIENTES",
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "CONTACTOS");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "FACTURACION");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        {
          "contrato_id (opcional)": "CT-00011",
          "cliente_id_interno o rut *": "NO-EXISTE",
          "servicio *": "Test",
          "area *": "Tributario",
          "monto_total *": 100000,
          "cantidad_cuotas *": 1,
          "fecha_inicio *": "01/01/2025",
          "estado_contrato *": "Activo",
        },
      ]),
      "CONTRATOS",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        {
          "contrato_id o cliente_id/rut *": "CT-00011",
          "numero_cuota *": 1,
          "monto *": 100000,
          "fecha_vencimiento *": "01/02/2025",
          "estado_cuota *": "contra resultado",
        },
      ]),
      "CUOTAS_OPCIONAL",
    );

    const result = await service.previewImport({
      fileName: "clientes.xlsx",
      fileBuffer: Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" })),
      createdBy: 1,
    });

    expect(result.preview.installments[0].issues.some((i) => i.code === "CONTRACT_HAS_ERRORS")).toBe(
      true,
    );
    expect(result.preview.installments[0].status).toBe("REVIEW");
    expect(
      result.preview.installments[0].issues.some(
        (i) => i.code === "UNRESOLVED_CONTRACT_REFERENCE",
      ),
    ).toBe(false);
  });

  it("cuota contra resultado sin monto queda SKIPPED y no ERROR", async () => {
    const db = buildPreviewDbMock({});
    const service = new ClientImportService(db as never);

    const result = await service.previewImport({
      fileName: "clientes.xlsx",
      fileBuffer: buildWorkbookBuffer({
        installmentAmount: null,
        installmentStatus: "contra resultado",
      }),
      createdBy: 1,
    });

    const installment = result.preview.installments[0];
    expect(installment.status).toBe("SKIPPED");
    expect(
      installment.issues.some(
        (issue) => issue.code === "INSTALLMENT_SKIPPED_NO_AMOUNT_NON_COLLECTIBLE",
      ),
    ).toBe(true);
    expect(
      installment.issues.some((issue) => issue.code === "INVALID_INSTALLMENT_AMOUNT"),
    ).toBe(false);
  });

  it("resumen separa bloqueantes y warnings importables", async () => {
    const db = buildPreviewDbMock({});
    const service = new ClientImportService(db as never);

    const result = await service.previewImport({
      fileName: "clientes.xlsx",
      fileBuffer: buildWorkbookBuffer({
        installmentStatus: "desconocido_x",
      }),
      createdBy: 1,
    });

    expect(result.summary.blockedRecords).toBeGreaterThanOrEqual(0);
    expect(result.summary.warningsImportablesTotal).toBeGreaterThan(0);
    expect(result.summary.registrosReady).toBeGreaterThanOrEqual(0);
    expect(result.summary.registrosSkipped).toBeGreaterThanOrEqual(0);
    expect(result.summary.registrosError).toBeGreaterThanOrEqual(0);
    expect(result.summary.readyInstallments + result.summary.reviewInstallments + result.summary.skippedInstallments + result.summary.errorInstallments).toBe(
      result.summary.totalInstallments,
    );
  });

  it("normaliza columnas historicas de pago en cuotas", async () => {
    const db = buildPreviewDbMock({});
    const service = new ClientImportService(db as never);

    const result = await service.previewImport({
      fileName: "clientes.xlsx",
      fileBuffer: buildWorkbookBuffer({
        installmentStatus: "Pendiente",
        installmentExtraColumns: {
          fecha_pago: "10/06/2025",
          medio_pago: "  transferencia  ",
          payment_id_externo: " ext-001 ",
          comprobante_url: " https://example.com/c1 ",
          tipo_cuota_origen: "  normal ",
          saldo_origen: "100.000",
          pagado_origen: "SÍ",
        },
      }),
      createdBy: 1,
    });

    const installment = result.preview.installments[0].normalizedData;
    expect(installment).not.toBeNull();
    expect(installment?.fechaPago).toBe("2025-06-10");
    expect(installment?.medioPago).toBe("transferencia");
    expect(installment?.paymentIdExterno).toBe("ext-001");
    expect(installment?.saldoOrigen).toBe(100000);
    expect(installment?.pagadoOrigen).toBe(true);
  });

  it("saldo_origen mayor al monto deja la cuota en ERROR", async () => {
    const db = buildPreviewDbMock({});
    const service = new ClientImportService(db as never);

    const result = await service.previewImport({
      fileName: "clientes.xlsx",
      fileBuffer: buildWorkbookBuffer({
        installmentAmount: 100000,
        installmentExtraColumns: {
          saldo_origen: 120000,
        },
      }),
      createdBy: 1,
    });

    expect(result.preview.installments[0].status).toBe("ERROR");
    expect(
      result.preview.installments[0].issues.some(
        (issue) => issue.code === "INVALID_SOURCE_BALANCE_EXCEEDS_INSTALLMENT",
      ),
    ).toBe(true);
  });

  it("bloquea contrato cuando suma de cuotas no coincide con monto_total", async () => {
    const db = buildPreviewDbMock({});
    const service = new ClientImportService(db as never);

    const installmentRows = Array.from({ length: 6 }, (_, idx) => ({
      "contrato_id o cliente_id/rut *": "CT-00001",
      "numero_cuota *": idx + 1,
      "monto *": 1000000,
      "fecha_vencimiento *": "06/06/2025",
      "estado_cuota *": "Vencida",
    }));

    const result = await service.previewImport({
      fileName: "clientes.xlsx",
      fileBuffer: buildWorkbookBuffer({
        contractAmount: 1200000,
        contractInstallmentCount: 6,
        installmentRows,
      }),
      createdBy: 1,
    });

    const contract = result.preview.contracts[0];
    expect(contract.status).toBe("ERROR");
    expect(
      contract.issues.some(
        (issue) => issue.code === "CONTRACT_INSTALLMENTS_AMOUNT_MISMATCH",
      ),
    ).toBe(true);
  });

  it("bloquea contrato cuando cantidad_cuotas no coincide con cuotas importadas", async () => {
    const db = buildPreviewDbMock({});
    const service = new ClientImportService(db as never);

    const installmentRows = Array.from({ length: 6 }, (_, idx) => ({
      "contrato_id o cliente_id/rut *": "CT-00001",
      "numero_cuota *": idx + 1,
      "monto *": 200000,
      "fecha_vencimiento *": "06/06/2025",
      "estado_cuota *": "Vencida",
    }));

    const result = await service.previewImport({
      fileName: "clientes.xlsx",
      fileBuffer: buildWorkbookBuffer({
        contractAmount: 1200000,
        contractInstallmentCount: 1,
        installmentRows,
      }),
      createdBy: 1,
    });

    const contract = result.preview.contracts[0];
    expect(contract.status).toBe("ERROR");
    expect(
      contract.issues.some(
        (issue) => issue.code === "CONTRACT_INSTALLMENTS_COUNT_MISMATCH",
      ),
    ).toBe(true);
  });

  it("deja contrato READY cuando cuotas cuadran con monto_total", async () => {
    const db = buildPreviewDbMock({});
    const service = new ClientImportService(db as never);

    const installmentRows = [
      {
        "contrato_id o cliente_id/rut *": "CT-00001",
        "numero_cuota *": 1,
        "monto *": 400000,
        "fecha_vencimiento *": "06/06/2025",
        "estado_cuota *": "Pendiente",
      },
      {
        "contrato_id o cliente_id/rut *": "CT-00001",
        "numero_cuota *": 2,
        "monto *": 400000,
        "fecha_vencimiento *": "06/07/2025",
        "estado_cuota *": "Pendiente",
      },
      {
        "contrato_id o cliente_id/rut *": "CT-00001",
        "numero_cuota *": 3,
        "monto *": 400000,
        "fecha_vencimiento *": "06/08/2025",
        "estado_cuota *": "Pendiente",
      },
    ];

    const result = await service.previewImport({
      fileName: "clientes.xlsx",
      fileBuffer: buildWorkbookBuffer({
        contractAmount: 1200000,
        contractInstallmentCount: 3,
        installmentRows,
      }),
      createdBy: 1,
    });

    expect(result.preview.contracts[0].status).toBe("READY");
  });

  it("aplica tolerancia de redondeo en descuadre de monto de cuotas", async () => {
    const db = buildPreviewDbMock({});
    const service = new ClientImportService(db as never);

    const result = await service.previewImport({
      fileName: "clientes.xlsx",
      fileBuffer: buildWorkbookBuffer({
        contractAmount: 1000001,
        contractInstallmentCount: 2,
        installmentRows: [
          {
            "contrato_id o cliente_id/rut *": "CT-00001",
            "numero_cuota *": 1,
            "monto *": 500000,
            "fecha_vencimiento *": "06/06/2025",
            "estado_cuota *": "Pendiente",
          },
          {
            "contrato_id o cliente_id/rut *": "CT-00001",
            "numero_cuota *": 2,
            "monto *": 500010,
            "fecha_vencimiento *": "06/07/2025",
            "estado_cuota *": "Pendiente",
          },
        ],
      }),
      createdBy: 1,
    });

    expect(result.preview.contracts[0].issues.some((issue) => issue.code === "CONTRACT_INSTALLMENTS_AMOUNT_MISMATCH")).toBe(
      false,
    );
    expect(result.preview.contracts[0].status).toBe("READY");
  });

  it("contrato sin CUOTAS_OPCIONAL mantiene comportamiento actual", async () => {
    const db = buildPreviewDbMock({});
    const service = new ClientImportService(db as never);

    const result = await service.previewImport({
      fileName: "clientes.xlsx",
      fileBuffer: buildWorkbookBuffer({
        includeInstallment: false,
      }),
      createdBy: 1,
    });

    expect(result.preview.contracts[0].status).toBe("READY");
    expect(result.summary.totalInstallments).toBe(0);
  });
});

describe("ClientImportService confirm idempotency", () => {
  it("Confirmar dos veces no duplica datos", async () => {
    const transactionSpy = vi.fn();
    const db = {
      clientImportBatch: {
        findUnique: vi.fn().mockResolvedValue({ id: 77, status: ImportBatchStatus.CONFIRMED }),
      },
      clientImportItem: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      contractImportItem: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      installmentImportItem: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      $transaction: transactionSpy,
    };

    const service = new ClientImportService(db as never);
    await service.confirmImport(77);

    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it("Cuotas existentes no se duplican", async () => {
    const batchId = 45;
    const installmentUpdate = vi.fn().mockResolvedValue({});
    const contractUpdate = vi.fn().mockResolvedValue({});
    const clientUpdate = vi.fn().mockResolvedValue({});
    const txCuotaFindUnique = vi.fn().mockResolvedValue({ id: 200 });
    const txCuotaUpsert = vi.fn().mockResolvedValue({ id: 200, monto_actual: 1000000 });
    const txCuotaUpdate = vi.fn().mockResolvedValue({});

    const tx = {
      cliente: { upsert: vi.fn().mockResolvedValue({ id: 10 }) },
      clienteContacto: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn(), create: vi.fn() },
      clienteFacturacion: { upsert: vi.fn() },
      sistemaExterno: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
      externalReference: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
      contrato: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ id: 100, fecha_contrato: new Date("2025-06-04") }),
      },
      cuota: {
        findUnique: txCuotaFindUnique,
        upsert: txCuotaUpsert,
        update: txCuotaUpdate,
      },
      pago: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 901, contrato_id: 100, cuota_id: 200 }),
      },
      aplicacionPago: {
        aggregate: vi
          .fn()
          .mockResolvedValueOnce({ _sum: { monto_aplicado: 0 } })
          .mockResolvedValueOnce({ _sum: { monto_aplicado: 1000000 } }),
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 1 }),
      },
      clientImportItem: { update: clientUpdate },
      contractImportItem: { update: contractUpdate },
      installmentImportItem: { update: installmentUpdate },
    };

    const db = {
      clientImportBatch: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: batchId, status: ImportBatchStatus.PREVIEW_READY })
          .mockResolvedValueOnce({
            id: batchId,
            filename: "clientes.xlsx",
            status: ImportBatchStatus.CONFIRMED,
            created_at: new Date(),
            confirmed_at: new Date(),
          }),
        update: vi.fn().mockResolvedValue({}),
      },
      clientImportItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 11,
            batch_id: batchId,
            row_number: 2,
            rut: "9140815-5",
            status: "READY",
            normalized_data: {
              rut: "9140815-5",
              nombreRazonSocial: "ALDO CORDERO",
              tipoCliente: "PERSONA",
              estadoCliente: "ACTIVO",
              fechaIngreso: "2025-06-04",
              contactoPrincipal: null,
              facturacion: null,
              enablePagacuotas: false,
            },
          },
        ]),
      },
      contractImportItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 21,
            batch_id: batchId,
            row_number: 10,
            status: "READY",
            errors: null,
            normalized_data: {
              externalContractId: "CT-00001",
              clienteRut: "9140815-5",
              servicio: "Servicio",
              area: null,
              montoTotal: 1000000,
              cantidadCuotas: 1,
              fechaInicio: "2025-06-04",
              estadoContrato: "ACTIVO",
              observaciones: null,
            },
          },
        ]),
        update: contractUpdate,
      },
      installmentImportItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 31,
            batch_id: batchId,
            row_number: 50,
            status: "READY",
            errors: null,
            normalized_data: {
              contratoRef: "CT-00001",
              contractRowNumber: 10,
              contractExternalId: "CT-00001",
              clientRut: "9140815-5",
              numeroCuota: 1,
              monto: 1000000,
              fechaVencimiento: "2025-06-06",
              estadoCuota: "PAGADA",
              cobrable: true,
              motivoNoCobrable: null,
            },
          },
        ]),
        update: installmentUpdate,
      },
      $transaction: vi
        .fn()
        .mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    const service = new ClientImportService(db as never);
    await service.confirmImport(batchId);

    expect(txCuotaUpsert).toHaveBeenCalled();
    expect(installmentUpdate).toHaveBeenCalledWith({
      where: { id: 31 },
      data: { status: "SKIPPED", created_cuota_id: 200 },
    });
  });

  it("usa una transaccion por contrato con timeout explicito", async () => {
    const batchId = 46;
    const tx = {
      cliente: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
      clienteContacto: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn(), create: vi.fn() },
      clienteFacturacion: { upsert: vi.fn() },
      sistemaExterno: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
      externalReference: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
      contrato: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({ id: 1, fecha_contrato: new Date("2025-01-01") }) },
      cuota: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({ id: 1 }) },
      clientImportItem: { update: vi.fn() },
      contractImportItem: { update: vi.fn() },
      installmentImportItem: { update: vi.fn() },
    };

    const contracts = Array.from({ length: 3 }, (_, idx) => ({
      id: idx + 1,
      batch_id: batchId,
      row_number: 100 + idx,
      status: "READY",
      errors: null,
      normalized_data: {
        externalContractId: `CT-${idx + 1}`,
        clienteRut: "9140815-5",
        servicio: `S-${idx + 1}`,
        area: null,
        montoTotal: 1000 + idx,
        cantidadCuotas: 1,
        fechaInicio: "2025-01-01",
        estadoContrato: "ACTIVO",
        observaciones: null,
      },
    }));

    const txSpy = vi
      .fn()
      .mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));

    const db = {
      clientImportBatch: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: batchId, status: ImportBatchStatus.PREVIEW_READY })
          .mockResolvedValueOnce({
            id: batchId,
            filename: "clientes.xlsx",
            status: ImportBatchStatus.CONFIRMED,
            created_at: new Date(),
            confirmed_at: new Date(),
          }),
        update: vi.fn().mockResolvedValue({}),
      },
      clientImportItem: { findMany: vi.fn().mockResolvedValue([]) },
      contractImportItem: { findMany: vi.fn().mockResolvedValue(contracts) },
      installmentImportItem: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: txSpy,
    };

    const service = new ClientImportService(db as never);
    await service.confirmImport(batchId);

    expect(txSpy).toHaveBeenCalledTimes(3);
    for (const call of txSpy.mock.calls) {
      expect(call[1]).toMatchObject({ maxWait: 10000, timeout: 30000 });
    }
  });

  it("si una transaccion falla, marca error y continua con el siguiente contrato", async () => {
    const batchId = 47;
    const contractUpdate = vi.fn().mockResolvedValue({});
    const tx = {
      cliente: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
      clienteContacto: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn(), create: vi.fn() },
      clienteFacturacion: { upsert: vi.fn() },
      sistemaExterno: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
      externalReference: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
      contrato: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({ id: 1, fecha_contrato: new Date("2025-01-01") }) },
      cuota: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({ id: 1 }) },
      clientImportItem: { update: vi.fn() },
      contractImportItem: { update: contractUpdate },
      installmentImportItem: { update: vi.fn() },
    };

    const contracts = [1, 2].map((idx) => ({
      id: idx,
      batch_id: batchId,
      row_number: 200 + idx,
      status: "READY",
      errors: null,
      normalized_data: {
        externalContractId: `CT-${idx}`,
        clienteRut: "9140815-5",
        servicio: `S-${idx}`,
        area: null,
        montoTotal: 1000 + idx,
        cantidadCuotas: 1,
        fechaInicio: "2025-01-01",
        estadoContrato: "ACTIVO",
        observaciones: null,
      },
    }));

    const txSpy = vi
      .fn()
      .mockRejectedValueOnce(new Error("forced failure"))
      .mockImplementationOnce(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));

    const db = {
      clientImportBatch: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: batchId, status: ImportBatchStatus.PREVIEW_READY })
          .mockResolvedValueOnce({
            id: batchId,
            filename: "clientes.xlsx",
            status: ImportBatchStatus.CONFIRMED,
            created_at: new Date(),
            confirmed_at: new Date(),
          }),
        update: vi.fn().mockResolvedValue({}),
      },
      clientImportItem: { findMany: vi.fn().mockResolvedValue([]) },
      contractImportItem: { findMany: vi.fn().mockResolvedValue(contracts), update: contractUpdate },
      installmentImportItem: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: txSpy,
    };

    const service = new ClientImportService(db as never);
    await service.confirmImport(batchId);

    expect(contractUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ status: "ERROR" }),
      }),
    );
    expect(tx.contrato.upsert).toHaveBeenCalledTimes(1);
  });

  it("contrato en ERROR por preview no crea cuotas ni pagos en confirmacion", async () => {
    const batchId = 999;
    const txSpy = vi.fn();

    const db = {
      clientImportBatch: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: batchId, status: ImportBatchStatus.PREVIEW_READY })
          .mockResolvedValueOnce({
            id: batchId,
            filename: "clientes.xlsx",
            status: ImportBatchStatus.CONFIRMED,
            created_at: new Date(),
            confirmed_at: new Date(),
          }),
        update: vi.fn().mockResolvedValue({}),
      },
      clientImportItem: { findMany: vi.fn().mockResolvedValue([]) },
      contractImportItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 1,
            batch_id: batchId,
            row_number: 10,
            status: "ERROR",
            errors: [{ code: "CONTRACT_INSTALLMENTS_AMOUNT_MISMATCH", severity: "error", message: "mismatch" }],
            normalized_data: {
              externalContractId: "CT-001",
              clienteRut: "9140815-5",
              servicio: "Servicio",
              area: null,
              montoTotal: 1200000,
              cantidadCuotas: 1,
              fechaInicio: "2025-01-01",
              estadoContrato: "ACTIVO",
              observaciones: null,
            },
          },
        ]),
      },
      installmentImportItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 2,
            batch_id: batchId,
            row_number: 20,
            status: "ERROR",
            errors: [{ code: "CONTRACT_FINANCIAL_VALIDATION_FAILED", severity: "error", message: "blocked" }],
            normalized_data: null,
          },
        ]),
      },
      $transaction: txSpy,
    };

    const service = new ClientImportService(db as never);
    await service.confirmImport(batchId);

    expect(txSpy).not.toHaveBeenCalled();
  });
});

describe("ClientImportService confirm import policy", () => {
  function buildPolicyConfirmContext(options?: {
    clientStatus?: string;
    contractStatus?: string;
    installmentStatus?: string;
  }) {
    const batchId = 321;
    const clientStatus = options?.clientStatus ?? "READY";
    const contractStatus = options?.contractStatus ?? "READY";
    const installmentStatus = options?.installmentStatus ?? "READY";

    const clientUpdate = vi.fn().mockResolvedValue({});
    const contractUpdate = vi.fn().mockResolvedValue({});
    const installmentUpdate = vi.fn().mockResolvedValue({});
    const pagoCreate = vi.fn().mockResolvedValue({ id: 901, contrato_id: 100, cuota_id: 300 });
    const txSpy = vi
      .fn()
      .mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));

    const tx = {
      cliente: { upsert: vi.fn().mockResolvedValue({ id: 10 }) },
      clienteContacto: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn(), create: vi.fn() },
      clienteFacturacion: { upsert: vi.fn() },
      sistemaExterno: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
      externalReference: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
      contrato: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ id: 100, fecha_contrato: new Date("2025-06-04") }),
      },
      cuota: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ id: 300, monto_actual: 1000000 }),
        update: vi.fn().mockResolvedValue({}),
      },
      pago: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: pagoCreate,
      },
      aplicacionPago: {
        aggregate: vi
          .fn()
          .mockResolvedValueOnce({ _sum: { monto_aplicado: 0 } })
          .mockResolvedValueOnce({ _sum: { monto_aplicado: 0 } }),
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 1 }),
      },
      clientImportItem: { update: clientUpdate },
      contractImportItem: { update: contractUpdate },
      installmentImportItem: { update: installmentUpdate },
    };

    const db = {
      clientImportBatch: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: batchId, status: ImportBatchStatus.PREVIEW_READY })
          .mockResolvedValueOnce({
            id: batchId,
            filename: "clientes.xlsx",
            status: ImportBatchStatus.CONFIRMED,
            created_at: new Date(),
            confirmed_at: new Date(),
          }),
        update: vi.fn().mockResolvedValue({}),
      },
      clientImportItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 11,
            batch_id: batchId,
            row_number: 2,
            rut: "9140815-5",
            status: clientStatus,
            errors: null,
            normalized_data: {
              rut: "9140815-5",
              nombreRazonSocial: "ALDO CORDERO",
              tipoCliente: "PERSONA",
              estadoCliente: "ACTIVO",
              fechaIngreso: "2025-06-04",
              contactoPrincipal: null,
              facturacion: null,
              enablePagacuotas: false,
            },
          },
        ]),
      },
      contractImportItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 21,
            batch_id: batchId,
            row_number: 10,
            status: contractStatus,
            errors: null,
            normalized_data: {
              externalContractId: "CT-00001",
              clienteRut: "9140815-5",
              servicio: "Servicio",
              area: null,
              montoTotal: 1000000,
              cantidadCuotas: 1,
              fechaInicio: "2025-06-04",
              estadoContrato: "ACTIVO",
              observaciones: null,
            },
          },
        ]),
        update: contractUpdate,
      },
      installmentImportItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 31,
            batch_id: batchId,
            row_number: 50,
            status: installmentStatus,
            errors: null,
            normalized_data: {
              contratoRef: "CT-00001",
              contractRowNumber: 10,
              contractExternalId: "CT-00001",
              clientRut: "9140815-5",
              numeroCuota: 1,
              monto: 1000000,
              fechaVencimiento: "2025-06-06",
              estadoCuota: "PENDIENTE",
              cobrable: true,
              motivoNoCobrable: null,
              fechaPago: null,
              medioPago: null,
              paymentIdExterno: null,
              comprobanteUrl: null,
              tipoCuotaOrigen: null,
              saldoOrigen: null,
              pagadoOrigen: false,
            },
          },
        ]),
        update: installmentUpdate,
      },
      $transaction: txSpy,
    };

    return {
      db,
      tx,
      spies: { txSpy, clientUpdate, contractUpdate, installmentUpdate, pagoCreate },
      batchId,
    };
  }

  it("onlyReady=true no importa cliente REVIEW", async () => {
    const { db, tx } = buildPolicyConfirmContext({ clientStatus: "REVIEW" });
    const service = new ClientImportService(db as never);

    await service.confirmImport(321, { onlyReady: true });
    expect(tx.cliente.upsert).not.toHaveBeenCalled();
  });

  it("onlyReady=true no importa contrato REVIEW", async () => {
    const { db, tx, spies } = buildPolicyConfirmContext({ contractStatus: "REVIEW" });
    const service = new ClientImportService(db as never);

    await service.confirmImport(321, { onlyReady: true });
    expect(spies.txSpy).not.toHaveBeenCalled();
    expect(tx.contrato.upsert).not.toHaveBeenCalled();
  });

  it("onlyReady=true no importa cuota REVIEW", async () => {
    const { db, tx, spies } = buildPolicyConfirmContext({ installmentStatus: "REVIEW" });
    const service = new ClientImportService(db as never);

    await service.confirmImport(321, { onlyReady: true });
    expect(spies.txSpy).toHaveBeenCalledTimes(1);
    expect(tx.cuota.upsert).not.toHaveBeenCalled();
  });

  it("onlyReady=true nunca importa contratos ERROR", async () => {
    const { db, tx, spies } = buildPolicyConfirmContext({ contractStatus: "ERROR" });
    const service = new ClientImportService(db as never);

    await service.confirmImport(321, { onlyReady: true });
    expect(spies.txSpy).not.toHaveBeenCalled();
    expect(tx.contrato.upsert).not.toHaveBeenCalled();
  });

  it("contrato READY con cliente REVIEW se salta y marca issue de importacion estricta", async () => {
    const { db, tx, spies } = buildPolicyConfirmContext({ clientStatus: "REVIEW" });
    const service = new ClientImportService(db as never);

    await service.confirmImport(321, { onlyReady: true });

    expect(spies.txSpy).not.toHaveBeenCalled();
    expect(tx.contrato.upsert).not.toHaveBeenCalled();
    expect(spies.contractUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 21 },
        data: expect.objectContaining({
          status: "SKIPPED",
          errors: expect.arrayContaining([
            expect.objectContaining({ code: "CLIENT_NOT_READY_FOR_STRICT_IMPORT" }),
          ]),
        }),
      }),
    );
  });

  it("cuota REVIEW no genera pago aunque el contrato sea READY en modo estricto", async () => {
    const { db, spies } = buildPolicyConfirmContext({ installmentStatus: "REVIEW" });
    const service = new ClientImportService(db as never);

    await service.confirmImport(321, { onlyReady: true });
    expect(spies.pagoCreate).not.toHaveBeenCalled();
  });

  it("allowReview=true permite importar REVIEW", async () => {
    const { db, tx, spies } = buildPolicyConfirmContext({
      clientStatus: "REVIEW",
      contractStatus: "REVIEW",
      installmentStatus: "REVIEW",
    });
    const service = new ClientImportService(db as never);

    await service.confirmImport(321, { onlyReady: false, allowReview: true });
    expect(spies.txSpy).toHaveBeenCalledTimes(1);
    expect(tx.contrato.upsert).toHaveBeenCalledTimes(1);
    expect(tx.cuota.upsert).toHaveBeenCalledTimes(1);
  });

  it("sin flags usa comportamiento seguro: solo READY", async () => {
    const { db, tx, spies } = buildPolicyConfirmContext({ contractStatus: "REVIEW" });
    const service = new ClientImportService(db as never);

    await service.confirmImport(321);
    expect(spies.txSpy).not.toHaveBeenCalled();
    expect(tx.contrato.upsert).not.toHaveBeenCalled();
  });
});

describe("ClientImportService historical payments", () => {
  function buildHistoricalConfirmContext(options?: {
    installmentOverrides?: Record<string, unknown>;
    existingPayment?: { id: number; contrato_id: number; cuota_id: number | null } | null;
    existingApplication?: boolean;
    initialAppliedAmount?: number;
    finalAppliedAmount?: number;
  }) {
    const batchId = 88;
    const installmentUpdate = vi.fn().mockResolvedValue({});
    const contractUpdate = vi.fn().mockResolvedValue({});
    const clientUpdate = vi.fn().mockResolvedValue({});
    const cuotaUpdate = vi.fn().mockResolvedValue({});
    const pagoCreate = vi.fn().mockResolvedValue({ id: 7001, contrato_id: 100, cuota_id: 300 });
    const aplicacionCreate = vi.fn().mockResolvedValue({ id: 9001 });
    const initialAppliedAmount = options?.initialAppliedAmount ?? 0;
    const finalAppliedAmount = options?.finalAppliedAmount ?? 1000000;
    const existingPayment = options?.existingPayment ?? null;
    const existingApplication = options?.existingApplication ?? false;

    const tx = {
      cliente: { upsert: vi.fn().mockResolvedValue({ id: 10 }) },
      clienteContacto: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn(), create: vi.fn() },
      clienteFacturacion: { upsert: vi.fn() },
      sistemaExterno: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
      externalReference: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
      contrato: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ id: 100, fecha_contrato: new Date("2025-06-04") }),
      },
      cuota: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ id: 300, monto_actual: 1000000 }),
        update: cuotaUpdate,
      },
      pago: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existingPayment)
          .mockResolvedValueOnce(existingPayment),
        create: pagoCreate,
      },
      aplicacionPago: {
        aggregate: vi
          .fn()
          .mockResolvedValueOnce({ _sum: { monto_aplicado: initialAppliedAmount } })
          .mockResolvedValueOnce({ _sum: { monto_aplicado: finalAppliedAmount } }),
        findUnique: vi.fn().mockResolvedValue(existingApplication ? { id: 500 } : null),
        create: aplicacionCreate,
      },
      clientImportItem: { update: clientUpdate },
      contractImportItem: { update: contractUpdate },
      installmentImportItem: { update: installmentUpdate },
    };

    const normalizedInstallmentBase = {
      contratoRef: "CT-00001",
      contractRowNumber: 10,
      contractExternalId: "CT-00001",
      clientRut: "9140815-5",
      numeroCuota: 1,
      monto: 1000000,
      fechaVencimiento: "2025-06-06",
      estadoCuota: "PAGADA",
      cobrable: true,
      motivoNoCobrable: null,
      fechaPago: "2025-06-07",
      medioPago: "transferencia",
      paymentIdExterno: null,
      comprobanteUrl: "https://example.com/comprobante.pdf",
      tipoCuotaOrigen: "normal",
      saldoOrigen: null,
      pagadoOrigen: null,
    };

    const db = {
      clientImportBatch: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: batchId, status: ImportBatchStatus.PREVIEW_READY })
          .mockResolvedValueOnce({
            id: batchId,
            filename: "clientes.xlsx",
            status: ImportBatchStatus.CONFIRMED,
            created_at: new Date(),
            confirmed_at: new Date(),
          }),
        update: vi.fn().mockResolvedValue({}),
      },
      clientImportItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 11,
            batch_id: batchId,
            row_number: 2,
            rut: "9140815-5",
            status: "READY",
            normalized_data: {
              rut: "9140815-5",
              nombreRazonSocial: "ALDO CORDERO",
              tipoCliente: "PERSONA",
              estadoCliente: "ACTIVO",
              fechaIngreso: "2025-06-04",
              contactoPrincipal: null,
              facturacion: null,
              enablePagacuotas: false,
            },
          },
        ]),
      },
      contractImportItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 21,
            batch_id: batchId,
            row_number: 10,
            status: "READY",
            errors: null,
            normalized_data: {
              externalContractId: "CT-00001",
              clienteRut: "9140815-5",
              servicio: "Servicio",
              area: null,
              montoTotal: 1000000,
              cantidadCuotas: 1,
              fechaInicio: "2025-06-04",
              estadoContrato: "ACTIVO",
              observaciones: null,
            },
          },
        ]),
        update: contractUpdate,
      },
      installmentImportItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 31,
            batch_id: batchId,
            row_number: 50,
            status: "READY",
            errors: null,
            normalized_data: {
              ...normalizedInstallmentBase,
              ...(options?.installmentOverrides ?? {}),
            },
          },
        ]),
        update: installmentUpdate,
      },
      $transaction: vi
        .fn()
        .mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    return {
      db,
      tx,
      spies: { installmentUpdate, contractUpdate, clientUpdate, cuotaUpdate, pagoCreate, aplicacionCreate },
    };
  }

  it("cuota PAGADA con fecha_pago crea Pago y AplicacionPago", async () => {
    const { db, spies } = buildHistoricalConfirmContext();
    const service = new ClientImportService(db as never);

    await service.confirmImport(88);

    expect(spies.pagoCreate).toHaveBeenCalledTimes(1);
    expect(spies.aplicacionCreate).toHaveBeenCalledTimes(1);
  });

  it("cuota PAGADA sin fecha_pago usa fecha_vencimiento y deja observacion", async () => {
    const { db, spies } = buildHistoricalConfirmContext({
      installmentOverrides: {
        fechaPago: null,
      },
    });
    const service = new ClientImportService(db as never);

    await service.confirmImport(88);

    const pagoPayload = spies.pagoCreate.mock.calls[0][0].data;
    expect(pagoPayload.fecha_pago.toISOString().slice(0, 10)).toBe("2025-06-06");
    expect(pagoPayload.observacion).toContain("sin fecha exacta");
    expect(pagoPayload.observacion).toContain("fecha de vencimiento");
  });

  it("cuota pagada sin medio_pago usa MIGRACION", async () => {
    const { db, spies } = buildHistoricalConfirmContext({
      installmentOverrides: {
        medioPago: null,
      },
    });
    const service = new ClientImportService(db as never);

    await service.confirmImport(88);

    const pagoPayload = spies.pagoCreate.mock.calls[0][0].data;
    expect(pagoPayload.medio_pago).toBe("MIGRACION");
  });

  it("cuota parcial por saldo_origen crea pago parcial y estado PARCIAL", async () => {
    const { db, spies } = buildHistoricalConfirmContext({
      installmentOverrides: {
        estadoCuota: "PENDIENTE",
        fechaPago: "2025-06-07",
        saldoOrigen: 400000,
      },
      initialAppliedAmount: 0,
      finalAppliedAmount: 600000,
    });
    const service = new ClientImportService(db as never);

    await service.confirmImport(88);

    expect(spies.aplicacionCreate.mock.calls[0][0].data.monto_aplicado).toBe(600000);
    expect(spies.cuotaUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: "PARCIAL",
          saldo_pendiente: 400000,
        }),
      }),
    );
  });

  it("reimportar no duplica Pago si ya existe por referencia estable", async () => {
    const { db, spies } = buildHistoricalConfirmContext({
      existingPayment: { id: 8001, contrato_id: 100, cuota_id: 300 },
      existingApplication: true,
      initialAppliedAmount: 1000000,
      finalAppliedAmount: 1000000,
    });
    const service = new ClientImportService(db as never);

    await service.confirmImport(88);

    expect(spies.pagoCreate).not.toHaveBeenCalled();
  });

  it("reimportar no duplica AplicacionPago si ya existe", async () => {
    const { db, spies } = buildHistoricalConfirmContext({
      existingPayment: { id: 8001, contrato_id: 100, cuota_id: 300 },
      existingApplication: true,
      initialAppliedAmount: 1000000,
      finalAppliedAmount: 1000000,
    });
    const service = new ClientImportService(db as never);

    await service.confirmImport(88);

    expect(spies.aplicacionCreate).not.toHaveBeenCalled();
  });

  it("cuota pendiente sin senales de pago no crea Pago", async () => {
    const { db, spies } = buildHistoricalConfirmContext({
      installmentOverrides: {
        estadoCuota: "PENDIENTE",
        fechaPago: null,
        saldoOrigen: null,
        pagadoOrigen: false,
      },
      finalAppliedAmount: 0,
    });
    const service = new ClientImportService(db as never);

    await service.confirmImport(88);

    expect(spies.pagoCreate).not.toHaveBeenCalled();
    expect(spies.aplicacionCreate).not.toHaveBeenCalled();
  });

  it("usa payment_id_externo como payment_event_id", async () => {
    const { db, spies } = buildHistoricalConfirmContext({
      installmentOverrides: {
        paymentIdExterno: "pay-ext-123",
      },
    });
    const service = new ClientImportService(db as never);

    await service.confirmImport(88);

    const pagoPayload = spies.pagoCreate.mock.calls[0][0].data;
    expect(pagoPayload.payment_event_id).toBe("pay-ext-123");
  });

  it("crea Pago y AplicacionPago dentro del flujo transaccional por contrato", async () => {
    const { db, spies } = buildHistoricalConfirmContext();
    const service = new ClientImportService(db as never);

    await service.confirmImport(88);

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(spies.pagoCreate).toHaveBeenCalledTimes(1);
    expect(spies.aplicacionCreate).toHaveBeenCalledTimes(1);
  });
});
