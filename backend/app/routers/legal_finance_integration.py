"""
CRM ↔ Legal Finance Integration Router
──────────────────────────────────────
POST /api/webhooks/legal_finance  → receives callbacks FROM Legal Finance
                                    (payment_confirmed)
"""
import os
import json
import asyncio
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Header
from sqlalchemy import create_engine, text as sa_text
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..utils import hive_service as hs
from ..utils.pagacuotas_links import normalize_pagacuotas_portal_link
from .work_orders import sign_ot_pdf_token
from .at_informa_integration import _notify_team

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["legal_finance"])

LF_CALLBACK_SECRET = os.getenv("LF_CALLBACK_SECRET", "")

_CONTABLE_URL = os.getenv(
    "CONTABLE_DATABASE_URL",
    "postgresql://contable_user:CHANGE_ME@pg-produccion-do-user-35082994-0.m.db.ondigitalocean.com:25061/contable_pool?sslmode=require",
)

_PAGACUOTAS_DB_URL = os.getenv(
    "PAGACUOTAS_DATABASE_URL",
    "",
)


async def _broadcast_cobrador_sync(created: int = 0, updated: int = 1):
    try:
        from ..broadcaster import wa_broadcaster
        await wa_broadcaster.broadcast("cobrador_sync", {"created": created, "updated": updated})
    except Exception as e:
        logger.warning("[cobrador] broadcast failed: %s", e)


def _fetch_lf_contrato_totals(lf_contrato_id: int) -> dict | None:
    """Query LF DB for real payment totals. Returns None on any failure."""
    if not lf_contrato_id or "CHANGE_ME" in _CONTABLE_URL:
        return None
    try:
        engine = create_engine(_CONTABLE_URL, pool_pre_ping=True)
        with engine.connect() as conn:
            row = conn.execute(sa_text("""
                SELECT
                    ct.monto_ccto,
                    COALESCE(SUM(cu.monto_pagado) FILTER (WHERE cu.estado = 'PAGADA'), 0)
                        AS total_pagado,
                    MIN(cu.fecha_vencimiento) FILTER (WHERE cu.estado = 'PENDIENTE')
                        AS proxima_cuota_fecha,
                    MIN(cu.monto_actual) FILTER (
                        WHERE cu.estado = 'PENDIENTE'
                        AND cu.fecha_vencimiento = (
                            SELECT MIN(q.fecha_vencimiento) FROM "Cuota" q
                            WHERE q.contrato_id = ct.id AND q.estado = 'PENDIENTE'
                        )
                    ) AS proxima_cuota_monto
                FROM "Contrato" ct
                LEFT JOIN "Cuota" cu ON cu.contrato_id = ct.id
                WHERE ct.id = :cid
                GROUP BY ct.id, ct.monto_ccto
            """), {"cid": lf_contrato_id}).first()
        engine.dispose()
        if row:
            return dict(row._mapping)
    except Exception as e:
        logger.warning("[cobrador] LF fetch totals failed contrato=%s: %s", lf_contrato_id, e)
    return None


