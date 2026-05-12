import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { CaseStage, PaymentStatus, Role } from "@prisma/client";
import Link from "next/link";
import { BandejaFilters } from "./BandejaFilters";
import { AlertCircle, TrendingDown, Clock, Plus } from "lucide-react";
import { generateSupabaseToken } from "@/lib/supabase-jwt";
import { LiveInboxCounter } from "./LiveInboxCounter";
import { BandejaHelpWidget } from "./BandejaHelpWidget";
import { BandejaClient } from "./BandejaClient";

type SearchParams = { category?: string; stage?: string; sort?: string };

export const dynamic = "force-dynamic";

export default async function BandejaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  const role = session!.user.role as string;
  const userId = session!.user.id;


  const categoryFilterId = searchParams.category;
  const stageFilter = searchParams.stage as CaseStage | undefined;

  const baseStages = stageFilter
    ? [stageFilter as CaseStage]
    : [CaseStage.OPEN, CaseStage.WAITING_CUOTAS, CaseStage.IN_PROGRESS];

  const roleFilter =
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

  const realtimeToken = generateSupabaseToken(userId, role as Role);


  const where = {
    ...roleFilter,
    stage: { in: baseStages },
    ...(categoryFilterId ? { categoryId: categoryFilterId } : {}),
  };


  const { cases, jefes, abogados, atRiskRevenue, categories } = await withRls(
    async (tx) => {
      const [cases, jefes, abogados, atRiskAgg, allCategories] =
        await Promise.all([
          tx.case.findMany({
            where,
            include: {
              client: { select: { fullName: true } },
              categoria: { select: { name: true } },
              abogados: { select: { id: true } }
            },
            orderBy: searchParams.sort === "client_asc" 
              ? { client: { fullName: "asc" } } 
              : { createdAt: "desc" },
            take: searchParams.sort === "client_asc" ? undefined : 50,
          }),
          tx.user.findMany({
            where: { role: Role.JEFE_DE_MESA, active: true },
            select: { id: true, fullName: true },
            orderBy: { fullName: "asc" },
          }),
          tx.user.findMany({
            where: { role: Role.ABOGADO, active: true },
            select: { id: true, fullName: true },
            orderBy: { fullName: "asc" },
          }),
          tx.paymentEvent.aggregate({
            _sum: { amount: true },
            where: {
              status: { in: [PaymentStatus.UNPAID, PaymentStatus.OVERDUE] },
              case: { stage: CaseStage.HALTED_BY_PAYMENT },
            },
          }),
          tx.category.findMany({
            orderBy: { name: "asc" },
          }),
        ]);

      return {
        cases,
        jefes,
        abogados,
        atRiskRevenue: atRiskAgg._sum.amount?.toNumber() ?? 0,
        categories: allCategories,
      };

    }
  );

  const canDerive = role === Role.SUPER_ADMIN || role === Role.JEFE_DE_MESA;

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text)] font-serif">
            Bandeja de Entrada
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1 font-medium">
            {role === Role.SUPER_ADMIN
              ? "Casos nuevos pendientes de asignación estratégica."
              : "Casos abiertos bajo la supervisión de tu equipo."}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {(role === Role.SUPER_ADMIN || role === Role.JEFE_DE_MESA) && (
            <Link 
              href="/admin/casos/nuevo"
              className="flex items-center gap-2 bg-[var(--bg)] text-[var(--gold)] px-5 py-2.5 rounded-sm text-[11px] font-bold uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-black/10"
            >
              <Plus className="w-4 h-4" />
              Ingreso Rápido
            </Link>
          )}

          <LiveInboxCounter count={cases.length} realtimeToken={realtimeToken} />
        </div>
      </header>


      {/* Metrics Row — only visible to SuperAdmin */}
      {role === Role.SUPER_ADMIN && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-sm p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 rounded-sm bg-[rgba(239,68,68,0.1)]">
                <TrendingDown className="w-5 h-5 text-red-600" />
              </div>
              <span className="text-[10px] font-bold text-red-600 uppercase tracking-widest bg-[rgba(239,68,68,0.1)] px-2 py-0.5 rounded-sm">
                Crítico
              </span>
            </div>
            <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">
              Ingresos en Riesgo
            </div>
            <div className="text-3xl font-bold text-[var(--text)]">
              ${atRiskRevenue.toLocaleString("es-CL")}
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-3 leading-relaxed">
              Suma total de cuotas vencidas en casos con flujo de trabajo detenido.
            </p>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-sm p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 rounded-sm bg-[rgba(249,115,22,0.1)]">
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
              <span className="text-[10px] font-bold text-orange-600 uppercase tracking-widest bg-[rgba(249,115,22,0.1)] px-2 py-0.5 rounded-sm">
                Pendiente
              </span>
            </div>
            <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">
              Esperando Pago Inicial
            </div>
            <div className="text-3xl font-bold text-[var(--text)]">
              {cases.filter(c => c.stage === CaseStage.WAITING_CUOTAS).length}
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-3 leading-relaxed">
              Casos que aún no han validado el pago de la cuota de apertura.
            </p>
          </div>

          <div className="bg-[var(--bg)] border border-[var(--border-subtle)] rounded-sm p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 rounded-sm bg-[var(--gold)10]">
                <AlertCircle className="w-5 h-5 text-[var(--gold)]" />
              </div>
              <span className="text-[10px] font-bold text-[var(--gold)] uppercase tracking-widest bg-[var(--gold)10] px-2 py-0.5 rounded-sm">
                Prioridad
              </span>
            </div>
            <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">
              Sin Asignar
            </div>
            <div className="text-3xl font-bold text-[var(--text)]">
              {cases.filter(c => c.stage === CaseStage.OPEN).length}
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-3 leading-relaxed">
              Casos con pago validado que requieren asignación inmediata a un equipo.
            </p>
          </div>
        </div>
      )}

      {/* Filters Section */}
      <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-sm p-6 mb-6 shadow-sm">
        <BandejaFilters
          categories={categories}
          selectedCategory={searchParams.category ?? ""}
          selectedStage={searchParams.stage ?? ""}
        />
      </div>

      {/* Bulk Assignment Table */}
      <BandejaClient
        cases={cases}
        jefes={jefes}
        abogados={abogados}
        role={role}
        currentUserId={userId}
        canDerive={canDerive}
        searchParams={searchParams}
      />

      {/* Nueva sección para el botón de generación de autoayuda */}
      <BandejaHelpWidget />
    </div>
  );
}

