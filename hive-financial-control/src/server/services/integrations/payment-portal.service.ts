import {
  EstadoContrato,
  EstadoCuota,
  ExternalEntityType,
  type PrismaClient,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { EXTERNAL_SYSTEM_CODES } from "./integration.constants";
import { ExternalReferenceService } from "./external-reference.service";
import { AtInformaClient } from "./at-informa.client";

type DbLike = PrismaClient;

const PORTAL_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePortalPassword() {
  return Array.from({ length: 6 }, () =>
    PORTAL_PASSWORD_ALPHABET[Math.floor(Math.random() * PORTAL_PASSWORD_ALPHABET.length)],
  ).join("");
}

/**
 * Devuelve las representaciones del mismo RUT chileno que pueden estar
 * guardadas en DB para que el lookup funcione viniendo de cualquier fuente:
 *   "15.879.421-3"  → ["15.879.421-3", "15879421-3", "158794213"]
 *   "17.110.050-K"  → ["17.110.050-K", "17110050-K", "17110050K",
 *                     "17.110.050-k", "17110050-k", "17110050k"]
 *
 * Incluye combinaciones de:
 *  - con/sin puntos
 *  - con/sin guión
 *  - dígito verificador K mayúsculo y minúsculo
 * porque FC usa `normalizeRut = rut.replace(/\./g,"").toLowerCase()` mientras
 * que PagaCuotas/NEXIO pueden enviarlo en cualquier formato.
 */
function rutVariants(input: string): string[] {
  const raw = input.trim();
  const clean = raw.replace(/[.\-]/g, "");
  if (!/^\d{1,8}[\dkK]$/.test(clean)) return [raw];
  const body = clean.slice(0, -1);
  const dvUpper = clean.slice(-1).toUpperCase();
  const dvLower = dvUpper.toLowerCase();
  const conPuntosBody = body
    .split("")
    .reverse()
    .reduce<string[]>((acc, ch, idx) => {
      if (idx > 0 && idx % 3 === 0) acc.push(".");
      acc.push(ch);
      return acc;
    }, [])
    .reverse()
    .join("");
  const set = new Set<string>([
    raw,
    `${conPuntosBody}-${dvUpper}`,
    `${conPuntosBody}-${dvLower}`,
    `${body}-${dvUpper}`,
    `${body}-${dvLower}`,
    `${body}${dvUpper}`,
    `${body}${dvLower}`,
  ]);
  return Array.from(set);
}

export class PaymentPortalService {
  private readonly externalReferenceService: ExternalReferenceService;

  constructor(private readonly db: DbLike = prisma) {
    this.externalReferenceService = new ExternalReferenceService(db);
  }

  async findClienteByIdentifier(identifier: string) {
    // Probar formato literal primero (más común).
    const byRut = await this.db.cliente.findUnique({
      where: { rut: identifier },
    });
    if (byRut) return byRut;

    // RUTs pueden venir desde PagaCuotas sin puntos ni guión ("158794213"),
    // sin puntos ("15879421-3") o formato chileno ("15.879.421-3"). Probamos
    // las variantes antes de caer a externalReference.
    const variants = rutVariants(identifier);
    for (const variant of variants) {
      if (variant === identifier) continue;
      const hit = await this.db.cliente.findUnique({ where: { rut: variant } });
      if (hit) return hit;
    }

    const ref = await this.db.externalReference.findFirst({
      where: {
        entity_type: ExternalEntityType.CLIENTE,
        external_id: identifier,
      },
    });

    if (!ref) return null;
    return this.db.cliente.findUnique({ where: { id: ref.entity_id } });
  }

  async findClienteByIdentifierOrId(identifier: string) {
    const byIdentifier = await this.findClienteByIdentifier(identifier);
    if (byIdentifier) return byIdentifier;

    const numericId = Number(identifier);
    if (!Number.isFinite(numericId)) return null;
    return this.db.cliente.findUnique({ where: { id: numericId } });
  }

  async resolveContratoId(contratoId: string) {
    const asNumber = Number(contratoId);
    if (Number.isFinite(asNumber)) {
      const byId = await this.db.contrato.findUnique({ where: { id: asNumber } });
      if (byId) return byId.id;
    }

    const ref = await this.externalReferenceService.findByExternalId(
      EXTERNAL_SYSTEM_CODES.PAGACUOTAS,
      ExternalEntityType.CONTRATO,
      contratoId,
    );
    if (ref) return ref.entity_id;

    const refAt = await this.externalReferenceService.findByExternalId(
      EXTERNAL_SYSTEM_CODES.AT_INFORMA,
      ExternalEntityType.CONTRATO,
      contratoId,
    );
    return refAt?.entity_id ?? null;
  }

  async getDeudasByIdentifier(identifier: string) {
    const cliente = await this.findClienteByIdentifierOrId(identifier);
    if (!cliente) {
      throw new Error("Cliente no encontrado.");
    }

    const contratos = await this.db.contrato.findMany({
      where: { cliente_id: cliente.id },
      include: {
        cuotas: {
          where: {
            cobrable: true,
            estado: {
              in: [EstadoCuota.PENDIENTE, EstadoCuota.PARCIAL, EstadoCuota.VENCIDA],
            },
          },
          orderBy: [{ fecha_vencimiento: "asc" }, { numero_cuota: "asc" }],
        },
      },
      orderBy: { id: "asc" },
    });

    const contratosConDeuda = contratos
      .map((contrato) => {
        const totalDeuda = contrato.cuotas.reduce(
          (acc, cuota) => acc + Number(cuota.saldo_pendiente),
          0,
        );
        return {
          contrato_id: contrato.id,
          tipo_servicio: contrato.tipo_servicio,
          estado: contrato.estado,
          total_deuda: totalDeuda,
          cuotas: contrato.cuotas.map((cuota) => ({
            cuota_id: cuota.id,
            numero_cuota: cuota.numero_cuota,
            fecha_vencimiento: cuota.fecha_vencimiento.toISOString().slice(0, 10),
            monto_actual: Number(cuota.monto_actual),
            saldo_pendiente: Number(cuota.saldo_pendiente),
            estado: cuota.estado,
          })),
        };
      })
      .filter((contrato) => contrato.total_deuda > 0);

    return {
      cliente: {
        id: cliente.id,
        rut: cliente.rut,
        nombre: cliente.nombre,
      },
      total_deuda: contratosConDeuda.reduce(
        (acc, contrato) => acc + contrato.total_deuda,
        0,
      ),
      contratos: contratosConDeuda,
    };
  }

  async ensurePortalCredentials(clienteId: number, opts: { force?: boolean } = {}) {
    const cliente = await this.db.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) throw new Error("Cliente no encontrado.");

    // Idempotent unless `force=true`. Previous behavior regenerated the
    // password on every call, which caused two bugs:
    //   1. Retry-sweep firings invalidated already-delivered credentials
    //      (cliente received WhatsApp clave X, retry-sweep then rotated to
    //      Y, every login with X failed).
    //   2. When the cliente had already rotated his password from the
    //      portal, a later retry-sweep stomped his chosen password back to
    //      a system-generated one.
    // Now: if a hash already exists we reuse it and return `password = null`
    // so callers know they cannot resend the clave (it's hashed, no
    // plaintext available). The downstream WhatsApp/email sync is skipped
    // upstream when passwordPlain is falsy.
    if (cliente.portal_password_hash && !opts.force) {
      return {
        password: null as string | null,
        cliente: {
          id: cliente.id,
          rut: cliente.rut,
          nombre: cliente.nombre,
          email: cliente.email,
          telefono: cliente.telefono,
        },
      };
    }

    const password = generatePortalPassword();
    const passwordHash = await bcrypt.hash(password, 10);

    const updated = await this.db.cliente.update({
      where: { id: cliente.id },
      data: {
        portal_password_hash: passwordHash,
        portal_password_updated_at: new Date(),
        portal_password_last_sent_at: new Date(),
      },
    });

    return {
      password,
      cliente: {
        id: updated.id,
        rut: updated.rut,
        nombre: updated.nombre,
        email: updated.email,
        telefono: updated.telefono,
      },
    };
  }

  async verifyPortalCredentials(identifier: string, password: string) {
    const cliente = await this.findClienteByIdentifierOrId(identifier);
    if (!cliente?.portal_password_hash) return null;

    const ok = await bcrypt.compare(password, cliente.portal_password_hash);
    if (!ok) return null;

    const debts = await this.getInternalDeudaSummary(cliente.rut);
    return {
      cliente: {
        id: cliente.id,
        rut: cliente.rut,
        nombre: cliente.nombre,
        email: cliente.email,
        telefono: cliente.telefono,
      },
      debts,
    };
  }

  async updatePortalPassword(identifier: string, currentPassword: string, newPassword: string) {
    const cliente = await this.findClienteByIdentifierOrId(identifier);
    if (!cliente?.portal_password_hash) return null;

    const ok = await bcrypt.compare(currentPassword, cliente.portal_password_hash);
    if (!ok) return null;

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.db.cliente.update({
      where: { id: cliente.id },
      data: {
        portal_password_hash: passwordHash,
        portal_password_updated_at: new Date(),
      },
    });

    await this.syncPasswordToServiceControl(cliente.rut, newPassword, "PagaCuotas");

    return { ok: true };
  }

  async setPortalPasswordFromAutoLogin(identifier: string, newPassword: string) {
    const cliente = await this.findClienteByIdentifierOrId(identifier);
    if (!cliente) return null;

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.db.cliente.update({
      where: { id: cliente.id },
      data: {
        portal_password_hash: passwordHash,
        portal_password_updated_at: new Date(),
      },
    });

    await this.syncPasswordToServiceControl(cliente.rut, newPassword, "PagaCuotas (auto-login)");

    return { ok: true };
  }

  /**
   * Propaga el cambio de contraseña hacia hive-service-control para que
   * el cliente pueda autenticarse en ambos portales con la misma clave.
   *
   * Falla suave: si sc no responde o el cliente aún no existe ahí (caso
   * no creado), registramos el incidente sin romper el flujo del cliente
   * en PagaCuotas. Una pasada posterior de `cases` POST o un cambio
   * futuro reintentará la sincronización.
   */
  private async syncPasswordToServiceControl(
    rut: string | null,
    passwordPlain: string,
    source: string,
  ): Promise<void> {
    if (!rut) {
      console.warn("[payment-portal] cliente sin RUT, omitiendo sync a service-control.");
      return;
    }
    if (!process.env.HIVE_SERVICE_URL || !process.env.HIVE_SERVICE_API_KEY) {
      console.warn(
        "[payment-portal] HIVE_SERVICE_URL/HIVE_SERVICE_API_KEY no configurados; cambio de clave no propagado a service-control.",
        { rut },
      );
      return;
    }

    try {
      const client = new AtInformaClient({
        baseUrl: process.env.HIVE_SERVICE_URL,
        token: process.env.HIVE_SERVICE_API_KEY,
      });
      await client.syncClientPassword({ rut, password_plain: passwordPlain, source });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("404")) {
        console.warn(
          "[payment-portal] cliente aún no existe en service-control; se sincronizará al crear el caso.",
          { rut },
        );
      } else {
        console.error("[payment-portal] sync a service-control falló.", { rut, error: message });
      }
    }
  }

  async getInternalDeudaSummary(identifier: string) {
    const cliente = await this.findClienteByIdentifierOrId(identifier);
    if (!cliente) throw new Error("Cliente no encontrado.");

    const contratos = await this.db.contrato.findMany({
      where: { cliente_id: cliente.id },
      include: {
        cuotas: {
          orderBy: [{ fecha_vencimiento: "asc" }, { numero_cuota: "asc" }],
        },
      },
      orderBy: { id: "asc" },
    });

    const activeStates = new Set<EstadoContrato>([
      EstadoContrato.ACTIVO,
      EstadoContrato.EN_MORA,
      EstadoContrato.REPACTADO,
      EstadoContrato.PENDING_INITIAL_PAYMENT,
    ]);
    const contratosActivos = contratos
      .filter((contrato) => activeStates.has(contrato.estado))
      .map((contrato) => ({
        id: contrato.id,
        tipo_servicio: contrato.tipo_servicio,
        estado: contrato.estado,
      }));

    const cuotas = contratos.flatMap((contrato) => contrato.cuotas);
    const pendingStates = new Set<EstadoCuota>([
      EstadoCuota.PENDIENTE,
      EstadoCuota.VENCIDA,
      EstadoCuota.PARCIAL,
    ]);
    const totalCuotas = cuotas.length;
    const cuotasPagadas = cuotas.filter((cuota) => cuota.estado === EstadoCuota.PAGADA).length;
    const cuotasPendientes = cuotas.filter((cuota) => pendingStates.has(cuota.estado)).length;
    const montoPendiente = cuotas.reduce(
      (acc, cuota) => acc + Number(cuota.saldo_pendiente),
      0,
    );
    const montoVencido = cuotas
      .filter((cuota) => cuota.estado === EstadoCuota.VENCIDA)
      .reduce((acc, cuota) => acc + Number(cuota.saldo_pendiente), 0);

    return {
      cliente: {
        id: cliente.id,
        rut: cliente.rut,
        nombre: cliente.nombre,
        email: cliente.email,
        telefono: cliente.telefono,
      },
      resumen_deuda: {
        total_cuotas: totalCuotas,
        cuotas_pagadas: cuotasPagadas,
        cuotas_pendientes: cuotasPendientes,
        monto_pendiente: montoPendiente,
        monto_vencido: montoVencido,
      },
      contratos_activos: contratosActivos,
      total_cuotas: totalCuotas,
      cuotas_pagadas: cuotasPagadas,
      cuotas_pendientes: cuotasPendientes,
      monto_pendiente: montoPendiente,
      monto_vencido: montoVencido,
    };
  }

  async getInternalContractInstallments(contratoId: string) {
    const internalId = await this.resolveContratoId(contratoId);
    if (!internalId) throw new Error("Contrato no encontrado.");

    const cuotas = await this.db.cuota.findMany({
      where: { contrato_id: internalId },
      orderBy: [{ numero_cuota: "asc" }, { fecha_vencimiento: "asc" }],
    });

    const payableStates = new Set<EstadoCuota>([
      EstadoCuota.PENDIENTE,
      EstadoCuota.VENCIDA,
      EstadoCuota.PARCIAL,
    ]);

    const mappedCuotas = cuotas.map((cuota) => ({
      id: cuota.id,
      numero: cuota.numero_cuota,
      monto: Number(cuota.monto_actual),
      monto_pagado: Number(cuota.monto_pagado),
      saldo: Number(cuota.saldo_pendiente),
      fecha_vencimiento: cuota.fecha_vencimiento.toISOString().slice(0, 10),
      estado: cuota.estado,
      pagable: cuota.cobrable && payableStates.has(cuota.estado),
    }));

    const totalCuotas = mappedCuotas.length;
    const cuotasPagadas = mappedCuotas.filter((c) => c.estado === EstadoCuota.PAGADA).length;
    const montoTotal = mappedCuotas.reduce((acc, c) => acc + c.monto, 0);
    const montoPagado = mappedCuotas.reduce((acc, c) => acc + c.monto_pagado, 0);
    const saldoPendiente = mappedCuotas.reduce((acc, c) => acc + c.saldo, 0);

    return {
      cuotas: mappedCuotas,
      resumen: {
        total_cuotas: totalCuotas,
        cuotas_pagadas: cuotasPagadas,
        cuotas_pendientes: totalCuotas - cuotasPagadas,
        cuotas_vencidas: mappedCuotas.filter((c) => c.estado === EstadoCuota.VENCIDA).length,
        monto_total: montoTotal,
        monto_pagado: montoPagado,
        saldo_pendiente: saldoPendiente,
      },
    };
  }

  async getCuotasByContrato(contratoId: string) {
    const internalId = await this.resolveContratoId(contratoId);
    if (!internalId) throw new Error("Contrato no encontrado.");

    const contrato = await this.db.contrato.findUnique({
      where: { id: internalId },
      include: {
        cuotas: {
          orderBy: [{ numero_cuota: "asc" }, { fecha_vencimiento: "asc" }],
        },
      },
    });
    if (!contrato) throw new Error("Contrato no encontrado.");

    const externalRef = await this.externalReferenceService.findByEntity(
      EXTERNAL_SYSTEM_CODES.AT_INFORMA,
      ExternalEntityType.CONTRATO,
      contrato.id,
    );
    const totalPagado = contrato.cuotas.reduce(
      (acc, cuota) => acc + Number(cuota.monto_pagado),
      0,
    );
    const saldoPendiente = contrato.cuotas.reduce(
      (acc, cuota) => acc + Number(cuota.saldo_pendiente),
      0,
    );
    const saldoVencido = contrato.cuotas
      .filter((cuota) => cuota.estado === EstadoCuota.VENCIDA)
      .reduce((acc, cuota) => acc + Number(cuota.saldo_pendiente), 0);

    const canPay = (estado: EstadoCuota, cobrable: boolean) =>
      cobrable &&
      (estado === EstadoCuota.PENDIENTE ||
        estado === EstadoCuota.VENCIDA ||
        estado === EstadoCuota.PARCIAL);

    return {
      contrato: {
        id: contrato.id,
        codigo_interno: `C-${String(contrato.id).padStart(4, "0")}`,
        codigo_externo: externalRef?.external_id ?? contrato.external_id ?? null,
        estado: contrato.estado.toLowerCase(),
        monto_total: Number(contrato.monto_ccto),
        total_pagado: totalPagado,
        saldo_pendiente: saldoPendiente,
        saldo_vencido: saldoVencido,
      },
      cuotas: contrato.cuotas.map((cuota) => ({
        id: cuota.id,
        numero_cuota: cuota.numero_cuota,
        fecha_vencimiento: cuota.fecha_vencimiento.toISOString().slice(0, 10),
        monto_original: Number(cuota.monto_original),
        monto_actual: Number(cuota.monto_actual),
        monto_pagado: Number(cuota.monto_pagado),
        saldo_pendiente: Number(cuota.saldo_pendiente),
        estado: cuota.estado.toLowerCase(),
        puede_pagar: canPay(cuota.estado, cuota.cobrable),
      })),
    };
  }
}
