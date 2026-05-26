"""
Google Calendar OAuth2 integration.
Uses httpx (already in requirements) — no extra Google SDK needed.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from typing import Optional
import httpx

from ..database import get_db
from .. import models
from ..auth import get_current_user

router = APIRouter(prefix="/api/google", tags=["google"])

GOOGLE_AUTH_URL    = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL   = "https://oauth2.googleapis.com/token"
GOOGLE_CALENDAR    = "https://www.googleapis.com/calendar/v3"
GOOGLE_USERINFO    = "https://www.googleapis.com/oauth2/v2/userinfo"
SCOPES = " ".join([
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/userinfo.email",
])


# ── Helpers ─────────────────────────────────────────────────

def _get_setting(db: Session, key: str) -> Optional[str]:
    s = db.query(models.AppSetting).filter(models.AppSetting.key == key).first()
    return s.value if s else None


def _get_credentials(db: Session):
    client_id     = _get_setting(db, "google_client_id")
    client_secret = _get_setting(db, "google_client_secret")
    redirect_uri  = _get_setting(db, "google_redirect_uri")
    if not client_id or not client_secret or not redirect_uri:
        raise HTTPException(
            status_code=503,
            detail="Google Calendar no configurado. El técnico debe ingresar las credenciales OAuth2.",
        )
    return client_id, client_secret, redirect_uri


async def _refresh_access_token(token: models.GoogleCalendarToken, db: Session):
    """Refresh the access token if it's expired or about to expire."""
    if not token.refresh_token:
        return False
    now = datetime.now(timezone.utc)
    expiry = token.token_expiry
    if expiry:
        # Add timezone info if missing (SQLite stores without tz)
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if expiry > now + timedelta(minutes=5):
            return True  # still valid

    client_id, client_secret, _ = _get_credentials(db)
    async with httpx.AsyncClient() as client:
        resp = await client.post(GOOGLE_TOKEN_URL, data={
            "grant_type":    "refresh_token",
            "refresh_token": token.refresh_token,
            "client_id":     client_id,
            "client_secret": client_secret,
        })
    if resp.status_code != 200:
        return False
    data = resp.json()
    token.access_token = data["access_token"]
    token.token_expiry = datetime.now(timezone.utc) + timedelta(seconds=data.get("expires_in", 3600))
    db.commit()
    return True


# ── Routes ─────────────────────────────────────────────────

