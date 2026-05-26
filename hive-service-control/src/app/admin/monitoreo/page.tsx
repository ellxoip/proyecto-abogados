import { auth } from "@/lib/auth";
import { withRls } from "@/lib/rls";
import { PROCESSING_PROCESSES } from "@/lib/processing/definitions";
import { AuditAction, CaseStage, Role } from "@/lib/db-enums";
import { notFound } from "next/navigation";
import { Activity, CheckCircle2, Clock, Database, Mail, MessageCircle, ShieldCheck, TimerReset, Zap, type LucideIcon } from "lucide-react";

const MESSAGE_ACTIONS = [
  AuditAction.WHATSAPP_SENT,
  AuditAction.WHATSAPP_FAILED,
  AuditAction.EMAIL_SENT,
  AuditAction.EMAIL_FAILED,
];

export default async function SystemMonitorPage() {
  const session = await auth();
  if (session?.user.role !== Role.SUPER_ADMIN) return notFound();

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const data = await withRls(async (tx) => {
    const [activeCases, waitingPayment, haltedCases, finishedToday, recentLogs, messageLogs24h] = await Promise.all([
      tx.case.count({ where: { stage: { in: [CaseStage.OPEN, CaseStage.IN_PROGRESS] } } }),
      tx.case.count({ where: { stage: CaseStage.WAITING_CUOTAS } }),
      tx.case.count({ where: { stage: CaseStage.HALTED_BY_PAYMENT } }),
      tx.case.count({ where: { stage: CaseStage.FINISHED, resolvedAt: { gte: oneDayAgo } } }),
      tx.auditLog.findMany({
        where: { action: { in: [...MESSAGE_ACTIONS, AuditAction.CASE_HALTED, AuditAction.CASE_REACTIVATED] } },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { id: true, action: true, channel: true, template: true, status: true, message: true, createdAt: true },
      }),
      tx.auditLog.findMany({
        where: { action: { in: MESSAGE_ACTIONS }, createdAt: { gte: oneDayAgo } },
        select: { action: true, status: true },
      }),
    ]);

    return { activeCases, waitingPayment, haltedCases, finishedToday, recentLogs, messageLogs24h };
  });

  const sent24h = data.messageLogs24h.filter((log) => log.status === "ok").length;
  const failed24h = data.messageLogs24h.filter((log) => log.status === "failed").length;
  const mode = process.env.VERCEL === "1" || process.env.PROCESSING_MODE === "inline" ? "Serverless integrado" : "Local con worker";
  const whatsappReady = Boolean(
    (process.env.WHATSAPP_PHONE_ID || process.env.META_WHATSAPP_PHONE_ID) &&
      (process.env.WHATSAPP_API_TOKEN || process.env.META_WHATSAPP_TOKEN),
  );
  const emailReady = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== "REEMPLAZAR_CON_API_KEY_RESEND");
  const redisReady = Boolean(process.env.REDIS_URL);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text)]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Motor de Procesamiento
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1 font-medium">
            Vista SuperAdmin de automatizaciones, avisos y control de mora dentro de la misma URL del sistema.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--border-glass)] bg-[var(--surface)]">
          <Zap className="w-4 h-4 text-[var(--gold)]" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text)]">{mode}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard icon={Activity} label="Casos activos" value={data.activeCases.toString()} detail="OPEN + IN_PROGRESS" />
        <MetricCard icon={TimerReset} label="Esperando cuotas" value={data.waitingPayment.toString()} detail="Pago inicial o plan pendiente" tone="warn" />
        <MetricCard icon={ShieldCheck} label="Detenidos por mora" value={data.haltedCases.toString()} detail="HALTED_BY_PAYMENT" tone="bad" />
        <MetricCard icon={CheckCircle2} label="Cierres 24h" value={data.finishedToday.toString()} detail="Casos terminados recientemente" tone="ok" />
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <StatusCard label="Redis / colas" ready={redisReady} detail={redisReady ? "REDIS_URL configurado para colas locales o externas." : "Sin REDIS_URL. En Vercel el modo inline puede seguir procesando eventos directos."} />
        <StatusCard label="WhatsApp Meta" ready={whatsappReady} detail={whatsappReady ? "Credenciales disponibles para envio real." : "Sin credenciales. Los envios se registran como omitidos."} />
        <StatusCard label="Email Resend" ready={emailReady} detail={emailReady ? "RESEND_API_KEY disponible para envio real." : "Sin API key. Los emails se registran como omitidos."} />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border-glass)]">
            <h2 className="text-sm font-bold text-[var(--text)]">Procesos del motor</h2>
            <p className="text-xs mt-1 text-[var(--text-muted)]">Que hace cada instancia y cuando se ejecuta.</p>
          </div>
          <div className="divide-y divide-[var(--border-glass)]">
            {PROCESSING_PROCESSES.map((process) => (
              <div key={process.id} className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text)]">{process.name}</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1">{process.purpose}</p>
                  </div>
                  <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded border border-[var(--border-glass)] text-[var(--gold)]">
                    {process.type}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
                  <MiniFact label="Frecuencia" value={process.cadence} />
                  <MiniFact label="Entrada" value={process.input} />
                  <MiniFact label="Resultado" value={process.output} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border-glass)] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[var(--text)]">Actividad reciente</h2>
              <p className="text-xs mt-1 text-[var(--text-muted)]">Auditoria de envios, bloqueos y reactivaciones.</p>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold text-[var(--text)]">{sent24h} ok / {failed24h} fallidos</div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">ultimas 24h</div>
            </div>
          </div>
          <div className="divide-y divide-[var(--border-glass)]">
            {data.recentLogs.length === 0 ? (
              <div className="p-8 text-sm text-center text-[var(--text-muted)]">Aun no hay actividad registrada del motor.</div>
            ) : (
              data.recentLogs.map((log) => (
                <div key={log.id} className="p-4 flex items-start gap-3">
                  <LogIcon channel={log.channel} status={log.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-bold text-[var(--text)]">{formatAction(log.action)}</p>
                      <span className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("es-CL")}
                      </span>
                    </div>
                    <p className="text-[11px] mt-1 text-[var(--text-muted)]">{log.message ?? log.template ?? "Sin detalle"}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, detail, tone = "neutral" }: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "ok" | "warn" | "bad";
}) {
  const color = tone === "ok" ? "#4ADE80" : tone === "warn" ? "#FCD34D" : tone === "bad" ? "var(--red)" : "var(--gold)";
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4" style={{ color }} />
        <span className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)]">{label}</span>
      </div>
      <div className="text-3xl font-bold text-[var(--text)]">{value}</div>
      <p className="text-[10px] mt-1 text-[var(--text-muted)]">{detail}</p>
    </div>
  );
}

function StatusCard({ label, ready, detail }: { label: string; ready: boolean; detail: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-md p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-xs font-bold text-[var(--text)]">{label}</h3>
        <span className={`text-[10px] font-bold uppercase tracking-widest ${ready ? "text-emerald-400" : "text-amber-300"}`}>
          {ready ? "Listo" : "Pendiente"}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">{detail}</p>
    </div>
  );
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border-glass)] p-3">
      <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)]">{label}</div>
      <div className="text-[11px] mt-1 text-[var(--text)]">{value}</div>
    </div>
  );
}

function LogIcon({ channel, status }: { channel: string | null; status: string | null }) {
  const iconClass = "w-4 h-4";
  const color = status === "failed" ? "var(--red)" : "var(--gold)";
  if (channel === "whatsapp") return <MessageCircle className={iconClass} style={{ color }} />;
  if (channel === "email") return <Mail className={iconClass} style={{ color }} />;
  if (channel === "system") return <Database className={iconClass} style={{ color }} />;
  return <Clock className={iconClass} style={{ color }} />;
}

function formatAction(action: AuditAction) {
  return action.replace(/_/g, " ");
}
