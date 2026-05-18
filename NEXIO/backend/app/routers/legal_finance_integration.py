"""
CRM ↔ Legal Finance Integration Router
──────────────────────────────────────
POST /api/webhooks/legal_finance  → receives callbacks FROM Legal Finance
                                    (payment_confirmed)
"""
import os
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
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
        _handle_service_started(db, lead, contrato_id)
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


def _handle_service_started(db: Session, lead: models.Lead, contrato_id):
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
