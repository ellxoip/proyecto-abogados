import dotenv from 'dotenv';
import type { BillingEnvironment, BillingProviderName, IBillingProvider } from './types.js';
import { AuthClBillingProvider } from './providers/authcl.provider.js';
import { BillingSimulatorProvider } from './providers/simulator.provider.js';
import { logger } from '../lib/logger.js';

dotenv.config();

class BillingProviderRegistry {
  private providers = new Map<BillingProviderName, IBillingProvider>();
  private defaultProviderName: BillingProviderName;
  private globalEnvironment: BillingEnvironment;

  constructor() {
    this.globalEnvironment = (process.env.BILLING_ENVIRONMENT as BillingEnvironment) || 'sandbox';
    this.defaultProviderName = (process.env.BILLING_PROVIDER as BillingProviderName) || 'authcl';
    this.registerAllProviders();
  }

  getDefault(): IBillingProvider {
    return this.get(this.defaultProviderName);
  }

  get(name: BillingProviderName): IBillingProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Billing provider "${name}" is not registered. Available: ${this.getAvailableNames().join(', ')}`);
    }
    return provider;
  }

  getAvailableNames(): BillingProviderName[] {
    return Array.from(this.providers.keys());
  }

  getEnvironment(): BillingEnvironment {
    return this.globalEnvironment;
  }

  getConfigSummary() {
    return Array.from(this.providers.entries()).map(([name, provider]) => ({
      name,
      environment: provider.environment,
      isDefault: name === this.defaultProviderName,
      status: 'active',
    }));
  }

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

  private registerAllProviders() {
    this.providers.set('simulator', new BillingSimulatorProvider());
    this.providers.set('authcl', new AuthClBillingProvider({
      environment: this.globalEnvironment,
      baseUrl: process.env.AUTHCL_API_BASE_URL || 'https://api.auth.cl',
      apiKey: process.env.AUTHCL_API_KEY || 'sk_test_placeholder',
      webhookSecret: process.env.AUTHCL_WEBHOOK_SECRET || '',
      companyRut: process.env.AUTHCL_COMPANY_RUT || '',
    }));

    logger.info('Billing providers registered', {
      count: this.providers.size,
      environment: this.globalEnvironment,
      defaultProvider: this.defaultProviderName,
      providers: Array.from(this.providers.keys()),
    });
  }
}

export const billingProviderRegistry = new BillingProviderRegistry();
