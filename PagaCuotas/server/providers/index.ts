import dotenv from 'dotenv';
import type { IPaymentProvider, ProviderName, ProviderEnvironment, ProviderConfig } from './types.js';
import { SimulatorProvider } from './simulator.provider.js';
import { MercadoPagoProvider } from './mercadopago.provider.js';
import { TransbankProvider } from './transbank.provider.js';
import { FlowProvider } from './flow.provider.js';
import { logger } from '../lib/logger.js';

dotenv.config();

/**
 * PaymentProviderRegistry — Central factory and registry for all payment providers.
 *
 * Manages provider lifecycle, selection, and health checking.
 * Reads configuration from environment variables.
 */
class PaymentProviderRegistry {
  private providers = new Map<ProviderName, IPaymentProvider>();
  private defaultProviderName: ProviderName;
  private globalEnvironment: ProviderEnvironment;

  constructor() {
    this.globalEnvironment = (process.env.PAYMENT_ENVIRONMENT as ProviderEnvironment) || 'sandbox';
    this.defaultProviderName = (process.env.PAYMENT_DEFAULT_PROVIDER as ProviderName) || 'mercadopago';

    this.registerAllProviders();
  }

  /**
   * Get the default payment provider.
   */
  getDefault(): IPaymentProvider {
    return this.get(this.defaultProviderName);
  }

  /**
   * Get a specific provider by name.
   */
  get(name: ProviderName): IPaymentProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Payment provider "${name}" is not registered or not enabled. Available: ${this.getAvailableNames().join(', ')}`);
    }
    return provider;
  }

  /**
   * Get all registered providers.
   */
  getAll(): Map<ProviderName, IPaymentProvider> {
    return this.providers;
  }

  /**
   * Get names of all available providers.
   */
  getAvailableNames(): ProviderName[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get the current global environment.
   */
  getEnvironment(): ProviderEnvironment {
    return this.globalEnvironment;
  }

  /**
   * Health check all providers.
   */
  async healthCheckAll(): Promise<Record<string, { healthy: boolean; message: string }>> {
    const results: Record<string, { healthy: boolean; message: string }> = {};

    for (const [name, provider] of this.providers) {
      try {
        results[name] = await provider.healthCheck();
      } catch (error: any) {
        results[name] = { healthy: false, message: error.message };
      }
    }

    return results;
  }

  /**
   * Get configuration summary (safe for API responses — no secrets).
   */
  getConfigSummary(): Array<{
    name: ProviderName;
    environment: ProviderEnvironment;
    isDefault: boolean;
    status: string;
  }> {
    return Array.from(this.providers.entries()).map(([name, provider]) => ({
      name,
      environment: provider.environment,
      isDefault: name === this.defaultProviderName,
      status: 'active',
    }));
  }

  // ===========================================================
  // Internal: Register providers from env config
  // ===========================================================
  private registerAllProviders() {
    // Always register the simulator
    this.providers.set('simulator', new SimulatorProvider({
      delayMs: parseInt(process.env.SIMULATOR_DELAY_MS || '300'),
    }));

    // MercadoPago
    const mpEnabled = process.env.MERCADOPAGO_ENABLED !== 'false';
    if (mpEnabled) {
      this.providers.set('mercadopago', new MercadoPagoProvider({
        environment: this.globalEnvironment,
        accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || 'TEST-sandbox-token',
        publicKey: process.env.MERCADOPAGO_PUBLIC_KEY || 'TEST-sandbox-public-key',
        webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET || '',
      }));
    }

    const transbankEnabled = process.env.TRANSBANK_ENABLED === 'true';
    if (transbankEnabled) {
      this.providers.set('transbank', new TransbankProvider({
        environment: (process.env.TRANSBANK_ENVIRONMENT as ProviderEnvironment) || this.globalEnvironment,
        commerceCode: process.env.TRANSBANK_COMMERCE_CODE || '597055555532',
        apiKey: process.env.TRANSBANK_API_KEY || 'change_me_transbank_api_key',
      }));
    }

    const flowEnabled = process.env.FLOW_ENABLED === 'true';
    if (flowEnabled) {
      this.providers.set('flow', new FlowProvider({
        environment: this.globalEnvironment,
        apiKey: process.env.FLOW_API_KEY || 'change_me_flow_api_key',
        secretKey: process.env.FLOW_SECRET_KEY || 'change_me_flow_secret_key',
      }));
    }

    logger.info('Payment providers registered', {
      count: this.providers.size,
      environment: this.globalEnvironment,
      defaultProvider: this.defaultProviderName,
      providers: Array.from(this.providers.keys()),
    });
    for (const [name, provider] of this.providers) {
      const isDefault = name === this.defaultProviderName ? ' ⭐ DEFAULT' : '';
      logger.debug('Payment provider available', { name, environment: provider.environment, isDefault: Boolean(isDefault) });
    }
  }
}

/** Singleton registry instance */
export const providerRegistry = new PaymentProviderRegistry();
