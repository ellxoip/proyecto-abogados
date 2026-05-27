"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type PendienteClientError = {
  id: number;
  batchId: number;
  batchFilename: string;
  batchConfirmedAt: string | null;
  rowNumber: number;
  rut: string | null;
  nombreRazonSocial: string | null;
  tipoPersona: string | null;
  estadoCliente: string | null;
  fechaIngreso: string | null;
  status: string;
  errors: Array<{ code: string; message: string; severity: "error" | "warning" }>;
};

type NormalizedContractData = {
  externalContractId: string | null;
  clienteRut: string;
  servicio: string;
  area: string | null;
  montoTotal: number;
  pagoInicial: number;
  cantidadCuotas: number;
  fechaInicio: string;
  estadoContrato: string;
  observaciones: string | null;
};

type PendienteContractError = {
  id: number;
  batchId: number;
  batchFilename: string;
  batchConfirmedAt: string | null;
  rowNumber: number;
  clienteRut: string | null;
  servicio: string | null;
  area: string | null;
  montoTotal: number | null;
  cantidadCuotas: number | null;
  fechaInicio: string | null;
  estadoContrato: string | null;
  status: string;
  errors: Array<{ code: string; message: string; severity: "error" | "warning" }>;
  normalizedData: NormalizedContractData | null;
};

type PendientesData = {
  clientErrors: PendienteClientError[];
  contractErrors: PendienteContractError[];
  total: number;
};

type ImportProgress = {
  batchId: number;
  batchStatus: string;
  contractsDone: number;
  contractsTotal: number;
  clientsDone: number;
  clientsTotal: number;
  done: boolean;
};

type TabKey =
  | "summary"
  | "ready"
  | "problems"
  | "contractProblems"
  | "installmentProblems"
  | "allIssues"
  | "pendientes";

