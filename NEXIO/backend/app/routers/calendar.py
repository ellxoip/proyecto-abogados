from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from ..database import get_db
from .. import models, schemas
from ..auth import get_current_user, get_visible_group_ids
from ..utils.notifications import create_notification

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


@router.get("", response_model=List[schemas.CalendarEventOut])
def list_events(
    start: Optional[str] = None,
    end: Optional[str] = None,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    q = db.query(models.CalendarEvent)

    if current_user.role in ("superadmin", "subadmin"):
        gids = get_visible_group_ids(db, current_user)
        if gids is not None:
            q = q.join(models.Lead, models.CalendarEvent.lead_id == models.Lead.id, isouter=True).filter(
                models.Lead.group_id.in_(gids)
            )
        if user_id:
            q = q.filter(
                (models.CalendarEvent.created_by == user_id) |
                (models.CalendarEvent.assigned_to == user_id)
            )
    elif current_user.role == "tecnico":
        if user_id:
            q = q.filter(
                (models.CalendarEvent.created_by == user_id) |
                (models.CalendarEvent.assigned_to == user_id)
            )
    elif current_user.role == "agendadora":
        if user_id:
            # Viewing a specific vendor's calendar (availability check)
            q = q.filter(
                (models.CalendarEvent.created_by == user_id) |
                (models.CalendarEvent.assigned_to == user_id)
            )
        else:
            vendedor_ids = [
                u.id for u in db.query(models.User).filter(
                    models.User.group_id == current_user.group_id,
                    models.User.role.in_(["vendedor", "verificador", "subadmin"]),
                ).all()
            ]
            q = q.filter(
                (models.CalendarEvent.created_by == current_user.id) |
                (models.CalendarEvent.assigned_to.in_(vendedor_ids)) |
                (models.CalendarEvent.created_by.in_(vendedor_ids))
            )
    else:
        q = q.filter(
            (models.CalendarEvent.created_by == current_user.id) |
            (models.CalendarEvent.assigned_to == current_user.id)
        )

    if start:
        q = q.filter(models.CalendarEvent.start_time >= start)
    if end:
        q = q.filter(models.CalendarEvent.end_time <= end)
    return q.order_by(models.CalendarEvent.start_time).all()


@router.get("/group-vendors")
def get_group_vendors(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in ("agendadora", "superadmin", "subadmin") or not current_user.group_id:
        return []
    users = db.query(models.User).filter(
        models.User.group_id == current_user.group_id,
        models.User.role.in_(["vendedor", "verificador", "subadmin"]),
        models.User.is_active == True,
    ).all()
    return [{"id": u.id, "name": u.name, "role": u.role} for u in users]


@router.get("/agendadora-followup")
def get_agendadora_followup(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return leads that currently need rescheduling (last_vendor_outcome is set).
    Only shows the most recent failed event per lead."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=60)

    # Only fetch events for leads that STILL have last_vendor_outcome set.
    # Once a new reunion is scheduled, last_vendor_outcome is cleared and
    # the lead disappears from this list automatically.
    events = (
        db.query(models.CalendarEvent)
        .join(models.Lead, models.CalendarEvent.lead_id == models.Lead.id)
        .options(
            joinedload(models.CalendarEvent.lead)
                .joinedload(models.Lead.contact),
            joinedload(models.CalendarEvent.lead)
                .joinedload(models.Lead.vendedor),
            joinedload(models.CalendarEvent.lead)
                .joinedload(models.Lead.history),
        )
        .filter(
            models.CalendarEvent.created_by == current_user.id,
            models.CalendarEvent.vendor_status.in_(["sin_exito", "no_show"]),
            models.CalendarEvent.start_time >= cutoff,
            models.Lead.last_vendor_outcome != None,
        )
        .order_by(models.CalendarEvent.start_time.desc())
        .all()
    )

    # Deduplicate: only the most recent event per lead
    seen_leads: set[int] = set()
    result = []
    for ev in events:
        if not ev.lead_id or ev.lead_id in seen_leads:
            continue
        seen_leads.add(ev.lead_id)

        # Get the most recent outcome note from lead history (sin_exito/no_show don't move stage)
        outcome_note = None
        if ev.lead and ev.lead.history:
            relevant = [
                h for h in ev.lead.history
                if h.result == "failed" and h.notes
                and h.from_stage == h.to_stage  # outcome without stage move
            ]
            if relevant:
                latest = sorted(relevant, key=lambda h: h.created_at, reverse=True)[0]
                outcome_note = latest.notes

        result.append({
            "id": ev.id,
            "title": ev.title,
            "start_time": ev.start_time.isoformat(),
            "vendor_status": ev.vendor_status,
            "lead_id": ev.lead_id,
            "contact_name": ev.lead.contact.name if ev.lead and ev.lead.contact else None,
            "contact_phone": ev.lead.contact.phone if ev.lead and ev.lead.contact else None,
            "vendor_id": ev.lead.vendedor_id if ev.lead else None,
            "vendor_name": ev.lead.vendedor.name if ev.lead and ev.lead.vendedor else None,
            "outcome_note": outcome_note,
            "lead_stage": ev.lead.current_stage if ev.lead else None,
        })

    return result


@router.get("/vendor-pipeline")
def get_vendor_pipeline(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return events grouped by vendor_status for the current vendedor's pipeline."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    q = db.query(models.CalendarEvent).options(
        joinedload(models.CalendarEvent.lead).joinedload(models.Lead.contact),
        joinedload(models.CalendarEvent.creator),
    ).filter(
        or_(
            models.CalendarEvent.assigned_to == current_user.id,
            models.CalendarEvent.created_by == current_user.id,
            models.CalendarEvent.lead.has(models.Lead.vendedor_id == current_user.id),
        )
    ).order_by(models.CalendarEvent.start_time.desc())

    events = q.all()

    # Also include leads in cierre / pago_comprometido for this vendedor
    leads_q = db.query(models.Lead).options(
        joinedload(models.Lead.contact),
        joinedload(models.Lead.work_orders),
    ).filter(
        models.Lead.vendedor_id == current_user.id,
        models.Lead.current_stage.in_(["cierre", "pago_comprometido"]),
    ).order_by(models.Lead.updated_at.desc()).all()

    cierre_leads = []
    pago_leads = []
    for lead in leads_q:
        entry = {
            "lead_id": lead.id,
            "contact_name": lead.contact.name if lead.contact else None,
            "contact_phone": lead.contact.phone if lead.contact else None,
            "honorarios": lead.honorarios,
            "num_cuotas": lead.num_cuotas,
            "monto_cuota": lead.monto_cuota,
            "has_ot": bool(lead.work_orders),
            "current_stage": lead.current_stage,
        }
        if lead.current_stage == "cierre":
            cierre_leads.append(entry)
        else:
            pago_leads.append(entry)

    result = {"espera_cliente": [], "sin_exito": [], "altamente_interesado": [], "no_show": [], "historial": [],
              "cierre": cierre_leads, "pago_comprometido": pago_leads}
    for ev in events:
        status = ev.vendor_status or "espera_cliente"

        start = ev.start_time
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        is_old = start < cutoff
        is_resolved = status in ("sin_exito", "altamente_interesado", "no_show")

        entry = {
            "id": ev.id,
            "title": ev.title,
            "start_time": ev.start_time.isoformat(),
            "end_time": ev.end_time.isoformat(),
            "event_type": ev.event_type,
            "notes": ev.notes,
            "color": ev.color,
            "vendor_status": ev.vendor_status,
            "lead_id": ev.lead_id,
            "contact_name": ev.lead.contact.name if ev.lead and ev.lead.contact else None,
            "contact_phone": ev.lead.contact.phone if ev.lead and ev.lead.contact else None,
            "creator_name": ev.creator.name if ev.creator else None,
        }

        if is_resolved and is_old:
            result["historial"].append(entry)
        elif status in result:
            result[status].append(entry)

    return result


@router.post("", response_model=schemas.CalendarEventOut)
def create_event(
    data: schemas.CalendarEventCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    event = models.CalendarEvent(**data.model_dump(), created_by=current_user.id)
    db.add(event)
    db.commit()
    db.refresh(event)

    if data.assigned_to and data.assigned_to != current_user.id:
        try:
            start_fmt = event.start_time.strftime("%d/%m %H:%M") if event.start_time else ""
            create_notification(
                db=db,
                user_id=data.assigned_to,
                title="Nueva reunión agendada",
                message=f"{current_user.name} agendó: {event.title} — {start_fmt}",
                lead_id=event.lead_id,
                event_id=event.id,
                notification_type="calendario",
            )
            db.commit()
        except Exception:
            pass

    # When a reunion event is created for a lead, clear any pending outcome flag
    # so the lead reappears in the pipeline kanban.
    if data.event_type == "reunion" and data.lead_id:
        lead = db.query(models.Lead).filter(models.Lead.id == data.lead_id).first()
        if lead and lead.last_vendor_outcome in ("sin_exito", "no_show"):
            lead.last_vendor_outcome = None
            db.commit()

    # When a 'reunion' event is assigned to a vendedor and linked to a lead,
    # update lead.vendedor_id and push/re-push to AT Informa if the lead is
    # already in a reunion stage (new leads are handled by move-stage).
    if (
        data.event_type == "reunion"
        and data.lead_id
        and data.assigned_to
    ):
        _sync_reunion_event_to_at(db, event, data.assigned_to, current_user)

    return event


def _sync_reunion_event_to_at(db: Session, event, assigned_to_id: int, current_user):
    """
    When a reunion event is created and assigned to a vendedor:
    - Ensure lead.vendedor_id matches the assigned abogado.
    - If the lead is already in reunion/recuperacion_reunion, re-push to AT Informa.
      (Leads in 'lead'/'recuperacion_lead' are handled by the move-stage → _fire_integrations path.)
    """
    import asyncio, logging
    from ..utils import at_informa as ati
    log = logging.getLogger(__name__)

    lead = db.query(models.Lead).options(
        joinedload(models.Lead.contact),
        joinedload(models.Lead.agendadora),
        joinedload(models.Lead.area),
    ).filter(models.Lead.id == event.lead_id).first()

    if not lead:
        return

    # Update lead's vendedor to the assigned abogado (if different)
    if lead.vendedor_id != assigned_to_id:
        lead.vendedor_id = assigned_to_id
        db.add(models.LeadHistory(
            lead_id    = lead.id,
            from_stage = lead.current_stage,
            to_stage   = lead.current_stage,
            result     = "manual",
            notes      = f"Abogado reasignado a {current_user.name} al agendar reunión",
            created_by = current_user.id,
        ))
        db.commit()
        db.refresh(lead)

    # Only re-push if lead is already in a reunion stage
    # (fresh leads get pushed via move-stage → _fire_integrations)
    REUNION_STAGES = {"reunion", "recuperacion_reunion"}
    if lead.current_stage not in REUNION_STAGES:
        return

    vendedor = db.query(models.User).filter(models.User.id == assigned_to_id).first()
    if not vendedor or not vendedor.at_informa_user_id:
        log.warning("Cannot push to AT Informa: vendedor %s has no at_informa_user_id", assigned_to_id)
        return

    contact    = lead.contact
    agendadora = lead.agendadora
    area       = lead.area

    meeting_at_iso   = event.start_time.isoformat() if event.start_time else None
    meeting_duration = 60
    if event.end_time and event.start_time:
        meeting_duration = max(15, int((event.end_time - event.start_time).total_seconds() / 60))

    try:
        result = asyncio.run(ati.push_reunion_lead(
            crm_lead_id      = lead.id,
            full_name        = contact.name if contact else "Cliente",
            email            = contact.email or f"lead_{lead.id}@crm.local",
            phone            = contact.phone if contact else "",
            category         = area.name.upper() if area else "TRIBUTARIO",
            service_desc     = lead.service_description,
            honorarios       = lead.honorarios or 0,
            vendedor_email   = vendedor.email,
            agendadora_name  = agendadora.name if agendadora else None,
            at_vendedor_id   = vendedor.at_informa_user_id,
            meeting_at       = meeting_at_iso,
            meeting_duration = meeting_duration,
        ))
        at_id = result.get("leadId") or result.get("caseId")
        if at_id:
            lead.at_informa_case_id = at_id
            db.commit()
        log.info("AT Informa re-notified for lead %s → vendedor %s (at_id: %s)", lead.id, vendedor.email, at_id)
    except Exception as exc:
        log.warning("AT Informa re-push failed for lead %s: %s", lead.id, exc)


@router.get("/{event_id}", response_model=schemas.CalendarEventOut)
def get_event(event_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    event = db.query(models.CalendarEvent).filter(models.CalendarEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    return event


@router.put("/{event_id}", response_model=schemas.CalendarEventOut)
def update_event(
    event_id: int,
    data: schemas.CalendarEventUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    event = db.query(models.CalendarEvent).filter(models.CalendarEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(event, field, value)
    db.commit()
    db.refresh(event)
    return event


@router.patch("/{event_id}/vendor-status")
def update_vendor_status(
    event_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Vendedor updates their event outcome status."""
    if current_user.role not in ("vendedor", "agendadora", "superadmin", "subadmin"):
        raise HTTPException(status_code=403, detail="Sin permiso para actualizar este estado")
    valid = {"espera_cliente", "sin_exito", "altamente_interesado", "no_show"}
    status = data.get("vendor_status")
    outcome_notes = (data.get("notes") or "").strip()
    if status not in valid:
        raise HTTPException(status_code=400, detail="Estado inválido")

    event = db.query(models.CalendarEvent).options(
        joinedload(models.CalendarEvent.lead).joinedload(models.Lead.contact),
        joinedload(models.CalendarEvent.lead).joinedload(models.Lead.agendadora),
    ).filter(models.CalendarEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Evento no encontrado")

    event.vendor_status = status

    # Stage transitions triggered by vendor outcome
    # Stages from which marking "exitoso" advances to altamente_interesado
    # Only "altamente_interesado" (exitoso) advances the lead stage.
    # "sin_exito" and "no_show" just flag the event for the agendadora to reschedule —
    # the lead stays where it is. Moving to recuperación is a manual decision.
    EXITOSO_STAGES = {"lead", "recuperacion_lead", "reunion", "recuperacion_reunion"}

    if event.lead_id:
        lead = db.query(models.Lead).options(
            joinedload(models.Lead.contact),
            joinedload(models.Lead.agendadora),
        ).filter(models.Lead.id == event.lead_id).first()

        if lead:
            contact_name = lead.contact.name if lead.contact else "cliente"
            old_stage = lead.current_stage
            new_stage = None
            history_result = None
            history_notes = None

            if status == "altamente_interesado" and old_stage in EXITOSO_STAGES:
                new_stage = "altamente_interesado"
                lead.last_vendor_outcome = None  # cleared — lead advanced
                history_result = "success"
                history_notes = f"Reunión exitosa — {current_user.name}"
                if outcome_notes:
                    history_notes += f": {outcome_notes}"

            elif status in ("sin_exito", "no_show"):
                # Record the outcome in history but DO NOT move the lead.
                # sin_exito → hidden from pipeline kanban (only in Seguimiento).
                # no_show  → stays visible in kanban with a warning badge.
                lead.last_vendor_outcome = status
                label = "Reunión sin éxito" if status == "sin_exito" else "Cliente no se conectó"
                history_notes = f"{label} — {current_user.name}"
                if outcome_notes:
                    history_notes += f": {outcome_notes}"
                db.add(models.LeadHistory(
                    lead_id=lead.id,
                    from_stage=old_stage,
                    to_stage=old_stage,
                    result="failed",
                    notes=history_notes,
                    created_by=current_user.id,
                ))

            if new_stage:
                lead.current_stage = new_stage
                db.add(models.LeadHistory(
                    lead_id=lead.id,
                    from_stage=old_stage,
                    to_stage=new_stage,
                    result=history_result,
                    notes=history_notes,
                    created_by=current_user.id,
                ))

            # Notify agendadora for all outcomes
            if lead.agendadora_id:
                if status == "altamente_interesado":
                    create_notification(
                        db, lead.agendadora_id,
                        "Reunion exitosa",
                        f"{current_user.name} marcó la reunión con {contact_name} como Altamente Interesado.",
                        lead_id=lead.id,
                        notification_type="etapa",
                    )
                elif status == "sin_exito":
                    create_notification(
                        db, lead.agendadora_id,
                        "Reunión sin éxito — reagendar",
                        f"{current_user.name} marcó la reunión con {contact_name} como Sin Éxito. Coordina nueva fecha.",
                        lead_id=lead.id,
                        notification_type="etapa",
                    )
                elif status == "no_show":
                    create_notification(
                        db, lead.agendadora_id,
                        "Cliente no se conectó — reagendar",
                        f"{current_user.name}: {contact_name} no se conectó. Coordina nueva fecha.",
                        lead_id=lead.id,
                        notification_type="etapa",
                    )

    db.commit()
    return {"ok": True, "vendor_status": status}


@router.delete("/{event_id}")
def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    event = db.query(models.CalendarEvent).filter(models.CalendarEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    db.query(models.Notification).filter(models.Notification.event_id == event_id).delete(synchronize_session=False)
    db.delete(event)
    db.commit()
    return {"ok": True}
