from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_
from typing import List, Optional
from datetime import datetime, timezone
import asyncio
import logging
import json
import os
import httpx
from ..database import get_db
from .. import models, schemas
from ..auth import get_current_user, get_visible_group_ids
from ..plans import enforce_limit, _get_negocio
from ..utils.notifications import create_notification
from ..utils import at_informa as ati
from ..utils import legal_finance as lf
from ..utils import pagacuotas as pc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/leads", tags=["leads"])

STAGE_FLOW = {
    "lead":                          {"success": "reunion",             "failed": "recuperacion_lead"},
    "reunion":                       {"success": "altamente_interesado","failed": "recuperacion_reunion"},
    "altamente_interesado":          {"success": "cierre",              "failed": "recuperacion_reunion"},
    "cierre":                        {"success": "pago_comprometido",   "failed": "recuperacion_cierre"},
    "pago_comprometido":             {"success": "pagado_confirmado",   "failed": "recuperacion_pago"},
    "pagado_confirmado":             {"success": "pagado_confirmado",   "failed": "recuperacion_cierre"},
    "recuperacion_lead":             {"success": "reunion",             "failed": "recuperacion_lead"},
    "recuperacion_reunion":          {"success": "altamente_interesado","failed": "recuperacion_reunion"},
    "recuperacion_cierre":           {"success": "pago_comprometido",   "failed": "recuperacion_cierre"},
    "recuperacion_pago":             {"success": "pago_comprometido",   "failed": "recuperacion_pago"},
}


def _visible_leads(q, current_user, db=None):
    if current_user.role == "verificador":
        return q.filter(models.Lead.current_stage.in_([
            "cierre", "pago_comprometido", "pagado_confirmado", "recuperacion_cierre", "recuperacion_pago",
        ]))
    if current_user.role == "agendadora":
        return q.filter(models.Lead.agendadora_id == current_user.id)
    if current_user.role == "vendedor":
        return q.filter(models.Lead.vendedor_id == current_user.id)
    # superadmin, subadmin, tecnico — scope to their negocio
    if db is not None:
        gids = get_visible_group_ids(db, current_user)
        if gids is not None:
            q = q.filter(models.Lead.group_id.in_(gids))
    return q


