/**
 * Cruza AT COBRANZA + MATRIZ CLIENTES TRIBUTARIOS → plantilla importación.
 * Salida: docs/plantilla-cruzada-importacion.xlsx
 *
 * Uso: node scripts/cruzar-datos-importacion.js
 */

const XLSX = require("xlsx");
const path = require("path");

// ─── helpers ─────────────────────────────────────────────────────────────────

function strVal(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s === "SIN DATOS" || s === "0" ? null : s;
}

function numVal(v) {
  if (typeof v === "number" && isFinite(v) && v > 0) return v;
  return null;
}

// Extrae primer RUT de un campo como "14.000.658-0 / 77.081.164-3"
function extractFirstRut(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || s === "SIN DATOS") return null;
  const first = s.split(/[\/,;]/)[0].trim();
  // normaliza: quita puntos y espacios, uppercase
  return first.replace(/\./g, "").replace(/\s/g, "").toUpperCase();
}

function dateToIso(v) {
  if (!v) return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    try {
      const parsed = XLSX.SSF.parse_date_code(v);
      if (!parsed) return null;
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    } catch {
      return null;
    }
  }
  return null;
}

function mapPersona(raw) {
  if (!raw) return "Natural";
  const s = String(raw).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  if (s.includes("juridica") || s.includes("empresa")) return "Juridica";
  if (s.includes("natural")) return "Natural";
  return "Natural";
}

function mapEstadoCliente(estatus) {
  if (!estatus) return "Activo";
  const s = String(estatus).toLowerCase();
  if (s.includes("pagado") || s.includes("en orden")) return "Al dia";
  if (s.includes("vencido") || s.includes("incobrable")) return "Moroso";
  return "Activo";
}

function mapEstadoCuota(estatus, tipo) {
  const t = String(tipo || "").toLowerCase();
  const e = String(estatus || "").toLowerCase();
  if (t.includes("contra resultado")) return "Contra resultado";
  if (e.includes("pagado")) return "Pagada";
  if (e.includes("pago parcial")) return "Parcial";
  if (e.includes("vencido")) return "Vencida";
  if (e.includes("incobrable")) return "Vencida";
  if (e.includes("en orden") || e.includes("por vencer")) return "Pendiente";
  return "Pendiente";
}

function isInicial(tipo) {
  return String(tipo || "").toLowerCase().trim().startsWith("inicial");
}

function isMensual(tipo) {
  const t = String(tipo || "").toLowerCase().trim();
  return (
    t.startsWith("mensual") ||
    t === "unico" ||
    t.startsWith("fee")
  );
}

function isContraResultado(tipo, estatus) {
  const t = String(tipo || "").toLowerCase();
  const e = String(estatus || "").toLowerCase();
  return t.includes("contra resultado") || e.includes("contra resultado");
}

// ─── 1. Leer MATRIZ CLIENTES PROCESADOS ──────────────────────────────────────

const matrizWb = XLSX.readFile(
  path.join(__dirname, "..", "docs", "MATRIZ DE CLIENTES TRIBUTARIOS ORDENADA.xlsx"),
  { cellDates: true, raw: true },
);

const matrizRaw = XLSX.utils
  .sheet_to_json(matrizWb.Sheets["CLIENTES PROCESADOS"], { header: 1, defval: null })
  .slice(1);

const matrizClients = [];
for (const r of matrizRaw) {
  const nombre = strVal(r[4]);
  if (!nombre) continue;

  const rutNorm = extractFirstRut(r[3]);
  if (!rutNorm) continue;

  const ccto = numVal(r[8]);
  const cuotasCount = typeof r[9] === "number" && r[9] > 0 ? Math.trunc(r[9]) : null;

  matrizClients.push({
    rutNorm,
    rutOriginal: strVal(r[3]) || rutNorm,
    nombre,
    persona: mapPersona(r[5]),
    area: strVal(r[6]) || "Sin Area",
    servicio: strVal(r[7]) || "Sin Servicio",
    ccto,
    cuotasCount,
    telefono: strVal(r[10]),
    fechaIngreso: dateToIso(r[2]),
    mes: strVal(r[0]),
    año: r[1],
  });
}

console.log("MATRIZ clientes válidos:", matrizClients.length);

// ─── 2. Leer AT COBRANZA y construir grupos por RUT ──────────────────────────

const atWb = XLSX.readFile(
  path.join(__dirname, "..", "docs", "AT. COBRANZA _ Auxiliar de Clientes.xlsx"),
  { cellDates: true, raw: true },
);