@router.get("/status")
def google_status(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    token = db.query(models.GoogleCalendarToken).filter(
        models.GoogleCalendarToken.user_id == current_user.id
    ).first()
    configured = bool(_get_setting(db, "google_client_id"))
    return {
        "configured": configured,
        "connected": bool(token),
        "google_email": token.google_email if token else None,
        "calendar_id": token.google_calendar_id if token else None,
    }


@router.get("/auth-url")
def get_auth_url(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    client_id, _, redirect_uri = _get_credentials(db)
    params = (
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&scope={SCOPES.replace(' ', '%20')}"
        f"&access_type=offline"
        f"&prompt=consent"
        f"&state={current_user.id}"
    )
    return {"url": GOOGLE_AUTH_URL + params}


@router.get("/callback")
async def google_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Google redirects here after user approves. Stores tokens and closes popup."""
    if error or not code or not state:
        return HTMLResponse(_popup_html(success=False, message=error or "Autenticación cancelada"))

    try:
        user_id = int(state)
    except (ValueError, TypeError):
        return HTMLResponse(_popup_html(success=False, message="Estado inválido"))

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        return HTMLResponse(_popup_html(success=False, message="Usuario no encontrado"))

    client_id, client_secret, redirect_uri = _get_credentials(db)

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(GOOGLE_TOKEN_URL, data={
            "code":          code,
            "client_id":     client_id,
            "client_secret": client_secret,
            "redirect_uri":  redirect_uri,
            "grant_type":    "authorization_code",
        })

    if token_resp.status_code != 200:
        return HTMLResponse(_popup_html(success=False, message="Error al obtener tokens de Google"))

    token_data = token_resp.json()
    access_token  = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expires_in    = token_data.get("expires_in", 3600)
    expiry        = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

    # Fetch user email from Google
    google_email = None
    async with httpx.AsyncClient() as client:
        info_resp = await client.get(
            GOOGLE_USERINFO,
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if info_resp.status_code == 200:
        google_email = info_resp.json().get("email")

    # Upsert token record
    existing = db.query(models.GoogleCalendarToken).filter(
        models.GoogleCalendarToken.user_id == user_id
    ).first()
    if existing:
        existing.access_token  = access_token
        if refresh_token:
            existing.refresh_token = refresh_token
        existing.token_expiry  = expiry
        existing.google_email  = google_email
    else:
        db.add(models.GoogleCalendarToken(
            user_id=user_id,
            access_token=access_token,
            refresh_token=refresh_token,
            token_expiry=expiry,
            google_email=google_email,
        ))
    db.commit()

    return HTMLResponse(_popup_html(success=True, message=google_email or "Conectado"))


@router.delete("/disconnect")
def disconnect_google(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    token = db.query(models.GoogleCalendarToken).filter(
        models.GoogleCalendarToken.user_id == current_user.id
    ).first()
    if token:
        db.delete(token)
        db.commit()
    return {"ok": True}


@router.get("/events")
async def list_google_events(
    time_min: Optional[str] = None,
    time_max: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Fetch events from the user's Google Calendar."""
    token = db.query(models.GoogleCalendarToken).filter(
        models.GoogleCalendarToken.user_id == current_user.id
    ).first()
    if not token:
        return []

    ok = await _refresh_access_token(token, db)
    if not ok:
        return []

    params: dict = {"singleEvents": "true", "orderBy": "startTime", "maxResults": "250"}
    if time_min:
        params["timeMin"] = time_min
    if time_max:
        params["timeMax"] = time_max

    cal_id = token.google_calendar_id or "primary"
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GOOGLE_CALENDAR}/calendars/{cal_id}/events",
            headers={"Authorization": f"Bearer {token.access_token}"},
            params=params,
        )
    if resp.status_code != 200:
        return []

    items = resp.json().get("items", [])
    events = []
    for item in items:
        start = item.get("start", {})
        end   = item.get("end", {})
        events.append({
            "id":        item.get("id"),
            "title":     item.get("summary", "Sin título"),
            "start":     start.get("dateTime") or start.get("date"),
            "end":       end.get("dateTime")   or end.get("date"),
            "allDay":    "date" in start and "dateTime" not in start,
            "htmlLink":  item.get("htmlLink"),
            "source":    "google",
        })
    return events


