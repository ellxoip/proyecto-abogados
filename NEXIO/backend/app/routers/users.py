from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from .. import models, schemas
from ..auth import get_current_user, hash_password, require_roles, get_visible_group_ids

router = APIRouter(prefix="/api/users", tags=["users"])


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
    # Hide tecnico users from non-tecnico panels
    if current_user.role != "tecnico":
        q = q.filter(models.User.role != "tecnico")
    # Scope to user's negocio
    gids = get_visible_group_ids(db, current_user)
    if gids is not None:
        q = q.filter(models.User.group_id.in_(gids))
    elif group_id:
        q = q.filter(models.User.group_id == group_id)
    if role:
        q = q.filter(models.User.role == role)
    return q.order_by(models.User.name).all()


@router.post("", response_model=schemas.UserOut)
def create_user(
    data: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("superadmin", "subadmin"))
):
    existing = db.query(models.User).filter(models.User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email ya registrado")
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
    data: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("superadmin", "subadmin"))
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "password" and value:
            setattr(user, "password_hash", hash_password(value))
        elif field != "password":
            setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("superadmin"))
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.is_active = False
    db.commit()
    return {"ok": True}