const atRaw = XLSX.utils
  .sheet_to_json(atWb.Sheets["Auxiliar de Clientes oficial"], { header: 1, defval: null })
  .slice(1);

// Propagar valores de cabecera de grupo hacia abajo
// Nuevo grupo: cuando aparece CCTO no nulo (col 9) o cuando cambia el nombre (col 5)
const atGroups = []; // [{rutNorm, nombre, ccto, persona, area, servicio, telefono, fechaIngreso, cuotas:[]}]

let cur = null;

for (const r of atRaw) {
  const rutRaw = r[4];
  const nombreRaw = r[5];
  const cctoRaw = r[9];
  const tipoRaw = r[11]; // INICIAL/MENSUAL/etc
  const nCuota = r[10];
  const montoCuota = r[12];
  const fechaCuota = r[13];
  const pagado = r[17];
  const fechaPago = r[18];
  const estatus = r[19];

  const hasNewCcto = cctoRaw !== null && cctoRaw !== undefined && Number(cctoRaw) > 0;
  const hasNewNombre =
    nombreRaw !== null &&
    nombreRaw !== undefined &&
    String(nombreRaw).trim().length > 0 &&
    String(nombreRaw).trim().length < 100; // evitar observaciones largas

  if (hasNewCcto || (hasNewNombre && !cur)) {
    // Nuevo grupo de contrato
    const rutNorm = extractFirstRut(rutRaw || (cur ? cur.rutRaw : null));
    if (!rutNorm && !hasNewNombre) continue; // sin RUT ni nombre, skip

    cur = {
      rutNorm,
      rutRaw: strVal(rutRaw) || (cur ? cur.rutRaw : null),
      nombre: hasNewNombre ? String(nombreRaw).trim() : (cur ? cur.nombre : null),
      ccto: numVal(cctoRaw),
      persona: strVal(r[6]) || (cur ? cur.persona : null),
      area: strVal(r[7]) || (cur ? cur.area : null),
      servicio: strVal(r[8]) || (cur ? cur.servicio : null),
      telefono: strVal(r[21]) || (cur ? cur.telefono : null),
      fechaIngreso: dateToIso(r[3]) || (cur ? cur.fechaIngreso : null),
      cuotas: [],
    };
    atGroups.push(cur);
  } else if (cur && hasNewNombre && String(nombreRaw).trim() !== cur.nombre) {
    // Cambio de nombre sin nuevo CCTO → actualizar nombre heredado pero mismo grupo
    // (caso donde nombre aparece en fila de cuota por error de datos)
  }

  if (!cur) continue;
  if (!tipoRaw) continue;

  cur.cuotas.push({
    n: typeof nCuota === "number" ? nCuota : null,
    tipo: strVal(tipoRaw),
    monto: numVal(montoCuota),
    fechaVenc: dateToIso(fechaCuota),
    pagado: String(pagado || "").toUpperCase() === "SI",
    fechaPago: dateToIso(fechaPago),
    estatus: strVal(estatus),
  });
}

// Indexar AT COBRANZA por RUT normalizado
const atByRut = new Map(); // rutNorm → [groups]
for (const g of atGroups) {
  if (!g.rutNorm) continue;
  const list = atByRut.get(g.rutNorm) ?? [];
  list.push(g);
  atByRut.set(g.rutNorm, list);
}

console.log("AT grupos de contrato:", atGroups.length);
console.log("AT RUTs únicos:", atByRut.size);

// ─── 3. Cruzar datos ─────────────────────────────────────────────────────────

const outClientes = [];
const outContactos = [];
const outContratos = [];
const outCuotas = [];

let contratoIdCounter = 1;

