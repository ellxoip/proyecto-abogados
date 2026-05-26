import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TIPOS_VENTA = ["BOLETA","FACTURA_EXENTA","FACTURA_AFECTA","NOTA_CREDITO","NOTA_DEBITO","COMPROBANTE_INGRESO"];
const TIPOS_COMPRA = ["FACTURA","BOLETA","NOTA_CREDITO_RECIBIDA","NOTA_DEBITO_RECIBIDA"];

function mapTipoVenta(raw: string): string {
  const t = raw.toUpperCase().replace(/\s+/g, "_");
  if (TIPOS_VENTA.includes(t)) return t;
  if (t.includes("BOLETA")) return "BOLETA";
  if (t.includes("EXENTA")) return "FACTURA_EXENTA";
  if (t.includes("AFECTA") || t.includes("FACTURA")) return "FACTURA_AFECTA";
  if (t.includes("CREDITO")) return "NOTA_CREDITO";
  return "BOLETA";
}

function mapTipoCompra(raw: string): string {
  const t = raw.toUpperCase().replace(/\s+/g, "_");
  if (TIPOS_COMPRA.includes(t)) return t;
  if (t.includes("CREDITO")) return "NOTA_CREDITO_RECIBIDA";
  if (t.includes("DEBITO")) return "NOTA_DEBITO_RECIBIDA";
  if (t.includes("BOLETA")) return "BOLETA";
  return "FACTURA";
}

export async function POST(req: NextRequest) {
  try {
    const { rows, tipo_libro } = await req.json();
    if (!Array.isArray(rows)) return NextResponse.json({ error: "Invalid" }, { status: 400 });

    let importados = 0;
    let ya_existentes = 0;
    let errores = 0;

    if (tipo_libro === "VENTAS") {
      for (const row of rows) {
        try {
          await prisma.documentoVenta.create({
            data: {
              tipo: mapTipoVenta(row.tipo_doc) as never,
              numero: row.folio ? parseInt(row.folio) || null : null,
              razon_social: row.razon_social || "Sin nombre",
              rut_receptor: row.rut || null,
              fecha_emision: new Date(row.fecha),
              monto_neto: row.monto_neto,
              iva: row.iva,
              monto_total: row.monto_total,
              estado: "EMITIDO",
            },
          });
          importados++;
        } catch (e: unknown) {
          if (e instanceof Error && e.message.includes("Unique")) ya_existentes++;
          else errores++;
        }
      }
    } else {
      for (const row of rows) {
        const proveedor = await prisma.proveedor.findFirst({ where: { rut: row.rut } });
        if (!proveedor) {
          try {
            const newProv = await prisma.proveedor.create({
              data: { rut: row.rut, nombre: row.razon_social || row.rut },
            });
            await prisma.documentoCompra.create({
              data: {
                proveedor_id: newProv.id,
                tipo: mapTipoCompra(row.tipo_doc) as never,
                numero: row.folio || null,
                fecha_emision: new Date(row.fecha),
                monto_neto: row.monto_neto,
                iva: row.iva,
                monto_total: row.monto_total,
                estado: "RECIBIDO",
              },
            });
            importados++;
          } catch {
            errores++;
          }
          continue;
        }
        try {
          await prisma.documentoCompra.create({
            data: {
              proveedor_id: proveedor.id,
              tipo: mapTipoCompra(row.tipo_doc) as never,
              numero: row.folio || null,
              fecha_emision: new Date(row.fecha),
              monto_neto: row.monto_neto,
              iva: row.iva,
              monto_total: row.monto_total,
              estado: "RECIBIDO",
            },
          });
          importados++;
        } catch (e: unknown) {
          if (e instanceof Error && e.message.includes("Unique")) ya_existentes++;
          else errores++;
        }
      }
    }

    return NextResponse.json({ libro: tipo_libro, importados, ya_existentes, errores });
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
