from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from pydantic import BaseModel
from .. import models
from ..database import get_db
from ..auth import get_current_user

router = APIRouter(prefix="/api/cobrador", tags=["cobrador"])

STAGES = ["lead_moroso", "pago_comprometido", "pagado"]


def _to_dict(lead: models.CobradorLead) -> dict:
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


class StageUpdate(BaseModel):
    stage: str


class NotesUpdate(BaseModel):
    notes: str


def _check_access(lead: models.CobradorLead, current_user: models.User):
    if current_user.role == "cobrador" and lead.cobrador_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sin acceso")


@router.get("/leads")
def list_leads(
    stage: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in ("cobrador", "superadmin", "subadmin", "tecnico"):
        raise HTTPException(status_code=403, detail="Sin acceso")
    q = db.query(models.CobradorLead).options(joinedload(models.CobradorLead.contact))
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
    lead = db.query(models.CobradorLead).options(
        joinedload(models.CobradorLead.contact)
    ).filter(models.CobradorLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="No encontrado")
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
    lead = db.query(models.CobradorLead).filter(models.CobradorLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="No encontrado")
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
    lead = db.query(models.CobradorLead).filter(models.CobradorLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="No encontrado")
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
    lead = db.query(models.CobradorLead).filter(models.CobradorLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="No encontrado")
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


# ─── Seed ───────────────────────────────────────────────────────────────────

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

    if db.query(models.CobradorLead).filter(
        models.CobradorLead.cobrador_id == cobrador.id
    ).first():
        return

    fake = [
        dict(nombre="Juan Carlos Vega",      rut="12.345.678-9", empresa="Servicios Digitales SpA",  telefono="+56912345001", email="jvega@sdigitales.cl",   monto_deuda=4_500_000,  monto_pagado=0,         num_cuotas=6,  cuota_inicial=500_000,  monto_cuota=666_667,  descripcion="Facturas pendientes Q3 2024. Servicio de desarrollo web.", stage="lead_moroso"),
        dict(nombre="María Ester Rojas",      rut="15.678.901-2", empresa="Importadora Norte Ltda",   telefono="+56912345002", email="mrojas@impnorte.cl",    monto_deuda=12_000_000, monto_pagado=2_000_000, num_cuotas=12, cuota_inicial=2_000_000, monto_cuota=833_333,  descripcion="Deuda por importación de mercancía, acuerdo parcial previo.", stage="pago_comprometido"),
        dict(nombre="Pedro Andrés Muñoz",     rut="11.222.333-4", empresa=None,                       telefono="+56912345003", email="pmunoz@gmail.com",       monto_deuda=850_000,    monto_pagado=850_000,   num_cuotas=1,  cuota_inicial=850_000,  monto_cuota=0,        descripcion="Crédito de consumo. Pagado completamente.", stage="pagado"),
        dict(nombre="Carolina Beatriz Silva", rut="18.999.111-K", empresa="Constructora del Sur SpA", telefono="+56912345004", email="csilva@constsur.cl",     monto_deuda=28_000_000, monto_pagado=0,         num_cuotas=24, cuota_inicial=4_000_000, monto_cuota=1_000_000,descripcion="Incumplimiento contrato de obra. Proceso judicial en curso.", stage="lead_moroso"),
        dict(nombre="Roberto Carlos Pinto",   rut="9.876.543-2",  empresa="Transporte Rápido SpA",    telefono="+56912345005", email="rpinto@transrapido.cl",  monto_deuda=6_200_000,  monto_pagado=6_200_000, num_cuotas=4,  cuota_inicial=1_200_000, monto_cuota=1_250_000,descripcion="Deuda saldada en su totalidad. Cierre exitoso.", stage="pagado"),
        dict(nombre="Ana Luisa Torres",       rut="14.555.777-8", empresa="Café Torres SRL",          telefono="+56912345006", email="atorres@cafetorres.cl",  monto_deuda=1_800_000,  monto_pagado=0,         num_cuotas=3,  cuota_inicial=300_000,  monto_cuota=500_000,  descripcion="Arrendamiento impago. Primera gestión pendiente.", stage="lead_moroso"),
        dict(nombre="Cristóbal Herrera",      rut="10.101.202-3", empresa=None,                       telefono="+56912345007", email=None,                     monto_deuda=450_000,    monto_pagado=0,         num_cuotas=2,  cuota_inicial=0,        monto_cuota=225_000,  descripcion="Deudor contactado, comprometió pago para fin de mes.", stage="pago_comprometido"),
        dict(nombre="Valentina Morales",      rut="16.234.567-0", empresa="Diseño Digital Ltda",      telefono="+56912345008", email="vmorales@ddltda.cl",     monto_deuda=3_100_000,  monto_pagado=500_000,   num_cuotas=5,  cuota_inicial=500_000,  monto_cuota=520_000,  descripcion="Servicios de diseño gráfico impagos. Abono realizado.", stage="pago_comprometido"),
        dict(nombre="Diego Alejandro Núñez",  rut="13.777.888-5", empresa="Logística Sur SpA",        telefono="+56912345009", email="dnunez@logsur.cl",       monto_deuda=15_500_000, monto_pagado=15_500_000,num_cuotas=10, cuota_inicial=3_000_000, monto_cuota=1_250_000,descripcion="Pagado en su totalidad. Gestión exitosa.", stage="pagado"),
        dict(nombre="Patricia Elena García",  rut="17.432.100-1", empresa="Eventos Exclusivos SpA",   telefono="+56912345010", email="pgarcia@eventosexcl.cl", monto_deuda=2_200_000,  monto_pagado=0,         num_cuotas=4,  cuota_inicial=200_000,  monto_cuota=500_000,  descripcion="Anticipo de servicio no prestado. Sin respuesta aún.", stage="lead_moroso"),
    ]

    for data in fake:
        db.add(models.CobradorLead(cobrador_id=cobrador.id, **data))
    db.commit()
    print(f"✅ Seeded {len(fake)} cobrador leads")