@router.get("", response_model=List[schemas.LeadOut])
def list_leads(
    stage: Optional[str] = None,
    group_id: Optional[int] = None,
    area_id: Optional[int] = None,
    agendadora_id: Optional[int] = None,
    vendedor_id: Optional[int] = None,
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    q = db.query(models.Lead).options(
        joinedload(models.Lead.contact),
        joinedload(models.Lead.agendadora),
        joinedload(models.Lead.vendedor),
        joinedload(models.Lead.area).joinedload(models.Area.phone_configs),
        joinedload(models.Lead.group),
        joinedload(models.Lead.payment_verification),
    )
    q = _visible_leads(q, current_user, db)
    if stage:
        q = q.filter(models.Lead.current_stage == stage)
    if group_id:
        q = q.filter(models.Lead.group_id == group_id)
    if area_id:
        q = q.filter(models.Lead.area_id == area_id)
    if agendadora_id:
        q = q.filter(models.Lead.agendadora_id == agendadora_id)
    if vendedor_id:
        q = q.filter(models.Lead.vendedor_id == vendedor_id)
    if search:
        from sqlalchemy import or_
        from ..models import Contact
        q = q.join(models.Lead.contact).filter(
            or_(
                Contact.name.ilike(f"%{search}%"),
                Contact.phone.ilike(f"%{search}%"),
                Contact.rut_persona.ilike(f"%{search}%"),
            )
        )
    limit = min(limit, 500)
    leads = q.order_by(models.Lead.updated_at.desc(), models.Lead.created_at.desc()).offset(offset).limit(limit).all()
    
    # Calculate unread counts dynamically for these leads
    lead_ids = [l.id for l in leads]
    if lead_ids:
        from sqlalchemy import func
        unread_counts = db.query(
            models.WhatsAppMessage.lead_id, 
            func.count(models.WhatsAppMessage.id)
        ).filter(
            models.WhatsAppMessage.lead_id.in_(lead_ids),
            models.WhatsAppMessage.direction == "in",
            models.WhatsAppMessage.is_read == False
        ).group_by(models.WhatsAppMessage.lead_id).all()
        
        count_map = {row[0]: row[1] for row in unread_counts}
        for l in leads:
            l.unread_count = count_map.get(l.id, 0)

        # Bulk: which leads have a reunion scheduled
        reunion_ids = set(
            r[0] for r in db.query(models.CalendarEvent.lead_id).filter(
                models.CalendarEvent.lead_id.in_(lead_ids),
                models.CalendarEvent.event_type == "reunion",
            ).distinct().all()
            if r[0] is not None
        )
        for l in leads:
            l.has_reunion_scheduled = l.id in reunion_ids
    else:
        for l in leads:
            l.unread_count = 0
            l.has_reunion_scheduled = False

    return leads


@router.get("/count")
def count_leads(
    stage: Optional[str] = None,
    group_id: Optional[int] = None,
    area_id: Optional[int] = None,
    agendadora_id: Optional[int] = None,
    vendedor_id: Optional[int] = None,
    search: Optional[str] = None,
    exclude_ai: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    q = db.query(func.count(models.Lead.id))
    q = _visible_leads(q, current_user, db)
    if stage:
        q = q.filter(models.Lead.current_stage == stage)
    if group_id:
        q = q.filter(models.Lead.group_id == group_id)
    if area_id:
        q = q.filter(models.Lead.area_id == area_id)
    if agendadora_id:
        q = q.filter(models.Lead.agendadora_id == agendadora_id)
    if vendedor_id:
        q = q.filter(models.Lead.vendedor_id == vendedor_id)
    if exclude_ai:
        q = q.filter(models.Lead.ai_agent_id.is_(None))
    if search:
        from sqlalchemy import or_
        from ..models import Contact
        q = q.join(models.Lead.contact).filter(
            or_(
                Contact.name.ilike(f"%{search}%"),
                Contact.phone.ilike(f"%{search}%"),
                Contact.rut_persona.ilike(f"%{search}%"),
            )
        )
    return {"total": q.scalar()}


PIPELINE_STAGES = [
    "lead", "reunion", "altamente_interesado", "cierre",
    "pago_comprometido", "pagado_confirmado",
    "recuperacion_lead", "recuperacion_reunion", "recuperacion_cierre", "recuperacion_pago",
]
PIPELINE_COL_LIMIT = 10


@router.get("/agent-queue")
def agent_queue(
    group_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Leads auto-created by AI agents that need agendadora attention."""
    q = db.query(models.Lead).options(
        joinedload(models.Lead.contact),
        joinedload(models.Lead.agendadora),
        joinedload(models.Lead.vendedor),
        joinedload(models.Lead.area),
        joinedload(models.Lead.group),
    ).filter(
        models.Lead.ai_agent_id.isnot(None),
        models.Lead.current_stage == 'lead',
    )
    q = _visible_leads(q, current_user, db)
    if group_id:
        q = q.filter(models.Lead.group_id == group_id)
    leads = q.order_by(models.Lead.created_at.desc()).limit(50).all()
    for l in leads:
        l.unread_count = 0
    return {
        "count": q.count(),
        "leads": [schemas.LeadOut.model_validate(l) for l in leads],
    }


@router.patch("/{lead_id}/dismiss-agent")
def dismiss_agent(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Mark an AI-handled lead as attended — removes it from the agent queue."""
    lead = db.query(models.Lead).filter(models.Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead no encontrado")
    lead.ai_agent_id = None
    db.commit()
    return {"ok": True}


@router.get("/pipeline-summary")
def pipeline_summary(
    group_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Return per-stage counts + top PIPELINE_COL_LIMIT leads per stage for the Kanban board."""
    result = {}
    # Collect all lead ids we'll fetch so we can bulk-query unread counts
    all_leads = []

    for stage in PIPELINE_STAGES:
        q = db.query(models.Lead).options(
            joinedload(models.Lead.contact),
            joinedload(models.Lead.agendadora),
            joinedload(models.Lead.vendedor),
            joinedload(models.Lead.area).joinedload(models.Area.phone_configs),
            joinedload(models.Lead.group),
            joinedload(models.Lead.payment_verification),
        )
        q = _visible_leads(q, current_user, db)
        q = q.filter(models.Lead.current_stage == stage)
        if group_id:
            q = q.filter(models.Lead.group_id == group_id)
        # sin_exito leads are hidden from the kanban — they only appear in Seguimiento
        if stage == "reunion":
            q = q.filter(
                (models.Lead.last_vendor_outcome == None) |
                (models.Lead.last_vendor_outcome != "sin_exito")
            )
        q = q.order_by(models.Lead.updated_at.desc(), models.Lead.created_at.desc())

        count = q.count()
        leads = q.limit(PIPELINE_COL_LIMIT).all()
        all_leads.extend(leads)
        result[stage] = {"count": count, "leads": leads}

    # Bulk unread counts
    lead_ids = [l.id for l in all_leads]
    if lead_ids:
        unread_rows = db.query(
            models.WhatsAppMessage.lead_id,
            func.count(models.WhatsAppMessage.id)
        ).filter(
            models.WhatsAppMessage.lead_id.in_(lead_ids),
            models.WhatsAppMessage.direction == "in",
            models.WhatsAppMessage.is_read == False,
        ).group_by(models.WhatsAppMessage.lead_id).all()
        count_map = {r[0]: r[1] for r in unread_rows}
        for l in all_leads:
            l.unread_count = count_map.get(l.id, 0)

    # Bulk: which leads have at least one reunion calendar event scheduled
    if lead_ids:
        reunion_lead_ids = set(
            r[0] for r in db.query(models.CalendarEvent.lead_id).filter(
                models.CalendarEvent.lead_id.in_(lead_ids),
                models.CalendarEvent.event_type == "reunion",
            ).distinct().all()
            if r[0] is not None
        )
        for l in all_leads:
            l.has_reunion_scheduled = l.id in reunion_lead_ids

    # Serialize (can't return ORM objects directly when mixed with dicts)
    from ..schemas import LeadOut
    return {
        stage: {
            "count": data["count"],
            "leads": [LeadOut.model_validate(l) for l in data["leads"]],
        }
        for stage, data in result.items()
    }


@router.post("", response_model=schemas.LeadOut)
def create_lead(
    data: schemas.LeadCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Plan limit: count active (non-cerrado) leads in the negocio
    negocio = _get_negocio(db, data.group_id)
    if negocio:
        all_group_ids_q = db.query(models.Group.id).filter(
            (models.Group.id == negocio.id) | (models.Group.negocio_id == negocio.id)
        ).subquery()
        active_count = db.query(models.Lead).filter(
            models.Lead.group_id.in_(all_group_ids_q),
            models.Lead.current_stage != "cerrado",
        ).count()
        enforce_limit(db, data.group_id, "max_leads", active_count)

    lead = models.Lead(**data.model_dump(), current_stage="lead")
    db.add(lead)
    db.flush()
    history = models.LeadHistory(
        lead_id=lead.id,
        from_stage=None,
        to_stage="lead",
        result="pending",
        notes="Lead creado",
        created_by=current_user.id,
    )
    db.add(history)
    db.commit()
    db.refresh(lead)

    # Reload with relations for notifications
    full_lead = db.query(models.Lead).options(
        joinedload(models.Lead.contact),
        joinedload(models.Lead.agendadora),
        joinedload(models.Lead.vendedor),
        joinedload(models.Lead.area).joinedload(models.Area.phone_configs),
        joinedload(models.Lead.group),
        joinedload(models.Lead.payment_verification),
    ).filter(models.Lead.id == lead.id).first()

    contact_name = full_lead.contact.name if full_lead.contact else "nuevo cliente"
    area_name = full_lead.area.name if full_lead.area else ""

    # Notify agendadora (unless they created it themselves)
    if data.agendadora_id and data.agendadora_id != current_user.id:
        try:
            create_notification(
                db, data.agendadora_id,
                "Nuevo lead asignado",
                f"Se te asignó un nuevo lead: {contact_name} — Área: {area_name}",
                lead_id=lead.id,
                notification_type="lead_nuevo",
            )
            db.commit()
        except Exception:
            pass

    # Notify vendedor — only when NOT created manually by an agendadora
    # (agendadora manual leads notify the vendor only when a reunion is scheduled)
    if data.vendedor_id and data.vendedor_id != current_user.id and data.vendedor_id != data.agendadora_id \
            and current_user.role != "agendadora":
        try:
            create_notification(
                db, data.vendedor_id,
                "Nuevo lead en tu pipeline",
                f"Nuevo cliente: {contact_name} — Área: {area_name}",
                lead_id=lead.id,
                notification_type="lead_nuevo",
            )
            db.commit()
        except Exception:
            pass

    return full_lead


# ── EXPORT CSV ─────────────────────────────────────────────
@router.get("/export/csv")
def export_leads_csv(
    group_id: Optional[int] = None,
    stage: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    import csv, io
    from sqlalchemy import or_
    from sqlalchemy.orm import joinedload as jl

    q = db.query(models.Lead).options(
        jl(models.Lead.contact),
        jl(models.Lead.area),
        jl(models.Lead.group),
        jl(models.Lead.agendadora),
        jl(models.Lead.vendedor),
    )

    if current_user.role == "agendadora":
        q = q.filter(models.Lead.agendadora_id == current_user.id)
    elif current_user.role == "vendedor":
        q = q.filter(models.Lead.vendedor_id == current_user.id)
    elif current_user.role == "verificador":
        q = q.filter(models.Lead.current_stage.in_(
            ["cierre", "pago_comprometido", "pagado_confirmado", "recuperacion_cierre", "recuperacion_pago"]
        ))
    else:
        # superadmin, subadmin, tecnico — scope to their negocio
        gids = get_visible_group_ids(db, current_user)
        if gids is not None:
            q = q.filter(models.Lead.group_id.in_(gids))
        elif group_id:  # tecnico filtering by specific group
            q = q.filter(models.Lead.group_id == group_id)

    if stage:
        q = q.filter(models.Lead.current_stage == stage)

    if search:
        q = q.join(models.Contact, models.Lead.contact_id == models.Contact.id, isouter=True).filter(
            or_(
                models.Contact.name.ilike(f"%{search}%"),
                models.Contact.phone.ilike(f"%{search}%"),
                models.Contact.rut_persona.ilike(f"%{search}%"),
            )
        )

    leads = q.order_by(models.Lead.updated_at.desc().nullslast()).all()

    STAGE_LABELS_ES = {
        "lead": "Lead",
        "reunion": "Reunión",
        "altamente_interesado": "Altamente Interesado",
        "cierre": "Cierre",
        "pago_comprometido": "Pago Comprometido",
        "pagado_confirmado": "Pago Confirmado",
        "recuperacion_lead": "Recuperación Lead",
        "recuperacion_reunion": "Recuperación Reunión",
        "recuperacion_cierre": "Recuperación Cierre",
        "recuperacion_pago": "Recuperación Pago",
    }

    now = datetime.now()
    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")

    writer.writerow([
        "Nombre", "Teléfono", "Correo", "RUT", "Empresa",
        "Grupo", "Área", "Etapa", "Honorarios ($)",
        "Días sin actividad", "Prioridad",
        "Agendador/a", "Vendedor", "Fecha creación",
    ])

    for lead in leads:
        c = lead.contact
        updated = lead.updated_at or lead.created_at
        days_since = max(0, (now - updated.replace(tzinfo=None)).days) if updated else 0
        writer.writerow([
            c.name if c else "",
            c.phone if c else "",
            c.email if c else "",
            c.rut_persona if c else "",
            c.razon_social if c else "",
            lead.group.name if lead.group else "",
            lead.area.name if lead.area else "",
            STAGE_LABELS_ES.get(lead.current_stage, lead.current_stage),
            f"{lead.honorarios:,.0f}".replace(",", ".") if lead.honorarios else "0",
            days_since,
            {"low": "Baja", "normal": "Normal", "high": "Alta"}.get(lead.priority or "", "Normal"),
            lead.agendadora.name if lead.agendadora else "",
            lead.vendedor.name if lead.vendedor else "",
            lead.created_at.strftime("%d/%m/%Y") if lead.created_at else "",
        ])

    # BOM for Excel UTF-8
    content = "﻿" + output.getvalue()
    filename = f"clientes_{now.strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _check_lead_access(lead: models.Lead, current_user: models.User, db=None):
    """Verify the current user is allowed to read/write this specific lead."""
    if current_user.role == "tecnico":
        return
    if current_user.role in ("superadmin", "subadmin"):
        if db is not None:
            gids = get_visible_group_ids(db, current_user)
            if gids is not None and lead.group_id not in gids:
                raise HTTPException(status_code=403, detail="Sin permiso para este lead")
        elif current_user.group_id and lead.group_id != current_user.group_id:
            raise HTTPException(status_code=403, detail="Sin permiso para este lead")
        return
    if current_user.role == "verificador":
        allowed = {"cierre", "pago_comprometido", "pagado_confirmado", "recuperacion_cierre", "recuperacion_pago"}
        if lead.current_stage not in allowed:
            raise HTTPException(status_code=403, detail="Sin permiso para este lead")
        return
    if current_user.role in ("agendadora", "vendedor"):
        if lead.agendadora_id != current_user.id and lead.vendedor_id != current_user.id:
            raise HTTPException(status_code=403, detail="Sin permiso para este lead")
        return
    raise HTTPException(status_code=403, detail="Sin permiso para este lead")


@router.get("/{lead_id}", response_model=schemas.LeadOut)
def get_lead(lead_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    lead = db.query(models.Lead).options(
        joinedload(models.Lead.contact),
        joinedload(models.Lead.agendadora),
        joinedload(models.Lead.vendedor),
        joinedload(models.Lead.area).joinedload(models.Area.phone_configs),
        joinedload(models.Lead.group),
        joinedload(models.Lead.payment_verification),
    ).filter(models.Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead no encontrado")
    _check_lead_access(lead, current_user, db)
    lead.has_reunion_scheduled = db.query(models.CalendarEvent).filter(
        models.CalendarEvent.lead_id == lead_id,
        models.CalendarEvent.event_type == "reunion",
    ).count() > 0
    return lead


@router.put("/{lead_id}", response_model=schemas.LeadOut)
def update_lead(
    lead_id: int,
    data: schemas.LeadUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    lead = db.query(models.Lead).filter(models.Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead no encontrado")
    _check_lead_access(lead, current_user, db)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(lead, field, value)
    db.commit()
    db.refresh(lead)
    return db.query(models.Lead).options(
        joinedload(models.Lead.contact),
        joinedload(models.Lead.agendadora),
        joinedload(models.Lead.vendedor),
        joinedload(models.Lead.area).joinedload(models.Area.phone_configs),
        joinedload(models.Lead.group),
        joinedload(models.Lead.payment_verification),
    ).filter(models.Lead.id == lead_id).first()


def _dispatch_payment_link_wa(lead: models.Lead, contact: models.Contact, payment_link: str, db, custom_message: str | None = None):
    """Send the PagaCuotas payment link to the client via WhatsApp (best-effort)."""
    try:
        from sqlalchemy.orm import joinedload as _jl

        # Find active WA config for this lead's area/group
        cfg = None
        area_with_cfg = db.query(models.Area).options(
            _jl(models.Area.phone_configs)
        ).filter(models.Area.id == lead.area_id).first()
        if area_with_cfg and area_with_cfg.phone_configs:
            cfg = next((c for c in area_with_cfg.phone_configs if c.is_active), None)

        if not cfg and lead.group_id:
            cfg = db.query(models.WhatsAppConfig).filter(
                models.WhatsAppConfig.group_id == lead.group_id,
                models.WhatsAppConfig.is_active == True,
            ).first()

        # Last resort: any active config in the system
        if not cfg:
            cfg = db.query(models.WhatsAppConfig).filter(
                models.WhatsAppConfig.is_active == True,
            ).first()

        if not cfg:
            logger.warning("No hay ninguna config WA activa — no se envió el link de pago al lead %s", lead.id)
            return

        if custom_message:
            message = custom_message
        else:
            nombre = contact.name.split()[0] if contact.name else "estimado cliente"
            monto = int(lead.monto_cuota or lead.cuota_inicial or lead.honorarios or 0)
            message = (
                f"Hola {nombre}, tu acuerdo de pago en Abogados Tributarios fue registrado exitosamente. ✅\n\n"
                f"💳 *Monto por cuota:* ${monto:,}\n"
                f"📋 *Cuotas:* {lead.num_cuotas or 1}\n\n"
                f"Usa este enlace personal para entrar a tu Portal PagaCuotas:\n"
                f"🔗 {payment_link}\n\n"
                f"_Este enlace es tuyo y puedes usarlo para revisar tu caso y pagar._\n"
                f"Saludos, Abogados Tributarios."
            ).replace(",", ".")

        from ..routers.whatsapp import send_whatsapp_api

        msg_result = asyncio.run(send_whatsapp_api(cfg, contact.phone, message))

        msg = models.WhatsAppMessage(
            contact_id=contact.id,
            lead_id=lead.id,
            whatsapp_config_id=cfg.id,
            direction="out",
            message_type="text",
            content=message,
            status=msg_result.get("status", "logged"),
            message_id=msg_result.get("message_id"),
        )
        db.add(msg)
        db.commit()
        logger.info("Link de pago enviado por WA a %s para lead %s", contact.phone, lead.id)
    except Exception as exc:
        logger.warning("No se pudo enviar link de pago WA para lead %s: %s", lead.id, exc)


def _get_negocio_tipo(lead: models.Lead, db) -> str:
    """Return the tipo of the lead's root negocio group."""
    if not lead.group_id or not db:
        return "abogados"
    g = db.query(models.Group).filter(models.Group.id == lead.group_id).first()
    if not g:
        return "abogados"
    root_id = g.negocio_id if g.negocio_id else g.id
    root = db.query(models.Group).filter(models.Group.id == root_id).first()
    return (root.tipo if root and root.tipo else "abogados")


def _fire_integrations(lead: models.Lead, new_stage: str, db=None):
    """Fire-and-forget: push stage transitions to AT Informa and Legal Finance."""
    # Only fire for abogados-type negocios
    if _get_negocio_tipo(lead, db) != "abogados":
        return

    contact    = lead.contact
    vendedor   = lead.vendedor
    agendadora = lead.agendadora
    area       = lead.area
    category   = area.name if area else "TRIBUTARIO"

    # ── AT Informa: reunion stage ─────────────────────────────────────────
    if new_stage == "reunion":
        try:
            # Look up the scheduled reunion event for meeting time
            meeting_at_iso = None
            meeting_duration = 60
            if db:
                event = (
                    db.query(models.CalendarEvent)
                    .filter(
                        models.CalendarEvent.lead_id == lead.id,
                        models.CalendarEvent.event_type == "reunion",
                        models.CalendarEvent.is_completed == False,
                    )
                    .order_by(models.CalendarEvent.start_time.desc())
                    .first()
                )
                if event:
                    meeting_at_iso = event.start_time.isoformat()
                    if event.end_time:
                        meeting_duration = max(15, int((event.end_time - event.start_time).total_seconds() / 60))

            result = asyncio.run(ati.push_reunion_lead(
                crm_lead_id      = lead.id,
                full_name        = contact.name if contact else "Cliente",
                email            = contact.email or f"lead_{lead.id}@crm.local",
                phone            = contact.phone if contact else "",
                category         = category,
                service_desc     = lead.service_description,
                honorarios       = lead.honorarios or 0,
                vendedor_email   = vendedor.email if vendedor else None,
                agendadora_name  = agendadora.name if agendadora else None,
                at_vendedor_id   = vendedor.at_informa_user_id if vendedor else None,
                meeting_at       = meeting_at_iso,
                meeting_duration = meeting_duration,
            ))
            # Store AT Informa lead/case ID on the lead for traceability
            at_id = result.get("leadId") or result.get("caseId")
            if db and at_id:
                lead.at_informa_case_id = at_id
                db.commit()
            logger.info("AT Informa notified: lead %s → reunion (at_id: %s)", lead.id, at_id)
        except Exception as exc:
            logger.warning("AT Informa push failed (non-critical) for lead %s: %s", lead.id, exc)

    # ── Legal Finance: pago_comprometido stage ───────────────────────────
    elif new_stage == "pago_comprometido":
        try:
            rut = (
                (contact.rut_persona or contact.rut_empresa) if contact else None
            ) or f"SIN-RUT-{lead.id}"

            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

            result = asyncio.run(lf.push_pago_comprometido(
                crm_lead_id   = lead.id,
                rut           = rut,
                nombre        = contact.name if contact else "Cliente",
                email         = contact.email if contact else None,
                phone         = contact.phone if contact else None,
                honorarios    = float(lead.honorarios or 0),
                cuota_inicial = _derive_cuota_inicial(lead),
                num_cuotas    = int(lead.num_cuotas or 1),
                tipo_servicio = lead.service_description or category,
                fecha_ingreso = today,
            ))
            # Store Legal Finance contract ID on the lead
            if db and result and result.get("contratoId"):
                lead.legal_finance_contrato_id = int(result["contratoId"])
                db.commit()
            logger.info(
                "Legal Finance notified: lead %s → pago_comprometido (contrato: %s)",
                lead.id, result.get("contratoId"),
            )
        except httpx.HTTPStatusError as exc:
            body_preview = ""
            try:
                body_preview = exc.response.text[:500]
            except Exception:
                pass
            logger.error(
                "Legal Finance push REJECTED for lead %s — HTTP %s: %s",
                lead.id, exc.response.status_code, body_preview,
            )
        except Exception as exc:
            logger.warning("Legal Finance push failed (non-critical) for lead %s: %s", lead.id, exc)

    # ── PagaCuotas: pago_comprometido stage ──────────────────────────────────
    if new_stage == "pago_comprometido":
        try:
            rut = (
                (contact.rut_persona or contact.rut_empresa) if contact else None
            ) or f"SIN-RUT-{lead.id}"

            area_name = lead.area.name if lead.area else "Sin categoría"
            vendedor_name = lead.vendedor.name if lead.vendedor else None

            result = asyncio.run(pc.crear_cliente(
                db            = db,
                crm_lead_id   = lead.id,
                rut           = rut,
                nombre        = contact.name if contact else "Cliente",
                razon_social  = getattr(contact, "razon_social", None) if contact else None,
                email         = contact.email if contact else None,
                phone         = contact.phone if contact else None,
                honorarios    = float(lead.honorarios or 0),
                cuota_inicial = float(lead.cuota_inicial or 0),
                num_cuotas    = int(lead.num_cuotas or 1),
                monto_cuota   = float(lead.monto_cuota or 0),
                tipo_servicio = lead.service_description or area_name,
                area_name     = area_name,
                vendedor_name = vendedor_name,
            ))
            if db:
                lead.pagacuotas_cliente_id = str(result.get("id", ""))
                lead.pagacuotas_status = "created"
                lead.pagacuotas_link = result.get("payment_link")
                db.commit()

            # Send payment link via WhatsApp — use message from pagaCuotas if available
            payment_link = result.get("payment_link")
            wa_info = result.get("whatsapp", {})
            if payment_link and contact and contact.phone:
                _dispatch_payment_link_wa(
                    lead, contact, payment_link, db,
                    custom_message=wa_info.get("message"),
                )

            logger.info(
                "PagaCuotas: cliente registrado para lead %s → %s",
                lead.id, payment_link,
            )
        except Exception as exc:
            logger.warning("PagaCuotas push failed (non-critical) for lead %s: %s", lead.id, exc)
            if db:
                lead.pagacuotas_status = "failed"
                db.commit()

        # Empuje a hive-service-control: movido a
        # `legal_finance_integration._handle_portal_credentials_ready`.
        # Necesita `password_plain` (que solo aparece cuando fc/PagaCuotas
        # generan las credenciales y NEXIO recibe el callback
        # `pagacuotas_ready`). Antes este push se intentaba acá sin
        # password y devolvía 422.


def _require_financials_for_pago_comprometido(lead: models.Lead) -> None:
    """
    Valida que el lead tenga los datos financieros necesarios antes de avanzar
    a Pago Comprometido. Se acepta puerta A (cuota_inicial) o puerta B (monto_cuota).
    """
    honorarios = float(lead.honorarios or 0)
    cuota_inicial = float(lead.cuota_inicial or 0)
    num_cuotas = int(lead.num_cuotas or 0)
    monto_cuota = float(lead.monto_cuota or 0)

    if honorarios <= 0:
        raise HTTPException(
            status_code=400,
            detail="Para pasar a Pago Comprometido el lead debe tener Total (honorarios) definido.",
        )
    if num_cuotas < 1:
        raise HTTPException(
            status_code=400,
            detail="Para pasar a Pago Comprometido el lead debe tener N° de cuotas (>= 1).",
        )
    if cuota_inicial > 0 or monto_cuota > 0:
        return
    raise HTTPException(
        status_code=400,
        detail=(
            "Para pasar a Pago Comprometido el lead necesita 'cuota inicial' "
            "O 'monto cuota'. Llena uno de los dos para que el sistema contable "
            "pueda crear el contrato."
        ),
    )


def _derive_cuota_inicial(lead: models.Lead) -> float:
    """
    Puerta A: cuota_inicial directa.
    Puerta B: deriva cuota_inicial como honorarios - num_cuotas * monto_cuota.
    """
    honorarios = float(lead.honorarios or 0)
    cuota_inicial = float(lead.cuota_inicial or 0)
    num_cuotas = int(lead.num_cuotas or 1)
    monto_cuota = float(lead.monto_cuota or 0)
    if cuota_inicial > 0:
        return cuota_inicial
    if monto_cuota > 0 and num_cuotas >= 1:
        derived = honorarios - (num_cuotas * monto_cuota)
        return max(0.0, round(derived, 2))
    return 0.0


@router.post("/{lead_id}/advance", response_model=schemas.LeadOut)
def advance_lead(
    lead_id: int,
    data: schemas.LeadStageUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    lead = db.query(models.Lead).options(
        joinedload(models.Lead.contact),
        joinedload(models.Lead.agendadora),
        joinedload(models.Lead.vendedor),
        joinedload(models.Lead.area).joinedload(models.Area.phone_configs),
        joinedload(models.Lead.group),
        joinedload(models.Lead.payment_verification),
    ).filter(models.Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead no encontrado")

    current = lead.current_stage
    if current not in STAGE_FLOW:
        raise HTTPException(status_code=400, detail=f"La etapa '{current}' no puede avanzar")

    new_stage = STAGE_FLOW[current].get(data.result)
    if not new_stage:
        raise HTTPException(status_code=400, detail="Resultado inválido")

    if new_stage == "pagado_confirmado" and current_user.role != "verificador":
        raise HTTPException(status_code=403, detail="Solo el Verificador de Pagos puede confirmar el pago")

    # ── RUT obligatorio para pasar a Cierre ──────────────────────────────────
    if new_stage == "cierre":
        contact = lead.contact
        rut = (contact.rut_persona or contact.rut_empresa) if contact else None
        if not rut or not rut.strip():
            raise HTTPException(
                status_code=400,
                detail="El cliente debe tener RUT registrado antes de pasar a Cierre. Sin RUT no se puede generar la Orden de Trabajo.",
            )

    if new_stage == "pago_comprometido":
        _require_financials_for_pago_comprometido(lead)

    old_stage = current
    lead.current_stage = new_stage

    history = models.LeadHistory(
        lead_id=lead.id,
        from_stage=old_stage,
        to_stage=new_stage,
        result=data.result,
        notes=data.notes,
        created_by=current_user.id,
    )
    db.add(history)

    # Si llegó a pago_comprometido → crear/resetear PaymentVerification y SIEMPRE notificar a Dante
    if new_stage == "pago_comprometido":
        dante_users = db.query(models.User).filter(
            models.User.role == "verificador",
            models.User.is_active == True
        ).all()
        dante_id = dante_users[0].id if dante_users else current_user.id
        existing_pv = db.query(models.PaymentVerification).filter(
            models.PaymentVerification.lead_id == lead_id
        ).first()
        if existing_pv:
            existing_pv.status = "pendiente"
            existing_pv.confirmed_at = None
        else:
            db.add(models.PaymentVerification(
                lead_id=lead_id,
                assigned_to=dante_id,
                status="pendiente"
            ))
        # Always notify Dante
        if dante_id:
            contact_name_pv = lead.contact.name if lead.contact else "cliente"
            create_notification(
                db, dante_id,
                "Pago comprometido — requiere verificación",
                f"El lead de {contact_name_pv} está en 'Pago Comprometido' y requiere confirmación.",
                lead_id=lead_id,
                notification_type="pago"
            )

    # Notify the other team member about the stage change
    contact_name = lead.contact.name if lead.contact else "cliente"
    stage_labels = {
        "reunion": "Reunión", "altamente_interesado": "Altamente Interesado",
        "cierre": "Cierre", "pago_comprometido": "Pago Comprometido",
        "pagado_confirmado": "Pago Confirmado",
        "recuperacion_lead": "Recuperación Lead", "recuperacion_reunion": "Recuperación Reunión",
        "recuperacion_cierre": "Recuperación Cierre", "recuperacion_pago": "Recuperación Pago",
    }
    new_label = stage_labels.get(new_stage, new_stage)
    if data.result == "success":
        # Notify both team members (except the one who made the change)
        for uid in {lead.agendadora_id, lead.vendedor_id} - {current_user.id, None}:
            try:
                create_notification(
                    db, uid,
                    f"Lead avanzó: {new_label}",
                    f"{current_user.name} avanzó a {contact_name} → {new_label}",
                    lead_id=lead_id,
                    notification_type="etapa",
                )
            except Exception:
                pass

    db.commit()
    db.refresh(lead)
    _fire_integrations(lead, new_stage, db)
    return db.query(models.Lead).options(
        joinedload(models.Lead.contact),
        joinedload(models.Lead.agendadora),
        joinedload(models.Lead.vendedor),
        joinedload(models.Lead.area).joinedload(models.Area.phone_configs),
        joinedload(models.Lead.group),
        joinedload(models.Lead.payment_verification),
    ).filter(models.Lead.id == lead_id).first()


@router.post("/{lead_id}/move-stage", response_model=schemas.LeadOut)
def move_lead_stage(
    lead_id: int,
    data: schemas.LeadMoveStage,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Manually move a lead to any stage."""
    valid_stages = [
        "lead", "reunion", "altamente_interesado", "cierre",
        "pago_comprometido", "pagado_confirmado",
        "recuperacion_lead", "recuperacion_reunion", "recuperacion_cierre", "recuperacion_pago",
    ]
    if data.stage not in valid_stages:
        raise HTTPException(status_code=400, detail="Etapa inválida")

    # Only dante can confirm payment
    if data.stage == "pagado_confirmado" and current_user.role != "verificador":
        raise HTTPException(status_code=403, detail="Solo el Verificador de Pagos puede confirmar el pago")

    # Dante can only move to pagado_confirmado
    if current_user.role == "verificador" and data.stage != "pagado_confirmado":
        raise HTTPException(status_code=403, detail="Sin permiso para esta etapa")

    lead = db.query(models.Lead).options(
        joinedload(models.Lead.contact)
    ).filter(models.Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead no encontrado")

    if current_user.role in ("agendadora", "vendedor"):
        if lead.agendadora_id != current_user.id and lead.vendedor_id != current_user.id:
            raise HTTPException(status_code=403, detail="Sin permiso para este lead")

    # Agendadoras cannot move to 'reunion' or any recuperación stage unless a reunion event exists
    if current_user.role == "agendadora" and (
        data.stage == "reunion" or data.stage.startswith("recuperacion")
    ):
        event_count = db.query(models.CalendarEvent).filter(
            models.CalendarEvent.lead_id == lead_id,
            models.CalendarEvent.event_type == "reunion",
        ).count()
        if event_count == 0:
            raise HTTPException(
                status_code=403,
                detail="Debes agendar una reunión para este lead antes de moverlo a Reunión o Recuperación"
            )

    # Agendadoras cannot advance a lead forward while it is in 'reunion' — only the vendor can
    if current_user.role == "agendadora" and lead.current_stage == "reunion":
        allowed_from_reunion = {"lead", "recuperacion_lead", "recuperacion_reunion", "recuperacion_cierre", "recuperacion_pago"}
        if data.stage not in allowed_from_reunion:
            raise HTTPException(
                status_code=403,
                detail="Solo el vendedor puede avanzar este lead desde Reunión"
            )

    # Agendadoras cannot move to pago_comprometido if the vendor hasn't created an OT
    if current_user.role == "agendadora" and data.stage == "pago_comprometido":
        ot_count = db.query(models.WorkOrder).filter(models.WorkOrder.lead_id == lead_id).count()
        if ot_count == 0:
            raise HTTPException(
                status_code=403,
                detail="El vendedor debe crear la Orden de Trabajo (OT) antes de mover a Pago Comprometido"
            )

    # ── RUT obligatorio para pasar a Cierre ──────────────────────────────────
    if data.stage == "cierre":
        contact = lead.contact
        rut = (contact.rut_persona or contact.rut_empresa) if contact else None
        if not rut or not rut.strip():
            raise HTTPException(
                status_code=400,
                detail="El cliente debe tener RUT registrado antes de pasar a Cierre. Sin RUT no se puede generar la Orden de Trabajo.",
            )

    if data.stage == "pago_comprometido":
        _require_financials_for_pago_comprometido(lead)

    old_stage = lead.current_stage
    lead.current_stage = data.stage

    db.add(models.LeadHistory(
        lead_id=lead.id,
        from_stage=old_stage,
        to_stage=data.stage,
        result="manual",
        notes=data.notes or "Movido manualmente",
        created_by=current_user.id,
    ))

    # Notify vendedor when lead reaches cierre with no OT — always, regardless of who moved it
    if data.stage == "cierre" and lead.vendedor_id:
        ot_count = db.query(models.WorkOrder).filter(models.WorkOrder.lead_id == lead_id).count()
        if ot_count == 0:
            contact_name_ot = lead.contact.name if lead.contact else "cliente"
            create_notification(
                db, lead.vendedor_id,
                "Lead en Cierre — OT requerida para avanzar",
                f"El lead de {contact_name_ot} está en Cierre y necesita una Orden de Trabajo antes de poder pasar a Pago Comprometido.",
                lead_id=lead_id,
                notification_type="etapa"
            )
    # Also notify when agendadora moves to altamente_interesado and no OT
    elif data.stage == "altamente_interesado":
        ot_count = db.query(models.WorkOrder).filter(models.WorkOrder.lead_id == lead_id).count()
        if ot_count == 0 and lead.vendedor_id and lead.vendedor_id != current_user.id:
            contact_name_ot = lead.contact.name if lead.contact else "cliente"
            create_notification(
                db, lead.vendedor_id,
                "OT pendiente — acción requerida",
                f"El lead de {contact_name_ot} está Altamente Interesado y aún no tiene Orden de Trabajo creada.",
                lead_id=lead_id,
                notification_type="etapa"
            )

    if data.stage == "pago_comprometido":
        dante_users = db.query(models.User).filter(
            models.User.role == "verificador",
            models.User.is_active == True
        ).all()
        dante_id = dante_users[0].id if dante_users else current_user.id
        existing_pv = db.query(models.PaymentVerification).filter(
            models.PaymentVerification.lead_id == lead_id
        ).first()
        if existing_pv:
            existing_pv.status = "pendiente"
            existing_pv.confirmed_at = None
        else:
            db.add(models.PaymentVerification(
                lead_id=lead_id,
                assigned_to=dante_id,
                status="pendiente"
            ))
        contact_name_mv = lead.contact.name if lead.contact else "cliente"
        # Always notify Dante
        if dante_id:
            create_notification(
                db, dante_id,
                "Pago comprometido — requiere verificación",
                f"El lead de {contact_name_mv} está en 'Pago Comprometido' y requiere confirmación.",
                lead_id=lead_id,
                notification_type="pago"
            )
        # Notify vendedor when agendadora moves to pago_comprometido
        if current_user.role == "agendadora" and lead.vendedor_id and lead.vendedor_id != current_user.id:
            create_notification(
                db, lead.vendedor_id,
                "Lead movido a Pago Comprometido",
                f"{current_user.name} movió el lead de {contact_name_mv} a Pago Comprometido.",
                lead_id=lead_id,
                notification_type="etapa"
            )

    if data.stage == "pagado_confirmado":
        existing = db.query(models.PaymentVerification).filter(
            models.PaymentVerification.lead_id == lead_id
        ).first()
        if existing:
            existing.status = "pago_exitoso"
            existing.confirmed_at = datetime.now(timezone.utc)
        else:
            db.add(models.PaymentVerification(
                lead_id=lead_id,
                assigned_to=current_user.id,
                status="pago_exitoso",
                confirmed_at=datetime.now(timezone.utc),
            ))

    db.commit()
    db.refresh(lead)
    _fire_integrations(lead, data.stage, db)
    return db.query(models.Lead).options(
        joinedload(models.Lead.contact),
        joinedload(models.Lead.agendadora),
        joinedload(models.Lead.vendedor),
        joinedload(models.Lead.area).joinedload(models.Area.phone_configs),
        joinedload(models.Lead.group),
        joinedload(models.Lead.payment_verification),
    ).filter(models.Lead.id == lead_id).first()


@router.get("/{lead_id}/history", response_model=List[schemas.LeadHistoryOut])
def lead_history(lead_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    lead = db.query(models.Lead).filter(models.Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead no encontrado")
    _check_lead_access(lead, current_user, db)
    return db.query(models.LeadHistory).options(
        joinedload(models.LeadHistory.creator)
    ).filter(models.LeadHistory.lead_id == lead_id).order_by(models.LeadHistory.created_at).all()


@router.delete("/{lead_id}")
def delete_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role not in ("superadmin", "subadmin", "tecnico"):
        raise HTTPException(status_code=403, detail="Sin permiso")
    lead = db.query(models.Lead).filter(models.Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead no encontrado")

    try:
        # Importación explícita para evitar que Pylance de VSCode marque errores visuales (falsos positivos)
        from ..models import (
            WhatsAppMessage, AIAgentLog, PagaCuotasCliente, Notification,
            CalendarEvent, PaymentVerification, WorkOrder, LeadHistory, Lead as LeadModel
        )

        # 1. Desvincular tablas donde lead_id puede ser nulo
        db.query(WhatsAppMessage).filter(WhatsAppMessage.lead_id == lead_id).update({"lead_id": None}, synchronize_session=False)
        db.query(AIAgentLog).filter(AIAgentLog.lead_id == lead_id).update({"lead_id": None}, synchronize_session=False)
        db.query(PagaCuotasCliente).filter(PagaCuotasCliente.crm_lead_id == lead_id).update({"crm_lead_id": None}, synchronize_session=False)

        # 2. Eliminar explícitamente entidades dependientes
        db.query(Notification).filter(Notification.lead_id == lead_id).delete(synchronize_session=False)
        db.query(CalendarEvent).filter(CalendarEvent.lead_id == lead_id).delete(synchronize_session=False)
        db.query(PaymentVerification).filter(PaymentVerification.lead_id == lead_id).delete(synchronize_session=False)
        db.query(WorkOrder).filter(WorkOrder.lead_id == lead_id).delete(synchronize_session=False)
        db.query(LeadHistory).filter(LeadHistory.lead_id == lead_id).delete(synchronize_session=False)

        # 3. Finalmente eliminar el lead
        db.query(LeadModel).filter(LeadModel.id == lead_id).delete(synchronize_session=False)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error interno de base de datos al eliminar: {str(e)}")

    return {"ok": True}


# ── DASHBOARD STATS ────────────────────────────────────────
@router.get("/stats/dashboard")
def dashboard_stats(
    group_id: Optional[int] = None,
    period: Optional[str] = None,  # "day" | "week" | "month" | "year"
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    from datetime import date, timedelta
    from sqlalchemy import or_
    from sqlalchemy.orm import joinedload as jl

    # Resolve tenant scope once for all sub-queries
    _gids = get_visible_group_ids(db, current_user)

    # ── Period start ──────────────────────────────────────────
    # Computed here so today_start is available below
    _today_start_tmp = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "day":
        period_start = _today_start_tmp
    elif period == "week":
        period_start = _today_start_tmp - timedelta(days=_today_start_tmp.weekday())
    elif period == "month":
        period_start = _today_start_tmp.replace(day=1)
    elif period == "year":
        period_start = _today_start_tmp.replace(month=1, day=1)
    else:
        period_start = None

    # scope_filter: role + tenant — NO period (for alert/point-in-time metrics)
    def scope_filter(query):
        if current_user.role == "agendadora":
            return query.filter(models.Lead.agendadora_id == current_user.id)
        elif current_user.role == "vendedor":
            return query.filter(models.Lead.vendedor_id == current_user.id)
        elif current_user.role == "verificador":
            return query.filter(models.Lead.current_stage.in_([
                "cierre", "pago_comprometido", "pagado_confirmado", "recuperacion_cierre", "recuperacion_pago",
            ]))
        if _gids is not None:
            query = query.filter(models.Lead.group_id.in_(_gids))
        return query

    # apply_dashboard_filter: scope + optional period date filter
    def apply_dashboard_filter(query):
        query = scope_filter(query)
        if period_start is not None:
            query = query.filter(models.Lead.created_at >= period_start)
        return query

    q = apply_dashboard_filter(db.query(models.Lead))

    all_stages = [
        "lead", "reunion", "altamente_interesado", "cierre",
        "pago_comprometido", "pagado_confirmado",
        "recuperacion_lead", "recuperacion_reunion", "recuperacion_cierre", "recuperacion_pago",
    ]
    counts = {s: q.filter(models.Lead.current_stage == s).count() for s in all_stages}
    total = sum(counts.values())

    pagados_q = db.query(func.sum(models.Lead.honorarios)).filter(
        models.Lead.current_stage.in_(["cierre", "pago_comprometido", "pagado_confirmado"]),
        models.Lead.honorarios > 0,
        or_(models.Lead.num_cuotas > 1, models.Lead.cuota_inicial > 0),
    )
    pagados_q = apply_dashboard_filter(pagados_q)
    total_honorarios = pagados_q.scalar() or 0

    # Today's stats — always point-in-time, NOT period-filtered
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_leads_q = db.query(func.count(models.Lead.id)).filter(
        models.Lead.created_at >= today_start
    )
    today_leads = scope_filter(today_leads_q).scalar() or 0

    # Pending payments — current state, NOT period-filtered
    pending_payments_q = db.query(func.count(models.PaymentVerification.id)).join(
        models.Lead, models.PaymentVerification.lead_id == models.Lead.id
    ).filter(models.PaymentVerification.status == "pendiente")
    pending_payments = scope_filter(pending_payments_q).scalar() or 0

    confirmed_payments_q = db.query(func.count(models.PaymentVerification.id)).join(
        models.Lead, models.PaymentVerification.lead_id == models.Lead.id
    ).filter(models.PaymentVerification.status == "pago_exitoso")
    confirmed_payments = scope_filter(confirmed_payments_q).scalar() or 0

    rejected_payments_q = db.query(func.count(models.PaymentVerification.id)).join(
        models.Lead, models.PaymentVerification.lead_id == models.Lead.id
    ).filter(models.PaymentVerification.status == "rechazado")
    rejected_payments = scope_filter(rejected_payments_q).scalar() or 0

    # Pending payments broken down by group (for dante/admin)
    payments_by_group = []
    if current_user.role in ("verificador", "superadmin", "subadmin"):
        groups_query = db.query(models.Group)
        if _gids is not None:
            groups_query = groups_query.filter(models.Group.id.in_(_gids))
        groups_list = groups_query.all()
        for g in groups_list:
            pending_g = db.query(func.count(models.PaymentVerification.id)).join(
                models.Lead, models.PaymentVerification.lead_id == models.Lead.id
            ).filter(
                models.PaymentVerification.status == "pendiente",
                models.Lead.group_id == g.id,
            ).scalar() or 0
            if pending_g > 0:
                payments_by_group.append({"id": g.id, "name": g.name, "pending": pending_g})

    # Today's calendar events
    today_end = today_start.replace(hour=23, minute=59, second=59)
    events_today_q = db.query(func.count(models.CalendarEvent.id)).filter(
        models.CalendarEvent.start_time >= today_start,
        models.CalendarEvent.start_time <= today_end,
        models.CalendarEvent.is_completed == False,
    )
    if current_user.role in ("superadmin", "subadmin") and _gids is not None:
        # Scope to events linked to leads in their negocio
        events_today_q = events_today_q.join(
            models.Lead, models.CalendarEvent.lead_id == models.Lead.id, isouter=True
        ).filter(models.Lead.group_id.in_(_gids))
    elif current_user.role not in ("superadmin", "subadmin", "tecnico"):
        events_today_q = events_today_q.filter(
            or_(
                models.CalendarEvent.created_by == current_user.id,
                models.CalendarEvent.assigned_to == current_user.id,
            )
        )

    events_today = events_today_q.scalar() or 0

    # Recent activity
    history_q = (
        db.query(models.LeadHistory)
        .join(models.Lead, models.LeadHistory.lead_id == models.Lead.id)
        .options(
            jl(models.LeadHistory.creator),
            jl(models.LeadHistory.lead).joinedload(models.Lead.contact),
        )
    )
    
    # Filter based on user's access to leads
    if current_user.role == "agendadora":
        history_q = history_q.filter(models.Lead.agendadora_id == current_user.id)
    elif current_user.role == "vendedor":
        history_q = history_q.filter(models.Lead.vendedor_id == current_user.id)
    elif current_user.role == "verificador":
        # Solo transiciones hacia etapas de cobro, no todo el historial de esos leads
        history_q = history_q.filter(models.LeadHistory.to_stage.in_([
            "cierre", "pago_comprometido", "pagado_confirmado", "recuperacion_cierre", "recuperacion_pago",
        ]))
    elif current_user.role in ("superadmin", "subadmin") and _gids is not None:
        history_q = history_q.filter(models.Lead.group_id.in_(_gids))

    # Filter by user's clear timestamp
    if current_user.dashboard_clear_at:
        history_q = history_q.filter(models.LeadHistory.created_at > current_user.dashboard_clear_at)

    recent_history = history_q.order_by(models.LeadHistory.created_at.desc()).limit(20).all()
    recent_activity = []
    for h in recent_history:
        recent_activity.append({
            "id": h.id,
            "user": h.creator.name if h.creator else "Sistema",
            "user_role": h.creator.role if h.creator else "",
            "action": f"{h.from_stage or 'inicio'} → {h.to_stage}",
            "lead_id": h.lead_id,
            "contact_name": h.lead.contact.name if h.lead and h.lead.contact else "—",
            "result": h.result,
            "notes": h.notes,
            "time": h.created_at.isoformat(),
        })

    # By group breakdown — show sub-groups of the negocio, not the negocio root itself
    by_group = []
    if current_user.role in ("superadmin", "subadmin"):
        if _gids is None:
            # Global admin: show all top-level groups (legacy / tecnico view)
            groups = db.query(models.Group).all()
        else:
            # Find the root negocio group for this user
            root_gid = current_user.group_id
            if root_gid:
                ug = db.query(models.Group).filter(models.Group.id == root_gid).first()
                if ug and ug.negocio_id:
                    root_gid = ug.negocio_id  # user is in a sub-group
            # Show only sub-groups of the root (not the root itself)
            groups = db.query(models.Group).filter(
                models.Group.negocio_id == root_gid
            ).all() if root_gid else []
        for g in groups:
            gl = db.query(func.count(models.Lead.id)).filter(
                models.Lead.group_id == g.id
            ).scalar() or 0
            gp = db.query(func.count(models.Lead.id)).filter(
                models.Lead.group_id == g.id,
                models.Lead.current_stage == "pagado_confirmado"
            ).scalar() or 0
            by_group.append({"id": g.id, "name": g.name, "total": gl, "pagado": gp})

    # Top performers
    top_vendedores = []
    if current_user.role in ("superadmin", "subadmin"):
        vendor_q = (
            db.query(models.User, models.Group.name.label("group_name"))
            .outerjoin(models.Group, models.User.group_id == models.Group.id)
            .filter(models.User.role == "vendedor", models.User.is_active == True)
        )
        if _gids is not None:
            vendor_q = vendor_q.filter(models.User.group_id.in_(_gids))

        for v, group_name in vendor_q.all():
            closed_q = db.query(func.count(models.Lead.id)).filter(
                models.Lead.vendedor_id == v.id,
                models.Lead.current_stage == "pagado_confirmado",
            )
            if period_start is not None:
                closed_q = closed_q.filter(models.Lead.created_at >= period_start)
            closed = closed_q.scalar() or 0
            total_q = db.query(func.count(models.Lead.id)).filter(models.Lead.vendedor_id == v.id)
            if period_start is not None:
                total_q = total_q.filter(models.Lead.created_at >= period_start)
            total_v = total_q.scalar() or 0
            top_vendedores.append({
                "name": v.name,
                "group": group_name or "Sin grupo",
                "closed": closed,
                "total": total_v,
            })
        top_vendedores.sort(key=lambda x: x["closed"], reverse=True)

    # Leads sin OT — in cierre/pago_comprometido without any work order
    sin_ot_q = (
        db.query(func.count(models.Lead.id))
        .outerjoin(models.WorkOrder, models.WorkOrder.lead_id == models.Lead.id)
        .filter(
            models.Lead.current_stage.in_(["cierre"]),
            models.WorkOrder.id.is_(None),
        )
    )
    sin_ot_count = scope_filter(sin_ot_q).scalar() or 0

    # Cold leads — point-in-time alert, NOT period-filtered
    cold_threshold = today_start - timedelta(days=3)
    from sqlalchemy import or_ as _or_
    cold_leads_q = db.query(func.count(models.Lead.id)).filter(
        _or_(
            models.Lead.updated_at < cold_threshold,
            models.Lead.updated_at.is_(None),
        ),
        models.Lead.created_at < cold_threshold,
        models.Lead.current_stage.notin_(["pagado_confirmado"]),
    )
    cold_leads_count = scope_filter(cold_leads_q).scalar() or 0

    # This week vs last week
    week_start = today_start - timedelta(days=today_start.weekday())
    last_week_start = week_start - timedelta(days=7)

    this_week_q = db.query(func.count(models.Lead.id)).filter(models.Lead.created_at >= week_start)
    last_week_q = db.query(func.count(models.Lead.id)).filter(
        models.Lead.created_at >= last_week_start,
        models.Lead.created_at < week_start,
    )

    this_week_leads = apply_dashboard_filter(this_week_q).scalar() or 0
    last_week_leads = apply_dashboard_filter(last_week_q).scalar() or 0

    # Appointments stats (cumulative and this month)
    month_start = today_start.replace(day=1)
    total_appointments_q = db.query(func.count(models.CalendarEvent.id)).filter(
        models.CalendarEvent.assigned_to == current_user.id
    )
    month_appointments_q = total_appointments_q.filter(models.CalendarEvent.start_time >= month_start)

    total_appointments = total_appointments_q.scalar() or 0
    month_appointments = month_appointments_q.scalar() or 0

    # ── New dashboard data ─────────────────────────────────────
    now = datetime.now(timezone.utc)

    # Unread WhatsApp messages — only count messages from active configs (config_id=None = orphan test messages)
    unread_q = (
        db.query(func.count(models.WhatsAppMessage.id))
        .join(models.Lead, models.WhatsAppMessage.lead_id == models.Lead.id)
        .join(models.WhatsAppConfig, models.WhatsAppMessage.whatsapp_config_id == models.WhatsAppConfig.id)
        .filter(
            models.WhatsAppMessage.direction == "in",
            models.WhatsAppMessage.is_read == False,
            models.WhatsAppConfig.is_active == True,
        )
    )
    if current_user.role == "agendadora":
        unread_q = unread_q.filter(models.Lead.agendadora_id == current_user.id)
    elif current_user.role == "vendedor":
        unread_q = unread_q.filter(models.Lead.vendedor_id == current_user.id)
    elif current_user.role in ("superadmin", "subadmin") and _gids is not None:
        unread_q = unread_q.filter(models.Lead.group_id.in_(_gids))
    unread_messages = unread_q.scalar() or 0

    # Lead ID of the most recent unread message (for direct navigation)
    first_unread_lead_id = None
    if unread_messages > 0:
        fuq = (
            db.query(models.WhatsAppMessage.lead_id)
            .join(models.Lead, models.WhatsAppMessage.lead_id == models.Lead.id)
            .join(models.WhatsAppConfig, models.WhatsAppMessage.whatsapp_config_id == models.WhatsAppConfig.id)
            .filter(
                models.WhatsAppMessage.direction == "in",
                models.WhatsAppMessage.is_read == False,
                models.WhatsAppConfig.is_active == True,
                models.WhatsAppMessage.lead_id.isnot(None),
            )
        )
        if current_user.role == "agendadora":
            fuq = fuq.filter(models.Lead.agendadora_id == current_user.id)
        elif current_user.role == "vendedor":
            fuq = fuq.filter(models.Lead.vendedor_id == current_user.id)
        elif current_user.role in ("superadmin", "subadmin") and _gids is not None:
            fuq = fuq.filter(models.Lead.group_id.in_(_gids))
        row = fuq.order_by(models.WhatsAppMessage.created_at.desc()).first()
        first_unread_lead_id = row[0] if row else None

    # Recovery leads count
    recovery_count = (
        counts.get("recuperacion_lead", 0) +
        counts.get("recuperacion_reunion", 0) +
        counts.get("recuperacion_cierre", 0) +
        counts.get("recuperacion_pago", 0)
    )

    # Today's events as a detailed list
    cal_user_filter = or_(
        models.CalendarEvent.assigned_to == current_user.id,
        models.CalendarEvent.created_by == current_user.id,
    )
    today_evs_q = (
        db.query(models.CalendarEvent)
        .options(jl(models.CalendarEvent.lead).joinedload(models.Lead.contact))
        .filter(
            models.CalendarEvent.start_time >= today_start,
            models.CalendarEvent.start_time <= today_end,
        )
    )
    if current_user.role in ("superadmin", "subadmin") and _gids is not None:
        today_evs_q = today_evs_q.join(
            models.Lead, models.CalendarEvent.lead_id == models.Lead.id, isouter=True
        ).filter(models.Lead.group_id.in_(_gids))
    elif current_user.role not in ("superadmin", "subadmin", "tecnico"):
        today_evs_q = today_evs_q.filter(cal_user_filter)
    today_events_list = [
        {
            "id": ev.id,
            "title": ev.title,
            "start_time": ev.start_time.isoformat(),
            "end_time": ev.end_time.isoformat(),
            "event_type": ev.event_type,
            "color": ev.color,
            "vendor_status": ev.vendor_status,
            "lead_id": ev.lead_id,
            "contact_name": ev.lead.contact.name if ev.lead and ev.lead.contact else None,
        }
        for ev in today_evs_q.order_by(models.CalendarEvent.start_time).all()
    ]

    # Past events with no vendor_status (meetings that happened but were never marked)
    past_unmarked_count = 0
    past_unmarked_events = []
    if current_user.role in ("vendedor", "agendadora"):
        past_ev_q = (
            db.query(models.CalendarEvent)
            .options(jl(models.CalendarEvent.lead).joinedload(models.Lead.contact))
            .filter(
                models.CalendarEvent.end_time < today_start,  # strictly before today
                models.CalendarEvent.vendor_status == None,
                cal_user_filter,
            )
            .order_by(models.CalendarEvent.start_time.desc())
            .limit(10)
        )
        past_evs = past_ev_q.all()
        past_unmarked_count = len(past_evs)
        past_unmarked_events = [
            {
                "id": ev.id,
                "title": ev.title,
                "start_time": ev.start_time.isoformat(),
                "lead_id": ev.lead_id,
                "contact_name": ev.lead.contact.name if ev.lead and ev.lead.contact else None,
            }
            for ev in past_evs
        ]

    # cierre sin abono = in "cierre" stage with no initial payment
    # cierre abonado   = in "cierre" stage with cuota_inicial > 0, plus pago_comprometido/confirmado
    cierre_sin_abono = q.filter(
        models.Lead.current_stage == "cierre",
        (models.Lead.cuota_inicial == None) | (models.Lead.cuota_inicial == 0),
    ).count()
    cierre_abonado = (
        q.filter(
            models.Lead.current_stage == "cierre",
            models.Lead.cuota_inicial > 0,
        ).count()
        + counts.get("pago_comprometido", 0)
        + counts.get("pagado_confirmado", 0)
    )
    cierre_total_conversion = cierre_sin_abono + cierre_abonado + counts.get("recuperacion_cierre", 0)

    # Cuotas: sum of monto_cuota for leads with installment plans in active payment stages
    cuotas_q = db.query(func.sum(models.Lead.monto_cuota)).filter(
        models.Lead.current_stage.in_(["pago_comprometido", "pagado_confirmado", "cierre"]),
        models.Lead.num_cuotas > 1,
        models.Lead.monto_cuota > 0,
    )
    cuotas_q = apply_dashboard_filter(cuotas_q)
    total_cuotas = cuotas_q.scalar() or 0

    # Pagos únicos: sum of cuota_inicial for single-payment leads in active payment stages
    pagos_q = db.query(func.sum(models.Lead.cuota_inicial)).filter(
        models.Lead.current_stage.in_(["pago_comprometido", "pagado_confirmado"]),
        models.Lead.num_cuotas <= 1,
        models.Lead.cuota_inicial > 0,
    )
    pagos_q = apply_dashboard_filter(pagos_q)
    total_pagos_unicos = pagos_q.scalar() or 0

    return {
        "total_leads": total,
        "by_stage": counts,
        "total_honorarios": float(total_honorarios),
        "total_cuotas": float(total_cuotas),
        "total_pagos_unicos": float(total_pagos_unicos),
        "conversion_rate": round(cierre_total_conversion / total * 100, 1) if total > 0 else 0,
        "cierre_sin_abono": cierre_sin_abono,
        "cierre_abonado": cierre_abonado,
        "today_leads": today_leads,
        "pending_payments": pending_payments,
        "confirmed_payments": confirmed_payments,
        "rejected_payments": rejected_payments,
        "payments_by_group": payments_by_group,
        "events_today": events_today,
        "total_appointments": total_appointments,
        "month_appointments": month_appointments,
        "recent_activity": recent_activity,
        "by_group": by_group,
        "top_vendedores": top_vendedores,
        "this_week_leads": this_week_leads,
        "last_week_leads": last_week_leads,
        "cold_leads_count": cold_leads_count,
        "unread_messages": int(unread_messages),
        "first_unread_lead_id": first_unread_lead_id,
        "recovery_count": recovery_count,
        "today_events_list": today_events_list,
        "past_unmarked_count": past_unmarked_count,
        "past_unmarked_events": past_unmarked_events,
        "leads_sin_ot_count": sin_ot_count,
    }


@router.get("/stats/dashboard-detail")
def dashboard_detail(
    metric: str,
    period: str = "month",
    group_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return lead rows for a given dashboard metric card."""
    from sqlalchemy.orm import joinedload as jl

    q = (
        db.query(models.Lead)
        .options(
            jl(models.Lead.contact),
            jl(models.Lead.vendedor),
            jl(models.Lead.agendadora),
            jl(models.Lead.area),
            jl(models.Lead.group),
        )
    )

    # Scope filter
    visible = get_visible_group_ids(db, current_user)
    if visible is not None:
        q = q.filter(models.Lead.group_id.in_(visible))
    if group_id:
        q = q.filter(models.Lead.group_id == group_id)

    # Period filter
    now = datetime.now(timezone.utc)
    if period == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        q = q.filter(models.Lead.created_at >= start)
    elif period == "week":
        start = now - timedelta(days=7)
        q = q.filter(models.Lead.created_at >= start)
    elif period == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        q = q.filter(models.Lead.created_at >= start)

    # Metric filter
    METRIC_FILTERS = {
        "active":           lambda q: q,
        "cierre_sin_abono": lambda q: q.filter(
            models.Lead.current_stage == "cierre",
            (models.Lead.cuota_inicial == None) | (models.Lead.cuota_inicial == 0),
        ),
        "cierre_abonado":   lambda q: q.filter(
            (
                (models.Lead.current_stage == "cierre") & (models.Lead.cuota_inicial > 0)
            ) | models.Lead.current_stage.in_(["pago_comprometido", "pagado_confirmado"])
        ),
        "recovery":         lambda q: q.filter(
            models.Lead.current_stage.in_([
                "recuperacion_lead", "recuperacion_reunion",
                "recuperacion_cierre", "recuperacion_pago",
            ])
        ),
        "cuotas":           lambda q: q.filter(
            models.Lead.current_stage.in_(["pago_comprometido", "pagado_confirmado", "cierre"]),
            models.Lead.num_cuotas > 1,
            models.Lead.monto_cuota > 0,
        ),
        "pagos_unicos":     lambda q: q.filter(
            models.Lead.current_stage.in_(["pago_comprometido", "pagado_confirmado"]),
            models.Lead.num_cuotas <= 1,
            models.Lead.cuota_inicial > 0,
        ),
        "honorarios":       lambda q: q.filter(
            models.Lead.current_stage.in_(["cierre", "pago_comprometido", "pagado_confirmado"]),
            models.Lead.honorarios > 0,
            or_(models.Lead.num_cuotas > 1, models.Lead.cuota_inicial > 0),
        ),
    }

    fn = METRIC_FILTERS.get(metric)
    if fn is None:
        raise HTTPException(status_code=400, detail=f"Métrica desconocida: {metric}")
    q = fn(q)

    leads = q.order_by(models.Lead.updated_at.desc().nullslast()).limit(200).all()

    result = []
    for l in leads:
        result.append({
            "id": l.id,
            "contact_name": l.contact.name if l.contact else "—",
            "contact_phone": l.contact.phone if l.contact else None,
            "area": l.area.name if l.area else "—",
            "group": l.group.name if l.group else "—",
            "stage": l.current_stage,
            "honorarios": float(l.honorarios or 0),
            "cuota_inicial": float(l.cuota_inicial or 0),
            "num_cuotas": l.num_cuotas or 1,
            "monto_cuota": float(l.monto_cuota or 0),
            "vendedor": l.vendedor.name if l.vendedor else "—",
            "created_at": l.created_at.isoformat() if l.created_at else None,
        })
    return result


@router.post("/run-recovery-automation")
def run_recovery_automation(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Auto-move pago_comprometido leads with no payment confirmation in 15+ days to recuperacion_pago."""
    if current_user.role not in ("superadmin", "subadmin", "tecnico"):
        raise HTTPException(status_code=403, detail="Sin permiso")

    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=15)

    stale_leads = (
        db.query(models.Lead)
        .join(models.PaymentVerification, models.PaymentVerification.lead_id == models.Lead.id)
        .filter(
            models.Lead.current_stage == "pago_comprometido",
            models.PaymentVerification.status == "pendiente",
            models.PaymentVerification.created_at < cutoff,
        )
        .all()
    )

    moved = 0
    for lead in stale_leads:
        lead.current_stage = "recuperacion_pago"
        db.add(models.LeadHistory(
            lead_id=lead.id,
            from_stage="pago_comprometido",
            to_stage="recuperacion_pago",
            result="failed",
            notes="Recuperación automática: sin pago confirmado en 15 días",
            created_by=current_user.id,
        ))
        moved += 1

    if moved:
        db.commit()
    return {"moved": moved}


@router.post("/revert-sinexito-moves")
def revert_sinexito_moves(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    One-time fix: move leads that were incorrectly sent to recuperacion_reunion
    by the old sin_exito/no_show logic back to 'reunion'.
    Identifies them by their last history entry: from_stage=reunion,
    to_stage=recuperacion_reunion, notes containing 'sin éxito' or 'no conectó'.
    """
    if current_user.role not in ("superadmin", "subadmin"):
        raise HTTPException(status_code=403, detail="Sin permiso")

    from sqlalchemy import desc

    leads_in_rec = (
        db.query(models.Lead)
        .filter(models.Lead.current_stage == "recuperacion_reunion")
        .all()
    )

    reverted = 0
    for lead in leads_in_rec:
        last_history = (
            db.query(models.LeadHistory)
            .filter(models.LeadHistory.lead_id == lead.id)
            .order_by(desc(models.LeadHistory.created_at))
            .first()
        )
        if last_history and last_history.from_stage == "reunion" and last_history.to_stage == "recuperacion_reunion":
            notes = last_history.notes or ""
            if "sin éxito" in notes or "no conectó" in notes or "sin exito" in notes.lower():
                lead.current_stage = "reunion"
                db.add(models.LeadHistory(
                    lead_id=lead.id,
                    from_stage="recuperacion_reunion",
                    to_stage="reunion",
                    result="info",
                    notes="Corrección automática: revertido de recuperación incorrecta por sin_exito/no_show",
                    created_by=current_user.id,
                ))
                reverted += 1

    if reverted:
        db.commit()
    return {"reverted": reverted}