@router.post("/sync-event/{event_id}")
async def sync_event_to_google(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Push a single CRM event to Google Calendar."""
    event = db.query(models.CalendarEvent).filter(models.CalendarEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Evento no encontrado")

    token = db.query(models.GoogleCalendarToken).filter(
        models.GoogleCalendarToken.user_id == current_user.id
    ).first()
    if not token:
        raise HTTPException(status_code=400, detail="Google Calendar no conectado")

    ok = await _refresh_access_token(token, db)
    if not ok:
        raise HTTPException(status_code=400, detail="Token de Google expirado, vuelve a conectar")

    payload = _crm_event_to_google(event)
    cal_id  = token.google_calendar_id or "primary"

    async with httpx.AsyncClient() as client:
        if event.google_event_id:
            # Update existing
            resp = await client.put(
                f"{GOOGLE_CALENDAR}/calendars/{cal_id}/events/{event.google_event_id}",
                headers={"Authorization": f"Bearer {token.access_token}"},
                json=payload,
            )
        else:
            # Create new
            resp = await client.post(
                f"{GOOGLE_CALENDAR}/calendars/{cal_id}/events",
                headers={"Authorization": f"Bearer {token.access_token}"},
                json=payload,
            )

    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=500, detail="Error al sincronizar con Google Calendar")

    google_event_id = resp.json().get("id")
    event.google_event_id = google_event_id
    db.commit()
    return {"ok": True, "google_event_id": google_event_id}


@router.post("/sync-all")
async def sync_all_events(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Sync ALL CRM events for current user to Google Calendar."""
    token = db.query(models.GoogleCalendarToken).filter(
        models.GoogleCalendarToken.user_id == current_user.id
    ).first()
    if not token:
        raise HTTPException(status_code=400, detail="Google Calendar no conectado")

    ok = await _refresh_access_token(token, db)
    if not ok:
        raise HTTPException(status_code=400, detail="Token de Google expirado")

    events = db.query(models.CalendarEvent).filter(
        (models.CalendarEvent.created_by == current_user.id) |
        (models.CalendarEvent.assigned_to == current_user.id)
    ).all()

    cal_id  = token.google_calendar_id or "primary"
    synced, failed = 0, 0

    async with httpx.AsyncClient() as client:
        for event in events:
            payload = _crm_event_to_google(event)
            try:
                if event.google_event_id:
                    resp = await client.put(
                        f"{GOOGLE_CALENDAR}/calendars/{cal_id}/events/{event.google_event_id}",
                        headers={"Authorization": f"Bearer {token.access_token}"},
                        json=payload,
                    )
                else:
                    resp = await client.post(
                        f"{GOOGLE_CALENDAR}/calendars/{cal_id}/events",
                        headers={"Authorization": f"Bearer {token.access_token}"},
                        json=payload,
                    )
                if resp.status_code in (200, 201):
                    event.google_event_id = resp.json().get("id")
                    synced += 1
                else:
                    failed += 1
            except Exception:
                failed += 1

    db.commit()
    return {"synced": synced, "failed": failed, "total": len(events)}


# ── Internal helpers ────────────────────────────────────────

def _crm_event_to_google(event: models.CalendarEvent) -> dict:
    def _iso(dt: datetime) -> str:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()

    desc = event.notes or ""
    if event.lead_id:
        desc = f"Lead #{event.lead_id} — {desc}" if desc else f"Lead #{event.lead_id}"

    color_map = {
        "#3B82F6": "7",   # blue → peacock
        "#10B981": "2",   # green → sage
        "#F59E0B": "5",   # amber → banana
        "#EF4444": "11",  # red → tomato
        "#8B5CF6": "3",   # violet → grape
        "#6B7280": "8",   # gray → graphite
    }

    return {
        "summary":     event.title,
        "description": desc,
        "start":       {"dateTime": _iso(event.start_time), "timeZone": "America/Santiago"},
        "end":         {"dateTime": _iso(event.end_time),   "timeZone": "America/Santiago"},
        "colorId":     color_map.get(event.color, "7"),
    }


def _popup_html(success: bool, message: str) -> str:
    if success:
        status_html = f"""
        <div class="icon success">✓</div>
        <h2>¡Google Calendar conectado!</h2>
        <p class="email">{message}</p>
        <p class="sub">Esta ventana se cerrará automáticamente.</p>
        """
        script = """
        if (window.opener) {
          window.opener.postMessage({ googleCalendar: 'connected', email: '%s' }, '*');
        }
        setTimeout(() => window.close(), 2000);
        """ % message
    else:
        status_html = f"""
        <div class="icon error">✗</div>
        <h2>Error de conexión</h2>
        <p class="sub">{message}</p>
        <button onclick="window.close()">Cerrar</button>
        """
        script = """
        if (window.opener) {
          window.opener.postMessage({ googleCalendar: 'error' }, '*');
        }
        """

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google Calendar</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh; background: #f8fafc; }}
    .card {{ background: white; border-radius: 16px; padding: 40px;
             text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,.08);
             max-width: 360px; width: 100%; }}
    .icon {{ width: 64px; height: 64px; border-radius: 50%;
             font-size: 28px; display: flex; align-items: center;
             justify-content: center; margin: 0 auto 20px; }}
    .icon.success {{ background: #ecfdf5; color: #10b981; }}
    .icon.error   {{ background: #fef2f2; color: #ef4444; }}
    h2  {{ font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }}
    .email {{ font-size: 14px; color: #64748b; margin-bottom: 8px; }}
    .sub {{ font-size: 13px; color: #94a3b8; margin-top: 12px; }}
    button {{ margin-top: 20px; padding: 10px 24px; border-radius: 8px;
              background: #0f172a; color: white; border: none; cursor: pointer;
              font-size: 14px; font-weight: 600; }}
  </style>
</head>
<body>
  <div class="card">
    {status_html}
  </div>
  <script>{script}</script>
</body>
</html>"""
