-- AT INFORMA v3.0 — Row Level Security policies
-- Apply AFTER `prisma migrate dev` has created the v3.0 schema.
-- Strategy: per-request session vars `app.user_id` and `app.user_role`
-- are set inside a transaction by the Prisma RLS extension (src/lib/rls.ts).
-- SUPER_ADMIN and SISTEMA_CUOTAS bypass policies; CLIENTE/ABOGADO/JEFE_DE_MESA
-- are constrained to rows they own per the v3.0 hierarchy.

BEGIN;

-- ── Helpers ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app_user_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '');
$$;

CREATE OR REPLACE FUNCTION app_user_role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.user_role', true);
$$;

CREATE OR REPLACE FUNCTION app_is_privileged() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app_user_role() IN ('SUPER_ADMIN', 'SISTEMA_CUOTAS');
$$;

-- ── Enable RLS ─────────────────────────────────────────────────────────
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases          ENABLE ROW LEVEL SECURITY;
ALTER TABLE updates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_google_calendar_events ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owner (defense-in-depth)
ALTER TABLE users          FORCE ROW LEVEL SECURITY;
ALTER TABLE cases          FORCE ROW LEVEL SECURITY;
ALTER TABLE updates        FORCE ROW LEVEL SECURITY;
ALTER TABLE comments       FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_events FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs     FORCE ROW LEVEL SECURITY;
ALTER TABLE leads          FORCE ROW LEVEL SECURITY;
ALTER TABLE google_calendar_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE lead_google_calendar_events FORCE ROW LEVEL SECURITY;

-- ── users ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS users_privileged ON users;
CREATE POLICY users_privileged ON users
  FOR ALL TO PUBLIC
  USING (app_is_privileged())
  WITH CHECK (app_is_privileged());

DROP POLICY IF EXISTS users_self ON users;
CREATE POLICY users_self ON users
  FOR SELECT
  USING (id = app_user_id());

DROP POLICY IF EXISTS users_jefe_subordinates ON users;
CREATE POLICY users_jefe_subordinates ON users
  FOR SELECT
  USING (app_user_role() = 'JEFE_DE_MESA' AND "managedById" = app_user_id());

-- ── cases ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS cases_privileged ON cases;
CREATE POLICY cases_privileged ON cases
  FOR ALL TO PUBLIC
  USING (app_is_privileged())
  WITH CHECK (app_is_privileged());

DROP POLICY IF EXISTS cases_cliente ON cases;
CREATE POLICY cases_cliente ON cases
  FOR SELECT
  USING (app_user_role() = 'CLIENTE' AND client_id = app_user_id());

DROP POLICY IF EXISTS cases_abogado ON cases;
CREATE POLICY cases_abogado ON cases
  FOR ALL
  USING (
    app_user_role() = 'ABOGADO'
    AND EXISTS (
      SELECT 1 FROM "_CaseLawyers" cl
      WHERE cl."A" = cases.id AND cl."B" = app_user_id()
    )
  )
  WITH CHECK (
    app_user_role() = 'ABOGADO'
    AND EXISTS (
      SELECT 1 FROM "_CaseLawyers" cl
      WHERE cl."A" = cases.id AND cl."B" = app_user_id()
    )
  );

DROP POLICY IF EXISTS cases_jefe ON cases;
CREATE POLICY cases_jefe ON cases
  FOR ALL
  USING (
    app_user_role() = 'JEFE_DE_MESA' AND (
      jefe_mesa_id = app_user_id()
      OR EXISTS (
        SELECT 1
        FROM "_CaseLawyers" cl
        JOIN users u ON u.id = cl."B"
        WHERE cl."A" = cases.id AND u."managedById" = app_user_id()
      )
    )
  )
  WITH CHECK (
    app_user_role() = 'JEFE_DE_MESA' AND (
      jefe_mesa_id = app_user_id()
      OR EXISTS (
        SELECT 1
        FROM "_CaseLawyers" cl
        JOIN users u ON u.id = cl."B"
        WHERE cl."A" = cases.id AND u."managedById" = app_user_id()
      )
    )
  );

-- ── updates ────────────────────────────────────────────────────────────
-- An update is visible/writable iff the underlying case is.
DROP POLICY IF EXISTS updates_privileged ON updates;
CREATE POLICY updates_privileged ON updates
  FOR ALL TO PUBLIC
  USING (app_is_privileged())
  WITH CHECK (app_is_privileged());

DROP POLICY IF EXISTS updates_via_case ON updates;
CREATE POLICY updates_via_case ON updates
  FOR ALL
  USING (EXISTS (SELECT 1 FROM cases c WHERE c.id = "caseId"))
  WITH CHECK (EXISTS (SELECT 1 FROM cases c WHERE c.id = "caseId"));

-- ── comments ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS comments_privileged ON comments;
CREATE POLICY comments_privileged ON comments
  FOR ALL TO PUBLIC
  USING (app_is_privileged())
  WITH CHECK (app_is_privileged());

