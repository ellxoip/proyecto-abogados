import { ExternalEntityType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SYSTEM_NAMES,
  ExternalSystemCode,
} from "./integration.constants";

type DbLike = Prisma.TransactionClient | typeof prisma;

type UpsertReferenceInput = {
  systemCode: ExternalSystemCode;
  entityType: ExternalEntityType;
  entityId: number;
  externalId: string;
  externalSecondaryId?: string;
  metadata?: Prisma.InputJsonValue;
};

export class ExternalReferenceService {
  constructor(private readonly db: DbLike = prisma) {}

  async ensureSystem(
    systemCode: ExternalSystemCode,
    baseUrl?: string,
  ): Promise<number> {
    const system = await this.db.sistemaExterno.upsert({
      where: { codigo: systemCode },
      update: {
        nombre: DEFAULT_SYSTEM_NAMES[systemCode],
        ...(baseUrl ? { base_url: baseUrl } : {}),
      },
      create: {
        codigo: systemCode,
        nombre: DEFAULT_SYSTEM_NAMES[systemCode],
        base_url: baseUrl,
      },
    });
    return system.id;
  }

  async findByExternalId(
    systemCode: ExternalSystemCode,
    entityType: ExternalEntityType,
    externalId: string,
  ) {
    return this.db.externalReference.findFirst({
      where: {
        entity_type: entityType,
        external_id: externalId,
        sistema_externo: { codigo: systemCode },
      },
    });
  }

  async findByEntity(
    systemCode: ExternalSystemCode,
    entityType: ExternalEntityType,
    entityId: number,
  ) {
    return this.db.externalReference.findFirst({
      where: {
        entity_type: entityType,
        entity_id: entityId,
        sistema_externo: { codigo: systemCode },
      },
    });
  }

  async upsertReference(input: UpsertReferenceInput) {
    const systemId = await this.ensureSystem(input.systemCode);
    return this.db.externalReference.upsert({
      where: {
        sistema_externo_id_entity_type_external_id: {
          sistema_externo_id: systemId,
          entity_type: input.entityType,
          external_id: input.externalId,
        },
      },
      update: {
        entity_id: input.entityId,
        external_secondary_id: input.externalSecondaryId,
        metadata: input.metadata,
      },
      create: {
        sistema_externo_id: systemId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        external_id: input.externalId,
        external_secondary_id: input.externalSecondaryId,
        metadata: input.metadata,
      },
    });
  }
}
