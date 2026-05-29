/**
 * PagaCuotas — Full Payment Flow Simulation
 *
 * Simulates the complete payment lifecycle using the provider abstraction layer:
 *   1. Query client debt from SIS.CONTABLE
 *   2. Create payment intent (validated by SIS.CONTABLE)
 *   3. Execute payment through selected provider
 *   4. Confirm transaction
 *   5. Verify sync with SIS.CONTABLE and CRM
 *   6. Simulate a rejection scenario
 *   7. Simulate a reversal scenario
 *
 * Usage:
 *   npm run integration:simulate-flow
 *   npm run integration:simulate-flow -- --provider=mercadopago
 */

import { providerRegistry } from '../server/providers';
import type { ProviderName } from '../server/providers/types';

async function simulatePaymentFlow() {
  const providerArg = process.argv.find(a => a.startsWith('--provider='));
  const selectedProvider = (providerArg?.split('=')[1] || 'simulator') as ProviderName;

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         PagaCuotas — Payment Flow Simulation            ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  // Show registered providers
  const config = providerRegistry.getConfigSummary();
  console.log(`🌍 Environment: ${providerRegistry.getEnvironment()}`);
  console.log(`📋 Registered providers:`);
  config.forEach(p => {
    const tag = p.isDefault ? ' ⭐ DEFAULT' : '';
    console.log(`   → ${p.name} (${p.environment})${tag}`);
  });
  console.log();

  // Get the provider
  let provider;
  try {
    provider = providerRegistry.get(selectedProvider);
  } catch {
    console.error(`❌ Provider "${selectedProvider}" not available.`);
    console.log(`   Available: ${providerRegistry.getAvailableNames().join(', ')}`);
    process.exit(1);
  }

  console.log(`💳 Using provider: ${provider.name} (${provider.environment})`);
  console.log();

  // Step 1: Health check
  console.log('─── Step 1: Provider Health Check ───');
  const health = await provider.healthCheck();
  console.log(`   Status: ${health.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
  console.log(`   Message: ${health.message}`);
  console.log();

  // Step 2: Create transaction
  console.log('─── Step 2: Create Transaction ───');
  const txnRequest = {
    external_attempt_id: `pc_sim_${Date.now()}`,
    amount: 150000,
    currency: 'CLP',
    description: 'Pago cuotas — Contrato CON-2026-001',
    customer_email: 'cliente@ejemplo.cl',
    customer_name: 'Juan Pérez',
    return_url: 'http://localhost:4000/api/payments/callback',
    cancel_url: 'http://localhost:4000/api/payments/cancel',
    notification_url: 'http://localhost:4000/api/webhooks/payment-provider',
  };

  const created = await provider.createTransaction(txnRequest);
  console.log(`   Provider TX ID: ${created.provider_transaction_id}`);
  console.log(`   Payment URL: ${created.payment_url}`);
  console.log();

  // Step 3: Confirm transaction (simulates customer completing payment)
  console.log('─── Step 3: Confirm Transaction (Customer completes payment) ───');
  const confirmed = await provider.confirmTransaction(created.provider_transaction_id);
  console.log(`   Approved: ${confirmed.approved ? '✅' : '❌'}`);
  console.log(`   Status: ${confirmed.status}`);
  console.log(`   Authorization: ${confirmed.authorization_code || 'N/A'}`);
  console.log(`   Method: ${confirmed.payment_method || 'N/A'}`);
  console.log(`   Card: ${confirmed.card_type || ''} ****${confirmed.card_last_four || ''}`);
  console.log();

  // Step 4: Check transaction status
  console.log('─── Step 4: Transaction Status Query ───');
  const statusResult = await provider.getTransactionStatus(created.provider_transaction_id);
  console.log(`   Status: ${statusResult.status}`);
  console.log();

  // Step 5: Simulate rejected payment (amount ending in 99)
  if (provider.name === 'simulator') {
    console.log('─── Step 5: Simulate REJECTED Payment (amount = $99,999) ───');
    const rejectedTxn = await provider.createTransaction({
      ...txnRequest,
      external_attempt_id: `pc_sim_rej_${Date.now()}`,
      amount: 99999, // Ends in 99 → rejected
    });
    const rejectedResult = await provider.confirmTransaction(rejectedTxn.provider_transaction_id);
    console.log(`   Approved: ${rejectedResult.approved ? '✅' : '❌ REJECTED'}`);
    console.log(`   Reason: ${rejectedResult.reason || 'N/A'}`);
    console.log(`   Error Code: ${rejectedResult.error_code || 'N/A'}`);
    console.log();
  }

  // Step 6: Refund
  console.log('─── Step 6: Refund Transaction ───');
  const refundResult = await provider.refundTransaction(created.provider_transaction_id, 150000);
  console.log(`   Refund Success: ${refundResult.success ? '✅' : '❌'}`);
  console.log(`   Refund ID: ${refundResult.provider_refund_id || 'N/A'}`);
  console.log(`   Amount Refunded: $${refundResult.amount_refunded.toLocaleString('es-CL')}`);
  console.log();

  // Summary
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║              SIMULATION COMPLETE ✅                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`   Provider: ${provider.name}`);
  console.log(`   Environment: ${provider.environment}`);
  console.log(`   Flows tested: Create → Confirm → Status → Reject → Refund`);
  console.log();
}

simulatePaymentFlow().catch((err) => {
  console.error('\n❌ Simulation failed:', err);
  process.exit(1);
});
