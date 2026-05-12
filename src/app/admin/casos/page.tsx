import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { Role } from "@prisma/client";
import { Eye, Activity, Clock, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default async function CasosPage({ searchParams }: { searchParams: { sort?: string } }) {
  const session = await auth();
  const role = session!.user.role;
  const userId = session!.user.id;

  const where =
    role === Role.SUPER_ADMIN
      ? {}
      : role === Role.JEFE_DE_MESA
      ? {
          OR: [
            { jefe_mesa_id: userId },
            { abogados: { some: { managedById: userId } } },
          ],
        }
      : role === Role.ABOGADO
      ? { abogados: { some: { id: userId } } }
      : { id: "__none__" };



  const cases = await withRls((tx) =>
    tx.case.findMany({
      where,
      include: { client: { select: { fullName: true } }, abogados: { select: { fullName: true } }, jefeMesa: { select: { fullName: true } } },

      orderBy: searchParams.sort === "client_asc" ? { client: { fullName: "asc" } } : { updatedAt: "desc" },
      take: searchParams.sort === "client_asc" ? undefined : 100,
    }),
  );

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-8">
         <h1 className="text-3xl font-bold tracking-tight text-[var(--text)] font-serif">
            Gestión de Casos
         </h1>
         <p className="text-sm text-[var(--text-muted)] mt-1 font-medium">
            Listado completo de expedientes bajo su responsabilidad profesional.
         </p>
      </header>

      <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-sm shadow-sm overflow-x-auto">
        <table className="w-full min-w-[820px] text-left border-collapse">
          <thead>
            <tr style={{ background: "var(--surface-2)" }}>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)]">Código</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)]">
                <Link 
                  href={`?sort=${searchParams.sort === "client_asc" ? "" : "client_asc"}`}
                  className="flex items-center gap-1 hover:text-[var(--text)] transition-colors"
                  title="Alternar orden alfabético"
                >
                  Cliente
                  {searchParams.sort === "client_asc" ? (
                    <span className="text-[var(--text)] font-extrabold">↑ A-Z</span>
                  ) : (
                    <span className="opacity-50 font-normal">⇵</span>
                  )}
                </Link>
              </th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)]">Estado</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)]">Salud Sistema</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)]">Finanzas</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)]">Responsable</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] border-b border-[var(--border-glass)] text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-glass)]">
            {cases.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-sm text-[var(--text-muted)]">
                   No hay casos registrados en este momento.
                </td>
              </tr>
            ) : (
              cases.map((c) => (
                <tr key={c.id} className="hover:bg-[var(--surface)] transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-bold text-[var(--text)] tracking-wider">{c.code}</div>
                    <div className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-tighter mt-0.5 flex items-center gap-1">
                       <Clock className="w-2.5 h-2.5" /> 
                       Act: {new Date(c.updatedAt).toLocaleDateString("es-CL")}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-[var(--text)]">{c.client.fullName}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm bg-[#EAF0FA] text-[#60A5FA]">
                      {c.stage}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {c.last_health_check_at && (new Date().getTime() - new Date(c.last_health_check_at).getTime() < 60 * 60 * 1000) ? (
                      <div className="flex items-center gap-1.5 text-green-600">
                        <ShieldCheck className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Óptimo</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-amber-500">
                        <Activity className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Revisión</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                     <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm ${c.is_paid ? "bg-[rgba(34,197,94,0.1)] text-green-400" : "bg-[rgba(239,68,68,0.1)] text-red-400"}`}>
                        {c.is_paid ? "Al día" : "Mora"}
                     </span>
                  </td>
                  <td className="px-6 py-4 text-xs font-medium text-[var(--text-muted)]">
                    {c.abogados[0]?.fullName ?? "No asignado"}

                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link 
                      href={`/admin/casos/${c.id}`} 
                      className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)] hover:text-[var(--text)] transition-colors"
                    >
                      Ver Expediente
                      <Eye className="w-3.5 h-3.5" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
