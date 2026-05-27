// Genera plantilla Excel para importacion masiva de clientes
// Uso: node scripts/gen-plantilla-importacion.js
const XLSX = require("xlsx");
const path = require("path");

function makeSheet(headers, rows) {
  return XLSX.utils.aoa_to_sheet([headers, ...rows]);
}

// ── CLIENTES ──────────────────────────────────────────────────────────────────
const clientesSheet = makeSheet(
  ["RUT *", "Nombre Razon Social *", "Tipo Persona *", "Estado Cliente *", "Fecha Ingreso *", "Cliente ID Interno (Opcional)"],
  [
    ["11111111-1", "Juan Perez Garcia", "Natural", "Activo", "2024-01-15", "CLI-001"],
  ],
);

// ── CONTACTOS ─────────────────────────────────────────────────────────────────
const contactosSheet = makeSheet(
  ["Cliente ID Interno o RUT *", "Nombre Contacto *", "Email", "Telefono", "Cargo", "Es Contacto Principal *", "Recibe Notificaciones *", "Recibe Comprobantes *", "WhatsApp"],
  [
    ["CLI-001", "Juan Perez Garcia", "juan.perez@ejemplo.cl", "+56912345678", "Gerente", "Si", "Si", "Si", "Si"],
  ],
);

// ── FACTURACION ───────────────────────────────────────────────────────────────
const facturacionSheet = makeSheet(
  ["Cliente ID Interno o RUT *", "RUT Facturacion *", "Razon Social Facturacion *", "Giro Facturacion", "Direccion Facturacion", "Comuna", "Ciudad", "Region", "Email Facturacion", "Tipo Documento Preferido", "Requiere OC", "Condicion Pago"],
  [
    ["CLI-001", "11111111-1", "Juan Perez Garcia", "Servicios Profesionales", "Av. Ejemplo 123", "Santiago", "Santiago", "Region Metropolitana", "juan.perez@ejemplo.cl", "Boleta", "No", "30 dias"],
  ],
);

// ── CONTRATOS ─────────────────────────────────────────────────────────────────
// monto_total = pago_inicial + suma de cuotas (500000 + 5x100000 = 1000000)
// saldo_financiado = monto_total - pago_inicial = 500000 → cuotas deben sumar 500000
const contratosSheet = makeSheet(
  ["Cliente ID Interno o RUT *", "Servicio *", "Area *", "Monto Total *", "Pago Inicial (Opcional)", "Cantidad Cuotas *", "Fecha Inicio *", "Estado Contrato *", "Contrato ID (Opcional)", "Observaciones"],
  [
    ["CLI-001", "Asesoria Legal", "Laboral", 1000000, 500000, 5, "2024-01-15", "Activo", "CTR-001", ""],
  ],
);

// ── CUOTAS_OPCIONAL ───────────────────────────────────────────────────────────
// 5 cuotas de 100000 c/u = 500000 = saldo financiado (monto_total - pago_inicial)
// Cuotas 1 y 2 pagadas, 3 vencida, 4-5 pendientes
const cuotasSheet = makeSheet(
  ["Contrato ID o Cliente ID/RUT *", "Numero Cuota *", "Monto *", "Fecha Vencimiento *", "Estado Cuota *", "Fecha Pago", "Medio Pago", "Payment ID Externo", "Comprobante URL", "Tipo Cuota Origen", "Saldo Origen", "Pagado Origen"],
  [
    ["CTR-001", 1, 100000, "2024-02-15", "Pagada",   "2024-02-14", "Transferencia", "", "", "", 0, "Si"],
    ["CTR-001", 2, 100000, "2024-03-15", "Pagada",   "2024-03-15", "Transferencia", "", "", "", 0, "Si"],
    ["CTR-001", 3, 100000, "2024-04-15", "Vencida",  "",           "",              "", "", "", "", ""],
    ["CTR-001", 4, 100000, "2024-05-15", "Pendiente","",           "",              "", "", "", "", ""],
    ["CTR-001", 5, 100000, "2024-06-15", "Pendiente","",           "",              "", "", "", "", ""],
  ],
);

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, clientesSheet,    "CLIENTES");
XLSX.utils.book_append_sheet(wb, contactosSheet,   "CONTACTOS");
XLSX.utils.book_append_sheet(wb, facturacionSheet, "FACTURACION");
XLSX.utils.book_append_sheet(wb, contratosSheet,   "CONTRATOS");
XLSX.utils.book_append_sheet(wb, cuotasSheet,      "CUOTAS_OPCIONAL");

const out = path.join(__dirname, "..", "public", "plantilla-importacion-clientes.xlsx");
XLSX.writeFile(wb, out);
console.log("Plantilla generada:", out);
