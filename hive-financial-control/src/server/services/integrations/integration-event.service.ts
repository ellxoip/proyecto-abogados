import {
  IntegrationEventStatus,
  Prisma,
  type IntegrationEvent,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ExternalSystemCode } from "./integration.constants";
import { ExternalReferenceService } from "./external-reference.service";

type DbLike = Prisma.TransactionClient | typeof prisma;

type CreateEventInput = {
  systemCode: ExternalSystemCode;
  eventType: string;
  externalEventId?: string;
  idempotencyKey: string;
  payload: Prisma.InputJsonValue;
};

type EnsureIdempotencyResult = {
  event: IntegrationEvent;
  duplicated: boolean;
};

export class IntegrationEventService {
  private readonly externalReferenceService: ExternalReferenceService;

  constructor(private readonly db: DbLike = prisma) {
    this.externalReferenceService = new ExternalReferenceService(db);
  }

  async createEvent(input: CreateEventInput): Promise<IntegrationEvent> {
    const systemId = await this.externalReferenceService.ensureSystem(input.systemCode);
    return this.db.integrationEvent.create({
      data: {
        sistema_externo_id: systemId,
        event_type: input.eventType,
        external_event_id: input.externalEventId,
        idempotency_key: input.idempotencyKey,
        payload: input.payload,
      },
    });
  }

  async markProcessed(eventId: number, resultPayload?: Prisma.InputJsonValue) {
    return this.db.integrationEvent.update({
      where: { id: eventId },
      data: {
        status: IntegrationEventStatus.PROCESSED,
        processed_at: new Date(),
        result_payload: resultPayload,
        error_message: null,
      },
    });
  }

  async markFailed(eventId: number, errorMessage: string) {
    return this.db.integrationEvent.update({
      where: { id: eventId },
      data: {
        status: IntegrationEventStatus.FAILED,
        error_message: errorMessage,
      },
    });
  }

  async ensureIdempotency(input: CreateEventInput): Promise<EnsureIdempotencyResult> {
    const existingByKey = await this.db.integrationEvent.findUnique({
      where: { idempotency_key: input.idempotencyKey },
    });

    if (existingByKey) {
      return { event: existingByKey, duplicated: true };
    }

    if (input.externalEventId) {
      const existingByExternal = await this.db.integrationEvent.findFirst({
        where: {
          event_type: input.eventType,
          external_event_id: input.externalEventId,
          sistema_externo: { codigo: input.systemCode },
        },
      });
      if (existingByExternal) {
        return { event: existingByExternal, duplicated: true };
      }
    }

    const created = await this.createEvent(input);
    return { event: created, duplicated: false };
  }
}
