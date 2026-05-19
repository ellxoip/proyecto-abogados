"""
Reintentar el push a hive-financial-control para leads que quedaron en
estado pago_comprometido SIN reflejarse en FC (porque les faltaba el
financiero, FC respondió 400 y NEXIO solo loggeó warning).

Uso:
    cd NEXIO/backend
    python -m scripts.retry_legal_finance_push           # dry-run (lista)
    python -m scripts.retry_legal_finance_push --apply   # ejecuta los pushes

Selecciona leads donde:
    current_stage == "pago_comprometido"
    AND legal_finance_contrato_id IS NULL
    AND honorarios > 0
    AND cuota_inicial > 0
    AND num_cuotas >= 1

Imprime los leads sin financiero (necesitan llenarse antes de reintentar)
y los que sí pueden ser pusheados.
"""
import argparse
import asyncio
import logging
import os
import sys
from datetime import datetime, timezone

# Permitir ejecutar como módulo desde backend/ o como script suelto.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import joinedload  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app import models  # noqa: E402
from app.utils import legal_finance as lf  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger("retry_lf_push")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Ejecutar los pushes (sin esta flag solo lista).",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        leads = (
            db.query(models.Lead)
            .options(joinedload(models.Lead.contact))
            .filter(
                models.Lead.current_stage == "pago_comprometido",
                models.Lead.legal_finance_contrato_id.is_(None),
            )
            .all()
        )
        print(f"Leads en pago_comprometido sin contrato FC: {len(leads)}\n")

        pushable: list[models.Lead] = []
        missing: list[tuple[models.Lead, list[str]]] = []
        for lead in leads:
            missing_fields = []
            honorarios = float(lead.honorarios or 0)
            cuota_inicial = float(lead.cuota_inicial or 0)
            monto_cuota = float(lead.monto_cuota or 0)
            num_cuotas = int(lead.num_cuotas or 0)
            if honorarios <= 0:
                missing_fields.append("honorarios")
            if num_cuotas < 1:
                missing_fields.append("num_cuotas")
            # Aceptamos puerta A (cuota_inicial) o puerta B (monto_cuota).
            if cuota_inicial <= 0 and monto_cuota <= 0:
                missing_fields.append("cuota_inicial o monto_cuota")
            if missing_fields:
                missing.append((lead, missing_fields))
            else:
                pushable.append(lead)

        if missing:
            print("─ FALTAN DATOS (no se reintenta hasta que se llenen): ───")
            for lead, fields in missing:
                name = lead.contact.name if lead.contact else "(sin contacto)"
                print(f"  Lead #{lead.id} {name} — faltan: {', '.join(fields)}")
            print()

        if not pushable:
            print("No hay leads listos para reintentar.")
            return 0

        print("─ LISTOS PARA REINTENTAR: ───")
        for lead in pushable:
            name = lead.contact.name if lead.contact else "(sin contacto)"
            print(
                f"  Lead #{lead.id} {name} — honorarios={lead.honorarios}, "
                f"cuota_inicial={lead.cuota_inicial}, num_cuotas={lead.num_cuotas}"
            )
        print()

        if not args.apply:
            print("Dry-run. Re-correr con --apply para ejecutar los pushes.")
            return 0

        async def push_one(lead: models.Lead) -> None:
            contact = lead.contact
            rut = (
                (contact.rut_persona or contact.rut_empresa) if contact else None
            ) or f"SIN-RUT-{lead.id}"
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            # Derivar cuota_inicial (puerta B): si solo trajo monto_cuota,
            # cuota_inicial = max(0, honorarios - num_cuotas*monto_cuota).
            honorarios = float(lead.honorarios or 0)
            cuota_inicial_db = float(lead.cuota_inicial or 0)
            monto_cuota = float(lead.monto_cuota or 0)
            num_cuotas = int(lead.num_cuotas or 1)
            cuota_inicial = (
                cuota_inicial_db
                if cuota_inicial_db > 0
                else max(0.0, round(honorarios - num_cuotas * monto_cuota, 2))
            )
            try:
                result = await lf.push_pago_comprometido(
                    crm_lead_id=lead.id,
                    rut=rut,
                    nombre=contact.name if contact else "Cliente",
                    email=contact.email if contact else None,
                    phone=contact.phone if contact else None,
                    honorarios=honorarios,
                    cuota_inicial=cuota_inicial,
                    num_cuotas=num_cuotas,
                    tipo_servicio=lead.service_description or "Servicio",
                    fecha_ingreso=today,
                )
                contrato_id = result.get("contratoId") if result else None
                if contrato_id:
                    lead.legal_finance_contrato_id = int(contrato_id)
                    db.commit()
                    print(f"  ✓ Lead #{lead.id} → contrato FC #{contrato_id}")
                else:
                    print(f"  ✗ Lead #{lead.id} respondió sin contratoId: {result}")
            except Exception as exc:
                print(f"  ✗ Lead #{lead.id} falló: {exc}")

        print("─ PUSH: ───")
        asyncio.run(asyncio.gather(*(push_one(l) for l in pushable)))
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
