import {
  EstadoContrato,
  EstadoCuota,
  EstadoCliente,
  ExternalEntityType,
  IntegrationEventStatus,
  Prisma,
  TipoCliente,
  type PrismaClient,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EXTERNAL_SYSTEM_CODES } from "./integration.constants";
import { ExternalReferenceService } from "./external-reference.service";
import { IntegrationEventService } from "./integration-event.service";
import { PagaCuotasNotifyService } from "./pagacuotas-notify.service";

type DbLike = PrismaClient;

function normalizeRut(rut: string): string {
  return rut.replace(/\./g, "").toLowerCase().trim();
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseLeadId(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;
  const match = String(value).match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export type CrmOnboardingInput = {
  eventId?: string;
  correlationId?: string;
  idempotencyKey: string;
  leadId?: string | number | null;
  opportunityId?: string | null;
  customer: {
    fullName: string;
    email?: string | null;
    phone?: string | null;
    taxId: string;
  };
  proposal: {
    serviceCode?: string | null;
    serviceName: string;
    initialFeeAmount: number;
    totalAmount: number;
    installmentsCount: number;
    firstDueDate?: string | null;
  };
};

export function parseCrmPayload(raw: Record<string, unknown>): CrmOnboardingInput {
  const nested =
    raw.payload && typeof raw.payload === "object"
      ? (raw.payload as Record<string, unknown>)
      : null;

  const customer = (nested?.customer ?? {}) as Record<string, unknown>;
  const proposal = (nested?.proposal ?? {}) as Record<string, unknown>;

  const leadId = nested?.lead_id ?? raw.crmLeadId ?? null;
  const opportunityId = nested?.opportunity_id
    ? String(nested.opportunity_id)
    : null;

  const idempotencyKey = String(
    raw.idempotency_key ??
      raw.idempotencyKey ??
      (opportunityId
        ? `crm-opp-${opportunityId}-accepted`
        : `crm-lead-${leadId ?? "unknown"}-${Date.now()}`),
  );

  return {
    eventId: raw.event_id ? String(raw.event_id) : undefined,
    correlationId: raw.correlation_id
      ? String(raw.correlation_id)
      : undefined,
    idempotencyKey,
    leadId: leadId != null ? String(leadId) : null,
    opportunityId,
    customer: {
      fullName: String(customer.full_name ?? raw.nombre ?? ""),
      email: customer.email
        ? String(customer.email)
        : raw.email
          ? String(raw.email)
          : null,
      phone: customer.phone
        ? String(customer.phone)
        : raw.phone
          ? String(raw.phone)
          : null,
      taxId: String(customer.tax_id ?? raw.rut ?? ""),
    },
    proposal: {
      serviceCode: proposal.service_code ? String(proposal.service_code) : null,
      serviceName: String(
        proposal.service_name ?? proposal.service_code ?? raw.tipoServicio ?? "",
      ),
      initialFeeAmount: Number(proposal.initial_fee_amount ?? raw.cuotaInicial ?? 0),
      totalAmount: Number(proposal.total_amount ?? raw.honorarios ?? 0),
      installmentsCount: Number(proposal.installments_count ?? raw.numCuotas ?? 1),
      firstDueDate: proposal.first_due_date
        ? String(proposal.first_due_date)
        : raw.fechaIngreso
          ? String(raw.fechaIngreso)
          : null,
    },
  };
}

export class CrmIntegrationService {
  private readonly integrationEventService: IntegrationEventService;
  private readonly externalReferenceService: ExternalReferenceService;
  private readonly pagaCuotasNotifyService: PagaCuotasNotifyService;

  constructor(
    private readonly db: DbLike = prisma,
    deps: {
      integrationEventService?: IntegrationEventService;
      externalReferenceService?: ExternalReferenceService;
      pagaCuotasNotifyService?: PagaCuotasNotifyService;
    } = {},
  ) {
    this.integrationEventService =
      deps.integrationEventService ?? new IntegrationEventService(db);
    this.externalReferenceService =
      deps.externalReferenceService ?? new ExternalReferenceService(db);
    this.pagaCuotasNotifyService =
      deps.pagaCuotasNotifyService ?? new PagaCuotasNotifyService(db);
  }

  async handleOpportunityAccepted(rawPayload: Record<string, unknown>) {
    const input = parseCrmPayload(rawPayload);
    this.validateInput(input);

    const idempotency = await this.integrationEventService.ensureIdempotency({
      systemCode: EXTERNAL_SYSTEM_CODES.CRM,
      eventType: "crm.opportunity.accepted",
      externalEventId: input.opportunityId ?? input.eventId,
      idempotencyKey: input.idempotencyKey,
      payload: rawPayload as Prisma.InputJsonValue,
    });

    if (
      idempotency.duplicated &&
      idempotency.event.status === IntegrationEventStatus.PROCESSED
    ) {
      const r = idempotency.event.result_payload as Record<string, unknown> | null;
      return {
        ok: true,
        status: "idempotent" as const,
        clienteId: r?.clienteId as number | undefined,
        contratoId: r?.contratoId as number | undefined,
        cuotaIds: r?.cuotaIds as number[] | undefined,
        integration_event_id: idempotency.event.id,
      };
    }

    try {
      const normalizedRut = normalizeRut(input.customer.taxId);

      if (input.opportunityId) {
        const existing = await this.db.contrato.findFirst({
          where: { crm_opportunity_id: input.opportunityId },
        });
        if (existing) {
          const result = { clienteId: existing.cliente_id, contratoId: existing.id, status: "idempotent" };
          await this.integrationEventService.markProcessed(
            idempotency.event.id,
            result as Prisma.InputJsonValue,
          );
          return { ok: true, ...result, integration_event_id: idempotency.event.id };
        }
      }

      const { cliente, conflict } = await this.findOrCreateCliente({
        rut: normalizedRut,
        nombre: input.customer.fullName,
        email: input.customer.email ?? null,
        telefono: input.customer.phone ?? null,
      });

      if (conflict) {
        await this.integrationEventService.markFailed(
          idempotency.event.id,
          `PENDING_REVIEW: ${conflict}`,
        );
        return {
          ok: false,
          status: "PENDING_REVIEW" as const,
          conflict,
          integration_event_id: idempotency.event.id,
        };
      }

      const { contrato, cuotaIds } = await this.createContratoWithCuotas(
        cliente.id,
        input,
      );

      await Promise.all([
        input.opportunityId
          ? this.externalReferenceService.upsertReference({
              systemCode: EXTERNAL_SYSTEM_CODES.CRM,
              entityType: ExternalEntityType.CONTRATO,
              entityId: contrato.id,
              externalId: input.opportunityId,
              metadata: {
                lead_id: input.leadId,
                correlation_id: input.correlationId,
              } as Prisma.InputJsonValue,
            })
          : Promise.resolve(),
        input.leadId
          ? this.externalReferenceService.upsertReference({
              systemCode: EXTERNAL_SYSTEM_CODES.CRM,
              entityType: ExternalEntityType.CLIENTE,
              entityId: cliente.id,
              externalId: String(input.leadId),
              metadata: { lead_id: input.leadId } as Prisma.InputJsonValue,
            })
          : Promise.resolve(),
      ]);

      // Side-effect: notify PagaCuotas. Idempotent + non-blocking.
      // - On success: IntegrationEvent[pagacuotas.client.from-crm] = PROCESSED.
      // - On failure: leaves event PENDING for the retry-sweep worker.
      // Never throws — onboarding del contrato es la operación principal.
      const pagaCuotasResult = await this.pagaCuotasNotifyService
        .scheduleClientCreation({
          clienteId: cliente.id,
          contratoId: contrato.id,
          rut: normalizedRut,
          nombre: input.customer.fullName,
          email: input.customer.email ?? null,
          telefono: input.customer.phone ?? null,
          crmLeadId: parseLeadId(input.leadId),
          correlationId: input.correlationId ?? null,
        })
        .catch((err) => {
          // Defensive: scheduleClientCreation maneja sus errores, pero si algo
          // inesperado escapa, no contaminar el onboarding.
          return {
            ok: false as const,
            status: "pending" as const,
            integrationEventId: -1,
            attempts: 0,
            error: err instanceof Error ? err.message : String(err),
          };
        });

      const result = {
        clienteId: cliente.id,
        contratoId: contrato.id,
        cuotaIds,
        status: "created",
        pagacuotas: pagaCuotasResult.ok
          ? {
              status: pagaCuotasResult.status,
              autoLoginUrl: pagaCuotasResult.autoLoginUrl,
              portalUrl: pagaCuotasResult.portalUrl,
              paymentLink: pagaCuotasResult.paymentLink,
            }
          : { status: "pending", attempts: pagaCuotasResult.attempts, error: pagaCuotasResult.error },
      };
      await this.integrationEventService.markProcessed(
        idempotency.event.id,
        result as Prisma.InputJsonValue,
      );

      return { ok: true, ...result, integration_event_id: idempotency.event.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error en onboarding CRM";
      await this.integrationEventService.markFailed(idempotency.event.id, message);
      throw error;
    }
  }

  private validateInput(input: CrmOnboardingInput) {
    if (!input.idempotencyKey) throw new Error("idempotency_key es requerido.");
    if (!input.customer.taxId) throw new Error("tax_id (rut) es requerido.");
    if (!input.customer.fullName) throw new Error("full_name (nombre) es requerido.");
    if (!input.proposal.serviceName) throw new Error("service_name es requerido.");
    if (input.proposal.installmentsCount < 1)
      throw new Error("installments_count debe ser >= 1.");
    // El financiero del contrato puede llegar por DOS caminos:
    //  A) Total + cuota_inicial + num_cuotas  → initialFee > 0
    //  B) Total + num_cuotas + monto_cuota    → initialFee puede ser 0 si
    //     num_cuotas*monto_cuota = total (todo financiado en cuotas iguales).
    // Aceptamos initialFee >= 0 mientras totalAmount > 0.
    if (input.proposal.initialFeeAmount < 0)
      throw new Error("initial_fee_amount no puede ser negativo.");
    if (input.proposal.totalAmount <= 0)
      throw new Error("total_amount debe ser > 0 (honorarios totales).");
    if (input.proposal.initialFeeAmount > input.proposal.totalAmount)
      throw new Error("initial_fee_amount no puede ser mayor que total_amount.");
  }

  private async createContratoWithCuotas(
    clienteId: number,
    input: CrmOnboardingInput,
  ): Promise<{ contrato: { id: number; cliente_id: number }; cuotaIds: number[] }> {
    const { proposal } = input;
    const installmentsCount = Math.max(1, proposal.installmentsCount);
    const initialFee = roundMoney(proposal.initialFeeAmount);
    const totalAmount = roundMoney(Math.max(proposal.totalAmount, initialFee));
    const saldoFinanciado = roundMoney(totalAmount - initialFee);
    const firstDue = proposal.firstDueDate ? new Date(proposal.firstDueDate) : new Date();

    return this.db.$transaction(async (tx) => {
      const contrato = await tx.contrato.create({
        data: {
          cliente_id: clienteId,
          tipo_servicio: proposal.serviceName,
          fecha_contrato: new Date(),
          monto_ccto: totalAmount,
          monto_pago_inicial: initialFee,
          saldo_financiado: saldoFinanciado,
          cantidad_cuotas_original: installmentsCount,
          estado: EstadoContrato.PENDING_INITIAL_PAYMENT,
          crm_lead_id: parseLeadId(input.leadId),
          crm_opportunity_id: input.opportunityId ?? null,
          correlation_id: input.correlationId ?? null,
          idempotency_key: input.idempotencyKey,
          observaciones: `CRM. Opp: ${input.opportunityId ?? "N/A"}. Corr: ${input.correlationId ?? "N/A"}.`,
        },
      });

      const cuotasData = this.buildCuotasData(
        contrato.id,
        installmentsCount,
        initialFee,
        saldoFinanciado,
        firstDue,
      );

      const cuotaIds: number[] = [];
      for (const data of cuotasData) {
        const cuota = await tx.cuota.create({ data });
        cuotaIds.push(cuota.id);
      }

      return { contrato, cuotaIds };
    });
  }

  private buildCuotasData(
    contratoId: number,
    installmentsCount: number,
    initialFee: number,
    saldoFinanciado: number,
    firstDue: Date,
  ) {
    type CuotaData = {
      contrato_id: number;
      numero_cuota: number;
      fecha_vencimiento: Date;
      monto_original: number;
      monto_actual: number;
      saldo_pendiente: number;
      estado: EstadoCuota;
      cobrable: boolean;
    };

    const cuotas: CuotaData[] = [
      {
        contrato_id: contratoId,
        numero_cuota: 1,
        fecha_vencimiento: firstDue,
        monto_original: initialFee,
        monto_actual: initialFee,
        saldo_pendiente: initialFee,
        estado: EstadoCuota.PENDIENTE,
        cobrable: true,
      },
    ];

    if (installmentsCount > 1 && saldoFinanciado > 0) {
      const remaining = installmentsCount - 1;
      const baseAmount = roundMoney(Math.floor((saldoFinanciado / remaining) * 100) / 100);
      const lastAmount = roundMoney(saldoFinanciado - baseAmount * (remaining - 1));

      for (let i = 2; i <= installmentsCount; i++) {
        const dueDate = new Date(firstDue);
        dueDate.setMonth(dueDate.getMonth() + (i - 1));
        const monto = i === installmentsCount ? lastAmount : baseAmount;

        cuotas.push({
          contrato_id: contratoId,
          numero_cuota: i,
          fecha_vencimiento: dueDate,
          monto_original: monto,
          monto_actual: monto,
          saldo_pendiente: monto,
          estado: EstadoCuota.PENDIENTE,
          cobrable: false, // enabled after initial payment confirms contract
        });
      }
    }

    return cuotas;
  }

  private async findOrCreateCliente(data: {
    rut: string;
    nombre: string;
    email: string | null;
    telefono: string | null;
  }): Promise<{
    cliente: { id: number; rut: string; nombre: string; email: string | null };
    conflict: string | null;
  }> {
    const byRut = await this.db.cliente.findUnique({ where: { rut: data.rut } });

    if (byRut) {
      if (data.email && byRut.email && byRut.email !== data.email) {
        return {
          cliente: byRut,
          conflict: `RUT ${data.rut} existe con email diferente: almacenado=${byRut.email}, recibido=${data.email}`,
        };
      }
      return { cliente: byRut, conflict: null };
    }

    if (data.email) {
      const byEmail = await this.db.cliente.findFirst({ where: { email: data.email } });
      if (byEmail) {
        if (byEmail.rut && byEmail.rut !== data.rut) {
          return {
            cliente: byEmail,
            conflict: `Email ${data.email} existe con RUT diferente: almacenado=${byEmail.rut}, recibido=${data.rut}`,
          };
        }
        return { cliente: byEmail, conflict: null };
      }
    }

    const newCliente = await this.db.cliente.create({
      data: {
        rut: data.rut,
        nombre: data.nombre,
        tipo_cliente: TipoCliente.PERSONA,
        email: data.email,
        telefono: data.telefono,
        fecha_ingreso: new Date(),
        estado: EstadoCliente.ACTIVO,
      },
    });

    return { cliente: newCliente, conflict: null };
  }
}
