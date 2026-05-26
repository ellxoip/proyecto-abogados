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
from fastapi import APIRouter, Depends, HTTPException, Header
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


@router.post("/webhooks/legal_finance")
def legal_finance_webhook(
    payload: dict,
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

    lead = db.query(models.Lead).filter(models.Lead.id == int(crm_lead_id)).first()
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
        f"El pago de {contact_name} fue verificado en Legal Finance. Lead cerrado exitosamente.",
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
        notes      = "[Legal Finance] Servicio iniciado. Caso creado en AT.Informa.",
        created_by = lead.vendedor_id or lead.agendadora_id,
    ))

    contact_name = lead.contact.name if lead.contact else "cliente"
    _notify_team(
        db, lead,
        f"Servicio activo — {contact_name}",
        f"El caso de {contact_name} fue iniciado en AT.Informa a través de Legal Finance.",
    )
