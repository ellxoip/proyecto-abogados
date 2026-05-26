"use client";

import { useMemo, useState, useTransition } from "react";

export type CalendarNoteDto = {
  id: string;
  body: string;
  date: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  initialNotes: CalendarNoteDto[];
};

type Draft = {
  body: string;
  date: string;
  pinned: boolean;
};

const emptyDraft: Draft = { body: "", date: "", pinned: false };

function sortNotes(notes: CalendarNoteDto[]): CalendarNoteDto[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const da = a.date ?? a.createdAt;
    const db = b.date ?? b.createdAt;
    return new Date(db).getTime() - new Date(da).getTime();
  });
}

function formatDate(value: string | null): string {
  if (!value) return "Sin fecha";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Sin fecha";
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

function isoToInputDate(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function inputDateToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function CalendarNotesPanel({ initialNotes }: Props) {
  const [notes, setNotes] = useState<CalendarNoteDto[]>(() => sortNotes(initialNotes));
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const editingNote = useMemo(
    () => (editing ? notes.find((n) => n.id === editing) ?? null : null),
    [editing, notes],
  );

  function resetDraft() {
    setDraft(emptyDraft);
    setEditing(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body = draft.body.trim();
    if (!body) {
      setError("Escribe el contenido de la nota.");
      return;
    }
    const payload = {
      body,
      date: inputDateToIso(draft.date),
      pinned: draft.pinned,
    };

    startTransition(async () => {
      try {
        if (editing) {
          const res = await fetch("/api/admin/agenda/notas", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editing, ...payload }),
          });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error ?? "No se pudo guardar");
          setNotes((prev) =>
            sortNotes(
              prev.map((n) =>
                n.id === editing
                  ? { ...n, body, date: payload.date, pinned: payload.pinned, updatedAt: new Date().toISOString() }
                  : n,
              ),
            ),
          );
        } else {
          const res = await fetch("/api/admin/agenda/notas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok || !data.ok || !data.note?.id) throw new Error(data.error ?? "No se pudo crear");
          const now = new Date().toISOString();
          setNotes((prev) =>
            sortNotes([
              ...prev,
              { id: data.note.id, body, date: payload.date, pinned: payload.pinned, createdAt: now, updatedAt: now },
            ]),
          );
        }
        resetDraft();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error inesperado");
      }
    });
  }

  function startEdit(note: CalendarNoteDto) {
    setEditing(note.id);
    setDraft({ body: note.body, date: isoToInputDate(note.date), pinned: note.pinned });
    setError(null);
  }

  async function togglePin(note: CalendarNoteDto) {
    startTransition(async () => {
      try {
        const next = !note.pinned;
        const res = await fetch("/api/admin/agenda/notas", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: note.id, pinned: next }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error ?? "No se pudo actualizar");
        setNotes((prev) => sortNotes(prev.map((n) => (n.id === note.id ? { ...n, pinned: next } : n))));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error inesperado");
      }
    });
  }

  async function remove(note: CalendarNoteDto) {
    if (!confirm("¿Eliminar esta nota? No se puede deshacer.")) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/agenda/notas?id=${encodeURIComponent(note.id)}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error ?? "No se pudo eliminar");
        setNotes((prev) => prev.filter((n) => n.id !== note.id));
        if (editing === note.id) resetDraft();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error inesperado");
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,360px),1fr]">
      <aside className="rounded-2xl border border-[var(--border-glass)] bg-[var(--surface)] p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {editing ? "Editar nota" : "Nueva nota"}
        </h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-[var(--text-muted)]">Contenido</span>
            <textarea
              className="mt-1 w-full rounded-lg border border-[var(--border-glass)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
              rows={6}
              maxLength={4000}
              value={draft.body}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              placeholder="Recordatorio, brief de audiencia, número de causa, etc."
            />
            <span className="mt-1 block text-[10px] text-[var(--text-muted)]">
              {draft.body.length} / 4000
            </span>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-[var(--text-muted)]">Fecha asociada (opcional)</span>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-[var(--border-glass)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={draft.pinned}
              onChange={(e) => setDraft((d) => ({ ...d, pinned: e.target.checked }))}
            />
            Anclar al inicio
          </label>

          {error && (
            <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Guardando…" : editing ? "Actualizar" : "Crear nota"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={resetDraft}
                className="rounded-lg border border-[var(--border-glass)] px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                Cancelar
              </button>
            )}
          </div>

          {editingNote && (
            <p className="text-[11px] text-[var(--text-muted)]">
              Editando nota creada el {formatDate(editingNote.createdAt)}.
            </p>
          )}
        </form>
      </aside>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Tus notas ({notes.length})
          </h2>
        </div>

        {notes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-glass)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-muted)]">
            Aún no tienes notas. Crea la primera desde el formulario lateral.
          </div>
        ) : (
          <ul className="space-y-3">
            {notes.map((note) => (
              <li
                key={note.id}
                className="rounded-2xl border border-[var(--border-glass)] bg-[var(--surface)] p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    {note.pinned && <span className="rounded bg-amber-500/20 px-2 py-0.5 text-amber-300">Anclada</span>}
                    <span>{formatDate(note.date ?? note.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => togglePin(note)}
                      disabled={pending}
                      className="rounded-md px-2 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--background)] hover:text-[var(--text)]"
                    >
                      {note.pinned ? "Desanclar" : "Anclar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(note)}
                      disabled={pending}
                      className="rounded-md px-2 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--background)] hover:text-[var(--text)]"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(note)}
                      disabled={pending}
                      className="rounded-md px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text)]">{note.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
