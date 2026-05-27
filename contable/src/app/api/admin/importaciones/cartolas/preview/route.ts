import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return NextResponse.json([]);

    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/"/g, ""));
    const fechaIdx = headers.findIndex(h => h.includes("fecha"));
    const glosaIdx = headers.findIndex(h => h.includes("glosa") || h.includes("descripcion") || h.includes("detalle"));
    const cargoIdx = headers.findIndex(h => h.includes("cargo") || h.includes("debito"));
    const abonoIdx = headers.findIndex(h => h.includes("abono") || h.includes("credito"));

    if (fechaIdx === -1 || glosaIdx === -1) {
      return NextResponse.json({ error: "No se encontraron columnas fecha/glosa" }, { status: 400 });
    }

    const rows = [];
    for (let i = 1; i < Math.min(lines.length, 1001); i++) {
      const cols = lines[i].split(",").map(c => c.trim().replace(/"/g, ""));
      const fecha = cols[fechaIdx] ?? "";
      const glosa = cols[glosaIdx] ?? "";

      if (!fecha || !glosa) continue;

      const cargoRaw = cargoIdx >= 0 ? cols[cargoIdx]?.replace(/[^0-9.,-]/g, "").replace(",", ".") : "";
      const abonoRaw = abonoIdx >= 0 ? cols[abonoIdx]?.replace(/[^0-9.,-]/g, "").replace(",", ".") : "";
      const cargo = cargoRaw ? parseFloat(cargoRaw) || null : null;
      const abono = abonoRaw ? parseFloat(abonoRaw) || null : null;

      if (!cargo && !abono) {
        rows.push({ row: i + 1, fecha, glosa, cargo: null, abono: null, status: "error", error: "Sin monto" });
        continue;
      }

      rows.push({ row: i + 1, fecha, glosa, cargo, abono, status: "ok" });
    }

    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: "Error procesando" }, { status: 500 });
  }
}
