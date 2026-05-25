import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { Role } from "@/lib/db-enums";
import { FolderTree, Folder, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

type CategoryRow = {
  id: string;
  name: string;
  totalDocs: number;
  totalCases: number;
};

export default async function DocumentosIndexPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== Role.SUPER_ADMIN) return notFound();

  // El módulo Documentos expone ÚNICAMENTE las OT que NEXIO entrega al
  // marcar el lead como Pago Comprometido. Comprobantes de pago, subidas
  // manuales del expediente y resoluciones finales viven en la ficha del
  // caso (`/admin/casos/[id]`), no aquí. Las OT se identifican por el
  // prefijo `[OT/...]` que `cases/route.ts` inserta al recibir el payload
  // desde NEXIO.
  const OT_PREFIX = "[OT/";
  const categories = await withRls(async (tx) => {
    const cats = await tx.category.findMany({
      orderBy: { name: "asc" },
      include: {
        cases: {
          select: {
            id: true,
            updates: {
              where: {
                document_url: { not: null },
                description: { startsWith: OT_PREFIX },
              },
              select: { id: true },
            },
          },
        },
      },
    });
    return cats.map<CategoryRow>((c) => ({
      id: c.id,
      name: c.name,
      totalCases: c.cases.filter((k) => k.updates.length > 0).length,
      totalDocs: c.cases.reduce((acc, k) => acc + k.updates.length, 0),
    }));
  });

  const totalDocs = categories.reduce((acc, c) => acc + c.totalDocs, 0);

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <header className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-md bg-[var(--surface-2)]">
            <FolderTree className="w-6 h-6 text-[var(--gold)]" />
          </div>
          <div>
            <h1
              className="text-2xl font-bold tracking-tight text-[var(--text)]"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Documentos
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Carpetas por categoría · {categories.length} categorías · {totalDocs} OT recibidas desde NEXIO
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.length === 0 && (
          <div className="col-span-full text-sm text-[var(--text-muted)] italic">
            Todavía no hay documentos almacenados. Las OT viajan a Hive cuando un lead pasa a Pago Comprometido en NEXIO.
          </div>
        )}
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/admin/documentos/${encodeURIComponent(c.name)}`}
            className="group bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-5 shadow-sm hover:border-[rgba(201,168,76,0.4)] transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              <Folder className="w-5 h-5 text-[var(--gold)]" />
              <h2 className="text-base font-bold text-[var(--text)]">{c.name}</h2>
            </div>
            <div className="text-xs text-[var(--text-muted)] flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <FileText className="w-3 h-3" /> {c.totalDocs} documentos
              </span>
              <span>·</span>
              <span>{c.totalCases} expedientes</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