@router.post("/webhooks/legal_finance")
def legal_finance_webhook(
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    x_lf_callback_secret: str = Header(None, alias="x-lf-callback-secret"),
):
    """
    Receives event callbacks from Legal Finance (SIS.CONTABLE).

    Expected payload:
    {
      "event":       "payment_confirmed",
      "crmLeadId":   123,
      "contratoId":  456
    }
    """
    if LF_CALLBACK_SECRET and x_lf_callback_secret != LF_CALLBACK_SECRET:
        raise HTTPException(status_code=401, detail="Secret inválido")

    event       = payload.get("event")
    crm_lead_id = payload.get("crmLeadId")
    contrato_id = payload.get("contratoId")

    if not event or not crm_lead_id:
        raise HTTPException(status_code=400, detail="Faltan campos: event, crmLeadId")

    raw_id = int(crm_lead_id)

    # Negative IDs = cobrador leads (set when moving to pago_comprometido)
    if raw_id < 0:
        cobrador_lead = db.query(models.CobradorLead).filter(
            models.CobradorLead.id == abs(raw_id)
        ).first()
        if not cobrador_lead:
            raise HTTPException(status_code=404, detail="Cobrador lead no encontrado")
        if event == "payment_confirmed":
            _handle_cobrador_payment_confirmed(db, cobrador_lead, payload)
        db.commit()
        background_tasks.add_task(_broadcast_cobrador_sync, 0, 1)
        return {"ok": True, "cobradorLeadId": abs(raw_id), "event": event}

    lead = db.query(models.Lead).filter(models.Lead.id == raw_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead no encontrado")

    if event == "payment_confirmed":
        _handle_payment_confirmed(db, lead, contrato_id)
    elif event == "service_started":
        _handle_service_started(db, lead, contrato_id, payload)
    elif event in ("portal_credentials_ready", "pagacuotas_ready"):
        _handle_portal_credentials_ready(db, lead, payload)
    else:
        logger.warning("Unknown Legal Finance event: %s", event)
        raise HTTPException(status_code=400, detail=f"Evento desconocido: {event}")

    db.commit()
    return {"ok": True, "leadId": crm_lead_id, "event": event}


def _handle_cobrador_payment_confirmed(db: Session, cobrador_lead: models.CobradorLead, payload: dict):
    """Sync real payment totals from LF and move to 'pagado' only when saldo = 0."""
    lf_data = _fetch_lf_contrato_totals(cobrador_lead.lf_contrato_id)

    if lf_data:
        total_pagado = float(lf_data.get("total_pagado") or 0)
        cobrador_lead.monto_pagado = total_pagado
        cobrador_lead.lf_total_pagado = total_pagado
        pcf = lf_data.get("proxima_cuota_fecha")
        cobrador_lead.proxima_cuota_fecha = (
            pcf.isoformat() if pcf and hasattr(pcf, "isoformat") else str(pcf) if pcf else None
        )
        pm = lf_data.get("proxima_cuota_monto")
        cobrador_lead.proxima_cuota_monto = float(pm) if pm else None
    else:
        # Fallback: accumulate from webhook if LF DB unreachable
        monto_cuota = float(payload.get("montoPagado") or payload.get("amount") or 0)
        if monto_cuota > 0:
            cobrador_lead.monto_pagado = min(
                cobrador_lead.monto_pagado + monto_cuota,
                cobrador_lead.monto_deuda,
            )

    # Move to pagado ONLY when fully paid (saldo = 0)
    if cobrador_lead.monto_pagado >= cobrador_lead.monto_deuda:
        cobrador_lead.stage = "pagado"
        logger.info("[cobrador] Lead %s → pagado (totalmente pagado)", cobrador_lead.id)
    else:
        pct = 100 * cobrador_lead.monto_pagado / cobrador_lead.monto_deuda if cobrador_lead.monto_deuda else 0
        logger.info(
            "[cobrador] Lead %s pago parcial: %s / %s (%.1f%%)",
            cobrador_lead.id, cobrador_lead.monto_pagado, cobrador_lead.monto_deuda, pct,
        )


def _handle_payment_confirmed(db: Session, lead: models.Lead, contrato_id):
    """
    Called when Legal Finance confirms full payment for a contract linked to this lead.
    Moves lead to pagado_confirmado and marks PaymentVerification.
    """
    if lead.current_stage != "pago_comprometido":
        logger.info(
            "Lead %s is in stage %s — skipping payment_confirmed", lead.id, lead.current_stage
        )
        return

    old_stage = lead.current_stage
    lead.current_stage      = "pagado_confirmado"
    lead.at_informa_status  = "pago_verificado_lf"

    if contrato_id:
        lead.legal_finance_contrato_id = int(contrato_id)

    db.add(models.LeadHistory(
        lead_id    = lead.id,
        from_stage = old_stage,
        to_stage   = "pagado_confirmado",
        result     = "success",
        notes      = "[Legal Finance] Pago confirmado automáticamente desde SIS.CONTABLE.",
        created_by = lead.vendedor_id or lead.agendadora_id,
    ))

    pv = db.query(models.PaymentVerification).filter(
        models.PaymentVerification.lead_id == lead.id
    ).first()
    if pv:
        pv.status       = "pago_exitoso"
        pv.confirmed_at = datetime.now(timezone.utc)
        pv.notes        = "Confirmado automáticamente por Legal Finance (SIS.CONTABLE)"

    contact_name = lead.contact.name if lead.contact else "cliente"
    _notify_team(
        db, lead,
        f"Pago confirmado — {contact_name}",
        f"El pago de {contact_name} fue verificado en Hive Contable. Lead cerrado exitosamente.",
    )


def _handle_portal_credentials_ready(db: Session, lead: models.Lead, payload: dict):
    """
    Recibe credenciales del portal PagaCuotas generadas en SIS.CONTABLE.
    Actualiza pagacuotas_link y envía WhatsApp al cliente con RUT + clave + link de pago.

    Mismo RUT + clave sirven para Hive Service Control (portal del caso legal)
    una vez que se confirma el pago inicial. El cliente entra a ambos sistemas
    con la misma credencial.
    """
    # `identifier` es el nombre canónico del campo en el callback de
    # legal-finance (CrmClient.notifyPagaCuotasReady en hive-financial-control).
    # Aceptamos `rut` como alias por compatibilidad histórica.
    rut          = payload.get("identifier") or payload.get("rut") or ""
    password     = payload.get("password", "")
    payment_link = normalize_pagacuotas_portal_link(
        payload.get("paymentLink") or payload.get("autoLoginUrl") or ""
    )

    if payment_link:
        lead.pagacuotas_link = payment_link

    contact = lead.contact
    if not contact or not contact.phone:
        logger.warning("Lead %s sin teléfono — no se envió WhatsApp de credenciales", lead.id)
        return

    hive_portal_url = os.getenv("HIVE_SERVICE_PUBLIC_URL", "http://localhost:3001").rstrip("/")

    nombre = contact.name.split()[0] if contact.name else "cliente"
    message = (
        f"Hola {nombre}, aquí están tus credenciales:\n\n"
        f"👤 RUT: {rut}\n"
        f"🔑 Clave: {password}\n\n"
        f"🔗 Portal PagaCuotas:\n{payment_link}\n\n"
        f"🛡️ Portal del caso legal (una vez confirmado el pago):\n{hive_portal_url}/login\n"
        f"   → ingresa con tu RUT (o correo) y la misma clave.\n\n"
        f"Puedes cambiar tu clave cuando quieras desde cualquiera de los dos portales."
    )

    try:
        from .leads import _dispatch_payment_link_wa
        _dispatch_payment_link_wa(lead, contact, payment_link, db, custom_message=message)
    except Exception as exc:
        logger.warning("No se pudo enviar WhatsApp de credenciales al lead %s: %s", lead.id, exc)

    # ── Empuje a hive-service-control con OT ─────────────────────────────
    # Ahora que tenemos `password` desde fc/PagaCuotas, podemos crear el
    # caso + sembrar la OT en sc. Antes este push se intentaba al pasar
    # Pago Comprometido sin password y fallaba con 422.
    if rut and password:
        contrato_id = payload.get("contratoId")
        _push_case_with_ot_to_service_control(db, lead, rut, password, payment_link, contrato_id)


def _push_case_with_ot_to_service_control(
    db: Session,
    lead: models.Lead,
    rut: str,
    password: str,
    payment_link: str,
    contrato_id: int | None,
) -> None:
    contact = lead.contact
    area_name = lead.area.name if lead.area else "TRIBUTARIO"
    vendedor = lead.vendedor.name if lead.vendedor else None
    agendadora = lead.agendadora.name if lead.agendadora else None

    latest_ot = (
        db.query(models.WorkOrder)
        .filter(models.WorkOrder.lead_id == lead.id)
        .order_by(models.WorkOrder.created_at.desc())
        .first()
    )
    work_order_payload = None
    if latest_ot:
        try:
            fields = json.loads(latest_ot.fields_json or "{}")
        except Exception:
            fields = {}
        nexio_public_url = os.getenv("NEXIO_PUBLIC_URL", "http://localhost:8000").rstrip("/")
        ot_token = sign_ot_pdf_token(latest_ot.id)
        work_order_payload = {
            "id": latest_ot.id,
            "type": latest_ot.ot_type,
            "status": latest_ot.status,
            "is_copy": bool(latest_ot.is_copy),
            "created_at": latest_ot.created_at.isoformat() if latest_ot.created_at else None,
            "document_url": f"{nexio_public_url}/api/work-orders/public/{latest_ot.id}/pdf?token={ot_token}",
            "fields": fields,
        }

    try:
        result = asyncio.run(hs.push_pago_comprometido(
            crm_lead_id=lead.id,
            rut=rut,
            nombre=contact.name if contact else "Cliente",
            email=contact.email if contact else None,
            telefono=contact.phone if contact else None,
            password_plain=password,
            # Alineamos con la convención de fc (`SIS-{contratoId}`) para
            # que ambos lados upserten el mismo Case. Fallback al lead-id
            # si fc no envió contratoId en el webhook.
            case_code=f"SIS-{contrato_id}" if contrato_id else f"NEXIO-{lead.id}",
            service_category=area_name,
            honorarios=float(lead.honorarios or 0),
            cuota_inicial=float(lead.cuota_inicial or 0),
            num_cuotas=int(lead.num_cuotas or 1),
            monto_cuota=float(lead.monto_cuota or 0),
            vendedor=vendedor,
            agendadora=agendadora,
            work_order=work_order_payload,
            payment_link=payment_link,
        ))
        if result:
            lead.hive_service_case_id = result.get("caseId")
            lead.hive_service_status = "created"
            db.commit()
        logger.info("Hive Service notified (con OT): lead %s -> case %s", lead.id, result.get("caseId"))
    except Exception as exc:
        logger.warning("Hive Service push failed (non-critical) for lead %s: %s", lead.id, exc)
        try:
            lead.hive_service_status = "failed"
            db.commit()
        except Exception:
            pass


def _handle_service_started(db: Session, lead: models.Lead, contrato_id, payload: dict | None = None):
    """
    Called when Legal Finance activates the contract (AT.Informa case created).
    """
    if lead.current_stage not in ("pagado_confirmado", "pago_comprometido"):
        logger.info(
            "Lead %s is in stage %s — skipping service_started", lead.id, lead.current_stage
        )
        return

    lead.at_informa_status = "servicio_iniciado_lf"

    if contrato_id:
        lead.legal_finance_contrato_id = int(contrato_id)

    service_case_id = (payload or {}).get("serviceCaseId") or (payload or {}).get("caseId")
    if service_case_id:
        lead.hive_service_case_id = str(service_case_id)
    lead.hive_service_status = "created"

    db.add(models.LeadHistory(
        lead_id    = lead.id,
        from_stage = lead.current_stage,
        to_stage   = lead.current_stage,
        result     = "success",
        notes      = "[Hive Contable] Servicio iniciado. Caso creado en Hive Service Control.",
        created_by = lead.vendedor_id or lead.agendadora_id,
    ))

    contact_name = lead.contact.name if lead.contact else "cliente"
    _notify_team(
        db, lead,
        f"Servicio activo — {contact_name}",
        f"El caso de {contact_name} fue iniciado en Hive Service Control a través de Hive Contable.",
    )


# ── PagaCuotas integration ────────────────────────────────────────────────────

def _mark_pagacuotas_payment_synced(external_payment_id: str) -> None:
    """Mark a payment as CRM-synced in PagaCuotas DB so it stops retrying."""
    if not external_payment_id or not _PAGACUOTAS_DB_URL or "CHANGE_ME" in _PAGACUOTAS_DB_URL:
        return
    try:
        engine = create_engine(_PAGACUOTAS_DB_URL, pool_pre_ping=True)
        with engine.connect() as conn:
            conn.execute(sa_text("""
                UPDATE "Payment"
                SET crm_sync_status = 'synced', updated_at = NOW()
                WHERE external_payment_id = :pid
            """), {"pid": external_payment_id})
            conn.execute(sa_text("""
                UPDATE "IntegrationOutbox"
                SET status = 'sent', updated_at = NOW()
                WHERE payload_json->>'external_payment_id' = :pid
            """), {"pid": external_payment_id})
            conn.commit()
        engine.dispose()
    except Exception as e:
        logger.warning("[pagacuotas] mark_synced failed for %s: %s", external_payment_id, e)


def _apply_payment_to_cobrador_lead(
    db: Session,
    cobrador_lead: models.CobradorLead,
    lf_contrato_id: int,
    fallback_amount: float = 0,
) -> None:
    """Fetch real LF totals and apply to cobrador lead. Fallback to amount if LF unreachable."""
    lf_data = _fetch_lf_contrato_totals(lf_contrato_id)
    if lf_data:
        total_pagado = float(lf_data.get("total_pagado") or 0)
        cobrador_lead.monto_pagado = total_pagado
        cobrador_lead.lf_total_pagado = total_pagado
        pcf = lf_data.get("proxima_cuota_fecha")
        cobrador_lead.proxima_cuota_fecha = (
            pcf.isoformat() if pcf and hasattr(pcf, "isoformat") else str(pcf) if pcf else None
        )
        pm = lf_data.get("proxima_cuota_monto")
        cobrador_lead.proxima_cuota_monto = float(pm) if pm else None
        if cobrador_lead.stage != "pagado" and cobrador_lead.monto_deuda > 0 and total_pagado >= cobrador_lead.monto_deuda:
            cobrador_lead.stage = "pagado"
            logger.info("[pagacuotas] Lead %s → pagado (saldo=0)", cobrador_lead.id)
    elif fallback_amount > 0:
        cobrador_lead.monto_pagado = min(
            cobrador_lead.monto_pagado + fallback_amount, cobrador_lead.monto_deuda
        )


def process_pagacuotas_pending_payments(db: Session) -> int:
    """
    Poll PagaCuotas DB for confirmed payments with crm_sync_status pending/failed,
    apply them to cobrador leads, and mark them synced. Returns count processed.
    """
    if not _PAGACUOTAS_DB_URL or "CHANGE_ME" in _PAGACUOTAS_DB_URL:
        return 0
    try:
        pc_engine = create_engine(_PAGACUOTAS_DB_URL, pool_pre_ping=True)
        with pc_engine.connect() as conn:
            rows = conn.execute(sa_text("""
                SELECT id, external_payment_id, contrato_contable_id, amount
                FROM "Payment"
                WHERE crm_sync_status IN ('pending', 'failed')
                  AND status = 'confirmado'
                ORDER BY paid_at ASC
                LIMIT 50
            """)).fetchall()
        pc_engine.dispose()
    except Exception as e:
        logger.warning("[pagacuotas] fetch pending payments failed: %s", e)
        return 0

    processed = 0
    for row in rows:
        d = dict(row._mapping)
        external_id = d.get("external_payment_id")
        lf_contrato_id_str = d.get("contrato_contable_id")
        if not lf_contrato_id_str:
            _mark_pagacuotas_payment_synced(external_id)
            continue
        try:
            lf_contrato_id = int(lf_contrato_id_str)
        except (ValueError, TypeError):
            continue

        cobrador_lead = db.query(models.CobradorLead).filter(
            models.CobradorLead.lf_contrato_id == lf_contrato_id
        ).first()

        if not cobrador_lead:
            _mark_pagacuotas_payment_synced(external_id)
            continue

        _apply_payment_to_cobrador_lead(db, cobrador_lead, lf_contrato_id, float(d.get("amount") or 0))
        _mark_pagacuotas_payment_synced(external_id)
        processed += 1
        logger.info("[pagacuotas] Processed payment %s → lf_contrato %s", external_id, lf_contrato_id)

    if processed > 0:
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            logger.warning("[pagacuotas] commit failed: %s", e)
            return 0

    return processed


@router.post("/payments")
def pagacuotas_payment_webhook(
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Receives payment notifications from PagaCuotas (pagacuotas.hivelegaltech.cl).
    Called after MercadoPago confirms a payment.

    Payload fields: contrato_id, monto_pagado, external_payment_id, cliente_nombre, ...
    """
    contrato_id_raw = payload.get("contrato_id")
    external_id = payload.get("external_payment_id") or payload.get("payment_id")
    fallback_monto = float(payload.get("monto_pagado") or payload.get("amount") or 0)

    if not contrato_id_raw:
        raise HTTPException(status_code=400, detail="contrato_id requerido")

    try:
        lf_contrato_id = int(contrato_id_raw)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="contrato_id inválido")

    cobrador_lead = db.query(models.CobradorLead).filter(
        models.CobradorLead.lf_contrato_id == lf_contrato_id
    ).first()

    if not cobrador_lead:
        logger.info("[pagacuotas] No cobrador lead for lf_contrato_id=%s — ignoring", lf_contrato_id)
        if external_id:
            _mark_pagacuotas_payment_synced(external_id)
        return {"ok": True, "message": "no cobrador lead for this contrato"}

    _apply_payment_to_cobrador_lead(db, cobrador_lead, lf_contrato_id, fallback_monto)
    db.commit()

    if external_id:
        _mark_pagacuotas_payment_synced(external_id)

    background_tasks.add_task(_broadcast_cobrador_sync, 0, 1)
    logger.info("[pagacuotas] webhook OK: contrato=%s lead=%s", lf_contrato_id, cobrador_lead.id)
    return {"ok": True, "cobrador_lead_id": cobrador_lead.id}
