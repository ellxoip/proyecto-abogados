import { logger } from '../lib/logger.js';

let alreadyValidated = false;

function hasRealValue(value: string | undefined, placeholders: string[] = []) {
  if (!value || value.trim() === '') return false;
  return !placeholders.some((placeholder) => value.includes(placeholder));
}

function addRequired(errors: string[], name: string, placeholders: string[] = []) {
  if (!hasRealValue(process.env[name], placeholders)) {
    errors.push(`${name} is required`);
  }
}

export function validateEnvironment() {
  if (alreadyValidated) return;
  alreadyValidated = true;

  const errors: string[] = [];
  const warnings: string[] = [];
  const paymentEnvironment = process.env.PAYMENT_ENVIRONMENT || 'sandbox';
  const strictMode = process.env.ENV_VALIDATION_MODE === 'strict'
    || process.env.NODE_ENV === 'production'
    || paymentEnvironment === 'production';

  addRequired(errors, 'DATABASE_URL');
  addRequired(errors, 'APP_URL');
  addRequired(errors, 'ADMIN_EMAIL');
  addRequired(errors, 'ADMIN_PASSWORD', ['change_this_password']);
  addRequired(errors, 'ADMIN_TOKEN_SECRET', ['change_this_long_random_secret']);

  if ((process.env.ADMIN_TOKEN_SECRET || '').length < 32) {
    warnings.push('ADMIN_TOKEN_SECRET should be at least 32 characters');
  }

  if (process.env.SIS_CONTABLE_LOCAL_FIXTURES !== 'true') {
    addRequired(errors, 'SIS_CONTABLE_BASE_URL');
    if ((process.env.SIS_CONTABLE_AUTH_METHOD || 'api_key') === 'bearer') {
      addRequired(errors, 'SIS_CONTABLE_BEARER_TOKEN', ['your_bearer_token_here']);
    } else {
      addRequired(errors, 'SIS_CONTABLE_API_KEY', ['change_me']);
    }
  }

  if (process.env.CRM_ENABLED !== 'false') {
    addRequired(errors, 'CRM_BASE_URL');
    addRequired(errors, 'CRM_EMAIL');
    addRequired(errors, 'CRM_PASSWORD', ['your_crm_password_here']);
  }

  if (paymentEnvironment === 'production') {
    if (!process.env.APP_URL?.startsWith('https://')) {
      errors.push('APP_URL must be https in PAYMENT_ENVIRONMENT=production');
    }
    if ((process.env.PAYMENT_DEFAULT_PROVIDER || '').includes('simulator')) {
      errors.push('PAYMENT_DEFAULT_PROVIDER cannot be simulator in production');
    }
    if (process.env.MERCADOPAGO_ENABLED !== 'false') {
      addRequired(errors, 'MERCADOPAGO_ACCESS_TOKEN', ['TEST-', 'APP_USR-...']);
      addRequired(errors, 'MERCADOPAGO_PUBLIC_KEY', ['TEST-', 'APP_USR-...']);
      addRequired(errors, 'MERCADOPAGO_WEBHOOK_SECRET', ['webhook_secret_from_mercadopago_panel']);
    }
    if (process.env.TRANSBANK_ENABLED === 'true') {
      addRequired(errors, 'TRANSBANK_COMMERCE_CODE', ['597055555532']);
      addRequired(errors, 'TRANSBANK_API_KEY', ['change_me']);
    }
    if (process.env.FLOW_ENABLED === 'true') {
      addRequired(errors, 'FLOW_API_KEY', ['change_me']);
      addRequired(errors, 'FLOW_SECRET_KEY', ['change_me']);
    }
  }

  if (process.env.BILLING_ENABLED === 'true') {
    addRequired(errors, 'AUTHCL_API_KEY', ['sk_test_placeholder', 'change_me']);
    addRequired(errors, 'AUTHCL_COMPANY_RUT');
    if ((process.env.BILLING_ENVIRONMENT || 'sandbox') === 'production') {
      addRequired(errors, 'AUTHCL_WEBHOOK_SECRET', ['change_me']);
    }
  }

  for (const warning of warnings) {
    logger.warn('Environment warning', { warning });
  }

  if (errors.length > 0) {
    const message = `Invalid PagaCuotas environment: ${errors.join('; ')}`;
    if (strictMode) {
      logger.error(message, { errors });
      throw new Error(message);
    }
    logger.warn(message, { errors });
  } else {
    logger.info('Environment validation passed', {
      nodeEnv: process.env.NODE_ENV || 'development',
      paymentEnvironment,
      strictMode,
    });
  }
}
