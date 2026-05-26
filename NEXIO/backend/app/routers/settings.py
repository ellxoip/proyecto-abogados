import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models
from ..auth import get_current_user

router = APIRouter(prefix="/api/settings", tags=["settings"])

DEFAULT_STAGE_LABELS = {
    "lead":                  "Lead",
    "reunion":               "Reunión",
    "altamente_interesado":  "Altamente Interesado",
    "cierre":                "Cierre",
    "pago_comprometido":     "Pago Comprometido",
    "pagado_confirmado":     "Pago Confirmado",
    "recuperacion_lead":     "Recuperación Lead",
    "recuperacion_reunion":  "Recuperación Reunión",
    "recuperacion_cierre":   "Recuperación Cierre",
    "recuperacion_pago":     "Recuperación Pago",
}


@router.get("/stage-labels")
def get_stage_labels(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    setting = db.query(models.AppSetting).filter(models.AppSetting.key == "stage_labels").first()
    if not setting:
        return DEFAULT_STAGE_LABELS
    stored = json.loads(setting.value)
    return {**DEFAULT_STAGE_LABELS, **stored}


@router.put("/stage-labels")
def update_stage_labels(
    data: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role not in ("superadmin", "subadmin"):
        raise HTTPException(status_code=403, detail="Sin permiso")

    # Allow updating any known stage key
    allowed = set(DEFAULT_STAGE_LABELS.keys())
    filtered = {k: v for k, v in data.items() if k in allowed and isinstance(v, str) and v.strip()}

    setting = db.query(models.AppSetting).filter(models.AppSetting.key == "stage_labels").first()
    if setting:
        setting.value = json.dumps(filtered)
    else:
        db.add(models.AppSetting(key="stage_labels", value=json.dumps(filtered)))
    db.commit()
    return {**DEFAULT_STAGE_LABELS, **filtered}