for (const mc of matrizClients) {
  const atMatch = atByRut.get(mc.rutNorm) ?? [];

  // ── CLIENTE ──────────────────────────────────────────────────────────────
  // Estado cliente: derivar del AT COBRANZA si hay datos
  let estadoCliente = "Activo";
  if (atMatch.length > 0) {
    const allEstatus = atMatch.flatMap((g) => g.cuotas.map((c) => c.estatus)).filter(Boolean);
    const hasVencido = allEstatus.some((e) => String(e).toLowerCase().includes("vencido"));
    const allPagado = allEstatus.every((e) => String(e).toLowerCase().includes("pagado"));
    if (hasVencido) estadoCliente = "Moroso";
    else if (allPagado) estadoCliente = "Finalizado";
    else estadoCliente = "Activo";
  }

  // Normalizar RUT para salida (formato chileno)
  const rutClean = mc.rutNorm.includes("-") ? mc.rutNorm : mc.rutNorm;

  outClientes.push({
    rut: mc.rutOriginal,
    nombre: mc.nombre,
    persona: mc.persona,
    estado: estadoCliente,
    fechaIngreso: mc.fechaIngreso,
    clienteId: `CLI-${mc.rutNorm.replace(/[^0-9K]/g, "").slice(-6)}`,
  });

  // ── CONTACTO ─────────────────────────────────────────────────────────────
  if (mc.telefono) {
    outContactos.push({
      clienteRef: mc.rutOriginal,
      nombre: mc.nombre,
      email: null,
      telefono: mc.telefono,
      cargo: null,
      esPrincipal: "Si",
      recibeNotif: "Si",
      recibeComp: "No",
      whatsapp: "Si",
    });
  }

  // ── CONTRATOS + CUOTAS ───────────────────────────────────────────────────
  if (atMatch.length > 0) {
    // Hay datos en AT COBRANZA → usar esos contratos
    for (const atG of atMatch) {
      const ctrId = `CTR-${String(contratoIdCounter++).padStart(4, "0")}`;
      const ccto = atG.ccto ?? mc.ccto;
      if (!ccto) continue;

      // Separar INICIAL de MENSUAL
      const cuotasInicial = atG.cuotas.filter((c) => isInicial(c.tipo));
      const cuotasMensual = atG.cuotas.filter(
        (c) => isMensual(c.tipo) && !isContraResultado(c.tipo, c.estatus),
      );
      const cuotasContraResultado = atG.cuotas.filter((c) =>
        isContraResultado(c.tipo, c.estatus),
      );

      const pagoInicial = cuotasInicial.reduce((s, c) => s + (c.monto ?? 0), 0);

      // Calcular monto por cuota MENSUAL
      const saldoFinanciado = ccto - pagoInicial;
      const nMensual = cuotasMensual.length || mc.cuotasCount || 1;
      const montoCuotaCalc =
        cuotasMensual.length > 0
          ? Math.round(saldoFinanciado / cuotasMensual.length)
          : mc.cuotasCount
            ? Math.round(saldoFinanciado / mc.cuotasCount)
            : saldoFinanciado;

      // Estado contrato desde cuotas
      const vencidas = cuotasMensual.filter((c) =>
        String(c.estatus || "").toLowerCase().includes("vencido"),
      ).length;
      const pagadas = cuotasMensual.filter((c) =>
        String(c.estatus || "").toLowerCase().includes("pagado"),
      ).length;
      const estadoContrato =
        cuotasMensual.length > 0 && pagadas === cuotasMensual.length
          ? "Pagado"
          : vencidas > 0
            ? "En mora"
            : "Activo";

      outContratos.push({
        clienteRef: mc.rutOriginal,
        servicio: atG.servicio || mc.servicio,
        area: atG.area || mc.area,
        montoTotal: ccto,
        pagoInicial: pagoInicial > 0 ? pagoInicial : "",
        cantidadCuotas: nMensual,
        fechaInicio: atG.fechaIngreso || mc.fechaIngreso,
        estadoContrato,
        contratoId: ctrId,
        observaciones: cuotasContraResultado.length > 0 ? `${cuotasContraResultado.length} cuota(s) contra resultado excluidas` : "",
      });

      // Cuotas MENSUAL
      let cuotaNum = 1;
      for (const c of cuotasMensual) {
        const estadoCuota = mapEstadoCuota(c.estatus, c.tipo);
        outCuotas.push({
          contratoRef: ctrId,
          numeroCuota: cuotaNum++,
          monto: c.monto ?? montoCuotaCalc,
          fechaVenc: c.fechaVenc,
          estadoCuota,
          fechaPago: c.pagado ? c.fechaPago : "",
          medioPago: c.pagado ? "Transferencia" : "",
          paymentId: "",
          comprobanteUrl: "",
          tipoCuotaOrigen: c.tipo,
          saldoOrigen: "",
          pagadoOrigen: c.pagado ? "Si" : "",
        });
      }
    }
  } else {
    // Sin datos en AT COBRANZA → generar cuotas sintéticas desde MATRIZ
    if (!mc.ccto || !mc.cuotasCount) continue;

    const ctrId = `CTR-${String(contratoIdCounter++).padStart(4, "0")}`;
    const montoCuota = Math.round(mc.ccto / mc.cuotasCount);

    outContratos.push({
      clienteRef: mc.rutOriginal,
      servicio: mc.servicio,
      area: mc.area,
      montoTotal: mc.ccto,
      pagoInicial: "",
      cantidadCuotas: mc.cuotasCount,
      fechaInicio: mc.fechaIngreso,
      estadoContrato: "Activo",
      contratoId: ctrId,
      observaciones: "Sin datos de pago en AT COBRANZA - cuotas generadas",
    });

    let cuotaNum = 1;
    let fechaBase = mc.fechaIngreso ? new Date(mc.fechaIngreso) : new Date();
    for (let i = 0; i < mc.cuotasCount; i++) {
      fechaBase = new Date(fechaBase);
      fechaBase.setMonth(fechaBase.getMonth() + 1);
      const isoFecha = fechaBase.toISOString().slice(0, 10);
      outCuotas.push({
        contratoRef: ctrId,
        numeroCuota: cuotaNum++,
        monto: montoCuota,
        fechaVenc: isoFecha,
        estadoCuota: "Pendiente",
        fechaPago: "",
        medioPago: "",
        paymentId: "",
        comprobanteUrl: "",
        tipoCuotaOrigen: "",
        saldoOrigen: "",
        pagadoOrigen: "",
      });
    }
  }
}

