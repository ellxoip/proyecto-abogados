import { NextResponse } from "next/server";
import { requireSessionUser } from "@/server/auth/session";
import { ClientImportService } from "@/server/services/client-import.service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Debes adjuntar un archivo XLSX en el campo file." },
        { status: 400 },
      );
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json(
        { ok: false, error: "Solo se permiten archivos .xlsx." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const service = new ClientImportService();
    const result = await service.previewImport({
      fileName: file.name,
      fileBuffer: buffer,
      createdBy: user.id,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    const status = message.toLowerCase().includes("autoriz") ? 401 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
