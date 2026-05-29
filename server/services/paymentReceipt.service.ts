import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../lib/logger.js';

const PUBLIC_BASE_URL =
  process.env.PAGACUOTAS_PUBLIC_BASE_URL ||
  process.env.APP_URL ||
  `http://localhost:${process.env.PORT || 4000}`;

const RECEIPTS_DIR = path.resolve(process.cwd(), 'public', 'uploads', 'receipts');

type ReceiptInput = {
  externalPaymentId: string;
  provider: string;
  method: string | null;
  paidAt: Date;
  amount: number;
  cliente: {
    rut: string;
    nombre: string;
    email?: string | null;
  };
  contrato: {
    contableId: string;
    servicio?: string | null;
  };
  cuotas: Array<{
    numero?: number | null;
    descripcion?: string | null;
    monto: number;
  }>;
  transactionNumber?: string | null;
};

export type GeneratedReceipt = {
  externalPaymentId: string;
  url: string;
  relativePath: string;
  filename: string;
  generatedAt: Date;
  provider: string;
};

const CLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(d);
}

function buildHtml(input: ReceiptInput, folio: string): string {
  const totalCuotas = input.cuotas.reduce((acc, c) => acc + Number(c.monto || 0), 0);
  const cuotasRows = input.cuotas
    .map((c) => {
      const label = c.descripcion
        ? escapeHtml(c.descripcion)
        : c.numero != null
          ? `Cuota ${c.numero}`
          : 'Cuota';
      return `
        <tr>
          <td>${label}</td>
          <td style="text-align:right">${CLP.format(Number(c.monto || 0))}</td>
        </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Comprobante de Pago · ${escapeHtml(folio)}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:'Helvetica Neue',Arial,sans-serif;background:#f1f5f9;color:#0f172a;margin:0;padding:32px}
    .card{max-width:720px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 18px 40px rgba(15,23,42,0.10);overflow:hidden}
    .header{background:linear-gradient(135deg,#1e3a8a 0%,#7c3aed 100%);color:#fff;padding:28px 32px}
    .header h1{margin:0;font-size:22px;letter-spacing:.06em;text-transform:uppercase}
    .header p{margin:6px 0 0;font-size:13px;opacity:.85}
    .ficticio{display:inline-block;margin-top:10px;padding:4px 8px;border:1px solid rgba(255,255,255,.4);border-radius:6px;font-size:10px;letter-spacing:.18em;text-transform:uppercase}
    .body{padding:28px 32px;display:grid;gap:24px}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:20px;font-size:13px}
    .row .label{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#64748b;margin-bottom:4px}
    .row .value{font-weight:600;color:#0f172a}
    table{width:100%;border-collapse:collapse;font-size:13px}
    table th,table td{padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:left}
    table th{background:#f8fafc;font-size:10px;text-transform:uppercase;letter-spacing:.16em;color:#475569}
    .total{display:flex;justify-content:space-between;align-items:center;padding:16px 0 0;border-top:2px solid #0f172a;font-weight:700;font-size:16px}
    .footer{padding:18px 32px;background:#0f172a;color:#cbd5e1;font-size:11px;letter-spacing:.05em}
    .footer code{color:#fcd34d}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Comprobante de Pago</h1>
      <p>PagaCuotas · Folio ${escapeHtml(folio)}</p>
      <span class="ficticio">Documento ficticio · Entorno de prueba</span>
    </div>
    <div class="body">
      <div class="row">
        <div>
          <div class="label">Cliente</div>
          <div class="value">${escapeHtml(input.cliente.nombre)}</div>
          <div class="value" style="color:#475569;font-weight:500">RUT ${escapeHtml(input.cliente.rut)}</div>
          ${input.cliente.email ? `<div class="value" style="color:#475569;font-weight:500">${escapeHtml(input.cliente.email)}</div>` : ''}
        </div>
        <div>
          <div class="label">Contrato</div>
          <div class="value">${escapeHtml(String(input.contrato.contableId))}</div>
          ${input.contrato.servicio ? `<div class="value" style="color:#475569;font-weight:500">${escapeHtml(input.contrato.servicio)}</div>` : ''}
        </div>
      </div>
      <div class="row">
        <div>
          <div class="label">Fecha del pago</div>
          <div class="value">${escapeHtml(fmtDate(input.paidAt))}</div>
        </div>
        <div>
          <div class="label">Medio de pago</div>
          <div class="value">${escapeHtml(input.provider)}${input.method ? ` · ${escapeHtml(input.method)}` : ''}</div>
          ${input.transactionNumber ? `<div class="value" style="color:#475569;font-weight:500">N° transacción: ${escapeHtml(input.transactionNumber)}</div>` : ''}
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Detalle</th><th style="text-align:right">Monto</th></tr>
        </thead>
        <tbody>
          ${cuotasRows || `<tr><td>Pago</td><td style="text-align:right">${CLP.format(input.amount)}</td></tr>`}
        </tbody>
      </table>
      <div class="total">
        <span>Total pagado</span>
        <span>${CLP.format(input.amount || totalCuotas)}</span>
      </div>
    </div>
    <div class="footer">
      Comprobante generado automáticamente por PagaCuotas · ID externo <code>${escapeHtml(input.externalPaymentId)}</code>
    </div>
  </div>
</body>
</html>`;
}

export async function generateFictionalReceipt(input: ReceiptInput): Promise<GeneratedReceipt> {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });

  const stamp = input.paidAt
    .toISOString()
    .replace(/[^0-9]/g, '')
    .slice(0, 14);
  const rand = crypto.randomBytes(3).toString('hex');
  const folio = `PC-${stamp}-${rand}`;
  const filename = `comprobante_${input.externalPaymentId}.html`;
  const absPath = path.join(RECEIPTS_DIR, filename);
  const html = buildHtml(input, folio);
  await fs.writeFile(absPath, html, 'utf8');

  const relativePath = `/uploads/receipts/${filename}`;
  const url = `${PUBLIC_BASE_URL.replace(/\/+$/, '')}${relativePath}`;

  logger.info('Receipt generated', {
    externalPaymentId: input.externalPaymentId,
    folio,
    path: absPath,
    url,
  });

  return {
    externalPaymentId: input.externalPaymentId,
    url,
    relativePath,
    filename,
    generatedAt: new Date(),
    provider: input.provider,
  };
}
