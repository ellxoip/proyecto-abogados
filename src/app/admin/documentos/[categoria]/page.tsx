import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { Role } from "@/lib/db-enums";
import { ChevronRight, Folder, FileText, Download, FolderOpen } from "lucide-react";

export const dynamic = "force-dynamic";

function extractSubfolderKey(description: string | null | undefined): string {
  if (!description) return "Sin categoría";
  const m = description.match(/^\[(.+?)\]/);
  return m ? m[1] : "General";
}

export default async function CategoriaDocumentosPage({
  params,
}: {
  params: { categoria: string };
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== Role.SUPER_ADMIN) return notFound();

  const categoryName = decodeURIComponent(params.categoria);

  // Mismas reglas que el índice: SOLO OT entregadas desde NEXIO. El
  // prefijo `[OT/...]` lo escribe `cases/route.ts` en la descripción del
  // Update al recibir el work_order. Otros artefactos (comprobantes,
  // resoluciones, subidas manuales) no aparecen aquí.
  const OT_PREFIX = "[OT/";
  const data = await withRls(async (tx) => {
    const category = await tx.category.findUnique({ where: { name: categoryName } });
    if (!category) return null;

    const cases = await tx.case.findMany({
      where: {
        categoryId: category.id,
        updates: {
          some: {
            document_url: { not: null },
            description: { startsWith: OT_PREFIX },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      include: {
        client: { select: { fullName: true } },
        updates: {
          where: {
            document_url: { not: null },
            description: { startsWith: OT_PREFIX },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            description: true,
            document_url: true,
            createdAt: true,
          },
        },
      },
    });

    return { category, cases };
  });

  if (!data) return notFound();

  const { category, cases } = data;

  // Agrupar documentos por subcarpeta dentro de cada caso
  const casesWithSubfolders = cases.map((k) => {
    const groups = new Map<
      string,
      { id: string; description: string; document_url: string | null; createdAt: Date }[]
    >();
    for (const u of k.updates) {
      const key = extractSubfolderKey(u.description);
      const arr = groups.get(key) ?? [];
      arr.push(u);
      groups.set(key, arr);
    }
    return {
      ...k,
      subfolders: Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b)),
    };
  });

  const totalDocs = cases.reduce((acc, k) => acc + k.updates.length, 0);

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <nav className="text-xs flex items-center gap-2 text-[var(--text-muted)]">
        <Link href="/admin/documentos" className="hover:text-[var(--gold)] transition-colors">
          Documentos
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-[var(--text)] font-bold">{category.name}</span>
      </nav>

      <header className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-md bg-[var(--surface-2)]">
            <FolderOpen className="w-6 h-6 text-[var(--gold)]" />
          </div>
          <div>
            <h1
              className="text-2xl font-bold tracking-tight text-[var(--text)]"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {category.name}
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {cases.length} expedientes · {totalDocs} documentos · subcarpetas por tipo de OT
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-4">
        {casesWithSubfolders.map((k) => (
          <details
            key={k.id}
            className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md overflow-hidden"
          >
            <summary className="cursor-pointer px-5 py-4 hover:bg-[var(--surface-2)] transition-colors flex items-center gap-3">
              <Folder className="w-4 h-4 text-[var(--gold)] flex-shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-bold text-[var(--text)]">{k.code}</div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  {k.client.fullName} · {k.updates.length} documentos · {k.subfolders.length} subcarpetas
                </div>
              </div>
              <Link
                href={`/admin/casos/${k.id}`}
                className="text-[10px] uppercase tracking-widest font-bold text-[var(--gold)] hover:underline"
              >
                Abrir expediente
              </Link>
            </summary>
            <div className="border-t border-[var(--border-glass)] divide-y divide-[var(--border-glass)]">
              {k.subfolders.map(([subfolderKey, docs]) => (
                <div key={subfolderKey} className="px-5 py-3">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold text-[var(--text-muted)] mb-2">
                    <Folder className="w-3 h-3" />
                    <span>{subfolderKey}</span>
                    <span className="text-[var(--gold)]">· {docs.length}</span>
                  </div>
                  <ul className="space-y-2 pl-5">
                    {docs.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-3 group">
                        <div className="flex items-start gap-2 min-w-0">
                          <FileText className="w-3.5 h-3.5 text-[var(--text-muted)] mt-0.5 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs text-[var(--text)] truncate">
                              {d.description.replace(/^\[.+?\]\s*/, "")}
                            </p>
                            <p className="text-[10px] text-[var(--text-muted)]">
                              {new Date(d.createdAt).toLocaleString("es-CL")}
                            </p>
                          </div>
                        </div>
                        {d.document_url && (
                          <a
                            href={d.document_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors hover:bg-[rgba(201,168,76,0.1)] flex-shrink-0"
                            style={{ color: "var(--gold)", border: "1px solid rgba(201,168,76,0.3)" }}
                          >
                            <Download className="w-3 h-3" />
                            Abrir
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
