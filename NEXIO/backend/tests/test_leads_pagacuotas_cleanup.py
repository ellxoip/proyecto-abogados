"""
Regression tests post-refactor (ADR-1, mayo 2026).

NEXIO ya NO empuja a PagaCuotas en el stage handler `pago_comprometido`. El
ownership del fan-out a PagaCuotas vive en hive-financial-control. Estos tests
fijan la ausencia del push directo para prevenir reintroducción accidental.

Ver: hive-financial-control/docs/INTEGRATIONS.md (ADR-1).
"""

import inspect
import re
from pathlib import Path


def _read_leads_source() -> str:
    path = Path(__file__).resolve().parent.parent / "app" / "routers" / "leads.py"
    return path.read_text(encoding="utf-8")


def _pago_comprometido_block() -> str:
    """
    Devuelve el bloque del stage handler `pago_comprometido` dentro de leads.py
    para asertar contra él específicamente (no falsos positivos por código en
    otros stages o helpers).
    """
    src = _read_leads_source()
    # El bloque empieza tras `if/elif new_stage == "pago_comprometido":` y termina
    # antes del próximo `elif`/`if new_stage` o del final de la función.
    # Tomamos un slice amplio (~200 líneas) que cubra ambos bloques de pago_comprometido.
    match = re.search(
        r'(?:if|elif) new_stage == "pago_comprometido":(.*?)(?=\n    (?:elif|if) new_stage|\Z)',
        src,
        re.DOTALL,
    )
    assert match, "No se encontró bloque pago_comprometido en leads.py"
    return match.group(1)


# ──────────────────────────────────────────────────────────────────────────────
# Estructural: imports y referencias eliminadas
# ──────────────────────────────────────────────────────────────────────────────


def test_leads_module_no_importa_pagacuotas_directo():
    """leads.py no debe importar utils.pagacuotas (pc) — ownership movido a financial."""
    src = _read_leads_source()
    forbidden_patterns = [
        r"from\s+\.\.utils\s+import\s+pagacuotas",
        r"from\s+\.\.utils\.pagacuotas\s+import",
        r"import\s+\.\.utils\.pagacuotas",
    ]
    for pat in forbidden_patterns:
        assert not re.search(pat, src), (
            f"leads.py reintrodujo import de utils.pagacuotas (patrón: {pat}). "
            "El push a PagaCuotas vive en hive-financial-control."
        )


def test_leads_no_invoca_crear_cliente_pagacuotas():
    """No debe haber call a pc.crear_cliente o pagacuotas.crear_cliente."""
    src = _read_leads_source()
    forbidden_calls = [
        "pc.crear_cliente",
        "pagacuotas.crear_cliente",
        ".crear_cliente(",
    ]
    for call in forbidden_calls:
        assert call not in src, (
            f"leads.py reintrodujo llamada `{call}`. "
            "El push a PagaCuotas vive en hive-financial-control."
        )


def test_pago_comprometido_no_setea_pagacuotas_status_created():
    """
    El stage handler ya no debe setear pagacuotas_status manualmente. Si vuelve a
    aparecer, alguien revirtió el cleanup.
    """
    block = _pago_comprometido_block()
    forbidden_strings = [
        'pagacuotas_status = "created"',
        'pagacuotas_status = "retry_pending"',
        "pagacuotas_cliente_id =",
        "pagacuotas_link =",
    ]
    for s in forbidden_strings:
        assert s not in block, (
            f"Bloque pago_comprometido reintrodujo `{s}`. "
            "Estado de PagaCuotas debe poblarse via callback desde financial-control."
        )


def test_pago_comprometido_no_invoca_dispatch_payment_link_wa():
    """
    `_dispatch_payment_link_wa` no debe invocarse desde el stage handler. Si se
    requiere enviar WhatsApp con el link, debe activarse via callback desde
    financial-control (no desde push directo de NEXIO).
    """
    block = _pago_comprometido_block()
    assert "_dispatch_payment_link_wa(" not in block, (
        "Bloque pago_comprometido reintrodujo _dispatch_payment_link_wa. "
        "El WhatsApp con el link debe activarse via callback de financial-control."
    )


def test_pago_comprometido_no_crea_caso_hive_service_directo():
    """
    El alta en hive-service-control ocurre despues del pago confirmado por
    PagaCuotas/SIS.CONTABLE, no cuando el lead solo promete pagar.
    """
    block = _pago_comprometido_block()
    forbidden = [
        "hs.push_pago_comprometido",
        "hive_service_status = \"created\"",
        "hive_service_status = \"failed\"",
    ]
    for item in forbidden:
        assert item not in block, (
            f"Bloque pago_comprometido reintrodujo `{item}`. "
            "Hive Service debe recibir el caso solo tras payment_confirmed/service_started."
        )


# ──────────────────────────────────────────────────────────────────────────────
# Funcional: el módulo pagacuotas sigue exportando PagaCuotasUnavailable
# para callers legacy (admin endpoint en pagacuotas_router.py)
# ──────────────────────────────────────────────────────────────────────────────


def test_utils_pagacuotas_expone_excepcion_y_fallback_default_false():
    """
    Sanity de utils/pagacuotas.py: la excepción tipada existe y el fallback
    local está deshabilitado por default (ADR-3 análogo).
    """
    from app.utils import pagacuotas as pc

    assert hasattr(pc, "PagaCuotasUnavailable"), "Falta clase PagaCuotasUnavailable."
    assert issubclass(pc.PagaCuotasUnavailable, RuntimeError)
    # Sin env vars seteadas en CI, ALLOW_LOCAL_FALLBACK debe ser False.
    assert pc.ALLOW_LOCAL_FALLBACK is False, (
        "ALLOW_LOCAL_FALLBACK debe ser False por default. "
        "Solo true si ENVIRONMENT != production Y PAGACUOTAS_ALLOW_LOCAL_FALLBACK=true."
    )


def test_legal_finance_push_sigue_activo_en_pago_comprometido():
    """
    Verifica que NEXIO sigue notificando a financial-control en el stage
    pago_comprometido (vía lf.push_pago_comprometido). Es la única conexión
    saliente vigente para este stage.
    """
    block = _pago_comprometido_block()
    assert "lf.push_pago_comprometido" in block, (
        "Bloque pago_comprometido perdió la llamada lf.push_pago_comprometido. "
        "NEXIO debe seguir notificando a hive-financial-control."
    )


def test_leads_signature_handler_intacto():
    """
    Smoke: el módulo leads se importa sin errores tras el cleanup. Si hay
    referencia colgante a `pc` u otro símbolo eliminado, el import falla.
    """
    from app.routers import leads

    assert inspect.ismodule(leads)
    assert hasattr(leads, "router")
