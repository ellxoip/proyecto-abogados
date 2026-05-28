from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.middleware.base import BaseHTTPMiddleware
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")
import os
import time

# Set Chilean Timezone
os.environ['TZ'] = 'America/Santiago'
if hasattr(time, 'tzset'):
    time.tzset()

from sqlalchemy import text
from .database import engine
from . import models
from .routers import auth, users, groups, contacts, leads, payments, calendar, notifications, whatsapp, pdf, webhooks, settings, tecnico, google_calendar, push, whatsapp_qr, whatsapp_sessions, at_informa_integration, legal_finance_integration, pagacuotas_router, ai_agents, pipeline_stages, work_orders, security, cobrador
from .seed import seed
from .auth import hash_password
from .broadcaster import wa_broadcaster
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="CRM Abogados Tributarios",
    description="Sistema CRM para gestión de leads, clientes y pagos",
    version="1.0.0",
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """ISO 27001 A.14.1.3 — HTTP security headers on every response."""
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        return response


app.add_middleware(SecurityHeadersMiddleware)

# ISO 27001 A.13.1 — CORS restricted to configured origins
_raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=_raw_origins != "*",
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(groups.router)
app.include_router(contacts.router)
app.include_router(leads.router)
app.include_router(payments.router)
app.include_router(calendar.router)
app.include_router(notifications.router)
app.include_router(whatsapp.router)
app.include_router(webhooks.router)
app.include_router(pdf.router)
app.include_router(settings.router)
app.include_router(tecnico.router)
app.include_router(google_calendar.router)
app.include_router(push.router)
app.include_router(whatsapp_qr.router)
app.include_router(whatsapp_qr.webhook_router)
app.include_router(whatsapp_sessions.router)
app.include_router(at_informa_integration.router)
app.include_router(legal_finance_integration.router)
app.include_router(pagacuotas_router.router)
app.include_router(pagacuotas_router.public_router)
app.include_router(ai_agents.router)
app.include_router(work_orders.router)
app.include_router(pipeline_stages.router)
app.include_router(security.router)
app.include_router(cobrador.router)


def _ensure_tecnico():
    """Create the root tecnico user if it doesn't exist."""
    from .database import SessionLocal
    db = SessionLocal()
    try:
        if not db.query(models.User).filter(models.User.role == "tecnico").first():
            db.add(models.User(
                name="Técnico Sistema",
                email="tecnico@abogadostributarios.cl",
                password_hash=hash_password("Tecnico2024!"),
                role="tecnico",
                group_id=None,
            ))
            db.commit()
            print("✅ Tecnico user created: tecnico@abogadostributarios.cl / Tecnico2024!")
    except Exception as e:
        db.rollback()
        print(f"⚠️  Could not create tecnico user: {e}")
    finally:
        db.close()


