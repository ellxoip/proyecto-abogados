"""
CRM → PagaCuotas integration.
Primary: calls pagaCuotas-main API (port 4000) via POST /api/integrations/crm/payment-commitments.
Fallback: creates client record directly in local DB if API is unavailable.
"""
import os
import secrets
import logging
import httpx

logger = logging.getLogger(__name__)

PAGACUOTAS_URL     = os.getenv("PAGACUOTAS_URL",     "http://localhost:4000")
PAGACUOTAS_API_KEY = os.getenv("PAGACUOTAS_API_KEY", "")
PAGACUOTAS_PORTAL_URL = os.getenv("PAGACUOTAS_PORTAL_URL", "http://localhost:5000")


def _local_token() -> str:
    return secrets.token_urlsafe(40)


def _local_fallback(
    *,
    db,
    crm_lead_id: int,
    rut: str,
    nombre: str,
    razon_social: str | None,
    email: str | None,
    phone: str | None,
    honorarios: float,
    cuota_inicial: float,
    num_cuotas: int,
    monto_cuota: float,
    tipo_servicio: str,
    area_name: str | None,
    vendedor_name: str | None,
) -> dict:
    """Create client in local DB when pagaCuotas API is unreachable."""
    from .. import models

    existing = db.query(models.PagaCuotasCliente).filter(
        models.PagaCuotasCliente.crm_lead_id == crm_lead_id
    ).first()
    if existing:
        link = f"{PAGACUOTAS_PORTAL_URL}/client/access/{existing.access_token}"
        return {"id": existing.id, "payment_link": link, "whatsapp": {}}

    token = _local_token()
    monto_calc = monto_cuota if monto_cuota > 0 else round(
        cuota_inicial if cuota_inicial > 0 else (honorarios / max(num_cuotas, 1))
    )
    cliente = models.PagaCuotasCliente(
        crm_lead_id=crm_lead_id,
        nombre=nombre,
        rut=rut,
        razon_social=razon_social,
        email=email,
        phone=phone,
        honorarios=honorarios,
        cuota_inicial=cuota_inicial,
        num_cuotas=num_cuotas,
        monto_cuota=monto_calc,
        tipo_servicio=tipo_servicio,
        area_name=area_name,
        vendedor_name=vendedor_name,
        access_token=token,
    )
    db.add(cliente)
    db.flush()

    link = f"{PAGACUOTAS_PORTAL_URL}/client/access/{token}"
    nombre_first = nombre.split()[0] if nombre else "estimado cliente"
    wa_msg = (
        f"Hola {nombre_first}, ya puedes pagar tus cuotas en PagaCuotas.\n"
        f"Ingresa directamente aquí: {link}\n"
        f"Este enlace es personal y seguro."
    )
    return {"id": cliente.id, "payment_link": link, "whatsapp": {"to": phone, "message": wa_msg}}


async def crear_cliente(
    *,
    db,
    crm_lead_id: int,
    rut: str,
    nombre: str,
    razon_social: str | None = None,
    email: str | None = None,
    phone: str | None = None,
    honorarios: float,
    cuota_inicial: float,
    num_cuotas: int,
    monto_cuota: float = 0,
    tipo_servicio: str,
    area_name: str | None = None,
    vendedor_name: str | None = None,
) -> dict:
    """
    Push lead payment commitment to pagaCuotas-main API.
    Falls back to local DB if the API is unreachable.
    Returns: {id, payment_link, whatsapp: {to, message}}
    """
    monto_calc = monto_cuota if monto_cuota > 0 else round(
        cuota_inicial if cuota_inicial > 0 else (honorarios / max(num_cuotas, 1))
    )

    payload = {
        "crm_lead_id": str(crm_lead_id),
        "status": "payment_committed",
        "contact": {
            "nombre": nombre,
            "telefono": phone or "",
            "correo": email or "",
            "rut": rut,
            "empresa": razon_social or "",
        },
        "expediente": {
            "area": area_name or tipo_servicio,
            "vendedor": vendedor_name or "",
        },
        "honorarios": {
            "total": honorarios,
            "cuota_inicial": cuota_inicial,
            "numero_cuotas": num_cuotas,
            "monto_cuota": monto_calc,
        },
        "descripcion": tipo_servicio,
    }

    headers = {}
    if PAGACUOTAS_API_KEY:
        headers["x-api-key"] = PAGACUOTAS_API_KEY

    try:
        async with httpx.AsyncClient(timeout=12) as client:
            resp = await client.post(
                f"{PAGACUOTAS_URL}/api/integrations/crm/payment-commitments",
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()

        payment_link = data.get("payment_link", "")
        logger.info(
            "PagaCuotas API: cliente creado para lead %s → %s",
            crm_lead_id, payment_link,
        )
        return {
            "id": data.get("commitment", {}).get("id", crm_lead_id),
            "payment_link": payment_link,
            "whatsapp": data.get("whatsapp", {}),
        }

    except Exception as exc:
        logger.warning(
            "PagaCuotas API no disponible para lead %s (%s). Usando DB local.",
            crm_lead_id, exc,
        )
        return _local_fallback(
            db=db,
            crm_lead_id=crm_lead_id,
            rut=rut,
            nombre=nombre,
            razon_social=razon_social,
            email=email,
            phone=phone,
            honorarios=honorarios,
            cuota_inicial=cuota_inicial,
            num_cuotas=num_cuotas,
            monto_cuota=monto_calc,
            tipo_servicio=tipo_servicio,
            area_name=area_name,
            vendedor_name=vendedor_name,
        )
