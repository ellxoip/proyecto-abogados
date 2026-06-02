from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import create_engine, text as sa_text
from typing import Optional
from pydantic import BaseModel
from .. import models
from ..database import get_db
from ..auth import get_current_user
import os, base64, httpx, asyncio, logging
from datetime import datetime, timezone, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_SEND_URL   = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"

PAGACUOTAS_DB_URL = os.getenv(
    "PAGACUOTAS_DATABASE_URL",
    "",
)
PAGACUOTAS_PORTAL_BASE = os.getenv("PAGACUOTAS_PORTAL_URL", "https://pagacuotas.hivelegaltech.cl")

router = APIRouter(prefix="/api/cobrador", tags=["cobrador"])

STAGES = ["pendiente_moroso", "lead_moroso", "pago_comprometido", "pagado", "historial"]

CONTABLE_URL = os.getenv(
    "CONTABLE_DATABASE_URL",
    "postgresql://contable_user:CHANGE_ME@pg-produccion-do-user-35082994-0.m.db.ondigitalocean.com:25061/contable_pool?sslmode=require",
)

PORTAL_BASE = os.getenv("PORTAL_BASE_URL", "https://nexio.hivelegaltech.cl")

HIVE_SERVICE_URL = os.getenv("HIVE_SERVICE_URL", "https://control.hivelegaltech.cl").rstrip("/")
HIVE_API_KEY     = os.getenv("HIVE_SERVICE_API_KEY") or os.getenv("INTEGRATION_INTERNAL_API_KEY")


# ── Helpers ──────────────────────────────────────────────────────────────────

def _to_dict(lead: models.CobradorLead) -> dict:
    pc = lead.pagacuotas
    return {
        "id": lead.id,
        "cobrador_id": lead.cobrador_id,
        "contact_id": lead.contact_id,
        "nombre": lead.nombre,
        "rut": lead.rut,
        "empresa": lead.empresa,
        "telefono": lead.telefono,
        "email": lead.email,
        "monto_deuda": lead.monto_deuda,
        "monto_pagado": lead.monto_pagado,
        "num_cuotas": lead.num_cuotas,
        "cuota_inicial": lead.cuota_inicial,
        "monto_cuota": lead.monto_cuota,
        "lf_cuotas_vencidas": lead.lf_cuotas_vencidas,
        "lf_total_facturado": lead.lf_total_facturado,
        "lf_total_pagado": lead.lf_total_pagado,
        "proxima_cuota_fecha": lead.proxima_cuota_fecha,
        "proxima_cuota_monto": lead.proxima_cuota_monto,
        "pagacuotas_cliente_id": lead.pagacuotas_cliente_id,
        "pagacuotas_token": pc.access_token if pc else None,
        "portal_url": f"{PORTAL_BASE}/pagar/{pc.access_token}" if pc else None,
        "descripcion": lead.descripcion,
        "stage": lead.stage,
        "notes": lead.notes,
        "is_new": bool(lead.is_new) if lead.is_new is not None else False,
        "is_contactado": bool(lead.is_contactado) if lead.is_contactado is not None else False,
        "contactado_at": lead.contactado_at.isoformat() if lead.contactado_at else None,
        "pagado_at": lead.pagado_at.isoformat() if lead.pagado_at else None,
        "created_at": lead.created_at.isoformat() if lead.created_at else None,
        "updated_at": lead.updated_at.isoformat() if lead.updated_at else None,
        "contact": {
            "id": lead.contact.id,
            "name": lead.contact.name,
            "phone": lead.contact.phone,
            "email": lead.contact.email,
        } if lead.contact else None,
    }


def _clean_phone(phone: str) -> str:
    if not phone:
        return phone
    p = phone.strip().replace(" ", "").replace("-", "")
    # Normalize Chilean mobile: +569XXXXXXXX
    if p.startswith("+"):
        return p
    if p.startswith("569") and len(p) >= 11:
        return f"+{p}"
    if p.startswith("9") and len(p) == 9:
        return f"+56{p}"
    return p


class StageUpdate(BaseModel):
    stage: str


class NotesUpdate(BaseModel):
    notes: str


def _check_access(lead: models.CobradorLead, current_user: models.User):
    if current_user.role == "cobrador" and lead.cobrador_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sin acceso")


def _load_lead(lead_id: int, db: Session) -> models.CobradorLead:
    lead = db.query(models.CobradorLead).options(
        joinedload(models.CobradorLead.contact),
        joinedload(models.CobradorLead.pagacuotas),
    ).filter(models.CobradorLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="No encontrado")
    return lead


# ── CRUD endpoints ───────────────────────────────────────────────────────────

