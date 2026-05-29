-- ============================================================
-- PagaCuotas — Row Level Security
-- Run this in Supabase SQL Editor (Settings > SQL Editor)
-- ============================================================
-- Strategy:
--   • postgres role (Prisma/backend) = superuser → bypasses RLS natively
--   • anon role (direct Supabase client) = blocked by default
--   • Portal user isolation by RUT is enforced in the Express backend layer
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE "CrmClientProfile"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentPortalSession"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentAttempt"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingDocument"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentReversal"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationLog"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationOutbox"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeadLetterQueue"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReconciliationRun"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportTicket"         ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- CrmClientProfile — portal client can read own profile by RUT
-- ============================================================
CREATE POLICY "client_read_own_profile"
  ON "CrmClientProfile"
  FOR SELECT
  TO anon
  USING (
    identifier = current_setting('app.current_rut', true)
  );

-- ============================================================
-- PaymentPortalSession — client can read own sessions
-- ============================================================
CREATE POLICY "client_read_own_sessions"
  ON "PaymentPortalSession"
  FOR SELECT
  TO anon
  USING (
    identifier = current_setting('app.current_rut', true)
  );

-- ============================================================
-- PaymentAttempt — client can read own attempts
-- ============================================================
CREATE POLICY "client_read_own_attempts"
  ON "PaymentAttempt"
  FOR SELECT
  TO anon
  USING (
    cliente_identifier = current_setting('app.current_rut', true)
  );

-- ============================================================
-- Payment — client can read own payments
-- ============================================================
CREATE POLICY "client_read_own_payments"
  ON "Payment"
  FOR SELECT
  TO anon
  USING (
    cliente_contable_id = current_setting('app.current_rut', true)
  );

-- ============================================================
-- BillingDocument — client can read own documents
-- (joined through Payment → cliente_contable_id)
-- ============================================================
CREATE POLICY "client_read_own_billing"
  ON "BillingDocument"
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM "Payment" p
      WHERE p.id = "BillingDocument".payment_id
        AND p.cliente_contable_id = current_setting('app.current_rut', true)
    )
  );

-- ============================================================
-- PaymentReversal — client can read own reversals
-- ============================================================
CREATE POLICY "client_read_own_reversals"
  ON "PaymentReversal"
  FOR SELECT
  TO anon
  USING (
    cliente_contable_id = current_setting('app.current_rut', true)
  );

-- ============================================================
-- Admin/internal tables — no direct anon access
-- IntegrationLog, IntegrationOutbox, DeadLetterQueue,
-- ReconciliationRun, SupportTicket = backend only (no policy = deny)
-- ============================================================

-- ============================================================
-- Usage from backend (when using anon role with RUT context):
--   SET LOCAL app.current_rut = '12345678-9';
--   SELECT * FROM "CrmClientProfile";
-- ============================================================
