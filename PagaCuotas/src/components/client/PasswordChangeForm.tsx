import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { updateClientPassword, getClientSession, saveClientSession, saveClientToken } from '../../lib/clientPortal';

type Strength = { score: number; label: string; color: string; hints: string[] };

const PASSWORD_REGEX = /^[a-zA-Z0-9]{6}$/;
const SEQUENTIAL_PATTERNS = ['012345', '123456', '234567', '345678', '456789', 'abcdef', 'bcdefg', 'cdefgh'];

function evaluateStrength(password: string): Strength {
  const hints: string[] = [];
  let score = 0;

  if (password.length === 6) score += 1;
  else hints.push('Debe tener exactamente 6 caracteres');

  const hasLetter = /[a-zA-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  if (hasLetter && hasDigit) score += 1;
  else hints.push('Combina letras y números');

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  if (hasUpper && hasLower) score += 1;
  else if (hasLetter) hints.push('Combina mayúsculas y minúsculas');

  const uniqueChars = new Set(password.split('')).size;
  if (uniqueChars >= 4) score += 1;
  else hints.push('Evita repetir el mismo carácter');

  const lower = password.toLowerCase();
  const isSequential = SEQUENTIAL_PATTERNS.some((p) => lower.includes(p));
  if (!isSequential && password.length > 0) score += 1;
  else if (isSequential) hints.push('Evita secuencias obvias (123456, abcdef)');

  const labels = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Fuerte'];
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-500'];
  const idx = Math.min(score, 4);
  return { score: idx, label: labels[idx], color: colors[idx], hints };
}

interface Props {
  forced?: boolean;
  onSuccess?: () => void;
}

export default function PasswordChangeForm({ forced = false, onSuccess }: Props) {
  const session = getClientSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  const strength = useMemo(() => evaluateStrength(newPassword), [newPassword]);
  const isValid = PASSWORD_REGEX.test(newPassword);
  const matches = newPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;
    setSuccess(false);

    if (!forced && !PASSWORD_REGEX.test(currentPassword)) {
      setMessage('La clave actual debe tener 6 caracteres alfanuméricos.');
      return;
    }
    if (!isValid) {
      setMessage('La nueva clave debe tener exactamente 6 caracteres alfanuméricos.');
      return;
    }
    if (!matches) {
      setMessage('La confirmación no coincide con la nueva clave.');
      return;
    }
    if (strength.score < 2) {
      setMessage('Tu clave es muy débil. Aplica las recomendaciones para reforzarla.');
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const result = await updateClientPassword({
        identifier: session.identifier,
        currentPassword: forced ? undefined : currentPassword,
        newPassword,
      });
      if (result.token) saveClientToken(result.token);

      const updatedSession = { ...session, passwordChangeRequired: false, payAfterPasswordChange: false };
      saveClientSession(updatedSession);

      setSuccess(true);
      setMessage('Clave actualizada correctamente.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onSuccess?.();
    } catch (error: any) {
      setMessage(error.message || 'No fue posible actualizar la clave.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      {!forced && (
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-on-surface-variant">Clave actual</span>
          <input
            className="h-11 rounded-lg border border-border-subtle px-3 text-sm outline-none focus:border-secondary"
            type="password"
            maxLength={6}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value.toUpperCase())}
            autoComplete="current-password"
          />
        </label>
      )}

      <label className="grid gap-1">
        <span className="text-xs font-semibold text-on-surface-variant">Nueva clave (6 caracteres)</span>
        <input
          className="h-11 rounded-lg border border-border-subtle px-3 text-sm outline-none focus:border-secondary"
          type="password"
          maxLength={6}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value.toUpperCase())}
          autoComplete="new-password"
        />
      </label>

      {newPassword.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div className={cn('h-full transition-all', strength.color)} style={{ width: `${((strength.score + 1) / 5) * 100}%` }} />
            </div>
            <span className="text-xs font-semibold text-on-surface-variant w-20 text-right">{strength.label}</span>
          </div>
          {strength.hints.length > 0 && (
            <ul className="text-[11px] text-on-surface-variant space-y-0.5">
              {strength.hints.map((h) => (
                <li key={h} className="flex items-center gap-1.5">
                  <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
                  {h}
                </li>
              ))}
            </ul>
          )}
          {strength.hints.length === 0 && isValid && (
            <p className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3" />
              Clave robusta dentro del límite de 6 caracteres.
            </p>
          )}
        </div>
      )}

      <label className="grid gap-1">
        <span className="text-xs font-semibold text-on-surface-variant">Confirmar nueva clave</span>
        <input
          className={cn(
            'h-11 rounded-lg border px-3 text-sm outline-none',
            confirmPassword.length === 0
              ? 'border-border-subtle focus:border-secondary'
              : matches
                ? 'border-emerald-500'
                : 'border-red-500'
          )}
          type="password"
          maxLength={6}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value.toUpperCase())}
          autoComplete="new-password"
        />
        {confirmPassword.length > 0 && !matches && (
          <span className="text-[11px] text-red-500">No coincide con la nueva clave.</span>
        )}
      </label>

      <button
        type="submit"
        disabled={busy || !isValid || !matches}
        className="h-11 rounded-lg bg-primary-container text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? 'Actualizando…' : forced ? 'Guardar clave y continuar' : 'Cambiar clave'}
      </button>

      {message && (
        <p className={cn('text-xs font-semibold', success ? 'text-emerald-600' : 'text-on-surface-variant')}>
          {message}
        </p>
      )}

      <details className="text-[11px] text-on-surface-variant">
        <summary className="cursor-pointer font-semibold">Recomendaciones de seguridad</summary>
        <ul className="mt-2 space-y-1 pl-4 list-disc">
          <li>Combina letras y números (ej. <code>A4K9B2</code>).</li>
          <li>Alterna mayúsculas y minúsculas si te resulta memorable.</li>
          <li>Evita fechas, RUT, secuencias (<code>123456</code>) o repeticiones (<code>AAAAAA</code>).</li>
          <li>No reutilices una clave que uses en otros sistemas.</li>
        </ul>
      </details>
    </form>
  );
}
