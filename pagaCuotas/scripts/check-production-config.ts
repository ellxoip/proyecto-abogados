import dotenv from 'dotenv';

dotenv.config();

type Check = {
  name: string;
  ok: boolean;
  message: string;
};

function hasValue(name: string) {
  return Boolean(process.env[name]?.trim());
}

function isPublicHttpsUrl(value?: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      host !== 'localhost' &&
      host !== '127.0.0.1' &&
      !host.endsWith('.local')
    );
  } catch {
    return false;
  }
}

const checks: Check[] = [
  {
    name: 'PAYMENT_ENVIRONMENT',
    ok: process.env.PAYMENT_ENVIRONMENT === 'production',
    message: 'Debe ser "production" para cobros reales.',
  },
  {
    name: 'APP_URL',
    ok: isPublicHttpsUrl(process.env.APP_URL),
    message: 'Debe ser una URL publica HTTPS, sin localhost.',
  },
  {
    name: 'DATABASE_URL',
    ok: hasValue('DATABASE_URL'),
    message: 'Debe apuntar a la base usada por PagaCuotas.',
  },
  {
    name: 'SIS_CONTABLE_BASE_URL',
    ok: isPublicHttpsUrl(process.env.SIS_CONTABLE_BASE_URL) || Boolean(process.env.SIS_CONTABLE_BASE_URL?.startsWith('http://localhost')),
    message: 'Debe apuntar al SIS.CONTABLE real o local de integracion.',
  },
  {
    name: 'SIS_CONTABLE_AUTH',
    ok: hasValue('SIS_CONTABLE_API_KEY') || hasValue('SIS_CONTABLE_BEARER_TOKEN'),
    message: 'Debe existir x-api-key o bearer token compartido con SIS.CONTABLE.',
  },
  {
    name: 'MERCADOPAGO_ACCESS_TOKEN',
    ok: hasValue('MERCADOPAGO_ACCESS_TOKEN') && !process.env.MERCADOPAGO_ACCESS_TOKEN?.startsWith('TEST-'),
    message: 'Debe ser access token productivo, normalmente APP_USR-...',
  },
  {
    name: 'MERCADOPAGO_PUBLIC_KEY',
    ok: hasValue('MERCADOPAGO_PUBLIC_KEY') && !process.env.MERCADOPAGO_PUBLIC_KEY?.startsWith('TEST-'),
    message: 'Debe ser public key productiva.',
  },
  {
    name: 'MERCADOPAGO_WEBHOOK_SECRET',
    ok: hasValue('MERCADOPAGO_WEBHOOK_SECRET') && process.env.MERCADOPAGO_WEBHOOK_SECRET !== 'webhook_secret_from_mercadopago_panel',
    message: 'Debe ser el secret de Webhooks configurado en MercadoPago.',
  },
];

const failed = checks.filter((check) => !check.ok);

console.log('\nPagaCuotas production payment configuration\n');
for (const check of checks) {
  console.log(`${check.ok ? 'OK ' : 'ERR'} ${check.name} - ${check.message}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length} configuration check(s) failed. Do not run real charges yet.`);
  process.exit(1);
}

console.log('\nConfiguration is ready for a controlled real payment test.');
