-- Operational indexes for portal login, payment reconciliation, admin searches and support queue.
-- Existing local SQLite databases can apply this safely because every index is guarded.

CREATE INDEX IF NOT EXISTS "PaymentPortalSession_identifier_idx" ON "PaymentPortalSession"("identifier");
CREATE INDEX IF NOT EXISTS "PaymentPortalSession_expires_at_idx" ON "PaymentPortalSession"("expires_at");
CREATE INDEX IF NOT EXISTS "PaymentPortalSession_cliente_contable_id_idx" ON "PaymentPortalSession"("cliente_contable_id");

CREATE INDEX IF NOT EXISTS "PaymentAttempt_cliente_identifier_idx" ON "PaymentAttempt"("cliente_identifier");
CREATE INDEX IF NOT EXISTS "PaymentAttempt_cliente_contable_id_idx" ON "PaymentAttempt"("cliente_contable_id");
CREATE INDEX IF NOT EXISTS "PaymentAttempt_contrato_contable_id_idx" ON "PaymentAttempt"("contrato_contable_id");
CREATE INDEX IF NOT EXISTS "PaymentAttempt_status_idx" ON "PaymentAttempt"("status");
CREATE INDEX IF NOT EXISTS "PaymentAttempt_sis_contable_sync_status_idx" ON "PaymentAttempt"("sis_contable_sync_status");
CREATE INDEX IF NOT EXISTS "PaymentAttempt_created_at_idx" ON "PaymentAttempt"("created_at");

CREATE INDEX IF NOT EXISTS "Payment_payment_attempt_id_idx" ON "Payment"("payment_attempt_id");
CREATE INDEX IF NOT EXISTS "Payment_cliente_contable_id_idx" ON "Payment"("cliente_contable_id");
CREATE INDEX IF NOT EXISTS "Payment_contrato_contable_id_idx" ON "Payment"("contrato_contable_id");
CREATE INDEX IF NOT EXISTS "Payment_status_idx" ON "Payment"("status");
CREATE INDEX IF NOT EXISTS "Payment_sis_contable_sync_status_idx" ON "Payment"("sis_contable_sync_status");
CREATE INDEX IF NOT EXISTS "Payment_crm_sync_status_idx" ON "Payment"("crm_sync_status");
CREATE INDEX IF NOT EXISTS "Payment_created_at_idx" ON "Payment"("created_at");

CREATE INDEX IF NOT EXISTS "PaymentReversal_external_payment_id_idx" ON "PaymentReversal"("external_payment_id");
CREATE INDEX IF NOT EXISTS "PaymentReversal_external_attempt_id_idx" ON "PaymentReversal"("external_attempt_id");
CREATE INDEX IF NOT EXISTS "PaymentReversal_payment_id_idx" ON "PaymentReversal"("payment_id");
CREATE INDEX IF NOT EXISTS "PaymentReversal_sis_contable_sync_status_idx" ON "PaymentReversal"("sis_contable_sync_status");
CREATE INDEX IF NOT EXISTS "PaymentReversal_crm_sync_status_idx" ON "PaymentReversal"("crm_sync_status");
CREATE INDEX IF NOT EXISTS "PaymentReversal_created_at_idx" ON "PaymentReversal"("created_at");

CREATE INDEX IF NOT EXISTS "IntegrationLog_system_idx" ON "IntegrationLog"("system");
CREATE INDEX IF NOT EXISTS "IntegrationLog_event_type_idx" ON "IntegrationLog"("event_type");
CREATE INDEX IF NOT EXISTS "IntegrationLog_direction_idx" ON "IntegrationLog"("direction");
CREATE INDEX IF NOT EXISTS "IntegrationLog_status_idx" ON "IntegrationLog"("status");
CREATE INDEX IF NOT EXISTS "IntegrationLog_created_at_idx" ON "IntegrationLog"("created_at");

CREATE INDEX IF NOT EXISTS "IntegrationOutbox_status_next_attempt_at_idx" ON "IntegrationOutbox"("status", "next_attempt_at");
CREATE INDEX IF NOT EXISTS "IntegrationOutbox_aggregate_type_aggregate_id_idx" ON "IntegrationOutbox"("aggregate_type", "aggregate_id");
CREATE INDEX IF NOT EXISTS "IntegrationOutbox_event_type_idx" ON "IntegrationOutbox"("event_type");
CREATE INDEX IF NOT EXISTS "IntegrationOutbox_created_at_idx" ON "IntegrationOutbox"("created_at");

CREATE INDEX IF NOT EXISTS "DeadLetterQueue_status_idx" ON "DeadLetterQueue"("status");
CREATE INDEX IF NOT EXISTS "DeadLetterQueue_source_idx" ON "DeadLetterQueue"("source");
CREATE INDEX IF NOT EXISTS "DeadLetterQueue_event_type_idx" ON "DeadLetterQueue"("event_type");
CREATE INDEX IF NOT EXISTS "DeadLetterQueue_created_at_idx" ON "DeadLetterQueue"("created_at");

CREATE INDEX IF NOT EXISTS "ReconciliationRun_status_idx" ON "ReconciliationRun"("status");
CREATE INDEX IF NOT EXISTS "ReconciliationRun_started_at_idx" ON "ReconciliationRun"("started_at");

CREATE INDEX IF NOT EXISTS "SupportTicket_requester_identifier_idx" ON "SupportTicket"("requester_identifier");
CREATE INDEX IF NOT EXISTS "SupportTicket_requester_email_idx" ON "SupportTicket"("requester_email");
CREATE INDEX IF NOT EXISTS "SupportTicket_status_idx" ON "SupportTicket"("status");
CREATE INDEX IF NOT EXISTS "SupportTicket_category_idx" ON "SupportTicket"("category");
CREATE INDEX IF NOT EXISTS "SupportTicket_created_at_idx" ON "SupportTicket"("created_at");
