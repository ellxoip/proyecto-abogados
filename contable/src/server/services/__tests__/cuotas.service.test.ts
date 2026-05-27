import { EstadoContrato, EstadoCuota } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  summarizeClient,
  summarizeContract,
  toCuotaUiEstado,
} from "../cuotas.service";

function cuota(input: {
  id: number;
  numero: number;
  vencimiento: string;
  saldo: number;
  pagado: number;
  estado: EstadoCuota;
}) {
  return {
    id: input.id,
    numero_cuota: input.numero,
    fecha_vencimiento: new Date(input.vencimiento),
    monto_actual: input.saldo + input.pagado,
    monto_pagado: input.pagado,
    saldo_pendiente: input.saldo,
    estado: input.estado,
    fecha_pago: input.estado === EstadoCuota.PAGADA ? new Date("2026-05-15") : null,
  };
}

function pago(id: number, monto: number, fecha = "2026-05-15") {
  return {
    id,
    monto_pagado: monto,
    fecha_pago: new Date(fecha),
    medio_pago: "transferencia",
    referencia: null,
    observacion: null,
    cuota_id: null,
  };
}

describe("cuotas.service calculations", () => {
  it("mapea estados de cuota a estados de UI", () => {
    expect(
      toCuotaUiEstado({ estado: EstadoCuota.PAGADA, saldo_pendiente: 0 }),
    ).toBe("PAGADA");
    expect(
      toCuotaUiEstado({ estado: EstadoCuota.PENDIENTE, saldo_pendiente: 100 }),
    ).toBe("PENDIENTE");
    expect(
      toCuotaUiEstado({ estado: EstadoCuota.PARCIAL, saldo_pendiente: 25 }),
    ).toBe("PAGO_PARCIAL");
    expect(
      toCuotaUiEstado({ estado: EstadoCuota.REPROGRAMADA, saldo_pendiente: 50 }),
    ).toBe("EN_REVISION");
    expect(
      toCuotaUiEstado({ estado: EstadoCuota.ANULADA, saldo_pendiente: 0 }),
    ).toBe("ANULADA");
  });

  it("calcula cuotas pagadas, pendientes, vencidas y saldo pendiente", () => {
    const now = new Date("2026-06-15");

    const resumen = summarizeContract(
      {
        id: 1,
        external_id: "CTR-1",
        tipo_servicio: "Servicio A",
        estado: EstadoContrato.ACTIVO,
        monto_ccto: 1000,
        fecha_contrato: new Date("2026-01-01"),
        cuotas: [
          cuota({
            id: 1,
            numero: 1,
            vencimiento: "2026-02-05",
            saldo: 0,
            pagado: 250,
            estado: EstadoCuota.PAGADA,
          }),
          cuota({
            id: 2,
            numero: 2,
            vencimiento: "2026-07-05",
            saldo: 250,
            pagado: 0,
            estado: EstadoCuota.PENDIENTE,
          }),
          cuota({
            id: 3,
            numero: 3,
            vencimiento: "2026-05-05",
            saldo: 250,
            pagado: 0,
            estado: EstadoCuota.VENCIDA,
          }),
          cuota({
            id: 4,
            numero: 4,
            vencimiento: "2026-08-05",
            saldo: 125,
            pagado: 125,
            estado: EstadoCuota.PARCIAL,
          }),
        ],
        pagos: [pago(1, 250), pago(2, 125)],
      },
      now,
    );

    expect(resumen.cuotasPagadas).toBe(1);
    expect(resumen.cuotasPendientes).toBe(2);
    expect(resumen.cuotasVencidas).toBe(1);
    expect(resumen.saldoPendiente).toBe(625);
  });

  it("calcula estado financiero del contrato", () => {
    const now = new Date("2026-06-15");

    const moroso = summarizeContract(
      {
        id: 10,
        external_id: null,
        tipo_servicio: "Servicio B",
        estado: EstadoContrato.ACTIVO,
        monto_ccto: 500,
        fecha_contrato: new Date("2026-01-01"),
        cuotas: [
          cuota({
            id: 10,
            numero: 1,
            vencimiento: "2026-04-01",
            saldo: 100,
            pagado: 0,
            estado: EstadoCuota.VENCIDA,
          }),
        ],
        pagos: [],
      },
      now,
    );
    expect(moroso.estadoFinanciero).toBe("MOROSO");

    const pagado = summarizeContract(
      {
        id: 11,
        external_id: null,
        tipo_servicio: "Servicio C",
        estado: EstadoContrato.PAGADO,
        monto_ccto: 300,
        fecha_contrato: new Date("2026-01-01"),
        cuotas: [
          cuota({
            id: 11,
            numero: 1,
            vencimiento: "2026-03-01",
            saldo: 0,
            pagado: 300,
            estado: EstadoCuota.PAGADA,
          }),
        ],
        pagos: [pago(11, 300)],
      },
      now,
    );
    expect(pagado.estadoFinanciero).toBe("PAGADO");

    const enRevision = summarizeContract(
      {
        id: 12,
        external_id: null,
        tipo_servicio: "Servicio D",
        estado: EstadoContrato.REPACTADO,
        monto_ccto: 700,
        fecha_contrato: new Date("2026-01-01"),
        cuotas: [
          cuota({
            id: 12,
            numero: 1,
            vencimiento: "2026-07-01",
            saldo: 100,
            pagado: 0,
            estado: EstadoCuota.REPROGRAMADA,
          }),
        ],
        pagos: [],
      },
      now,
    );
    expect(enRevision.estadoFinanciero).toBe("EN_REVISION");
  });

  it("calcula estado financiero del cliente", () => {
    const now = new Date("2026-06-15");

    const alDia = summarizeClient(
      {
        id: 1,
        nombre: "Cliente A",
        rut: "1-9",
        contratos: [
          {
            id: 1,
            external_id: null,
            tipo_servicio: "Servicio A",
            estado: EstadoContrato.ACTIVO,
            monto_ccto: 200,
            fecha_contrato: new Date("2026-01-01"),
            cuotas: [
              cuota({
                id: 100,
                numero: 1,
                vencimiento: "2026-07-01",
                saldo: 100,
                pagado: 100,
                estado: EstadoCuota.PARCIAL,
              }),
            ],
            pagos: [pago(100, 100)],
          },
        ],
      },
      now,
    );
    expect(alDia.estadoFinanciero).toBe("AL_DIA");

    const conDeuda = summarizeClient(
      {
        id: 2,
        nombre: "Cliente B",
        rut: "2-7",
        contratos: [
          {
            id: 2,
            external_id: null,
            tipo_servicio: "Servicio B",
            estado: EstadoContrato.ACTIVO,
            monto_ccto: 300,
            fecha_contrato: new Date("2026-01-01"),
            cuotas: [
              cuota({
                id: 200,
                numero: 1,
                vencimiento: "2026-07-01",
                saldo: 300,
                pagado: 0,
                estado: EstadoCuota.PENDIENTE,
              }),
            ],
            pagos: [],
          },
        ],
      },
      now,
    );
    expect(conDeuda.estadoFinanciero).toBe("CON_DEUDA");

    const moroso = summarizeClient(
      {
        id: 3,
        nombre: "Cliente C",
        rut: "3-5",
        contratos: [
          {
            id: 3,
            external_id: null,
            tipo_servicio: "Servicio C",
            estado: EstadoContrato.EN_MORA,
            monto_ccto: 400,
            fecha_contrato: new Date("2026-01-01"),
            cuotas: [
              cuota({
                id: 300,
                numero: 1,
                vencimiento: "2026-05-01",
                saldo: 200,
                pagado: 0,
                estado: EstadoCuota.VENCIDA,
              }),
            ],
            pagos: [],
          },
        ],
      },
      now,
    );
    expect(moroso.estadoFinanciero).toBe("MOROSO");

    const pagado = summarizeClient(
      {
        id: 4,
        nombre: "Cliente D",
        rut: "4-3",
        contratos: [
          {
            id: 4,
            external_id: null,
            tipo_servicio: "Servicio D",
            estado: EstadoContrato.PAGADO,
            monto_ccto: 500,
            fecha_contrato: new Date("2026-01-01"),
            cuotas: [
              cuota({
                id: 400,
                numero: 1,
                vencimiento: "2026-03-01",
                saldo: 0,
                pagado: 500,
                estado: EstadoCuota.PAGADA,
              }),
            ],
            pagos: [pago(400, 500)],
          },
        ],
      },
      now,
    );
    expect(pagado.estadoFinanciero).toBe("PAGADO");
  });
});