def _run_migrations():
    """SQLite-only: patch columns/tables on existing DBs. PostgreSQL uses create_all()."""
    from .database import _is_sqlite
    if not _is_sqlite:
        return
    with engine.connect() as conn:
        # Recreate whatsapp_configs with nullable group_id if needed
        # Check if group_id is NOT NULL
        cursor = conn.execute(text("PRAGMA table_info('whatsapp_configs')"))
        is_not_null = False
        for col in cursor.fetchall():
            if col[1] == 'group_id' and col[3] == 1:
                is_not_null = True
        
        if is_not_null:
            conn.execute(text("PRAGMA foreign_keys=OFF"))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS whatsapp_configs_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR(100) NOT NULL,
                    phone_number VARCHAR(30) NOT NULL,
                    api_token VARCHAR(500),
                    api_provider VARCHAR(30) DEFAULT 'manual',
                    phone_number_id VARCHAR(100),
                    group_id INTEGER REFERENCES groups(id),
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(text("INSERT INTO whatsapp_configs_new SELECT * FROM whatsapp_configs"))
            conn.execute(text("DROP TABLE whatsapp_configs"))
            conn.execute(text("ALTER TABLE whatsapp_configs_new RENAME TO whatsapp_configs"))
            conn.execute(text("PRAGMA foreign_keys=ON"))
            conn.commit()

        # Create push_subscriptions table if missing
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS push_subscriptions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    endpoint TEXT NOT NULL UNIQUE,
                    p256dh TEXT NOT NULL,
                    auth TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.commit()
        except Exception:
            pass

        # Create area_phone_numbers junction table (many-to-many area ↔ WA config)
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS area_phone_numbers (
                    area_id INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
                    whatsapp_config_id INTEGER NOT NULL REFERENCES whatsapp_configs(id) ON DELETE CASCADE,
                    PRIMARY KEY (area_id, whatsapp_config_id)
                )
            """))
            conn.commit()
            # Migrate existing whatsapp_config_id data
            conn.execute(text("""
                INSERT OR IGNORE INTO area_phone_numbers (area_id, whatsapp_config_id)
                SELECT id, whatsapp_config_id FROM areas WHERE whatsapp_config_id IS NOT NULL
            """))
            conn.commit()
        except Exception:
            pass

        for stmt in [
            "ALTER TABLE whatsapp_messages ADD COLUMN is_read BOOLEAN DEFAULT 0",
            "ALTER TABLE whatsapp_messages ADD COLUMN media_url VARCHAR(1000)",
            "ALTER TABLE calendar_events ADD COLUMN google_event_id VARCHAR(200)",
            "ALTER TABLE calendar_events ADD COLUMN vendor_status VARCHAR(30)",
            "ALTER TABLE payment_verifications ADD COLUMN invoice_url VARCHAR(1000)",
            # AT Informa integration columns
            "ALTER TABLE leads ADD COLUMN at_informa_case_id VARCHAR(100)",
            "ALTER TABLE leads ADD COLUMN at_informa_status VARCHAR(50)",
            "ALTER TABLE users ADD COLUMN at_informa_user_id VARCHAR(100)",
            # Legal Finance integration column
            "ALTER TABLE leads ADD COLUMN legal_finance_contrato_id INTEGER",
            # Vendor outcome tracking (for Seguimiento page)
            "ALTER TABLE leads ADD COLUMN last_vendor_outcome VARCHAR(30)",
            # PagaCuotas integration columns
            "ALTER TABLE leads ADD COLUMN pagacuotas_cliente_id VARCHAR(100)",
            "ALTER TABLE leads ADD COLUMN pagacuotas_status VARCHAR(20)",
            "ALTER TABLE leads ADD COLUMN pagacuotas_link VARCHAR(500)",
            "ALTER TABLE leads ADD COLUMN hive_service_case_id VARCHAR(100)",
            "ALTER TABLE leads ADD COLUMN hive_service_status VARCHAR(30)",
            "ALTER TABLE groups ADD COLUMN plan VARCHAR(20) DEFAULT 'basico'",
            "ALTER TABLE groups ADD COLUMN plan_expires_at DATETIME",
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass  # Column already exists

        # PagaCuotas tables
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS pagacuotas_clientes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    crm_lead_id INTEGER UNIQUE,
                    nombre VARCHAR(200) NOT NULL,
                    rut VARCHAR(30),
                    razon_social VARCHAR(200),
                    email VARCHAR(100),
                    phone VARCHAR(30),
                    honorarios REAL DEFAULT 0,
                    cuota_inicial REAL DEFAULT 0,
                    num_cuotas INTEGER DEFAULT 1,
                    monto_cuota REAL DEFAULT 0,
                    tipo_servicio VARCHAR(200),
                    area_name VARCHAR(100),
                    vendedor_name VARCHAR(100),
                    access_token VARCHAR(64) UNIQUE NOT NULL,
                    cuotas_pagadas INTEGER DEFAULT 0,
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS pagacuotas_pagos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cliente_id INTEGER NOT NULL REFERENCES pagacuotas_clientes(id) ON DELETE CASCADE,
                    monto REAL NOT NULL,
                    metodo VARCHAR(50),
                    referencia VARCHAR(100),
                    notas TEXT,
                    status VARCHAR(30) DEFAULT 'pendiente',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_pagacuotas_token ON pagacuotas_clientes (access_token)"))
            conn.commit()
        except Exception:
            pass

        # AI Agents tables
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS ai_agents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR(100) NOT NULL,
                    description TEXT,
                    whatsapp_config_id INTEGER REFERENCES whatsapp_configs(id),
                    group_id INTEGER REFERENCES groups(id),
                    is_active BOOLEAN DEFAULT 1,
                    openai_api_key VARCHAR(200) NOT NULL,
                    openai_model VARCHAR(50) DEFAULT 'gpt-4o-mini',
                    temperature REAL DEFAULT 0.7,
                    max_tokens INTEGER DEFAULT 500,
                    max_history_messages INTEGER DEFAULT 20,
                    system_prompt TEXT NOT NULL,
                    response_delay_seconds INTEGER DEFAULT 2,
                    escalation_keywords TEXT DEFAULT '[]',
                    business_hours_start VARCHAR(5),
                    business_hours_end VARCHAR(5),
                    total_messages_sent INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS ai_agent_contact_states (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    agent_id INTEGER NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
                    contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
                    state VARCHAR(20) DEFAULT 'active',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME,
                    UNIQUE(agent_id, contact_id)
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS ai_agent_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    agent_id INTEGER NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
                    contact_id INTEGER REFERENCES contacts(id),
                    lead_id INTEGER REFERENCES leads(id),
                    input_message TEXT,
                    output_message TEXT,
                    tokens_used INTEGER DEFAULT 0,
                    model_used VARCHAR(50),
                    latency_ms INTEGER DEFAULT 0,
                    error TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ai_agent_logs_agent ON ai_agent_logs(agent_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ai_agent_contact_agent ON ai_agent_contact_states(agent_id)"))
            conn.commit()
        except Exception:
            pass

        # ai_agent_configs M2M table + migrate existing single-config data
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS ai_agent_configs (
                    agent_id INTEGER NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
                    whatsapp_config_id INTEGER NOT NULL REFERENCES whatsapp_configs(id) ON DELETE CASCADE,
                    PRIMARY KEY (agent_id, whatsapp_config_id)
                )
            """))
            conn.execute(text("""
                INSERT OR IGNORE INTO ai_agent_configs (agent_id, whatsapp_config_id)
                SELECT id, whatsapp_config_id FROM ai_agents
                WHERE whatsapp_config_id IS NOT NULL
            """))
            conn.commit()
        except Exception:
            pass

        # Performance indexes (safe to re-run — CREATE INDEX IF NOT EXISTS)
        indexes = [
            "CREATE INDEX IF NOT EXISTS ix_leads_current_stage ON leads (current_stage)",
            "CREATE INDEX IF NOT EXISTS ix_leads_group_id ON leads (group_id)",
            "CREATE INDEX IF NOT EXISTS ix_leads_agendadora_id ON leads (agendadora_id)",
            "CREATE INDEX IF NOT EXISTS ix_leads_vendedor_id ON leads (vendedor_id)",
            "CREATE INDEX IF NOT EXISTS ix_leads_created_at ON leads (created_at)",
            "CREATE INDEX IF NOT EXISTS ix_leads_stage_group ON leads (current_stage, group_id)",
            "CREATE INDEX IF NOT EXISTS ix_leads_contact_id ON leads (contact_id)",
            "CREATE INDEX IF NOT EXISTS ix_wamsg_lead_id ON whatsapp_messages (lead_id)",
            "CREATE INDEX IF NOT EXISTS ix_wamsg_contact_id ON whatsapp_messages (contact_id)",
            "CREATE INDEX IF NOT EXISTS ix_notif_user_id ON notifications (user_id)",
            "CREATE INDEX IF NOT EXISTS ix_notif_is_read ON notifications (is_read)",
        ]
        for stmt in indexes:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass

        # Add negocio_id to groups (self-referential FK for sub-groups)
        try:
            conn.execute(text("ALTER TABLE groups ADD COLUMN negocio_id INTEGER REFERENCES groups(id)"))
            conn.commit()
        except Exception:
            pass

        # Add tipo to groups (negocio type — drives pipeline mode & integrations)
        try:
            conn.execute(text("ALTER TABLE groups ADD COLUMN tipo VARCHAR(50) NOT NULL DEFAULT 'abogados'"))
            conn.commit()
        except Exception:
            pass

        # ISO 27001 A.9.4.2 — brute-force lockout columns on users
        for stmt in [
            "ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE users ADD COLUMN locked_until DATETIME",
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass

        # ISO 27001 A.12.4.1 — security audit log table
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS security_audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    actor_email VARCHAR(100),
                    action VARCHAR(100) NOT NULL,
                    resource_type VARCHAR(50),
                    resource_id INTEGER,
                    ip_address VARCHAR(45),
                    user_agent VARCHAR(500),
                    details TEXT,
                    severity VARCHAR(20) NOT NULL DEFAULT 'info',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sal_action ON security_audit_logs(action)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sal_created ON security_audit_logs(created_at)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sal_severity ON security_audit_logs(severity)"))
            conn.commit()
        except Exception:
            pass

        # group_users M2M table (user can belong to multiple groups)
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS group_users (
                    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    PRIMARY KEY (group_id, user_id)
                )
            """))
            conn.commit()
        except Exception:
            pass

        # Pipeline stages table for non-abogados negocios
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS pipeline_stages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    negocio_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
                    key VARCHAR(100) NOT NULL,
                    name VARCHAR(100) NOT NULL,
                    color VARCHAR(50),
                    "order" INTEGER DEFAULT 0,
                    UNIQUE(negocio_id, key)
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_pipeline_stages_negocio ON pipeline_stages(negocio_id)"))
            conn.commit()
        except Exception:
            pass

@app.on_event("startup")
async def startup():
    _run_migrations()
    try:
        seed()
    except Exception as e:
        print(f"⚠️  Seed skipped (DB already initialized): {e}")
    _ensure_tecnico()
    try:
        _migrate_negocio()  # Must run after seed so superadmin user exists
    except Exception as e:
        print(f"⚠️  _migrate_negocio skipped: {e}")
    try:
        from .database import SessionLocal as _SL
        _db = _SL()
        cobrador.seed_cobrador(_db)  # ensures cobrador user exists
        result = cobrador.sync_morosos(_db)
        if result["ok"]:
            print(f"✅ LF sync: {result['created']} nuevos, {result['updated']} actualizados ({result['total']} morosos)")
        else:
            print(f"⚠️  LF sync failed: {result.get('error')}")
        _db.close()
    except Exception as e:
        print(f"⚠️  cobrador startup skipped: {e}")
    await wa_broadcaster.start()


@app.on_event("shutdown")
async def shutdown():
    await wa_broadcaster.stop()


def _migrate_negocio():
    """Assign orphan superadmins to a root negocio group. Must run AFTER seed()."""
    with engine.connect() as conn:
        try:
            orphan_admins = conn.execute(text(
                "SELECT id, name FROM users WHERE role='superadmin' AND group_id IS NULL ORDER BY id"
            )).fetchall()
            if not orphan_admins:
                return
            has_negocio = conn.execute(text(
                "SELECT g.id FROM groups g INNER JOIN users u ON u.group_id=g.id "
                "WHERE u.role='superadmin' AND g.negocio_id IS NULL LIMIT 1"
            )).fetchone()
            if has_negocio:
                # Root group already exists — assign any remaining orphans to it
                root_id = has_negocio[0]
                orphan_ids = ",".join(str(r[0]) for r in orphan_admins)
                conn.execute(text(f"UPDATE users SET group_id={root_id} WHERE id IN ({orphan_ids})"))
                conn.commit()
                print(f"✅ Assigned {len(orphan_admins)} orphan superadmin(s) to existing negocio (id={root_id})")
            else:
                # No root group yet — create one and assign ALL orphans
                from .database import _is_sqlite
                if _is_sqlite:
                    conn.execute(text(
                        "INSERT INTO groups (name, description, tipo) "
                        "VALUES ('Abogados Tributarios', 'Negocio principal', 'abogados')"
                    ))
                    conn.commit()
                    root_id = conn.execute(text("SELECT last_insert_rowid()")).scalar()
                else:
                    row = conn.execute(text(
                        "INSERT INTO groups (name, description, tipo) "
                        "VALUES ('Abogados Tributarios', 'Negocio principal', 'abogados') "
                        "RETURNING id"
                    )).fetchone()
                    conn.commit()
                    root_id = row[0]
                orphan_ids = ",".join(str(r[0]) for r in orphan_admins)
                conn.execute(text(f"UPDATE users SET group_id={root_id} WHERE id IN ({orphan_ids})"))
                conn.execute(text(
                    f"UPDATE groups SET negocio_id={root_id} "
                    f"WHERE negocio_id IS NULL AND id != {root_id}"
                ))
                conn.commit()
                print(f"✅ Negocio root group created (id={root_id}), {len(orphan_admins)} superadmin(s) assigned")
        except Exception as e:
            print(f"⚠️  _migrate_negocio: {e}")


@app.get("/health")
def health():
    return {"status": "ok"}


# Serve uploaded files (invoices, etc.)
uploads_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../uploads"))
os.makedirs(uploads_dir, exist_ok=True)
os.makedirs(os.path.join(uploads_dir, "whatsapp_media"), exist_ok=True)
try:
    app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")
except Exception:
    pass

# Serve frontend static files
static_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../frontend/dist"))

if os.path.isdir(static_dir):
    try:
        app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")
    except Exception:
        pass

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    # Ignore API routes so they return proper 404 JSON if not matched
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found")
        
    path = os.path.join(static_dir, full_path)
    if full_path and os.path.isfile(path):
        return FileResponse(path)
    
    index_path = os.path.join(static_dir, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
        
    return {"message": "Frontend not built yet. Please run 'npm run build' first."}
