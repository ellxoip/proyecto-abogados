"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  buildConfirmPayload,
  buildProblemRows,
  buildReadyRows,
  canConfirmImport,
  countImportables,
  type PreviewResponse,
  type ProblemRow,
} from "./page-helpers";

type ConfirmResponse = {
  ok: true;
  batchId: number;
  report: {
    batch: {
      id: number;
      filename: string;
      status: string;
      createdAt: string;
      confirmedAt: string | null;
    };
    summary: {
      clients: Record<string, number>;
      contracts: Record<string, number>;
      installments: Record<string, number>;
    };
    manualReview: {
      clients: Array<{
        rowNumber: number;
        status: string;
        rut: string | null;
        nombreRazonSocial: string | null;
        issues: Array<{ code: string; message: string; severity: "error" | "warning" }>;
      }>;
      contracts: Array<{
        rowNumber: number;
        status: string;
        clienteRut: string | null;
      }>;
      installments: Array<{
        rowNumber: number;
        status: string;
        contratoRef: string | null;
      }>;
    };
  };
};

type TabKey =
  | "summary"
  | "ready"
  | "problems"
  | "contractProblems"
  | "installmentProblems"
  | "allIssues";

function toJsonSnippet(value: Record<string, unknown> | null) {
  if (!value) return "-";
  const text = JSON.stringify(value);
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function toCsvCell(value: string) {
  const escaped = value.replaceAll('"', '""');
  return `"${escaped}"`;
}

export default function ImportacionClientesPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingConfirm, setLoadingConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResponse | null>(null);
  const [onlyReady, setOnlyReady] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("summary");

  const readyRows = useMemo(() => (preview ? buildReadyRows(preview) : []), [preview]);
  const problemRows = useMemo(() => (preview ? buildProblemRows(preview) : []), [preview]);
  const contractProblemRows = useMemo(
    () => problemRows.filter((row) => row.entity === "CONTRATO"),
    [problemRows],
  );
  const installmentProblemRows = useMemo(
    () => problemRows.filter((row) => row.entity === "CUOTA"),
    [problemRows],
  );

  const importableTotal = useMemo(
    () => (preview ? countImportables(preview, onlyReady) : 0),
    [preview, onlyReady],
  );
  const canConfirm = useMemo(() => canConfirmImport(preview, onlyReady), [preview, onlyReady]);

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Selecciona un archivo .xlsx para previsualizar.");
      return;
    }

    setError(null);
    setConfirmResult(null);
    setLoadingPreview(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/importaciones/clientes/preview", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "No se pudo generar preview.");
      }

      setPreview(data as PreviewResponse);
      setActiveTab("summary");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error inesperado.";
      setError(message);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleConfirm() {
    if (!preview) return;

    setError(null);
    setLoadingConfirm(true);

    try {
      const response = await fetch(
        `/api/importaciones/clientes/${preview.batchId}/confirm`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildConfirmPayload(onlyReady)),
        },
      );

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "No se pudo confirmar la importacion.");
      }

      setConfirmResult(data as ConfirmResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error inesperado.";
      setError(message);
    } finally {
      setLoadingConfirm(false);
    }
  }

  function handleExportTxt() {
    if (!preview) return;
    const generatedAt = new Date().toISOString();
    const bySheet = new Map<string, ProblemRow[]>();
    for (const row of problemRows) {
      const list = bySheet.get(row.sheet) ?? [];
      list.push(row);
      bySheet.set(row.sheet, list);
    }

    const lines: string[] = [
      "IMPORTACION CLIENTES - ERRORES Y ADVERTENCIAS",
      `Batch: ${preview.batchId}`,
      `Generado: ${generatedAt}`,
      "",
    ];

    for (const [sheet, rows] of bySheet.entries()) {
      lines.push(`== ${sheet} ==`);
      for (const row of rows) {
        lines.push(
          `[fila=${row.rowNumber}] [${row.type}] [${row.code}] ref=${row.reference} estado=${row.status}`,
        );
        lines.push(`  mensaje: ${row.message}`);
        lines.push(`  sugerencia: ${row.suggestedAction}`);
      }
      lines.push("");
    }

    if (problemRows.length === 0) {
      lines.push("Sin incidencias detectadas en el preview.");
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `importacion-clientes-errores-batch-${preview.batchId}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleExportCsv() {
    if (!preview) return;

    const header = [
      "sheet",
      "entity",
      "row",
      "reference",
      "status",
      "type",
      "code",
      "message",
      "suggested_action",
      "raw_data",
      "normalized_data",
    ];
    const lines = [
      header.join(","),
      ...problemRows.map((row) =>
        [
          row.sheet,
          row.entity,
          String(row.rowNumber),
          row.reference,
          row.status,
          row.type,
          row.code,
          row.message,
          row.suggestedAction,
          JSON.stringify(row.rawData ?? {}),
          JSON.stringify(row.normalizedData ?? {}),
        ]
          .map((value) => toCsvCell(value))
          .join(","),
      ),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `importacion-clientes-errores-batch-${preview.batchId}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">Importacion masiva de clientes</h2>
        <p className="text-sm text-[var(--muted)]">
          Carga el Excel final, revisa el preview y confirma solo lo que cumpla la politica.
        </p>
      </header>

      <form onSubmit={handlePreview} className="card space-y-4 p-4">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="xlsx-file">
            Archivo Excel final (.xlsx)
          </label>
          <input
            id="xlsx-file"
            type="file"
            accept=".xlsx"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={loadingPreview}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {loadingPreview ? "Generando preview..." : "Generar preview"}
        </button>
      </form>

      {error ? (
        <div className="card border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {preview ? (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">Revision previa</h3>
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={onlyReady}
                    onChange={(event) => setOnlyReady(event.target.checked)}
                  />
                  Importar solo READY
                </label>
                <button
                  type="button"
                  onClick={handleExportTxt}
                  className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium"
                >
                  Exportar .txt
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium"
                >
                  Exportar .csv
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!canConfirm || loadingConfirm}
                  className="rounded-md bg-[#12212f] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {loadingConfirm ? "Confirmando..." : "Confirmar importacion"}
                </button>
              </div>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Politica actual:{" "}
              <strong>
                {onlyReady ? "solo READY" : "READY + REVIEW (nunca ERROR/SKIPPED)"}
              </strong>
              . Importables detectados: <strong>{importableTotal}</strong>.
            </p>
          </div>

          <div className="card p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {[
                { key: "summary", label: "Resumen" },
                { key: "ready", label: "Listos" },
                { key: "problems", label: "Con problemas" },
                { key: "contractProblems", label: "Contratos con problemas" },
                { key: "installmentProblems", label: "Cuotas con problemas" },
                { key: "allIssues", label: "Todos los errores / advertencias" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as TabKey)}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    activeTab === tab.key
                      ? "border-[#12212f] bg-[#12212f] text-white"
                      : "border-[var(--border)]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "summary" ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric title="Clientes totales" value={preview.summary.totalClients} />
                <Metric title="Clientes READY" value={preview.summary.readyClients} />
                <Metric title="Clientes REVIEW" value={preview.summary.reviewClients ?? 0} />
                <Metric title="Clientes ERROR" value={preview.summary.errorClients} />
                <Metric title="Contratos totales" value={preview.summary.totalContracts} />
                <Metric title="Contratos READY" value={preview.summary.readyContracts} />
                <Metric title="Contratos REVIEW" value={preview.summary.reviewContracts ?? 0} />
                <Metric title="Contratos ERROR" value={preview.summary.errorContracts} />
                <Metric title="Cuotas totales" value={preview.summary.totalInstallments} />
                <Metric title="Cuotas READY" value={preview.summary.readyInstallments} />
                <Metric title="Cuotas REVIEW" value={preview.summary.reviewInstallments} />
                <Metric title="Cuotas SKIPPED" value={preview.summary.skippedInstallments} />
                <Metric title="Cuotas ERROR" value={preview.summary.errorInstallments} />
                <Metric title="Errores bloqueantes" value={preview.summary.blockedRecords} />
                <Metric
                  title="Warnings importables"
                  value={preview.summary.warningsImportablesTotal}
                />
              </div>
            ) : null}

            {activeTab === "ready" ? <ReadyTable rows={readyRows} /> : null}
            {activeTab === "problems" ? <ProblemsTable rows={problemRows} /> : null}
            {activeTab === "contractProblems" ? (
              <ProblemsTable rows={contractProblemRows} />
            ) : null}
            {activeTab === "installmentProblems" ? (
              <ProblemsTable rows={installmentProblemRows} />
            ) : null}
            {activeTab === "allIssues" ? <ProblemsTable rows={problemRows} /> : null}
          </div>

          {confirmResult ? (
            <div className="space-y-4">
              <div className="card space-y-3 p-4">
                <h3 className="text-lg font-semibold">Importacion confirmada</h3>
                <p className="text-sm text-[var(--muted)]">
                  Batch #{confirmResult.batchId} confirmado con estado{" "}
                  <strong>{confirmResult.report.batch.status}</strong>.
                </p>
                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <SummaryBlock title="Clientes" data={confirmResult.report.summary.clients} />
                  <SummaryBlock title="Contratos" data={confirmResult.report.summary.contracts} />
                  <SummaryBlock title="Cuotas" data={confirmResult.report.summary.installments} />
                </div>
                <a
                  href={`/api/importaciones/clientes/${confirmResult.batchId}/reporte`}
                  className="inline-flex rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium"
                >
                  Descargar reporte final
                </a>
              </div>

              <div className="rounded-md border border-red-300 bg-red-50 p-4">
                <h3 className="text-lg font-semibold text-red-800">
                  Pendientes de revision manual (guardados)
                </h3>
                <p className="mt-1 text-sm text-red-700">
                  Clientes con problemas:{" "}
                  <strong>{confirmResult.report.manualReview.clients.length}</strong>. Contratos:{" "}
                  <strong>{confirmResult.report.manualReview.contracts.length}</strong>. Cuotas:{" "}
                  <strong>{confirmResult.report.manualReview.installments.length}</strong>.
                </p>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-red-700">
                        <th className="table-cell">Fila</th>
                        <th className="table-cell">RUT</th>
                        <th className="table-cell">Nombre</th>
                        <th className="table-cell">Estado</th>
                        <th className="table-cell">Codigo</th>
                        <th className="table-cell">Mensaje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {confirmResult.report.manualReview.clients.length === 0 ? (
                        <tr>
                          <td className="table-cell" colSpan={6}>
                            No quedaron clientes con problemas para revision manual.
                          </td>
                        </tr>
                      ) : (
                        confirmResult.report.manualReview.clients.map((item) => {
                          const issue = item.issues[0];
                          return (
                            <tr key={`manual-client-${item.rowNumber}-${item.rut ?? "-"}`}>
                              <td className="table-cell">{item.rowNumber}</td>
                              <td className="table-cell">{item.rut ?? "-"}</td>
                              <td className="table-cell">{item.nombreRazonSocial ?? "-"}</td>
                              <td className="table-cell">{item.status}</td>
                              <td className="table-cell">{issue?.code ?? "STATUS_ONLY"}</td>
                              <td className="table-cell">
                                {issue?.message ??
                                  "Registro pendiente de revision manual por estado."}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--border)] p-3">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{title}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function ReadyTable({
  rows,
}: {
  rows: Array<{
    entity: string;
    sheet: string;
    rowNumber: number;
    reference: string;
    status: string;
  }>;
}) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[var(--muted)]">
            <th className="table-cell">Entidad</th>
            <th className="table-cell">Hoja</th>
            <th className="table-cell">Fila</th>
            <th className="table-cell">Referencia</th>
            <th className="table-cell">Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="table-cell" colSpan={5}>
                No hay registros READY.
              </td>
            </tr>
          ) : (
            rows.slice(0, 500).map((row) => (
              <tr key={`${row.sheet}-${row.rowNumber}-${row.reference}`}>
                <td className="table-cell">{row.entity}</td>
                <td className="table-cell">{row.sheet}</td>
                <td className="table-cell">{row.rowNumber}</td>
                <td className="table-cell">{row.reference}</td>
                <td className="table-cell">{row.status}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ProblemsTable({ rows }: { rows: ProblemRow[] }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[var(--muted)]">
            <th className="table-cell">Tipo</th>
            <th className="table-cell">Hoja</th>
            <th className="table-cell">Fila</th>
            <th className="table-cell">Referencia</th>
            <th className="table-cell">Estado</th>
            <th className="table-cell">Codigo</th>
            <th className="table-cell">Mensaje</th>
            <th className="table-cell">Accion sugerida</th>
            <th className="table-cell">Raw</th>
            <th className="table-cell">Normalizado</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="table-cell" colSpan={10}>
                Sin errores ni advertencias para esta vista.
              </td>
            </tr>
          ) : (
            rows.slice(0, 1000).map((row, index) => (
              <tr key={`${row.sheet}-${row.rowNumber}-${row.code}-${index}`}>
                <td className="table-cell">{row.type}</td>
                <td className="table-cell">{row.sheet}</td>
                <td className="table-cell">{row.rowNumber}</td>
                <td className="table-cell">{row.reference}</td>
                <td className="table-cell">{row.status}</td>
                <td className="table-cell">{row.code}</td>
                <td className="table-cell">{row.message}</td>
                <td className="table-cell">{row.suggestedAction}</td>
                <td className="table-cell">{toJsonSnippet(row.rawData)}</td>
                <td className="table-cell">{toJsonSnippet(row.normalizedData)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SummaryBlock({
  title,
  data,
}: {
  title: string;
  data: Record<string, number>;
}) {
  return (
    <div className="rounded-md border border-[var(--border)] p-3">
      <p className="font-medium">{title}</p>
      <ul className="mt-2 space-y-1 text-[var(--muted)]">
        {Object.entries(data).map(([status, count]) => (
          <li key={status}>
            {status}: <strong className="text-[var(--foreground)]">{count}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
