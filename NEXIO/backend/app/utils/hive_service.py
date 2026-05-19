import os
from typing import Any

import aiohttp


HIVE_SERVICE_URL = os.getenv("HIVE_SERVICE_URL", "http://localhost:3001").rstrip("/")
HIVE_SERVICE_API_KEY = os.getenv("HIVE_SERVICE_API_KEY") or os.getenv("INTEGRATION_INTERNAL_API_KEY")


async def push_pago_comprometido(
    *,
    crm_lead_id: int,
    rut: str,
    nombre: str,
    email: str | None,
    telefono: str | None,
    case_code: str,
    service_category: str,
    honorarios: float,
    cuota_inicial: float,
    num_cuotas: int,
    monto_cuota: float,
    vendedor: str | None,
    agendadora: str | None,
    work_order: dict[str, Any] | None,
    payment_link: str | None = None,
) -> dict[str, Any]:
    if not HIVE_SERVICE_API_KEY:
        raise RuntimeError("HIVE_SERVICE_API_KEY no configurada")

    payload = {
        "rut": rut,
        "nombre": nombre,
        "email": email,
        "telefono": telefono,
        "case_code": case_code,
        "service_category": service_category,
        "crm_lead_id": crm_lead_id,
        "correlation_id": f"nexio-lead-{crm_lead_id}",
        "initial_payment_amount": cuota_inicial,
        "payment_link": payment_link,
        "work_order": work_order,
        "financials": {
            "honorarios": honorarios,
            "cuota_inicial": cuota_inicial,
            "num_cuotas": num_cuotas,
            "monto_cuota": monto_cuota,
        },
        "team": {
            "vendedor": vendedor,
            "agendadora": agendadora,
        },
        "source": "NEXIO",
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{HIVE_SERVICE_URL}/api/internal/integration/cases",
            json=payload,
            headers={
                "Authorization": f"Bearer {HIVE_SERVICE_API_KEY}",
                "Content-Type": "application/json",
            },
            timeout=aiohttp.ClientTimeout(total=20),
        ) as resp:
            data = await resp.json(content_type=None)
            if resp.status >= 400:
                raise RuntimeError(f"Hive Service error {resp.status}: {data}")
            return data
