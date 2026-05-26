/**
 * Garantiza que los buckets de Supabase Storage que usa la mensajería
 * existen en el proyecto apuntado por NEXT_PUBLIC_SUPABASE_URL.
 *
 * Buckets:
 *   - `case-audio`  → notas de voz adjuntas a Comments (postAudioComment)
 *   - `documents`   → archivos PDF/imagen/Word adjuntos a Comments (postFileComment)
 *   - `receipts`    → comprobantes de pago del portal cliente
 *
 * Si no existen los crea. Si existen, los deja como están (idempotente).
 *
 * Uso:
 *   cd hive-service-control
 *   npx tsx scripts/ensure-storage-buckets.ts
 *
 * Requiere SUPABASE_SERVICE_KEY (no la anon key) — es la única que tiene
 * permiso para crear buckets vía API.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

(function loadEnv() {
  const file = path.resolve(__dirname, "..", ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
})();

type BucketSpec = {
  name: string;
  public: boolean;
  fileSizeLimitMb: number;
  allowedMime: string[];
  description: string;
};

const BUCKETS: BucketSpec[] = [
  {
    name: "case-audio",
    public: true,
    fileSizeLimitMb: 15,
    allowedMime: ["audio/*"],
    description: "Notas de voz en Comments (postAudioComment)",
  },
  {
    name: "documents",
    public: true,
    fileSizeLimitMb: 25,
    allowedMime: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    description: "Documentos adjuntos en Comments (postFileComment)",
  },
  {
    name: "receipts",
    public: true,
    fileSizeLimitMb: 10,
    allowedMime: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    description: "Comprobantes de pago del portal cliente",
  },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url) {
    console.error("✗ NEXT_PUBLIC_SUPABASE_URL ausente.");
    process.exit(1);
  }
  if (!serviceKey) {
    console.error("✗ SUPABASE_SERVICE_KEY ausente (necesaria para crear buckets).");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  console.log("Ensure Supabase buckets — service-control");
  console.log(`  proyecto: ${url}`);
  console.log("");

  const { data: existing, error: listErr } = await admin.storage.listBuckets();
  if (listErr) {
    console.error(`✗ listBuckets falló: ${listErr.message}`);
    process.exit(1);
  }
  const existingNames = new Set((existing ?? []).map((b) => b.name));

  let created = 0;
  let already = 0;
  let failed = 0;

  for (const spec of BUCKETS) {
    if (existingNames.has(spec.name)) {
      already += 1;
      console.log(`  · ${spec.name} ya existe`);
      continue;
    }
    const { error } = await admin.storage.createBucket(spec.name, {
      public: spec.public,
      fileSizeLimit: spec.fileSizeLimitMb * 1024 * 1024,
      allowedMimeTypes: spec.allowedMime,
    });
    if (error) {
      failed += 1;
      console.error(`  ✗ ${spec.name} falló: ${error.message}`);
    } else {
      created += 1;
      console.log(`  ✓ ${spec.name} creado (${spec.description})`);
    }
  }

  console.log("");
  console.log(`Resumen: ${created} creados · ${already} existentes · ${failed} fallidos`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