@router.get("/historial")
def list_historial(
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in ("cobrador", "superadmin", "subadmin", "tecnico"):
        raise HTTPException(status_code=403, detail="Sin acceso")
    q = db.query(models.CobradorLead).options(
        joinedload(models.CobradorLead.contact),
        joinedload(models.CobradorLead.pagacuotas),
    ).filter(models.CobradorLead.stage == "historial")
    if current_user.role == "cobrador":
        q = q.filter(models.CobradorLead.cobrador_id == current_user.id)
    if search:
        like = f"%{search}%"
        q = q.filter(
            models.CobradorLead.nombre.ilike(like) |
            models.CobradorLead.empresa.ilike(like) |
            models.CobradorLead.rut.ilike(like)
        )
    leads = q.order_by(models.CobradorLead.pagado_at.desc().nullslast()).all()
    return [_to_dict(l) for l in leads]


@router.get("/leads")
def list_leads(
    stage: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in ("cobrador", "superadmin", "subadmin", "tecnico"):
        raise HTTPException(status_code=403, detail="Sin acceso")
    q = db.query(models.CobradorLead).options(
        joinedload(models.CobradorLead.contact),
        joinedload(models.CobradorLead.pagacuotas),
    )
    if current_user.role == "cobrador":
        q = q.filter(models.CobradorLead.cobrador_id == current_user.id)
    if stage:
        q = q.filter(models.CobradorLead.stage == stage)
    else:
        # Exclude historial from cartera — they live in their own page
        q = q.filter(models.CobradorLead.stage != "historial")
    if search:
        like = f"%{search}%"
        q = q.filter(
            models.CobradorLead.nombre.ilike(like) |
            models.CobradorLead.empresa.ilike(like) |
            models.CobradorLead.rut.ilike(like)
        )
    leads = q.order_by(models.CobradorLead.created_at.desc()).all()
    return [_to_dict(l) for l in leads]


@router.get("/leads/{lead_id}")
def get_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in ("cobrador", "superadmin", "subadmin", "tecnico"):
        raise HTTPException(status_code=403, detail="Sin acceso")
    lead = _load_lead(lead_id, db)
    _check_access(lead, current_user)
    return _to_dict(lead)


def _get_portal_url_from_pagacuotas(rut: str) -> str | None:
    """Look up existing PagaCuotas client by RUT, return their auto-login URL."""
    if not rut or rut.startswith("sin-rut") or not PAGACUOTAS_DB_URL:
        return None
    try:
        engine = create_engine(PAGACUOTAS_DB_URL, pool_pre_ping=True)
        with engine.connect() as conn:
            row = conn.execute(sa_text(
                'SELECT magic_token FROM "CrmClientProfile" WHERE rut = :rut LIMIT 1'
            ), {"rut": rut}).first()
        engine.dispose()
        if row and row[0]:
            base = PAGACUOTAS_PORTAL_BASE.rstrip("/")
            return f"{base}/client/auto-login?token={row[0]}"
    except Exception as e:
        logger.warning("[cobrador] PagaCuotas DB lookup failed for rut=%s: %s", rut, e)
    return None


def _send_pago_comprometido_wa(lead: models.CobradorLead, db: Session):
    """Best-effort: send PagaCuotas payment link via WhatsApp when cobrador moves to pago_comprometido."""
    try:
        phone = lead.telefono
        if not phone:
            contact = db.query(models.Contact).filter(models.Contact.id == lead.contact_id).first()
            phone = contact.phone if contact else None
        if not phone:
            logger.warning("[cobrador] No phone for lead %s — WA not sent", lead.id)
            return

        # Look up portal URL in PagaCuotas DB by RUT (morosos are existing clients)
        portal_url = _get_portal_url_from_pagacuotas(lead.rut or "")
        if not portal_url:
            logger.warning("[cobrador] No portal_url in PagaCuotas for lead %s rut=%s", lead.id, lead.rut)
            return

        # Find any active WhatsApp config
        cfg = db.query(models.WhatsAppConfig).filter(models.WhatsAppConfig.is_active == True).first()
        if not cfg:
            logger.warning("[cobrador] No active WA config — link not sent for lead %s", lead.id)
            return

        nombre = lead.nombre.split()[0] if lead.nombre else "estimado cliente"
        monto = int(lead.monto_cuota or lead.cuota_inicial or lead.monto_deuda or 0)
        message = (
            f"Hola {nombre}, tu acuerdo de pago fue registrado exitosamente. ✅\n\n"
            f"💳 *Monto por cuota:* ${monto:,.0f}\n"
            f"📋 *Cuotas:* {lead.num_cuotas or 1}\n\n"
            f"Usa este enlace personal para entrar a tu Portal de Pago:\n"
            f"🔗 {portal_url}\n\n"
            f"_Este enlace es tuyo y puedes usarlo para revisar tu caso y pagar._"
        ).replace(",", ".")

        # Register cobrador lead ID in LF so payment_confirmed webhook fires back
        try:
            lf_engine = _get_contable_engine()
            with lf_engine.connect() as conn:
                conn.execute(sa_text(
                    'UPDATE "Contrato" SET crm_lead_id = :lead_id WHERE id = :contrato_id AND crm_lead_id IS NULL'
                ), {"lead_id": -lead.id, "contrato_id": lead.lf_contrato_id})
                conn.commit()
            lf_engine.dispose()
        except Exception as e:
            logger.warning("[cobrador] Could not set LF crm_lead_id for lead %s: %s", lead.id, e)

        contact = db.query(models.Contact).filter(models.Contact.id == lead.contact_id).first()

        from ..routers.whatsapp import send_whatsapp_api
        msg_result = asyncio.run(send_whatsapp_api(cfg, phone, message))

        db.add(models.WhatsAppMessage(
            contact_id=contact.id if contact else None,
            lead_id=None,
            whatsapp_config_id=cfg.id,
            direction="out",
            message_type="text",
            content=message,
            status=msg_result.get("status", "logged"),
            message_id=msg_result.get("message_id"),
        ))
        db.commit()
        logger.info("[cobrador] Link de pago WA enviado a %s para lead %s", contact.phone, lead.id)
    except Exception as exc:
        logger.warning("[cobrador] No se pudo enviar WA pago_comprometido lead %s: %s", lead.id, exc)


@router.patch("/leads/{lead_id}/stage")
def update_stage(
    lead_id: int,
    body: StageUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in ("cobrador", "superadmin", "subadmin", "tecnico"):
        raise HTTPException(status_code=403, detail="Sin acceso")
    if body.stage not in STAGES:
        raise HTTPException(status_code=400, detail="Etapa inválida")
    lead = _load_lead(lead_id, db)
    _check_access(lead, current_user)
    prev_stage = lead.stage
    lead.stage = body.stage
    if body.stage == "pagado" and prev_stage != "pagado":
        lead.pagado_at = datetime.now(timezone.utc)
    elif body.stage != "pagado":
        lead.pagado_at = None
    db.commit()
    db.refresh(lead)

    # Trigger side effects when moving to pago_comprometido
    if body.stage == "pago_comprometido" and prev_stage != "pago_comprometido":
        _send_pago_comprometido_wa(lead, db)

    return _to_dict(lead)


@router.patch("/leads/{lead_id}/notes")
def update_notes(
    lead_id: int,
    body: NotesUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in ("cobrador", "superadmin", "subadmin", "tecnico"):
        raise HTTPException(status_code=403, detail="Sin acceso")
    lead = _load_lead(lead_id, db)
    _check_access(lead, current_user)
    lead.notes = body.notes
    db.commit()
    db.refresh(lead)
    return _to_dict(lead)


@router.patch("/leads/{lead_id}/monto_pagado")
def update_monto_pagado(
    lead_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in ("cobrador", "superadmin", "subadmin", "tecnico"):
        raise HTTPException(status_code=403, detail="Sin acceso")
    lead = _load_lead(lead_id, db)
    _check_access(lead, current_user)
    monto = float(body.get("monto_pagado", lead.monto_pagado))
    if monto < 0:
        raise HTTPException(status_code=400, detail="Monto inválido")
    lead.monto_pagado = monto
    db.commit()
    db.refresh(lead)
    return _to_dict(lead)


@router.get("/dashboard")
def dashboard(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in ("cobrador", "superadmin", "subadmin", "tecnico"):
        raise HTTPException(status_code=403, detail="Sin acceso")
    q = db.query(models.CobradorLead)
    if current_user.role == "cobrador":
        q = q.filter(models.CobradorLead.cobrador_id == current_user.id)
    leads = q.all()

    total_deuda   = sum(l.monto_deuda for l in leads)
    total_cobrado = sum(l.monto_pagado for l in leads)
    por_stage = {s: 0 for s in STAGES}
    for l in leads:
        if l.stage in por_stage:
            por_stage[l.stage] += 1

    # Breakdown by area (empresa / tipo_servicio)
    areas: dict = {}
    for l in leads:
        area_key = (l.empresa or "Sin área").strip().upper()
        if area_key not in areas:
            areas[area_key] = {"nombre": area_key, "total_leads": 0, "total_deuda": 0, "total_cobrado": 0}
        areas[area_key]["total_leads"]   += 1
        areas[area_key]["total_deuda"]   += l.monto_deuda
        areas[area_key]["total_cobrado"] += l.monto_pagado
    por_area = sorted(areas.values(), key=lambda x: x["total_deuda"], reverse=True)

    return {
        "total_leads":   len(leads),
        "total_deuda":   total_deuda,
        "total_cobrado": total_cobrado,
        "tasa_cobro":    round(total_cobrado / total_deuda * 100, 1) if total_deuda else 0,
        "por_stage":     por_stage,
        "por_area":      por_area,
    }


# ── Credentials endpoint ─────────────────────────────────────────────────────

@router.get("/leads/{lead_id}/portal-url")
def get_portal_url(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Returns the PagaCuotas portal URL for this lead so cobrador can send it."""
    if current_user.role not in ("cobrador", "superadmin", "subadmin", "tecnico"):
        raise HTTPException(status_code=403, detail="Sin acceso")
    lead = _load_lead(lead_id, db)
    _check_access(lead, current_user)
    if not lead.pagacuotas:
        raise HTTPException(status_code=404, detail="Este cliente no tiene cuenta PagaCuotas")
    pc = lead.pagacuotas
    url = f"{PORTAL_BASE}/pagar/{pc.access_token}"
    msg = (
        f"Hola {lead.nombre}, le contactamos de Legal Finance. "
        f"Puede revisar y pagar su deuda en el siguiente enlace:\n{url}"
    )
    return {"url": url, "message": msg, "nombre": lead.nombre}


# ── Sync from Legal Finance ───────────────────────────────────────────────────

def _get_contable_engine():
    return create_engine(CONTABLE_URL, pool_pre_ping=True)


def _fetch_contrato_data_bulk(lf_contrato_ids: list) -> dict:
    """Batch-fetch payment totals from LF for a list of contrato IDs."""
    if not lf_contrato_ids or "CHANGE_ME" in CONTABLE_URL:
        return {}
    id_list = ",".join(str(int(i)) for i in lf_contrato_ids)
    engine = _get_contable_engine()
    try:
        with engine.connect() as conn:
            rows = conn.execute(sa_text(f"""
                SELECT
                    ct.id AS lf_contrato_id,
                    ct.monto_ccto,
                    COALESCE(SUM(cu.monto_pagado) FILTER (WHERE cu.estado = 'PAGADA'), 0)
                        AS total_pagado,
                    COUNT(cu.id) FILTER (
                        WHERE cu.estado = 'PENDIENTE' AND cu.fecha_vencimiento < CURRENT_DATE
                    ) AS cuotas_vencidas,
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
                WHERE ct.id IN ({id_list})
                GROUP BY ct.id, ct.monto_ccto
            """))
            return {row[0]: dict(row._mapping) for row in rows}
    except Exception as e:
        logger.warning("[cobrador] bulk contrato fetch failed: %s", e)
        return {}
    finally:
        engine.dispose()


def _fetch_morosos_from_contable():
    engine = _get_contable_engine()
    try:
        with engine.connect() as conn:
            rows = conn.execute(sa_text("""
                SELECT
                    c.id           AS lf_cliente_id,
                    c.rut,
                    c.nombre,
                    c.telefono,
                    c.email,
                    ct.id          AS lf_contrato_id,
                    ct.tipo_servicio,
                    ct.monto_ccto,
                    ct.monto_pago_inicial,
                    ct.saldo_financiado,
                    ct.cantidad_cuotas_original,
                    COALESCE(SUM(cu.monto_pagado) FILTER (WHERE cu.estado = 'PAGADA'), 0)
                        AS total_pagado_lf,
                    COUNT(cu.id) FILTER (
                        WHERE cu.estado = 'PENDIENTE' AND cu.fecha_vencimiento < CURRENT_DATE
                    ) AS cuotas_vencidas,
                    MIN(cu.fecha_vencimiento) FILTER (WHERE cu.estado = 'PENDIENTE')
                        AS proxima_cuota_fecha,
                    MIN(cu.monto_actual) FILTER (
                        WHERE cu.estado = 'PENDIENTE'
                        AND cu.fecha_vencimiento = (
                            SELECT MIN(q.fecha_vencimiento) FROM "Cuota" q
                            WHERE q.contrato_id = ct.id AND q.estado = 'PENDIENTE'
                        )
                    ) AS proxima_cuota_monto
                FROM "Cliente" c
                JOIN "Contrato" ct ON ct.cliente_id = c.id
                LEFT JOIN "Cuota" cu ON cu.contrato_id = ct.id
                GROUP BY c.id, c.rut, c.nombre, c.telefono, c.email,
                         ct.id, ct.tipo_servicio, ct.monto_ccto, ct.monto_pago_inicial,
                         ct.saldo_financiado, ct.cantidad_cuotas_original
                HAVING COUNT(cu.id) FILTER (
                    WHERE cu.estado = 'PENDIENTE' AND cu.fecha_vencimiento < CURRENT_DATE
                ) > 0
                ORDER BY c.nombre
            """))
            return [dict(r._mapping) for r in rows]
    finally:
        engine.dispose()


def _fetch_pendiente_morosos() -> list[dict]:
    """Fetch EN_PROCESO_MORA contracts from Hive control service."""
    import urllib.request, json, ssl
    if not HIVE_API_KEY:
        raise RuntimeError("HIVE_API_KEY no configurada")
    url = f"{HIVE_SERVICE_URL}/api/integrations/cobranza/proceso-mora"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {HIVE_API_KEY}",
        "Content-Type": "application/json",
    })
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
        data = json.loads(r.read())
    return data.get("data", [])


def sync_pendiente_morosos(db: Session) -> dict:
    """Upsert EN_PROCESO_MORA clients as pendiente_moroso leads."""
    try:
        rows = _fetch_pendiente_morosos()
    except Exception as e:
        logger.warning("[cobrador] pendiente_morosos fetch error: %s", e)
        return {"ok": False, "error": str(e), "created": 0, "updated": 0}

    cobrador = db.query(models.User).filter(models.User.role == "cobrador").first()
    if not cobrador:
        return {"ok": False, "error": "No hay cobrador", "created": 0, "updated": 0}

    created = updated = 0
    for row in rows:
        cliente = row.get("cliente") or {}
        cuotas  = row.get("cuotas_vencidas") or []
        rut     = (cliente.get("rut") or "").strip() or None
        nombre  = (cliente.get("nombre") or "").strip() or "Sin nombre"
        email   = (cliente.get("email") or "").strip() or None
        phone_raw = (cliente.get("telefono") or "").strip()
        phone   = _clean_phone(phone_raw) if phone_raw else None
        lf_cliente_id  = cliente.get("id")
        lf_contrato_id = row.get("contrato_id")
        tipo_servicio  = row.get("tipo_servicio") or row.get("external_id")
        monto_deuda    = sum(float(c.get("saldo_pendiente") or c.get("monto_actual") or 0) for c in cuotas)
        cuotas_vencidas = len(cuotas)

        if not lf_contrato_id:
            continue

        # Assign to cobrador based on area match
        assigned_cobrador = _find_cobrador_for_area(tipo_servicio)
        if not assigned_cobrador:
            # No cobrador assigned to this area — skip (don't create orphan leads)
            skipped += 1
            continue

        # Find or create contact
        contact_id = None
        if phone:
            contact = db.query(models.Contact).filter(models.Contact.phone == phone).first()
            if not contact:
                try:
                    contact = models.Contact(name=nombre, phone=phone, email=email,
                                             rut_persona=rut, group_id=assigned_cobrador.group_id,
                                             created_by=assigned_cobrador.id)
                    db.add(contact)
                    db.flush()
                except Exception:
                    db.rollback()
                    contact = db.query(models.Contact).filter(models.Contact.phone == phone).first()
            if contact:
                contact_id = contact.id

        lead = db.query(models.CobradorLead).filter(
            models.CobradorLead.lf_cliente_id == lf_cliente_id,
            models.CobradorLead.lf_contrato_id == lf_contrato_id,
        ).first()

        if lead:
            lead.monto_deuda        = monto_deuda
            lead.lf_cuotas_vencidas = cuotas_vencidas
            lead.empresa            = tipo_servicio or lead.empresa
            lead.cobrador_id        = assigned_cobrador.id  # re-assign if area changed
            if contact_id and not lead.contact_id:
                lead.contact_id = contact_id
            if lead.stage not in ("lead_moroso", "pago_comprometido", "pagado", "historial"):
                lead.stage = "pendiente_moroso"
                lead.is_new = True
            updated += 1
        else:
            lead = models.CobradorLead(
                cobrador_id        = assigned_cobrador.id,
                contact_id         = contact_id,
                nombre             = nombre,
                rut                = rut,
                empresa            = tipo_servicio,
                telefono           = phone,
                email              = email,
                monto_deuda        = monto_deuda,
                monto_pagado       = 0,
                lf_cliente_id      = lf_cliente_id,
                lf_contrato_id     = lf_contrato_id,
                lf_cuotas_vencidas = cuotas_vencidas,
                stage              = "pendiente_moroso",
                is_new             = True,
            )
            db.add(lead)
            created += 1

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        return {"ok": False, "error": str(e), "created": created, "updated": updated}
    return {"ok": True, "created": created, "updated": updated, "total": len(rows)}


def sync_morosos(db: Session) -> dict:
    """Pull morosos from Legal Finance contable_db and upsert into cobrador_leads."""
    try:
        rows = _fetch_morosos_from_contable()
    except Exception as e:
        return {"ok": False, "error": str(e), "created": 0, "updated": 0}

    # Load all active cobradores with their assigned area for area-based matching
    all_cobradores = db.query(models.User).filter(
        models.User.role == "cobrador",
        models.User.is_active == True,
    ).all()
    if not all_cobradores:
        return {"ok": False, "error": "No hay usuarios cobrador en Nexio", "created": 0, "updated": 0}

    # Build area→cobrador map (case-insensitive)
    area_cobrador_map: dict = {}
    fallback_cobrador = all_cobradores[0]
    for c in all_cobradores:
        if c.cobrador_area:
            area_cobrador_map[c.cobrador_area.strip().upper()] = c

    def _find_cobrador_for_area(tipo_servicio: str | None) -> models.User | None:
        if not tipo_servicio:
            return None
        key = tipo_servicio.strip().upper()
        return area_cobrador_map.get(key)

    created = updated = skipped = 0

    for row in rows:
        tipo_servicio_row = row.get("tipo_servicio")
        assigned_cobrador = _find_cobrador_for_area(tipo_servicio_row)
        if not assigned_cobrador:
            skipped += 1
            continue

        phone_raw = row.get("telefono") or ""
        phone = _clean_phone(phone_raw) if phone_raw else None
        rut = (row.get("rut") or "").strip() or None
        email = (row.get("email") or "").strip() or None

        # Find or create Contact by phone (for WhatsApp chat)
        contact_id = None
        if phone:
            contact = db.query(models.Contact).filter(models.Contact.phone == phone).first()
            if not contact:
                try:
                    contact = models.Contact(
                        name=row["nombre"],
                        phone=phone,
                        email=email,
                        rut_persona=rut,
                        group_id=assigned_cobrador.group_id,
                        created_by=assigned_cobrador.id,
                    )
                    db.add(contact)
                    db.flush()
                except Exception:
                    db.rollback()
                    contact = db.query(models.Contact).filter(models.Contact.phone == phone).first()
            if contact:
                contact_id = contact.id

        # Find PagaCuotas record by RUT
        pagacuotas_id = None
        if rut:
            pc = db.query(models.PagaCuotasCliente).filter(
                models.PagaCuotasCliente.rut == rut
            ).first()
            if pc:
                pagacuotas_id = pc.id

        # Calculate monto_cuota
        saldo = float(row.get("saldo_financiado") or 0)
        ncuotas = int(row.get("cantidad_cuotas_original") or 1)
        monto_cuota = round(saldo / ncuotas, 0) if ncuotas > 0 else 0

        # Upsert by lf_cliente_id + lf_contrato_id
        lead = db.query(models.CobradorLead).filter(
            models.CobradorLead.lf_cliente_id == row["lf_cliente_id"],
            models.CobradorLead.lf_contrato_id == row["lf_contrato_id"],
        ).first()

        total_facturado  = float(row.get("monto_ccto") or 0)
        total_pagado_lf  = float(row.get("total_pagado_lf") or 0)
        pcf = row.get("proxima_cuota_fecha")
        proxima_fecha    = pcf.isoformat() if pcf and hasattr(pcf, "isoformat") else str(pcf) if pcf else None
        proxima_monto    = float(row.get("proxima_cuota_monto") or 0) if row.get("proxima_cuota_monto") else None

        if lead:
            lead.monto_deuda          = total_facturado
            lead.monto_pagado         = total_pagado_lf
            lead.lf_total_facturado   = total_facturado
            lead.lf_total_pagado      = total_pagado_lf
            lead.lf_cuotas_vencidas   = int(row["cuotas_vencidas"])
            lead.proxima_cuota_fecha  = proxima_fecha
            lead.proxima_cuota_monto  = proxima_monto
            lead.cobrador_id          = assigned_cobrador.id
            lead.empresa              = tipo_servicio_row or lead.empresa
            if contact_id and not lead.contact_id:
                lead.contact_id = contact_id
            if pagacuotas_id and not lead.pagacuotas_cliente_id:
                lead.pagacuotas_cliente_id = pagacuotas_id
            # Escalate pendiente_moroso → lead_moroso (grace period ended)
            if lead.stage == "pendiente_moroso" and int(row["cuotas_vencidas"]) > 0:
                lead.stage = "lead_moroso"
                lead.is_new = True
            # Reactivate from historial: client has new overdue cuotas
            elif lead.stage == "historial" and int(row["cuotas_vencidas"]) > 0:
                lead.stage = "lead_moroso"
                lead.pagado_at = None
                lead.is_new = True
            updated += 1
        else:
            lead = models.CobradorLead(
                cobrador_id           = assigned_cobrador.id,
                contact_id            = contact_id,
                nombre                = row["nombre"],
                rut                   = rut,
                empresa               = tipo_servicio_row,
                telefono              = phone,
                email                 = email,
                monto_deuda           = total_facturado,
                monto_pagado          = total_pagado_lf,
                num_cuotas            = ncuotas,
                cuota_inicial         = float(row.get("monto_pago_inicial") or 0),
                monto_cuota           = monto_cuota,
                lf_cliente_id         = row["lf_cliente_id"],
                lf_contrato_id        = row["lf_contrato_id"],
                lf_cuotas_vencidas    = int(row["cuotas_vencidas"]),
                lf_total_facturado    = total_facturado,
                lf_total_pagado       = total_pagado_lf,
                proxima_cuota_fecha   = proxima_fecha,
                proxima_cuota_monto   = proxima_monto,
                pagacuotas_cliente_id = pagacuotas_id,
                stage                 = "lead_moroso",
                is_new                = True,
            )
            db.add(lead)
            created += 1

    # Second pass: refresh ALL existing leads' payment data from LF
    # (catches leads with no overdue cuotas that fall outside the HAVING clause above)
    try:
        all_leads = db.query(models.CobradorLead).filter(
            models.CobradorLead.lf_contrato_id.isnot(None)
        ).all()
        contrato_ids = [l.lf_contrato_id for l in all_leads if l.lf_contrato_id]
        if contrato_ids:
            fresh = _fetch_contrato_data_bulk(contrato_ids)
            for lead in all_leads:
                d = fresh.get(lead.lf_contrato_id)
                if not d:
                    continue
                new_pagado = float(d.get("total_pagado") or 0)
                if abs(new_pagado - lead.monto_pagado) < 1 and lead.stage != "pagado":
                    continue  # no change
                lead.monto_pagado = new_pagado
                lead.lf_total_pagado = new_pagado
                lead.lf_cuotas_vencidas = int(d.get("cuotas_vencidas") or 0)
                pcf = d.get("proxima_cuota_fecha")
                lead.proxima_cuota_fecha = (
                    pcf.isoformat() if pcf and hasattr(pcf, "isoformat") else str(pcf) if pcf else None
                )
                pm = d.get("proxima_cuota_monto")
                lead.proxima_cuota_monto = float(pm) if pm else None
                if lead.stage != "pagado" and lead.stage != "historial" and lead.monto_deuda > 0 and new_pagado >= lead.monto_deuda:
                    lead.stage = "pagado"
                    lead.pagado_at = datetime.now(timezone.utc)
                updated += 1
    except Exception as e:
        logger.warning("[cobrador] second-pass refresh error: %s", e)

    # Archive pagado leads older than 24 hours → historial.
    # Includes leads with pagado_at=NULL (marked pagado before this column existed)
    # — use updated_at as fallback, or archive immediately if both are NULL.
    try:
        from sqlalchemy import or_, and_
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        old_pagados = db.query(models.CobradorLead).filter(
            models.CobradorLead.stage == "pagado",
            or_(
                and_(
                    models.CobradorLead.pagado_at.isnot(None),
                    models.CobradorLead.pagado_at < cutoff,
                ),
                and_(
                    models.CobradorLead.pagado_at.is_(None),
                    or_(
                        models.CobradorLead.updated_at.is_(None),
                        models.CobradorLead.updated_at < cutoff,
                    ),
                ),
            ),
        ).all()
        for lead in old_pagados:
            lead.stage = "historial"
        if old_pagados:
            logger.info("[cobrador] Archived %d leads to historial", len(old_pagados))
    except Exception as e:
        logger.warning("[cobrador] archival error: %s", e)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        return {"ok": False, "error": str(e), "created": created, "updated": updated}
    return {"ok": True, "created": created, "updated": updated, "total": len(rows)}


@router.patch("/leads/{lead_id}/seen")
def mark_seen(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Mark a cobrador lead as seen (removes 'NUEVO' badge)."""
    lead = db.query(models.CobradorLead).filter(models.CobradorLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead no encontrado")
    if lead.is_new:
        lead.is_new = False
        db.commit()
    return {"ok": True}


@router.patch("/leads/{lead_id}/contactado")
def mark_contactado(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Mark lead as contacted and try to update Legal Finance DB."""
    lead = db.query(models.CobradorLead).filter(models.CobradorLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead no encontrado")

    from datetime import datetime, timezone
    lead.is_contactado = True
    lead.contactado_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(lead)

    # Best-effort: insert ModificacionContrato in Legal Finance so deudores view shows "CONTACTADO"
    # LF computes hasGestion = bool(contrato.modificaciones), which drives the CONTACTADO badge
    lf_updated = False
    if lead.lf_cliente_id and lead.lf_contrato_id and CONTABLE_URL and "CHANGE_ME" not in CONTABLE_URL:
        try:
            lf_engine = _get_contable_engine()
            with lf_engine.connect() as conn:
                conn.execute(sa_text("""
                    INSERT INTO "ModificacionContrato"
                        (contrato_id, usuario_id, tipo_modificacion, fecha_modificacion,
                         valor_anterior, valor_nuevo, motivo, created_at)
                    VALUES
                        (:ctid, 1, 'EDICION_PAGO'::"TipoModificacion", CURRENT_DATE,
                         '{}', '{}', 'Contactado por cobrador Nexio CRM', NOW())
                    ON CONFLICT DO NOTHING
                """), {"ctid": lead.lf_contrato_id})
                conn.commit()
            lf_updated = True
        except Exception as e:
            print(f"[cobrador] LF modificacion contactado failed: {e}")

    return {
        "id": lead.id, "is_contactado": lead.is_contactado,
        "contactado_at": lead.contactado_at.isoformat() if lead.contactado_at else None,
        "stage": lead.stage, "lf_updated": lf_updated,
    }


@router.patch("/leads/{lead_id}/descontactar")
def unmark_contactado(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    lead = db.query(models.CobradorLead).filter(models.CobradorLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead no encontrado")

    lead.is_contactado = False
    lead.contactado_at = None
    db.commit()
    db.refresh(lead)

    lf_updated = False
    if lead.lf_contrato_id and CONTABLE_URL and "CHANGE_ME" not in CONTABLE_URL:
        try:
            lf_engine = _get_contable_engine()
            with lf_engine.connect() as conn:
                conn.execute(sa_text("""
                    DELETE FROM "ModificacionContrato"
                    WHERE contrato_id = :ctid
                      AND motivo = 'Contactado por cobrador Nexio CRM'
                """), {"ctid": lead.lf_contrato_id})
                conn.commit()
            lf_updated = True
        except Exception as e:
            print(f"[cobrador] LF delete modificacion failed: {e}")

    return {
        "id": lead.id, "is_contactado": lead.is_contactado,
        "contactado_at": None, "stage": lead.stage, "lf_updated": lf_updated,
    }


class EmailPayload(BaseModel):
    subject: str
    body: str
    to: Optional[str] = None

async def _get_valid_gmail_token(token: models.GoogleCalendarToken, db: Session) -> str:
    """Refresh gmail token if expired, return valid access token."""
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    expiry = token.gmail_token_expiry
    if expiry:
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if expiry > now + timedelta(minutes=2):
            return token.gmail_access_token
    # Refresh
    setting = db.query(models.AppSetting).filter(models.AppSetting.key == "google_client_id").first()
    secret  = db.query(models.AppSetting).filter(models.AppSetting.key == "google_client_secret").first()
    if not setting or not secret or not token.gmail_refresh_token:
        return token.gmail_access_token
    async with httpx.AsyncClient() as client:
        resp = await client.post(GOOGLE_TOKEN_URL, data={
            "grant_type": "refresh_token",
            "refresh_token": token.gmail_refresh_token,
            "client_id": setting.value,
            "client_secret": secret.value,
        })
    if resp.status_code == 200:
        data = resp.json()
        token.gmail_access_token = data["access_token"]
        token.gmail_token_expiry = datetime.now(timezone.utc) + timedelta(seconds=data.get("expires_in", 3600))
        db.commit()
        return token.gmail_access_token
    return token.gmail_access_token


@router.post("/leads/{lead_id}/email")
async def send_email_to_lead(
    lead_id: int,
    payload: EmailPayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    lead = db.query(models.CobradorLead).filter(models.CobradorLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead no encontrado")
    recipient = (payload.to or lead.email or "").strip()
    if not recipient:
        raise HTTPException(status_code=400, detail="Sin destinatario de correo")

    gmail_token = db.query(models.GoogleCalendarToken).filter(
        models.GoogleCalendarToken.user_id == current_user.id,
        models.GoogleCalendarToken.gmail_access_token != None,
    ).first()

    if not gmail_token:
        raise HTTPException(status_code=503, detail="Conecta tu Gmail desde la sección Correo")

    try:
        access_token = await _get_valid_gmail_token(gmail_token, db)
        from_addr = gmail_token.gmail_email or "me"

        msg = MIMEMultipart("alternative")
        msg["Subject"] = payload.subject
        msg["From"] = from_addr
        msg["To"] = recipient
        html_body = payload.body.replace("\n", "<br>")
        msg.attach(MIMEText(payload.body, "plain", "utf-8"))
        msg.attach(MIMEText(f"<div style='font-family:sans-serif;line-height:1.6;font-size:14px'>{html_body}</div>", "html", "utf-8"))

        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                GMAIL_SEND_URL,
                headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
                json={"raw": raw},
            )
        if resp.status_code not in (200, 201):
            raise HTTPException(status_code=500, detail=f"Gmail API error: {resp.text}")
        return {"ok": True, "to": recipient, "from": from_addr}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error enviando email: {e}")


@router.post("/sync")
def trigger_sync(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Sync morosos + pendiente_morosos into cobrador panel."""
    if current_user.role not in ("cobrador", "superadmin", "subadmin", "tecnico"):
        raise HTTPException(status_code=403, detail="Sin acceso")
    r1 = sync_pendiente_morosos(db)
    r2 = sync_morosos(db)
    if not r2["ok"]:
        raise HTTPException(status_code=503, detail=r2.get("error", "Error de sincronización"))
    return {**r2, "pendientes_created": r1.get("created", 0), "pendientes_updated": r1.get("updated", 0)}


# ── Seed (fake data, only if no leads at all) ─────────────────────────────────

def seed_cobrador(db: Session):
    from ..auth import hash_password

    cobrador = db.query(models.User).filter(models.User.email == "cobrador@nexio.cl").first()
    if not cobrador:
        cobrador = models.User(
            name="Carlos Cobrador",
            email="cobrador@nexio.cl",
            password_hash=hash_password("Cobrador2024!"),
            role="cobrador",
        )
        db.add(cobrador)
        db.commit()
        db.refresh(cobrador)
        print("✅ Cobrador user: cobrador@nexio.cl / Cobrador2024!")

    print("✅ Cobrador user ready.")
