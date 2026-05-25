from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from .. import models, schemas
from ..auth import get_current_user, hash_password, require_roles, get_visible_group_ids, validate_password_strength
from ..plans import enforce_limit, _get_negocio
from ..security import log_event

router = APIRouter(prefix="/api/users", tags=["users"])


def _ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/clear-dashboard")
def clear_dashboard(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    from datetime import datetime, timezone
    current_user.dashboard_clear_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.get("", response_model=List[schemas.UserOut])
def list_users(
    group_id: Optional[int] = None,
    role: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    q = db.query(models.User).filter(models.User.is_active == True)
    if current_user.role != "tecnico":
        q = q.filter(models.User.role != "tecnico")
    gids = get_visible_group_ids(db, current_user)
    if gids is not None:
        if current_user.role in ("superadmin", "subadmin"):
            q = q.filter(
                (models.User.group_id.in_(gids)) | (models.User.group_id.is_(None))
            )
        else:
            q = q.filter(models.User.group_id.in_(gids))
    if group_id:
        q = q.filter(models.User.group_id == group_id)
    if role:
        q = q.filter(models.User.role == role)
    return q.order_by(models.User.name).all()


@router.post("", response_model=schemas.UserOut)
def create_user(
    request: Request,
    data: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("superadmin", "subadmin"))
):
    existing = db.query(models.User).filter(models.User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email ya registrado")

    validate_password_strength(data.password)

    target_group_id = data.group_id or current_user.group_id
    negocio = _get_negocio(db, target_group_id)
    if negocio:
        from ..auth import get_visible_group_ids as _gvgi
        all_group_ids_q = db.query(models.Group.id).filter(
            (models.Group.id == negocio.id) | (models.Group.negocio_id == negocio.id)
        ).subquery()
        current_count = db.query(models.User).filter(
            models.User.group_id.in_(all_group_ids_q),
            models.User.is_active == True,
            models.User.role != "tecnico",
        ).count()
        enforce_limit(db, target_group_id, "max_users", current_count)

    user = models.User(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
        role=data.role,
        group_id=data.group_id,
        whatsapp_number=data.whatsapp_number
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    log_event(db, "user_created", user_id=current_user.id, actor_email=current_user.email,
              resource_type="user", resource_id=user.id,
              ip=_ip(request), details=f"Creado: {data.email} rol={data.role}")
    return user


@router.get("/{user_id}", response_model=schemas.UserOut)
def get_user(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user


@router.put("/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: int,
    request: Request,
    data: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("superadmin", "subadmin"))
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    changes = []
    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "password" and value:
            validate_password_strength(value)
            setattr(user, "password_hash", hash_password(value))
            changes.append("password_changed")
        elif field != "password":
            setattr(user, field, value)
            changes.append(field)
    db.commit()
    db.refresh(user)
    log_event(db, "user_updated", user_id=current_user.id, actor_email=current_user.email,
              resource_type="user", resource_id=user_id,
              ip=_ip(request), details=f"Campos: {', '.join(changes)}")
    return user


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("superadmin"))
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.is_active = False
    db.commit()
    log_event(db, "user_deactivated", user_id=current_user.id, actor_email=current_user.email,
              resource_type="user", resource_id=user_id,
              ip=_ip(request), details=f"Desactivado: {user.email}", severity="warning")
    return {"ok": True}
