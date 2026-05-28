from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import create_engine, text as sa_text
from typing import Optional
from pydantic import BaseModel
from .. import models
from ..database import get_db
from ..auth import get_current_user
import os

router = APIRouter(prefix="/api/cobrador", tags=["cobrador"])

STAGES = ["lead_moroso", "pago_comprometido", "pagado"]

CONTABLE_URL = os.getenv(
    "CONTABLE_DATABASE_URL",
    "postgresql://contable_user:CHANGE_ME@pg-produccion-do-user-35082994-0.m.db.ondigitalocean.com:25061/contable_pool?sslmode=require",
)

PORTAL_BASE = os.getenv("PORTAL_BASE_URL", "https://nexio.hivelegaltech.cl")


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
        "pagacuotas_cliente_id": lead.pagacuotas_cliente_id,
        "pagacuotas_token": pc.access_token if pc else None,
        "portal_url": f"{PORTAL_BASE}/pagar/{pc.access_token}" if pc else None,
        "descripcion": lead.descripcion,
        "stage": lead.stage,
        "notes": lead.notes,
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
    lead.stage = body.stage
    db.commit()
    db.refresh(lead)
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

    return {
        "total_leads":   len(leads),
        "total_deuda":   total_deuda,
        "total_cobrado": total_cobrado,
        "tasa_cobro":    round(total_cobrado / total_deuda * 100, 1) if total_deuda else 0,
        "por_stage":     por_stage,
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

def _fetch_morosos_from_contable():
    engine = create_engine(CONTABLE_URL, pool_pre_ping=True)
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
                    COALESCE(SUM(cu.saldo_pendiente) FILTER (WHERE cu.estado = 'PENDIENTE'), 0)
                        AS deuda_pendiente,
                    COUNT(cu.id) FILTER (
                        WHERE cu.estado = 'PENDIENTE' AND cu.fecha_vencimiento < CURRENT_DATE
                    ) AS cuotas_vencidas
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


def sync_morosos(db: Session) -> dict:
    """Pull morosos from Legal Finance contable_db and upsert into cobrador_leads."""
    try:
        rows = _fetch_morosos_from_contable()
    except Exception as e:
        return {"ok": False, "error": str(e), "created": 0, "updated": 0}

    # Default cobrador: first cobrador user
    cobrador = db.query(models.User).filter(models.User.role == "cobrador").first()
    if not cobrador:
        return {"ok": False, "error": "No hay usuarios cobrador en Nexio", "created": 0, "updated": 0}

    created = updated = 0

    for row in rows:
        phone_raw = row.get("telefono") or ""
        phone = _clean_phone(phone_raw) if phone_raw else None
        rut = (row.get("rut") or "").strip() or None
        email = (row.get("email") or "").strip() or None

        # Find or create Contact by phone (for WhatsApp chat)
        contact_id = None
        if phone:
            contact = db.query(models.Contact).filter(models.Contact.phone == phone).first()
            if not contact:
                contact = models.Contact(
                    name=row["nombre"],
                    phone=phone,
                    email=email,
                    rut_persona=rut,
                    group_id=cobrador.group_id,
                )
                db.add(contact)
                db.flush()
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

        if lead:
            # Update debt amounts and sync metadata
            lead.monto_deuda         = float(row["deuda_pendiente"])
            lead.lf_cuotas_vencidas  = int(row["cuotas_vencidas"])
            if contact_id and not lead.contact_id:
                lead.contact_id = contact_id
            if pagacuotas_id and not lead.pagacuotas_cliente_id:
                lead.pagacuotas_cliente_id = pagacuotas_id
            updated += 1
        else:
            lead = models.CobradorLead(
                cobrador_id          = cobrador.id,
                contact_id           = contact_id,
                nombre               = row["nombre"],
                rut                  = rut,
                empresa              = row.get("tipo_servicio"),
                telefono             = phone,
                email                = email,
                monto_deuda          = float(row["deuda_pendiente"]),
                monto_pagado         = 0,
                num_cuotas           = ncuotas,
                cuota_inicial        = float(row.get("monto_pago_inicial") or 0),
                monto_cuota          = monto_cuota,
                lf_cliente_id        = row["lf_cliente_id"],
                lf_contrato_id       = row["lf_contrato_id"],
                lf_cuotas_vencidas   = int(row["cuotas_vencidas"]),
                pagacuotas_cliente_id = pagacuotas_id,
                stage                = "lead_moroso",
            )
            db.add(lead)
            created += 1

    db.commit()
    return {"ok": True, "created": created, "updated": updated, "total": len(rows)}


@router.post("/sync")
def trigger_sync(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Sync morosos from Legal Finance into cobrador panel. Admin or cobrador."""
    if current_user.role not in ("cobrador", "superadmin", "subadmin", "tecnico"):
        raise HTTPException(status_code=403, detail="Sin acceso")
    result = sync_morosos(db)
    if not result["ok"]:
        raise HTTPException(status_code=503, detail=result.get("error", "Error de sincronización"))
    return result


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

    # Don't seed fake data if real LF data exists
    if db.query(models.CobradorLead).filter(
        models.CobradorLead.cobrador_id == cobrador.id
    ).first():
        print("DB already seeded.")
        return

    # Try live sync first
    result = sync_morosos(db)
    if result["ok"] and result["total"] > 0:
        print(f"✅ Synced {result['total']} morosos from Legal Finance")
        return

    # Fall back to fake seed only if sync fails and table is empty
    fake = [
        dict(nombre="Juan Carlos Vega",      rut="12.345.678-9", empresa="Servicios Digitales SpA",  telefono="+56912345001", email="jvega@sdigitales.cl",   monto_deuda=4_500_000,  monto_pagado=0,         num_cuotas=6,  cuota_inicial=500_000,  monto_cuota=666_667,  descripcion="Facturas pendientes Q3 2024.", stage="lead_moroso"),
        dict(nombre="María Ester Rojas",      rut="15.678.901-2", empresa="Importadora Norte Ltda",   telefono="+56912345002", email="mrojas@impnorte.cl",    monto_deuda=12_000_000, monto_pagado=2_000_000, num_cuotas=12, cuota_inicial=2_000_000, monto_cuota=833_333,  descripcion="Acuerdo parcial previo.", stage="pago_comprometido"),
        dict(nombre="Carolina Beatriz Silva", rut="18.999.111-K", empresa="Constructora del Sur SpA", telefono="+56912345004", email="csilva@constsur.cl",     monto_deuda=28_000_000, monto_pagado=0,         num_cuotas=24, cuota_inicial=4_000_000, monto_cuota=1_000_000,descripcion="Proceso judicial en curso.", stage="lead_moroso"),
        dict(nombre="Ana Luisa Torres",       rut="14.555.777-8", empresa="Café Torres SRL",          telefono="+56912345006", email="atorres@cafetorres.cl",  monto_deuda=1_800_000,  monto_pagado=0,         num_cuotas=3,  cuota_inicial=300_000,  monto_cuota=500_000,  descripcion="Arrendamiento impago.", stage="lead_moroso"),
        dict(nombre="Valentina Morales",      rut="16.234.567-0", empresa="Diseño Digital Ltda",      telefono="+56912345008", email="vmorales@ddltda.cl",     monto_deuda=3_100_000,  monto_pagado=500_000,   num_cuotas=5,  cuota_inicial=500_000,  monto_cuota=520_000,  descripcion="Abono realizado.", stage="pago_comprometido"),
    ]
    for data in fake:
        db.add(models.CobradorLead(cobrador_id=cobrador.id, **data))
    db.commit()
    print(f"✅ Seeded {len(fake)} fake cobrador leads (LF sync unavailable)")
