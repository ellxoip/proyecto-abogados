import { IntegrationEventStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EXTERNAL_SYSTEM_CODES } from "./integration.constants";
import { AtInformaClient } from "./at-informa.client";
import { CrmClient } from "./crm.client";
import { IntegrationEventService } from "./integration-event.service";
import { PaymentPortalService } from "./payment-portal.service";

const PAGACUOTAS_API_URL =
  process.env.PAGACUOTAS_API_URL || "http://localhost:4000";
const PAGACUOTAS_PORTAL_URL =
  (process.env.PAGACUOTAS_PORTAL_URL || "http://localhost:3002").replace(/\/+$/, "");
const PAGACUOTAS_CRM_API_KEY = process.env.PAGACUOTAS_CRM_API_KEY || "";
const PAGACUOTAS_NOTIFY_TIMEOUT_MS = 8_000;
const MAX_RETRY_ATTEMPTS = 8;

export type PagaCuotasClientPayload = {
  clienteId: number;
  contratoId: number;
  rut: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  crmLeadId?: number | null;
  correlationId?: string | null;
};

type NotifyResult =
  | {
      ok: true;
      status: "created" | "idempotent";
      autoLoginUrl: string | null;
      portalUrl: string | null;
      paymentLink: string | null;
      integrationEventId: number;
    }
  | { ok: false; status: "pending"; integrationEventId: number; attempts: number; error: string };

export class PagaCuotasNotifyService {
  constructor(
    private readonly db: typeof prisma = prisma,
    private readonly eventService: IntegrationEventService = new IntegrationEventService(db),
    private readonly paymentPortalService: PaymentPortalService = new PaymentPortalService(db),
    private readonly crmClient: CrmClient = new CrmClient(),
    private readonly atInformaClient: AtInformaClient | null = null,
  ) {}

  /**
   * Idempotent attempt to push the contract's client to PagaCuotas.
   * - On success: marks the IntegrationEvent PROCESSED.
   * - On failure: leaves the event in PENDING with attempt count for retry-sweep.
   *
   * Never throws — callers in the onboarding flow should NOT fail just because
   * the side-effect to PagaCuotas is temporarily unavailable.
   */
  async scheduleClientCreation(payload: PagaCuotasClientPayload): Promise<NotifyResult> {
    const idempotencyKey = `pagacuotas:client:from-crm:contrato=${payload.contratoId}`;
    const { event, duplicated } = await this.eventService.ensureIdempotency({
      systemCode: EXTERNAL_SYSTEM_CODES.PAGACUOTAS,
      eventType: "pagacuotas.client.from-crm",
      externalEventId: String(payload.contratoId),
      idempotencyKey,
      payload: payload as unknown as Prisma.InputJsonValue,
    });

    if (duplicated && event.status === IntegrationEventStatus.PROCESSED) {
      const prevResult = (event.result_payload ?? {}) as {
        autoLoginUrl?: string | null;
        portalUrl?: string | null;
        paymentLink?: string | null;
      };
      return {
        ok: true,
        status: "idempotent",
        autoLoginUrl: prevResult.autoLoginUrl ?? null,
        portalUrl: prevResult.portalUrl ?? null,
        paymentLink: prevResult.paymentLink ?? null,
        integrationEventId: event.id,
      };
    }

    const prevAttempts =
      ((event.result_payload as { attempts?: number } | null)?.attempts) ?? 0;
    return this.attemptPush(event.id, payload, prevAttempts);
  }

  /**
   * Used by the retry-sweep worker. Reads attempts so far from result_payload,
   * pushes again, and updates status accordingly.
   */
  async retryEvent(eventId: number): Promise<NotifyResult> {
    const event = await this.db.integrationEvent.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new Error(`IntegrationEvent ${eventId} no existe.`);
    }
    if (event.status === IntegrationEventStatus.PROCESSED) {
      const prevResult = (event.result_payload ?? {}) as {
        autoLoginUrl?: string | null;
        portalUrl?: string | null;
        paymentLink?: string | null;
      };
      return {
        ok: true,
        status: "idempotent",
        autoLoginUrl: prevResult.autoLoginUrl ?? null,
        portalUrl: prevResult.portalUrl ?? null,
        paymentLink: prevResult.paymentLink ?? null,
        integrationEventId: event.id,
      };
    }

