"use client";

import { useRef, useState } from "react";
import { Category } from "@prisma/client";
import { sendCaseToCrmAgendadoras } from "./actions";
import { useRouter } from "next/navigation";
import {
  User,
  Phone,
  Mail,
  Hash,
  BookOpen,
  CreditCard,
  Upload,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  Send,
  Building2,
  DollarSign,
  CreditCard as CardIcon,
} from "lucide-react";
import { HelpTip } from "@/components/HelpTip";

const MAX_RECEIPT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const RECEIPT_MIME_ALLOW = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];

function bytesToReadable(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

export function QuickIntakeForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "+56",
    rut: "",
    caseCode: `AT-${new Date().getFullYear()}-`,
    categoryId: "",
    isPaid: false,
    receiptUrl: "",
    honorarios: "",
    cuotaInicial: "",
    numCuotas: "",
    notes: "",
  });
  const [receipt, setReceipt] = useState<{ name: string; size: number; type: string } | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [crmResult, setCrmResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, setPending] = useState(false);

  // The receipt is *required* when the operator marks the payment as confirmed.
  const needsReceipt = formData.isPaid && !receipt;
  const needsRut = !formData.rut.trim();
  const formInvalid = needsReceipt;

  async function onPickFile(file: File | null) {
    setReceiptError(null);
    if (!file) {
      setReceipt(null);
      setFormData((prev) => ({ ...prev, receiptUrl: "" }));
      return;
    }
    if (!RECEIPT_MIME_ALLOW.includes(file.type)) {
      setReceiptError("Formato no soportado. Use PDF, PNG, JPG o WebP.");
      return;
    }
    if (file.size > MAX_RECEIPT_SIZE_BYTES) {
      setReceiptError(`Archivo demasiado grande (máx ${bytesToReadable(MAX_RECEIPT_SIZE_BYTES)}).`);
      return;
    }
    try {
      const dataUrl = await readAsDataURL(file);
      setReceipt({ name: file.name, size: file.size, type: file.type });
      setFormData((prev) => ({ ...prev, receiptUrl: dataUrl }));
    } catch {
      setReceiptError("No se pudo leer el archivo. Inténtalo nuevamente.");
    }
  }

  function clearReceipt() {
    setReceipt(null);
    setReceiptError(null);
    setFormData((prev) => ({ ...prev, receiptUrl: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function resetForm() {
    setFormData({
      fullName: "",
      email: "",
      phone: "+56",
      rut: "",
      caseCode: `AT-${new Date().getFullYear()}-`,
      categoryId: "",
      isPaid: false,
      receiptUrl: "",
      honorarios: "",
      cuotaInicial: "",
      numCuotas: "",
      notes: "",
    });
    setReceipt(null);
    setSubmitAttempted(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);
    setCrmResult(null);
    if (formInvalid) return;
    if (needsRut) {
      setCrmResult({ ok: false, message: "El RUT del cliente es obligatorio." });
      return;
    }
    const categoryName = categories.find((c) => c.id === formData.categoryId)?.name ?? "";
    if (!categoryName) {
      setCrmResult({ ok: false, message: "Selecciona una categoría legal." });
      return;
    }

    setPending(true);
    try {
      const res = await sendCaseToCrmAgendadoras({
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        rut: formData.rut,
        caseCode: formData.caseCode,
        categoryName,
        honorarios: formData.honorarios ? Number(formData.honorarios) : undefined,
        cuotaInicial: formData.cuotaInicial ? Number(formData.cuotaInicial) : undefined,
        numCuotas: formData.numCuotas ? Number(formData.numCuotas) : undefined,
        isPaid: formData.isPaid,
        receiptUrl: formData.receiptUrl || undefined,
        notes: formData.notes || undefined,
      });
      if (res.ok) {
        const summary = res.crmAgendadoraName
          ? ` Asignado en CRM a ${res.crmAgendadoraName} (área ${res.crmAreaName ?? "—"}).`
          : "";
        setCrmResult({
          ok: true,
          message: `Caso ${formData.caseCode} derivado correctamente al CRM.${summary} HIVE CONTROL cumplió con la entrega; el flujo continúa con las agendadoras.`,
        });
        setTimeout(resetForm, 3000);
      } else {
        setCrmResult({ ok: false, message: (res as any).error ?? "Error inesperado." });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Section 1: Client Identity */}
      <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-[var(--surface-2)] border-b border-[var(--border-glass)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-[var(--gold)]" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--gold)]">Identidad del Cliente</h2>
          </div>
          <HelpTip
            content="Estos datos identifican al cliente en el CRM. Si ya existe un contacto con el mismo RUT, teléfono o email, el CRM lo reutiliza para evitar duplicados."
            side="left"
          />
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Nombre Completo</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-dim)]" />
              <input
                required
                type="text"
                placeholder="Ej: Juan Pérez"
                className="w-full pl-10 pr-4 py-2.5 bg-[var(--surface-3)] border border-[var(--card-border)] rounded outline-none focus:border-[var(--gold)] focus:shadow-[var(--ring-focus)] transition-all text-sm"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Teléfono / WhatsApp</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-dim)]" />
              <input
                required
                type="text"
                placeholder="+569..."
                className="w-full pl-10 pr-4 py-2.5 bg-[var(--surface-3)] border border-[var(--card-border)] rounded outline-none focus:border-[var(--gold)] focus:shadow-[var(--ring-focus)] transition-all text-sm"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] inline-flex items-center gap-1.5">
              RUT <span className="text-[var(--red)]">*</span>
              <HelpTip content="Identificador chileno único. Requerido para crear el contacto en el CRM. Formato: 12345678-9." />
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-dim)]" />
              <input
                required
                type="text"
                placeholder="12345678-9"
                className="w-full pl-10 pr-4 py-2.5 bg-[var(--surface-3)] border border-[var(--card-border)] rounded outline-none focus:border-[var(--gold)] focus:shadow-[var(--ring-focus)] transition-all text-sm"
                value={formData.rut}
                onChange={(e) => setFormData({ ...formData, rut: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Correo (Opcional)</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-dim)]" />
              <input
                type="email"
                placeholder="cliente@email.com"
                className="w-full pl-10 pr-4 py-2.5 bg-[var(--surface-3)] border border-[var(--card-border)] rounded outline-none focus:border-[var(--gold)] focus:shadow-[var(--ring-focus)] transition-all text-sm"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Case Logistics */}
      <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-[var(--surface-2)] border-b border-[var(--border-glass)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[var(--gold)]" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--gold)]">Detalles del Expediente</h2>
          </div>
          <HelpTip
            content="Código de referencia interno y área legal del caso. El CRM intentará mapear la categoría con el Área correspondiente para asignar la agendadora correcta."
            side="left"
          />
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Código de Seguimiento</label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-dim)]" />
              <input
                required
                type="text"
                className="w-full pl-10 pr-4 py-2.5 bg-[var(--surface-3)] border border-[var(--card-border)] rounded outline-none focus:border-[var(--gold)] focus:shadow-[var(--ring-focus)] transition-all text-sm font-bold tracking-widest"
                value={formData.caseCode}
                onChange={(e) => setFormData({ ...formData, caseCode: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Categoría Legal</label>
            <select
              required
              className="w-full px-4 py-2.5 bg-[var(--surface-3)] border border-[var(--card-border)] rounded outline-none focus:border-[var(--gold)] focus:shadow-[var(--ring-focus)] transition-all text-sm appearance-none"
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
            >
              <option value="">Seleccione una área...</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Notas para la Agendadora (Opcional)</label>
            <textarea
              rows={3}
              placeholder="Contexto que ayudará a la agendadora a contactar al cliente..."
              className="w-full px-4 py-2.5 bg-[var(--surface-3)] border border-[var(--card-border)] rounded outline-none focus:border-[var(--gold)] focus:shadow-[var(--ring-focus)] transition-all text-sm"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Section 3: Plan de Pago (CRM) */}
      <div className="bg-[var(--surface)] border border-[var(--border-glass)] rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-[var(--surface-2)] border-b border-[var(--border-glass)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-[var(--gold)]" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--gold)]">Plan de Pago (Opcional)</h2>
          </div>
          <HelpTip
            content="Si ya hay un acuerdo comercial, registralo aquí. El CRM lo recibe en el Lead y la agendadora puede usarlo en la siguiente etapa. Vacío también está OK."
            side="left"
          />
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Honorarios Totales</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-dim)]">$</span>
              <input
                type="number"
                min="0"
                placeholder="0"
                className="w-full pl-7 pr-4 py-2.5 bg-[var(--surface-3)] border border-[var(--card-border)] rounded outline-none focus:border-[var(--gold)] focus:shadow-[var(--ring-focus)] transition-all text-sm"
                value={formData.honorarios}
                onChange={(e) => setFormData({ ...formData, honorarios: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Cuota Inicial</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-dim)]">$</span>
              <input
                type="number"
                min="0"
                placeholder="0"
                className="w-full pl-7 pr-4 py-2.5 bg-[var(--surface-3)] border border-[var(--card-border)] rounded outline-none focus:border-[var(--gold)] focus:shadow-[var(--ring-focus)] transition-all text-sm"
                value={formData.cuotaInicial}
                onChange={(e) => setFormData({ ...formData, cuotaInicial: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">N° Cuotas</label>
            <div className="relative">
              <CardIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-dim)]" />
              <input
                type="number"
                min="0"
                placeholder="0"
                className="w-full pl-10 pr-4 py-2.5 bg-[var(--surface-3)] border border-[var(--card-border)] rounded outline-none focus:border-[var(--gold)] focus:shadow-[var(--ring-focus)] transition-all text-sm"
                value={formData.numCuotas}
                onChange={(e) => setFormData({ ...formData, numCuotas: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: Comprobante */}
      <div className={`bg-[var(--surface)] border rounded-lg shadow-sm overflow-hidden transition-all duration-300 ${formData.isPaid ? "border-emerald-300" : "border-[var(--border-glass)]"}`}>
        <div className={`px-6 py-4 border-b flex items-center justify-between ${formData.isPaid ? "bg-emerald-50 border-emerald-200" : "bg-[var(--surface-2)] border-[var(--border-glass)]"}`}>
          <div className="flex items-center gap-2">
            <CreditCard className={`w-4 h-4 ${formData.isPaid ? "text-emerald-700" : "text-[var(--gold)]"}`} />
            <h2 className={`text-xs font-bold uppercase tracking-widest ${formData.isPaid ? "text-emerald-700" : "text-[var(--gold)]"}`}>
              Validación de Pago Inicial (Opcional)
            </h2>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={formData.isPaid}
              onChange={(e) => setFormData({ ...formData, isPaid: e.target.checked })}
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--surface)] after:border-[var(--border-glass)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            <span className="ml-3 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">¿Pago Confirmado?</span>
          </label>
        </div>

        <div className="p-6 space-y-4">
          {!receipt ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`w-full flex items-center gap-4 p-4 bg-[var(--surface-3)] rounded-lg border-2 border-dashed transition-all text-left ${
                submitAttempted && needsReceipt
                  ? "border-red-400 bg-red-50/40"
                  : "border-[var(--card-border)] hover:border-[var(--gold)] hover:bg-[var(--card-bg-hover)]"
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-[var(--surface)] flex items-center justify-center text-[var(--text-muted)] flex-shrink-0">
                <Upload className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-[11px] font-bold text-[var(--text)] uppercase tracking-widest">
                  Cargar Comprobante de Pago
                  {formData.isPaid && <span className="text-red-600 ml-1">*</span>}
                </p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  PDF, PNG, JPG o WebP · máx {bytesToReadable(MAX_RECEIPT_SIZE_BYTES)}
                </p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--gold)]">Seleccionar</span>
            </button>
          ) : (
            <div className="flex items-center gap-4 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 flex-shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-900 truncate">{receipt.name}</p>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  {bytesToReadable(receipt.size)} · Comprobante listo para adjuntar
                </p>
              </div>
              <button
                type="button"
                onClick={clearReceipt}
                aria-label="Quitar comprobante"
                className="p-2 rounded-md text-emerald-700 hover:bg-emerald-100 transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />

          {receiptError && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{receiptError}</span>
            </div>
          )}

          {formData.isPaid && !receipt && (
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-[0.15em]">
                Se requiere comprobante adjunto para confirmar el pago.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* CRM result */}
      {crmResult && (
        <div
          role="status"
          className="px-4 py-3 rounded-lg border flex items-start gap-3 text-sm"
          style={
            crmResult.ok
              ? { background: "var(--green-dim)", borderColor: "var(--green-border)", color: "var(--green)" }
              : { background: "var(--red-dim)", borderColor: "var(--red-border)", color: "var(--red)" }
          }
        >
          {crmResult.ok ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          )}
          <span>{crmResult.message}</span>
        </div>
      )}

      {/* Primary action: derive to CRM */}
      <button
        type="submit"
        disabled={pending || formInvalid}
        title={
          formInvalid
            ? "Adjunta el comprobante antes de continuar"
            : needsRut
            ? "Completa el RUT del cliente"
            : "Crea un Lead en el CRM (área de agendadoras). HIVE CONTROL no guarda copia local."
        }
        className="w-full py-4 rounded-lg text-xs font-bold uppercase tracking-[0.25em] flex items-center justify-center gap-3 transition-all shadow-xl shadow-black/10 group disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: "linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-deep) 100%)",
          color: "#FFFFFF",
        }}
      >
        {pending ? (
          <>
            <span className="spinner" />
            Derivando al CRM...
          </>
        ) : (
          <>
            Derivar al CRM (Agendadoras)
            <Send className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </>
        )}
      </button>

      <p className="text-[11px] text-[var(--text-muted)] text-center -mt-2">
        El caso se envía al CRM y queda en el pool de agendadoras. <strong className="text-[var(--text)]">HIVE CONTROL no conserva copia local</strong>;
        el ciclo comercial sigue en el CRM y vuelve a HIVE CONTROL solo si el lead llega a etapa de reunión legal.
      </p>
    </form>
  );
}
