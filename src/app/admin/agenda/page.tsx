import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { Role } from "@/lib/db-enums";
import { CalendarNotesPanel } from "./CalendarNotesPanel";

const STAFF_ROLES = new Set<string>([Role.SUPER_ADMIN, Role.JEFE_DE_MESA, Role.ABOGADO]);

export default async function AgendaPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!STAFF_ROLES.has(session.user.role)) redirect("/admin/bandeja");

  const notes = await withRls((tx) =>
    tx.calendarNote.findMany({
      where: { userId: session.user.id },
      orderBy: [{ pinned: "desc" }, { date: "desc" }, { createdAt: "desc" }],
    }),
  );

  const initialNotes = notes.map((n) => ({
    id: n.id,
    body: n.body,
    date: n.date ? n.date.toISOString() : null,
    pinned: n.pinned,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="rounded-2xl border border-[var(--border-glass)] bg-[var(--surface)] p-6 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--text-muted)]">
          Agenda personal
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
          Calendario y notas privadas
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">
          Tu cuaderno privado. Las notas son visibles únicamente para ti — ningún otro abogado, jefe de
          grupo o superadmin puede leerlas. Pronto se integrará tu Google Calendar para asociarlas a
          eventos.
        </p>
      </header>

      <CalendarNotesPanel initialNotes={initialNotes} />
    </div>
  );
}
