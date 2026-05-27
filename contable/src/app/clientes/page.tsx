import Link from "next/link";
import { Prisma, EstadoCliente, TipoCliente } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { CrearClienteModal } from "@/app/components/crear-cliente-modal";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function pickFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const estadoClass: Record<EstadoCliente, string> = {
  ACTIVO: "bg-slate-100 text-slate-700",
  AL_DIA: "bg-emerald-100 text-emerald-700",
  MOROSO: "bg-rose-100 text-rose-700",
  FINALIZADO: "bg-slate-200 text-slate-600",
  ANULADO: "bg-slate-200 text-slate-500",
};

export default async function ClientesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = pickFirst(sp.q)?.trim() ?? "";
  const tipo = pickFirst(sp.tipo) ?? "";
  const estado = pickFirst(sp.estado) ?? "";
  const contratos = pickFirst(sp.contratos) ?? "";

  const where: Prisma.ClienteWhereInput = {
    AND: [
      q
        ? {
            OR: [
              { nombre: { contains: q, mode: "insensitive" } },
              { rut: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
      tipo && Object.values(TipoCliente).includes(tipo as TipoCliente)
        ? { tipo_cliente: tipo as TipoCliente }
        : {},
      estado && Object.values(EstadoCliente).includes(estado as EstadoCliente)
        ? { estado: estado as EstadoCliente }
        : {},
      contratos === "con"
        ? { contratos: { some: {} } }
        : contratos === "sin"
          ? { contratos: { none: {} } }
          : {},
    ],
  };

  const clientes = await prisma.cliente.findMany({
    where,
    orderBy: { created_at: "desc" },
    include: {
      contratos: {
        select: { id: true },
      },
    },
  });

  return (
    <section className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Clientes</h2>
          <p className="text-sm text-[var(--muted)]">
            Base financiera de clientes y estado general
          </p>
        </div>
        <CrearClienteModal />
      </header>

      <form className="card grid gap-3 p-4 md:grid-cols-5" method="GET">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre, RUT o email"
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
        />
        <select
          name="tipo"
          defaultValue={tipo}
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
        >
          <option value="">Tipo cliente</option>
          <option value={TipoCliente.PERSONA}>PERSONA</option>
          <option value={TipoCliente.EMPRESA}>EMPRESA</option>
        </select>
        <select
          name="estado"
          defaultValue={estado}
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
        >
          <option value="">Estado cliente</option>
          {Object.values(EstadoCliente).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          name="contratos"
          defaultValue={contratos}
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
        >
          <option value="">Con y sin contratos</option>
          <option value="con">Solo con contratos</option>
          <option value="sin">Solo sin contratos</option>
        </select>
        <div className="flex gap-2">
          <button
            className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white"
            type="submit"
          >
            Filtrar
          </button>
          <Link
            href="/clientes"
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          >
            Limpiar
          </Link>
        </div>
      </form>

      <p className="text-sm text-[var(--muted)]">
        {clientes.length} cliente{clientes.length === 1 ? "" : "s"} encontrado
        {clientes.length === 1 ? "" : "s"}.
      </p>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[var(--muted)]">
            <tr>
              <th className="table-cell font-medium">RUT</th>
              <th className="table-cell font-medium">Nombre</th>
              <th className="table-cell font-medium">Tipo</th>
              <th className="table-cell font-medium">Estado</th>
              <th className="table-cell font-medium">Ingreso</th>
              <th className="table-cell font-medium">Contratos</th>
              <th className="table-cell font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((cliente) => (
              <tr key={cliente.id}>
                <td className="table-cell font-mono text-xs">{cliente.rut}</td>
                <td className="table-cell">{cliente.nombre}</td>
                <td className="table-cell">{cliente.tipo_cliente}</td>
                <td className="table-cell">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${estadoClass[cliente.estado]}`}
                  >
                    {cliente.estado}
                  </span>
                </td>
                <td className="table-cell">{formatDate(cliente.fecha_ingreso)}</td>
                <td className="table-cell">{cliente.contratos.length}</td>
                <td className="table-cell">
                  <div className="flex gap-2">
                    <Link
                      className="text-[var(--accent)] hover:underline"
                      href={`/clientes/${cliente.id}`}
                    >
                      Ver ficha
                    </Link>
                    {cliente.contratos.length > 0 && (
                      <Link
                        className="text-slate-500 hover:underline"
                        href={`/cuotas/${cliente.contratos[0].id}`}
                      >
                        Cuotas
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {clientes.length === 0 && (
              <tr>
                <td className="table-cell text-center text-[var(--muted)]" colSpan={7}>
                  Sin clientes registrados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