DROP POLICY IF EXISTS comments_via_case_public ON comments;
CREATE POLICY comments_via_case_public ON comments
  FOR ALL
  USING (
    type = 'PUBLIC' AND EXISTS (SELECT 1 FROM cases c WHERE c.id = "caseId")
  )
  WITH CHECK (
    type = 'PUBLIC' AND EXISTS (SELECT 1 FROM cases c WHERE c.id = "caseId")
  );

-- INTERNAL comments: clients never see them. Lawyers/jefes need case access.
DROP POLICY IF EXISTS comments_via_case_internal ON comments;
CREATE POLICY comments_via_case_internal ON comments
  FOR ALL
  USING (
    type = 'INTERNAL'
    AND app_user_role() IN ('ABOGADO', 'JEFE_DE_MESA')
    AND EXISTS (SELECT 1 FROM cases c WHERE c.id = "caseId")
  )
  WITH CHECK (
    type = 'INTERNAL'
    AND app_user_role() IN ('ABOGADO', 'JEFE_DE_MESA')
    AND EXISTS (SELECT 1 FROM cases c WHERE c.id = "caseId")
  );

-- ── payment_events ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS payments_privileged ON payment_events;
CREATE POLICY payments_privileged ON payment_events
  FOR ALL TO PUBLIC
  USING (app_is_privileged())
  WITH CHECK (app_is_privileged());

DROP POLICY IF EXISTS payments_via_case ON payment_events;
CREATE POLICY payments_via_case ON payment_events
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM cases c WHERE c.id = "caseId"));

-- ── audit_logs ─────────────────────────────────────────────────────────
-- Privileged-only: clients/lawyers should never see the audit trail.
DROP POLICY IF EXISTS audit_privileged ON audit_logs;
CREATE POLICY audit_privileged ON audit_logs
  FOR ALL TO PUBLIC
  USING (app_is_privileged())
  WITH CHECK (app_is_privileged());

-- ── leads ──────────────────────────────────────────────────────────────
-- SUPER_ADMIN/SISTEMA_CUOTAS pasan por todo.
-- ABOGADO ve y edita los suyos.
-- JEFE_DE_MESA ve y edita los suyos y los de los abogados que maneja.
DROP POLICY IF EXISTS leads_privileged ON leads;
CREATE POLICY leads_privileged ON leads
  FOR ALL TO PUBLIC
  USING (app_is_privileged())
  WITH CHECK (app_is_privileged());

DROP POLICY IF EXISTS leads_abogado ON leads;
CREATE POLICY leads_abogado ON leads
  FOR ALL
  USING (
    app_user_role() = 'ABOGADO'
    AND "assignedAbogadoId" = app_user_id()
  )
  WITH CHECK (
    app_user_role() = 'ABOGADO'
    AND "assignedAbogadoId" = app_user_id()
  );

DROP POLICY IF EXISTS leads_jefe ON leads;
CREATE POLICY leads_jefe ON leads
  FOR ALL
  USING (
    app_user_role() = 'JEFE_DE_MESA' AND (
      "assignedAbogadoId" = app_user_id()
      OR EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = leads."assignedAbogadoId"
          AND u."managedById" = app_user_id()
      )
    )
  )
  WITH CHECK (
    app_user_role() = 'JEFE_DE_MESA' AND (
      "assignedAbogadoId" = app_user_id()
      OR EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = leads."assignedAbogadoId"
          AND u."managedById" = app_user_id()
      )
    )
  );

-- â”€â”€ google_calendar_connections â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Cada usuario administra solo sus propias cuentas Google conectadas.
DROP POLICY IF EXISTS google_calendar_connections_privileged ON google_calendar_connections;
CREATE POLICY google_calendar_connections_privileged ON google_calendar_connections
  FOR ALL TO PUBLIC
  USING (app_is_privileged())
  WITH CHECK (app_is_privileged());

DROP POLICY IF EXISTS google_calendar_connections_owner ON google_calendar_connections;
CREATE POLICY google_calendar_connections_owner ON google_calendar_connections
  FOR ALL
  USING ("userId" = app_user_id())
  WITH CHECK ("userId" = app_user_id());

-- â”€â”€ lead_google_calendar_events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
DROP POLICY IF EXISTS lead_google_calendar_events_privileged ON lead_google_calendar_events;
CREATE POLICY lead_google_calendar_events_privileged ON lead_google_calendar_events
  FOR ALL TO PUBLIC
  USING (app_is_privileged())
  WITH CHECK (app_is_privileged());

DROP POLICY IF EXISTS lead_google_calendar_events_owner ON lead_google_calendar_events;
CREATE POLICY lead_google_calendar_events_owner ON lead_google_calendar_events
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM google_calendar_connections gcc
      WHERE gcc.id = "connectionId" AND gcc."userId" = app_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM google_calendar_connections gcc
      WHERE gcc.id = "connectionId" AND gcc."userId" = app_user_id()
    )
  );

COMMIT;