function toJsonSnippet(value: Record<string, unknown> | null) {
  if (!value) return "-";
  const text = JSON.stringify(value);
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function toCsvCell(value: string) {
  const escaped = value.replaceAll('"', '""');
  return `"${escaped}"`;
}

function formatCLP(value: number | null) {
  if (value === null) return "-";
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" }).format(value);
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

  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [pendientes, setPendientes] = useState<PendientesData | null>(null);
  const [loadingPendientes, setLoadingPendientes] = useState(false);
  const [pendientesError, setPendientesError] = useState<string | null>(null);
  const [corrigiendoId, setCorrigiendoId] = useState<number | null>(null);
  const [corregirError, setCorregirError] = useState<string | null>(null);

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
  const importableClientsTotal = useMemo(
    () =>
      preview
        ? preview.preview.clients.filter((c) =>
            onlyReady ? c.status === "READY" : c.status === "READY" || c.status === "REVIEW",
          ).length
        : 0,
    [preview, onlyReady],
  );
  const canConfirm = useMemo(() => canConfirmImport(preview, onlyReady), [preview, onlyReady]);

  const fetchPendientes = useCallback(async () => {
    setLoadingPendientes(true);
    setPendientesError(null);
    try {
      const res = await fetch("/api/importaciones/clientes/pendientes");
      const data = (await res.json()) as { ok: boolean; error?: string } & Partial<PendientesData>;
      if (!res.ok || !data.ok) {
        setPendientesError(data.error ?? "Error al cargar pendientes.");
      } else {
        setPendientes({
          clientErrors: data.clientErrors ?? [],
          contractErrors: data.contractErrors ?? [],
          total: data.total ?? 0,
        });
      }
    } catch (err) {
      setPendientesError(err instanceof Error ? err.message : "Error de red al cargar pendientes.");
    } finally {
      setLoadingPendientes(false);
    }
  }, []);

  useEffect(() => {
    void fetchPendientes();
    return () => stopPolling();
  }, [fetchPendientes]);

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

      const rawText = await response.text();
      let data: { ok: boolean; error?: string } & Partial<PreviewResponse>;
      try {
        data = JSON.parse(rawText) as typeof data;
      } catch {
        throw new Error(
          `El servidor retorno una respuesta invalida (HTTP ${response.status}): ${rawText.slice(0, 300)}`,
        );
      }
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "No se pudo generar preview.");
      }

      setPreview(data as unknown as PreviewResponse);
      setActiveTab("summary");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error inesperado.";
      setError(message);
    } finally {
      setLoadingPreview(false);
    }
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling(batchId: number) {
    stopPolling();
    const poll = async () => {
      try {
        const res = await fetch(`/api/importaciones/clientes/${batchId}/progreso`);
        if (!res.ok) return;
        const data = (await res.json()) as ImportProgress & { ok: boolean };
        if (!data.ok) return;
        setImportProgress({ ...data, batchId });
        if (data.done) stopPolling();
      } catch {
        // ignorar errores de polling
      }
    };
    void poll();
    pollRef.current = setInterval(() => void poll(), 2000);
  }

  async function handleConfirm() {
    if (!preview) return;

    setError(null);
    setLoadingConfirm(true);
    setImportProgress({
      batchId: preview.batchId,
      batchStatus: "PROCESSING",
      contractsDone: 0,
      contractsTotal: preview.summary.totalContracts,
      clientsDone: 0,
      clientsTotal: preview.summary.totalClients,
      done: false,
    });
    setPreview(null);
    setConfirmResult(null);
    startPolling(preview.batchId);

    try {
      const response = await fetch(
        `/api/importaciones/clientes/${preview.batchId}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildConfirmPayload(onlyReady)),
        },
      );

      stopPolling();
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "No se pudo confirmar la importacion.");
      }

      setConfirmResult(data as ConfirmResponse);
      setImportProgress(null);
      await fetchPendientes();
    } catch (err) {
      stopPolling();
      const message = err instanceof Error ? err.message : "Error inesperado.";
      setError(message);
      setImportProgress(null);
    } finally {
      setLoadingConfirm(false);
    }
  }

  async function handleCorregir(itemId: number, montoTotal: number) {
    setCorrigiendoId(itemId);
    setCorregirError(null);
    try {
      const res = await fetch(
        `/api/importaciones/clientes/pendientes/contratos/${itemId}/corregir`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "manual", montoTotal }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "No se pudo corregir el item.");
      }
      await fetchPendientes();
    } catch (err) {
      setCorregirError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCorrigiendoId(null);
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

  const pendientesTotal = pendientes?.total ?? 0;

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">Importacion masiva de clientes</h2>
        <p className="text-sm text-[var(--muted)]">
          Carga el Excel final, revisa el preview y confirma solo lo que cumpla la politica.
        </p>
      </header>

      <div className="flex flex-wrap items-start gap-4">
        <form onSubmit={handlePreview} className="card flex-1 space-y-4 p-4" style={{ minWidth: 280 }}>
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

        <button
          type="button"
          onClick={() => setActiveTab("pendientes")}
          className={`card flex flex-col items-center gap-1 p-4 text-center transition-colors ${
            pendientesError
              ? "border-yellow-300 bg-yellow-50 hover:bg-yellow-100"
              : pendientesTotal > 0
                ? "border-red-300 bg-red-50 hover:bg-red-100"
                : "border-[var(--border)] hover:bg-[var(--muted-bg,#f5f5f5)]"
          }`}
          style={{ minWidth: 160 }}
          title={pendientesError ?? "Ver registros con error pendientes de correccion"}
        >
          {loadingPendientes ? (
            <span className="text-2xl font-bold text-[var(--muted)]">...</span>
          ) : pendientesError ? (
            <span className="text-2xl font-bold text-yellow-700">!</span>
          ) : (
            <span
              className={`text-3xl font-bold ${pendientesTotal > 0 ? "text-red-700" : "text-[var(--foreground)]"}`}
            >
              {pendientesTotal}
            </span>
          )}
          <span
            className={`text-xs font-medium ${
              pendientesError
                ? "text-yellow-700"
                : pendientesTotal > 0
                  ? "text-red-600"
                  : "text-[var(--muted)]"
            }`}
          >
            {pendientesError
              ? "Error al cargar"
              : pendientesTotal === 1
                ? "registro con error"
                : "registros con error"}
          </span>
          <span className="text-xs text-[var(--muted)]">pendientes de correccion</span>
        </button>
      </div>

      {error ? (
        <div className="card border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {importProgress ? (
        <ImportProgressView progress={importProgress} />
      ) : null}

      {activeTab === "pendientes" && !preview && !importProgress ? (
        <PendientesPanel
          pendientes={pendientes}
          loading={loadingPendientes}
          fetchError={pendientesError}
          corrigiendoId={corrigiendoId}
          corregirError={corregirError}
          onCorregir={handleCorregir}
          onRefresh={fetchPendientes}
        />
      ) : null}

      {preview && !importProgress ? (
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
              . Clientes a importar: <strong>{importableClientsTotal}</strong>.
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
                {
                  key: "pendientes",
                  label: pendientesTotal > 0 ? `Pendientes (${pendientesTotal})` : "Pendientes",
                },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as TabKey)}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    activeTab === tab.key
                      ? "border-[#12212f] bg-[#12212f] text-white"
                      : tab.key === "pendientes" && pendientesTotal > 0
                        ? "border-red-300 bg-red-50 text-red-700"
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
            {activeTab === "pendientes" ? (
              <PendientesPanel
                pendientes={pendientes}
                loading={loadingPendientes}
                fetchError={pendientesError}
                corrigiendoId={corrigiendoId}
                corregirError={corregirError}
                onCorregir={handleCorregir}
                onRefresh={fetchPendientes}
              />
            ) : null}
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

function ImportProgressView({ progress }: { progress: ImportProgress }) {
  const pct = progress.contractsTotal > 0
    ? Math.min(Math.round((progress.contractsDone / progress.contractsTotal) * 100), 100)
    : 0;

  return (
    <div className="card space-y-6 p-6">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Importando clientes...</h3>
        <p className="text-sm text-[var(--muted)]">
          No cierres esta ventana. El proceso puede tardar varios minutos.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--muted)]">Contratos procesados</span>
          <span className="font-medium tabular-nums">
            {progress.contractsDone} / {progress.contractsTotal}
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--border)]">
          <div
            className="h-full rounded-full bg-[#12212f] transition-all duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-right text-xs tabular-nums text-[var(--muted)]">{pct}%</p>
      </div>

      <div className="flex gap-6 text-sm">
        <div>
          <p className="text-[var(--muted)]">Clientes</p>
          <p className="text-xl font-bold tabular-nums">{progress.clientsDone}</p>
          <p className="text-xs text-[var(--muted)]">de {progress.clientsTotal}</p>
        </div>
        <div>
          <p className="text-[var(--muted)]">Contratos</p>
          <p className="text-xl font-bold tabular-nums">{progress.contractsDone}</p>
          <p className="text-xs text-[var(--muted)]">de {progress.contractsTotal}</p>
        </div>
        <div>
          <p className="text-[var(--muted)]">Estado</p>
          <p className="mt-1 text-sm font-medium">
            {progress.done ? "Completado" : "Procesando..."}
          </p>
        </div>
      </div>
    </div>
  );
}

function PendientesPanel({
  pendientes,
  loading,
  fetchError,
  corrigiendoId,
  corregirError,
  onCorregir,
  onRefresh,
}: {
  pendientes: PendientesData | null;
  loading: boolean;
  fetchError: string | null;
  corrigiendoId: number | null;
  corregirError: string | null;
  onCorregir: (itemId: number, montoTotal: number) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  if (loading) {
    return <p className="text-sm text-[var(--muted)]">Cargando pendientes...</p>;
  }

  if (fetchError) {
    return (
      <div className="rounded-md border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-800">
        <p className="font-medium">No se pudo cargar la lista de pendientes.</p>
        <p className="mt-1 text-yellow-700">{fetchError}</p>
        <button
          type="button"
          onClick={onRefresh}
          className="mt-2 rounded border border-yellow-400 px-3 py-1 text-xs font-medium hover:bg-yellow-100"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!pendientes || pendientes.total === 0) {
    return (
      <div className="rounded-md border border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
        No hay registros con error pendientes de correccion.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {corregirError ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {corregirError}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--muted)]">
          {pendientes.clientErrors.length} cliente(s) con error &mdash;{" "}
          {pendientes.contractErrors.length} contrato(s) con error
        </p>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium"
        >
          Actualizar
        </button>
      </div>

      {pendientes.clientErrors.length > 0 ? (
        <div>
          <h4 className="mb-2 text-sm font-semibold">Clientes con error</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted)]">
                  <th className="table-cell">Batch</th>
                  <th className="table-cell">Fila</th>
                  <th className="table-cell">RUT</th>
                  <th className="table-cell">Nombre</th>
                  <th className="table-cell">Estado</th>
                  <th className="table-cell">Error</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.clientErrors.map((item) => {
                  const issue = item.errors[0];
                  return (
                    <tr key={`ce-${item.id}`}>
                      <td className="table-cell text-xs text-[var(--muted)]">
                        #{item.batchId} {item.batchFilename}
                      </td>
                      <td className="table-cell">{item.rowNumber}</td>
                      <td className="table-cell">{item.rut ?? "-"}</td>
                      <td className="table-cell">{item.nombreRazonSocial ?? "-"}</td>
                      <td className="table-cell">
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                          {item.status}
                        </span>
                      </td>
                      <td className="table-cell text-xs text-red-600">
                        {issue ? `[${issue.code}] ${issue.message}` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {pendientes.contractErrors.length > 0 ? (
        <ContractErrorsTable
          items={pendientes.contractErrors}
          clientErrors={pendientes.clientErrors}
          corrigiendoId={corrigiendoId}
          onCorregir={onCorregir}
        />
      ) : null}
    </div>
  );
}

type ContractErrorItem = PendientesData["contractErrors"][number];

const ERROR_CODE_TO_FIELD: Record<string, string[]> = {
  INVALID_TOTAL_AMOUNT: ["montoTotal"],
  INVALID_INITIAL_PAYMENT_NEGATIVE: ["pagoInicial"],
  INVALID_INITIAL_PAYMENT_EXCEEDS_TOTAL: ["pagoInicial", "montoTotal"],
  INVALID_INSTALLMENT_COUNT: ["cantidadCuotas"],
  MISSING_START_DATE: ["fechaInicio"],
  INVALID_CONTRACT_STATUS: ["estadoContrato"],
  MISSING_SERVICE: ["servicio"],
  CONTRACT_INSTALLMENTS_AMOUNT_MISMATCH: ["montoTotal"],
  CONTRACT_INSTALLMENTS_COUNT_MISMATCH: ["cantidadCuotas"],
  MISSING_CONTRACT_CLIENT: ["clienteRut"],
  DUPLICATE_CONTRACT: ["servicio", "montoTotal", "fechaInicio"],
};

function fieldHasError(field: string, errors: ContractErrorItem["errors"]) {
  return errors.some((e) => (ERROR_CODE_TO_FIELD[e.code] ?? []).includes(field));
}

function ContractErrorsTable({
  items,
  clientErrors,
  corrigiendoId,
  onCorregir,
}: {
  items: ContractErrorItem[];
  clientErrors: PendienteClientError[];
  corrigiendoId: number | null;
  onCorregir: (itemId: number, montoTotal: number) => Promise<void>;
}) {
  const [modalItem, setModalItem] = useState<ContractErrorItem | null>(null);

  async function handleSave(montoTotal: number) {
    if (!modalItem) return;
    await onCorregir(modalItem.id, montoTotal);
    setModalItem(null);
  }

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">Contratos con error</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--muted)]">
              <th className="table-cell">Batch</th>
              <th className="table-cell">Fila</th>
              <th className="table-cell">RUT cliente</th>
              <th className="table-cell">Servicio</th>
              <th className="table-cell">Monto total</th>
              <th className="table-cell">Cuotas</th>
              <th className="table-cell">Estado</th>
              <th className="table-cell">Error principal</th>
              <th className="table-cell"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const issue = item.errors[0];
              const busy = corrigiendoId === item.id;
              return (
                <tr key={`ctr-${item.id}`}>
                  <td className="table-cell text-xs text-[var(--muted)]">
                    #{item.batchId} {item.batchFilename}
                  </td>
                  <td className="table-cell">{item.rowNumber}</td>
                  <td
                    className={`table-cell ${fieldHasError("clienteRut", item.errors) ? "text-red-600 font-medium" : ""}`}
                  >
                    {item.clienteRut ?? "-"}
                  </td>
                  <td
                    className={`table-cell ${fieldHasError("servicio", item.errors) ? "text-red-600 font-medium" : ""}`}
                  >
                    {item.servicio ?? "-"}
                  </td>
                  <td
                    className={`table-cell ${fieldHasError("montoTotal", item.errors) ? "text-red-600 font-medium" : ""}`}
                  >
                    {formatCLP(item.montoTotal)}
                  </td>
                  <td
                    className={`table-cell ${fieldHasError("cantidadCuotas", item.errors) ? "text-red-600 font-medium" : ""}`}
                  >
                    {item.cantidadCuotas ?? "-"}
                  </td>
                  <td className="table-cell">
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                      {item.status}
                    </span>
                  </td>
                  <td className="table-cell text-xs text-red-600" style={{ maxWidth: 220 }}>
                    {issue ? issue.message : "-"}
                  </td>
                  <td className="table-cell">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setModalItem(item)}
                      className="rounded border border-[var(--border)] px-2 py-1 text-xs font-medium hover:bg-[var(--muted-bg,#f5f5f5)] disabled:opacity-50"
                    >
                      {busy ? "Guardando..." : "Ver / Corregir"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalItem ? (
        <ContractDetailModal
          item={modalItem}
          clientErrors={clientErrors}
          saving={corrigiendoId === modalItem.id}
          onSave={handleSave}
          onClose={() => setModalItem(null)}
        />
      ) : null}
    </div>
  );
}

function ContractDetailModal({
  item,
  clientErrors,
  saving,
  onSave,
  onClose,
}: {
  item: ContractErrorItem;
  clientErrors: PendienteClientError[];
  saving: boolean;
  onSave: (montoTotal: number) => Promise<void>;
  onClose: () => void;
}) {
  const nd = item.normalizedData;
  const errorCodes = new Set(item.errors.map((e) => e.code));
  const matchedClient = clientErrors.find(
    (c) => c.rut && item.clienteRut && c.rut === item.clienteRut,
  );

  const [montoValue, setMontoValue] = useState(
    nd?.montoTotal !== undefined ? String(nd.montoTotal) : item.montoTotal !== null ? String(item.montoTotal) : "",
  );
  const [inputError, setInputError] = useState<string | null>(null);

  function field(label: string, value: string | number | null | undefined, errorField: string) {
    const bad = fieldHasError(errorField, item.errors);
    return (
      <div>
        <dt className="text-xs text-[var(--muted)]">{label}</dt>
        <dd className={`mt-0.5 text-sm font-medium ${bad ? "text-red-600" : ""}`}>
          {value !== null && value !== undefined && value !== "" ? String(value) : <span className="text-[var(--muted)] font-normal italic">vacío</span>}
          {bad ? <span className="ml-1 text-xs">⚠</span> : null}
        </dd>
      </div>
    );
  }

  async function handleSubmit() {
    const parsed = parseFloat(montoValue.replace(/[^0-9.]/g, ""));
    if (isNaN(parsed) || parsed <= 0) {
      setInputError("Ingresa un monto válido mayor a 0.");
      return;
    }
    setInputError(null);
    await onSave(parsed);
  }

  const hasMismatch =
    errorCodes.has("CONTRACT_INSTALLMENTS_AMOUNT_MISMATCH") ||
    errorCodes.has("CONTRACT_INSTALLMENTS_COUNT_MISMATCH");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <h2 className="text-base font-semibold">Perfil del contrato — Fila {item.rowNumber}</h2>
            <p className="text-xs text-[var(--muted)]">
              Batch #{item.batchId} · {item.batchFilename}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--muted)] hover:bg-[var(--muted-bg,#f5f5f5)]"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Errors */}
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">
              {item.errors.length} error{item.errors.length !== 1 ? "es" : ""} detectado{item.errors.length !== 1 ? "s" : ""}
            </p>
            <ul className="space-y-1">
              {item.errors.map((e, i) => (
                <li key={i} className="flex gap-2 text-sm text-red-800">
                  <span className="mt-0.5 shrink-0 text-red-500">▸</span>
                  <span>
                    <span className="font-mono text-xs text-red-500">[{e.code}]</span>{" "}
                    {e.message}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Contract fields */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Datos del contrato
            </h3>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              {field("RUT cliente", item.clienteRut, "clienteRut")}
              {field("Servicio", nd?.servicio ?? item.servicio, "servicio")}
              {field("Área", nd?.area ?? item.area, "area")}
              {field("Fecha inicio", nd?.fechaInicio ?? item.fechaInicio, "fechaInicio")}
              {field("Estado contrato", nd?.estadoContrato ?? item.estadoContrato, "estadoContrato")}
              {field("Cantidad cuotas", nd?.cantidadCuotas ?? item.cantidadCuotas, "cantidadCuotas")}
              {field("Contrato ID externo", nd?.externalContractId ?? null, "externalContractId")}
              {field("Observaciones", nd?.observaciones ?? null, "observaciones")}
            </dl>

            {/* Financial breakdown */}
            <div className="mt-4 rounded-lg border border-[var(--border)] p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Montos
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-[var(--muted)]">Monto total</p>
                  <p className={`text-sm font-semibold ${fieldHasError("montoTotal", item.errors) ? "text-red-600" : ""}`}>
                    {formatCLP(nd?.montoTotal ?? item.montoTotal)}
                    {fieldHasError("montoTotal", item.errors) ? " ⚠" : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Pago inicial</p>
                  <p className={`text-sm font-semibold ${fieldHasError("pagoInicial", item.errors) ? "text-red-600" : ""}`}>
                    {formatCLP(nd?.pagoInicial ?? 0)}
                    {fieldHasError("pagoInicial", item.errors) ? " ⚠" : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Saldo financiado</p>
                  <p className="text-sm font-semibold">
                    {nd
                      ? formatCLP(nd.montoTotal - nd.pagoInicial)
                      : "-"}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Client info */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Cliente asociado {matchedClient ? "" : "(no encontrado en este batch)"}
            </h3>
            {matchedClient ? (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div>
                  <dt className="text-xs text-[var(--muted)]">RUT</dt>
                  <dd className="text-sm font-medium">{matchedClient.rut ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--muted)]">Nombre / Razón social</dt>
                  <dd className="text-sm font-medium">{matchedClient.nombreRazonSocial ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--muted)]">Tipo persona</dt>
                  <dd className="text-sm font-medium">{matchedClient.tipoPersona ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--muted)]">Estado cliente</dt>
                  <dd className={`text-sm font-medium ${matchedClient.errors.length > 0 ? "text-red-600" : ""}`}>
                    {matchedClient.estadoCliente ?? "-"}
                    {matchedClient.errors.length > 0 ? " ⚠" : ""}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                RUT <span className="font-mono font-medium">{item.clienteRut ?? "-"}</span> — cliente no presente en lista de errores de este batch.
              </p>
            )}
          </section>
        </div>

        {/* Footer — edición */}
        {hasMismatch ? (
          <div className="border-t border-[var(--border)] bg-[var(--muted-bg,#f9f9f9)] px-6 py-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Corregir monto total
            </p>
            <p className="mb-3 text-xs text-[var(--muted)]">
              La suma de cuotas no coincide con el monto del contrato. Ingresa el monto total correcto y guarda para desbloquear la importación.
            </p>
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={montoValue}
                  onChange={(e) => { setMontoValue(e.target.value); setInputError(null); }}
                  disabled={saving}
                  className="w-44 rounded border border-[var(--border)] px-3 py-2 text-sm focus:border-[#12212f] focus:outline-none disabled:opacity-50"
                  placeholder="Nuevo monto total"
                />
                {inputError ? <span className="text-xs text-red-600">{inputError}</span> : null}
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSubmit()}
                className="rounded bg-[#12212f] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Guardar corrección"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="rounded border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <div className="border-t border-[var(--border)] px-6 py-4 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-[var(--border)] px-4 py-2 text-sm"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
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