console.log(
  `Clientes: ${outClientes.length} | Contratos: ${outContratos.length} | Cuotas: ${outCuotas.length}`,
);

// ─── 4. Construir Excel ───────────────────────────────────────────────────────

function makeSheet(headers, rows) {
  return XLSX.utils.aoa_to_sheet([headers, ...rows]);
}

const clientesSheet = makeSheet(
  ["RUT *", "Nombre Razon Social *", "Tipo Persona *", "Estado Cliente *", "Fecha Ingreso *", "Cliente ID Interno (Opcional)"],
  outClientes.map((c) => [c.rut, c.nombre, c.persona, c.estado, c.fechaIngreso, c.clienteId]),
);

const contactosSheet = makeSheet(
  ["Cliente ID Interno o RUT *", "Nombre Contacto *", "Email", "Telefono", "Cargo", "Es Contacto Principal *", "Recibe Notificaciones *", "Recibe Comprobantes *", "WhatsApp"],
  outContactos.map((c) => [c.clienteRef, c.nombre, c.email ?? "", c.telefono, c.cargo ?? "", c.esPrincipal, c.recibeNotif, c.recibeComp, c.whatsapp]),
);

const facturacionSheet = makeSheet(
  ["Cliente ID Interno o RUT *", "RUT Facturacion *", "Razon Social Facturacion *", "Giro Facturacion", "Direccion Facturacion", "Comuna", "Ciudad", "Region", "Email Facturacion", "Tipo Documento Preferido", "Requiere OC", "Condicion Pago"],
  [], // Sin datos de facturacion en fuente
);

const contratosSheet = makeSheet(
  ["Cliente ID Interno o RUT *", "Servicio *", "Area *", "Monto Total *", "Pago Inicial (Opcional)", "Cantidad Cuotas *", "Fecha Inicio *", "Estado Contrato *", "Contrato ID (Opcional)", "Observaciones"],
  outContratos.map((c) => [
    c.clienteRef, c.servicio, c.area, c.montoTotal, c.pagoInicial,
    c.cantidadCuotas, c.fechaInicio, c.estadoContrato, c.contratoId, c.observaciones,
  ]),
);

const cuotasSheet = makeSheet(
  ["Contrato ID o Cliente ID/RUT *", "Numero Cuota *", "Monto *", "Fecha Vencimiento *", "Estado Cuota *", "Fecha Pago", "Medio Pago", "Payment ID Externo", "Comprobante URL", "Tipo Cuota Origen", "Saldo Origen", "Pagado Origen"],
  outCuotas.map((c) => [
    c.contratoRef, c.numeroCuota, c.monto, c.fechaVenc, c.estadoCuota,
    c.fechaPago, c.medioPago, c.paymentId, c.comprobanteUrl,
    c.tipoCuotaOrigen, c.saldoOrigen, c.pagadoOrigen,
  ]),
);

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, clientesSheet, "CLIENTES");
XLSX.utils.book_append_sheet(wb, contactosSheet, "CONTACTOS");
XLSX.utils.book_append_sheet(wb, facturacionSheet, "FACTURACION");
XLSX.utils.book_append_sheet(wb, contratosSheet, "CONTRATOS");
XLSX.utils.book_append_sheet(wb, cuotasSheet, "CUOTAS_OPCIONAL");

const out = path.join(__dirname, "..", "docs", "plantilla-cruzada-importacion.xlsx");
XLSX.writeFile(wb, out);
console.log("Archivo generado:", out);