    const payload = event.payload as unknown as PagaCuotasClientPayload;
    const prevAttempts =
      ((event.result_payload as { attempts?: number } | null)?.attempts) ?? 0;
    return this.attemptPush(event.id, payload, prevAttempts);
  }

  private async attemptPush(
    eventId: number,
    payload: PagaCuotasClientPayload,
    prevAttempts: number,
  ): Promise<NotifyResult> {
    if (!PAGACUOTAS_CRM_API_KEY) {
      const message =
        "PAGACUOTAS_CRM_API_KEY no configurada. No se puede notificar a PagaCuotas.";
      await this.eventService.markFailed(eventId, message);
      return { ok: false, status: "pending", integrationEventId: eventId, attempts: prevAttempts, error: message };
    }

    const attempts = prevAttempts + 1;
    let body: unknown;
    let status = 0;
    let errorMessage = "";

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PAGACUOTAS_NOTIFY_TIMEOUT_MS);
      const response = await fetch(
        `${PAGACUOTAS_API_URL.replace(/\/$/, "")}/api/integration/clients/from-crm`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-crm-api-key": PAGACUOTAS_CRM_API_KEY,
          },
          body: JSON.stringify({
            rut: payload.rut,
            nombre: payload.nombre,
            telefono: payload.telefono,
            email: payload.email,
            fuente: "hive_financial_control",
            contrato_id: payload.contratoId,
            cliente_id: payload.clienteId,
          }),
          signal: controller.signal,
        },
      ).finally(() => clearTimeout(timeout));

      status = response.status;
      if (response.ok) {
        body = await response.json().catch(() => ({}));
      } else {
        const text = await response.text().catch(() => "");
        errorMessage = `HTTP ${status}: ${text || response.statusText}`;
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    if (!errorMessage) {
      const data = body as { autoLoginUrl?: string | null };
      const portalUrl = this.buildPortalLoginUrl(payload.rut);
      const paymentLink = data?.autoLoginUrl ?? portalUrl;
      let passwordPlain: string | null = null;
      let nexioCallbackWarning: string | null = null;

      // 1. Credenciales y sync con service-control: SIEMPRE.
      //    Sin esto, el portal del cliente en SC nunca tiene paymentLink y
      //    PagaCuotas no acepta la clave. Antes esto estaba metido dentro del
      //    `if (crmLeadId)`, lo que dejaba a los clientes manuales sin sync.
      try {
        const credentials = await this.paymentPortalService.ensurePortalCredentials(payload.clienteId);
        passwordPlain = credentials.password;
        await this.getAtInformaClient().syncPaymentLink({
          rut: payload.rut,
          nombre: payload.nombre,
          email: payload.email,
          telefono: payload.telefono,
          payment_link: paymentLink,
          password_plain: credentials.password,
          crm_lead_id: payload.crmLeadId ?? null,
          correlation_id: payload.correlationId ?? null,
        });
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : String(err);
      }

      // 2. Callback a NEXIO (CRM): sólo si hay crmLeadId y CRM configurado.
      //    Falla acá es soft-warning: el paymentLink ya quedó pusheado a SC y
      //    el cliente puede pagar — solo el CRM no se enteró. retry-sweep
      //    reintentará el callback. NO debe romper el flujo de pago.
      if (!errorMessage && payload.crmLeadId) {
        if (!this.crmClient.configured) {
          nexioCallbackWarning = "CRM callback no configurado. paymentLink listo en SC, falta notificar a NEXIO.";
        } else {
          try {
            await this.crmClient.notifyPagaCuotasReady({
              crmLeadId: payload.crmLeadId,
              contratoId: payload.contratoId,
              clienteId: payload.clienteId,
              identifier: payload.rut,
              portalUrl,
              paymentLink,
              autoLoginUrl: data?.autoLoginUrl ?? null,
              password: passwordPlain ?? "",
              correlationId: payload.correlationId ?? null,
            });
          } catch (err) {
            nexioCallbackWarning = err instanceof Error ? err.message : String(err);
          }
        }
      }

      // Si solo falló el callback a NEXIO (nexioCallbackWarning set,
      // errorMessage vacío), marcamos PROCESSED y devolvemos ok=true con la
      // advertencia. El paymentLink ya está vivo para el cliente.
      if (nexioCallbackWarning && !errorMessage) {
        await this.eventService.markProcessed(eventId, {
          attempts,
          autoLoginUrl: data?.autoLoginUrl ?? null,
          portalUrl,
          paymentLink,
          passwordPlain,
          crmLeadId: payload.crmLeadId ?? null,
          nexioCallbackWarning,
          last_status: status,
        } as Prisma.InputJsonValue);
        return {
          ok: true,
          status: "created",
          autoLoginUrl: data?.autoLoginUrl ?? null,
          portalUrl,
          paymentLink,
          integrationEventId: eventId,
        };
      }

      if (errorMessage) {
        if (attempts >= MAX_RETRY_ATTEMPTS) {
          await this.eventService.markFailed(
            eventId,
            `Max retries (${MAX_RETRY_ATTEMPTS}) alcanzado. Ultimo error: ${errorMessage}`,
          );
        } else {
          await this.db.integrationEvent.update({
            where: { id: eventId },
            data: {
              status: IntegrationEventStatus.PENDING,
              result_payload: {
                attempts,
                autoLoginUrl: data?.autoLoginUrl ?? null,
                portalUrl,
                paymentLink,
                passwordPlain,
                last_error: errorMessage,
                last_status: status,
                last_retry_at: new Date().toISOString(),
              } as Prisma.InputJsonValue,
              error_message: errorMessage,
            },
          });
        }
        return {
          ok: false,
          status: "pending",
          integrationEventId: eventId,
          attempts,
          error: errorMessage,
        };
      }

      await this.eventService.markProcessed(eventId, {
        attempts,
        autoLoginUrl: data?.autoLoginUrl ?? null,
        portalUrl,
        paymentLink,
        passwordPlain,
        crmLeadId: payload.crmLeadId ?? null,
        last_status: status,
      } as Prisma.InputJsonValue);
      return {
        ok: true,
        status: "created",
        autoLoginUrl: data?.autoLoginUrl ?? null,
        portalUrl,
        paymentLink,
        integrationEventId: eventId,
      };
    }

    if (attempts >= MAX_RETRY_ATTEMPTS) {
      await this.eventService.markFailed(
        eventId,
        `Max retries (${MAX_RETRY_ATTEMPTS}) alcanzado. Último error: ${errorMessage}`,
      );
    } else {
      // Keep PENDING but persist attempt count + last error in result_payload
      await this.db.integrationEvent.update({
        where: { id: eventId },
        data: {
          status: IntegrationEventStatus.PENDING,
          result_payload: {
            attempts,
            last_error: errorMessage,
            last_status: status,
            last_retry_at: new Date().toISOString(),
          } as Prisma.InputJsonValue,
          error_message: errorMessage,
        },
      });
    }

    return {
      ok: false,
      status: "pending",
      integrationEventId: eventId,
      attempts,
      error: errorMessage,
    };
  }

  /**
   * Fetches pending events ready for retry, ordered by oldest first.
   */
  async listPending(limit = 25) {
    return this.db.integrationEvent.findMany({
      where: {
        event_type: "pagacuotas.client.from-crm",
        status: IntegrationEventStatus.PENDING,
        sistema_externo: { codigo: EXTERNAL_SYSTEM_CODES.PAGACUOTAS },
      },
      orderBy: { created_at: "asc" },
      take: limit,
    });
  }

  private buildPortalLoginUrl(identifier: string) {
    return `${PAGACUOTAS_PORTAL_URL}/client/login?identifier=${encodeURIComponent(identifier)}`;
  }

  private getAtInformaClient() {
    return this.atInformaClient ?? new AtInformaClient();
  }
}
