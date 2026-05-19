from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List
from ..database import get_db
from .. import models, schemas
from ..auth import get_current_user, require_roles, get_visible_group_ids

router = APIRouter(prefix="/api/groups", tags=["groups"])


@router.get("", response_model=List[schemas.GroupOut])
def list_groups(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    gids = get_visible_group_ids(db, current_user)
    if gids is None:
        return db.query(models.Group).all()
    return db.query(models.Group).filter(models.Group.id.in_(gids)).all()


@router.post("", response_model=schemas.GroupOut)
def create_group(
    data: schemas.GroupCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("superadmin", "subadmin"))
):
    # Attach new group as a sub-group of the superadmin's negocio
    negocio_id = None
    if current_user.group_id:
        ug = db.query(models.Group).filter(models.Group.id == current_user.group_id).first()
        if ug:
            negocio_id = ug.negocio_id if ug.negocio_id else ug.id
    group = models.Group(name=data.name, description=data.description, negocio_id=negocio_id)
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


@router.put("/{group_id}", response_model=schemas.GroupOut)
def update_group(
    group_id: int,
    data: schemas.GroupUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("superadmin", "subadmin"))
):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(group, field, value)
    db.commit()
    db.refresh(group)
    return group


@router.delete("/{group_id}")
def delete_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("superadmin"))
):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    db.delete(group)
    db.commit()
    return {"ok": True}


# ── DEFAULT ASSIGNMENT ───────────────────────────────────
@router.get("/{group_id}/default-assignment")
def get_default_assignment(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Return first active agendadora and vendedor for auto-assignment when creating a lead."""
    agendadora = db.query(models.User).filter(
        models.User.group_id == group_id,
        models.User.role == "agendadora",
        models.User.is_active == True
    ).first()
    vendedor = db.query(models.User).filter(
        models.User.group_id == group_id,
        models.User.role == "vendedor",
        models.User.is_active == True
    ).first()
    return {
        "agendadora": {"id": agendadora.id, "name": agendadora.name} if agendadora else None,
        "vendedor": {"id": vendedor.id, "name": vendedor.name} if vendedor else None,
    }


# ── AREAS ────────────────────────────────────────────────
@router.get("/{group_id}/areas", response_model=List[schemas.AreaOut])
def list_areas(group_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return (
        db.query(models.Area)
        .options(joinedload(models.Area.phone_configs))
        .filter(models.Area.group_id == group_id)
        .all()
    )


@router.post("/{group_id}/areas", response_model=schemas.AreaOut)
def create_area(
    group_id: int,
    data: schemas.AreaCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("superadmin", "subadmin"))
):
    config_ids = list(data.whatsapp_config_ids)
    if data.whatsapp_config_id and data.whatsapp_config_id not in config_ids:
        config_ids.insert(0, data.whatsapp_config_id)

    payload = data.model_dump(exclude={"whatsapp_config_ids"})
    payload["group_id"] = group_id
    payload["whatsapp_config_id"] = config_ids[0] if config_ids else None
    area = models.Area(**payload)
    db.add(area)
    db.flush()

    for wid in config_ids:
        wc = db.query(models.WhatsAppConfig).filter(models.WhatsAppConfig.id == wid).first()
        if wc and wc not in area.phone_configs:
            area.phone_configs.append(wc)

    db.commit()
    db.refresh(area)
    return area


@router.put("/areas/{area_id}", response_model=schemas.AreaOut)
def update_area(
    area_id: int,
    data: schemas.AreaUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("superadmin", "subadmin"))
):
    area = db.query(models.Area).filter(models.Area.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Área no encontrada")

    fields = data.model_dump(exclude_unset=True, exclude={"whatsapp_config_ids"})
    for field, value in fields.items():
        setattr(area, field, value)

    if data.whatsapp_config_ids is not None:
        config_ids = list(data.whatsapp_config_ids)
        if data.whatsapp_config_id and data.whatsapp_config_id not in config_ids:
            config_ids.insert(0, data.whatsapp_config_id)

        area.phone_configs.clear()
        for wid in config_ids:
            wc = db.query(models.WhatsAppConfig).filter(models.WhatsAppConfig.id == wid).first()
            if wc:
                area.phone_configs.append(wc)
        area.whatsapp_config_id = config_ids[0] if config_ids else None

    db.commit()
    db.refresh(area)
    return area


@router.delete("/areas/{area_id}")
def delete_area(
    area_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("superadmin", "subadmin"))
):
    area = db.query(models.Area).filter(models.Area.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Área no encontrada")
    db.delete(area)
    db.commit()
    return {"ok": True}


# ── WHATSAPP CONFIGS ─────────────────────────────────────
@router.get("/{group_id}/whatsapp", response_model=List[schemas.WhatsAppConfigOut])
def list_whatsapp(group_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.WhatsAppConfig).filter(models.WhatsAppConfig.group_id == group_id).all()


@router.post("/{group_id}/whatsapp", response_model=schemas.WhatsAppConfigOut)
def create_whatsapp(
    group_id: int,
    data: schemas.WhatsAppConfigCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("superadmin", "subadmin"))
):
    data.group_id = group_id
    config = models.WhatsAppConfig(**data.model_dump())
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


@router.put("/whatsapp/{config_id}", response_model=schemas.WhatsAppConfigOut)
def update_whatsapp(
    config_id: int,
    data: schemas.WhatsAppConfigUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("superadmin", "subadmin"))
):
    config = db.query(models.WhatsAppConfig).filter(models.WhatsAppConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config no encontrada")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(config, field, value)
    db.commit()
    db.refresh(config)
    return config


@router.delete("/whatsapp/{config_id}")
def delete_whatsapp(
    config_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("superadmin", "subadmin"))
):
    config = db.query(models.WhatsAppConfig).filter(models.WhatsAppConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config no encontrada")
    db.delete(config)
    db.commit()
    return {"ok": True}
