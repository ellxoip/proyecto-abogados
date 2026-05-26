import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return NextResponse.json([]);

    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/"/g, ""));
    const rutIdx = headers.indexOf("rut");
    const nombreIdx = headers.indexOf("nombre");
    const giroIdx = headers.indexOf("giro");
    const emailIdx = headers.indexOf("email");
    const telIdx = headers.indexOf("telefono");
    const bancoIdx = headers.indexOf("banco");
    const cuentaIdx = headers.indexOf("numero_cuenta");

    if (rutIdx === -1 || nombreIdx === -1) {
      return NextResponse.json({ error: "Faltan columnas rut y/o nombre" }, { status: 400 });
    }

    const rutsExistentes = new Set(
      (await prisma.proveedor.findMany({ select: { rut: true } })).map(p => p.rut)
    );

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map(c => c.trim().replace(/"/g, ""));
      const rut = cols[rutIdx] ?? "";
      const nombre = cols[nombreIdx] ?? "";

      if (!rut) {
        rows.push({ row: i + 1, rut, nombre, status: "error", error: "RUT vacío" });
        continue;
      }
      if (!nombre) {
        rows.push({ row: i + 1, rut, nombre, status: "error", error: "Nombre vacío" });
        continue;
      }
      if (rutsExistentes.has(rut)) {
        rows.push({ row: i + 1, rut, nombre, status: "duplicate" });
        continue;
      }

      rows.push({
        row: i + 1,
        rut,
        nombre,
        giro: cols[giroIdx] || undefined,
        email: cols[emailIdx] || undefined,
        telefono: cols[telIdx] || undefined,
        banco: cols[bancoIdx] || undefined,
        numero_cuenta: cols[cuentaIdx] || undefined,
        status: "ok",
      });
    }

    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: "Error procesando archivo" }, { status: 500 });
  }
}
