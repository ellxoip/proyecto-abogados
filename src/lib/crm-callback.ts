const CRM_URL = process.env.CRM_URL || "http://localhost:8000";
const CRM_CALLBACK_SECRET = process.env.CRM_CALLBACK_SECRET || "";

export type ReunionResult = "exitoso" | "no_exitoso";

export async function notifyCrmReunionResult(params: {
  crmLeadId: string | number;
  result: ReunionResult;
  caseId?: string | null;
  notes?: string;
}): Promise<void> {
  if (!CRM_CALLBACK_SECRET) {
    console.warn("[crm-callback] CRM_CALLBACK_SECRET not configured — skipping callback");
    return;
  }

  const payload = {
    event: "reunion_result",
    crmLeadId: Number(params.crmLeadId),
    result: params.result,
    caseId: params.caseId || null,
    notes: params.notes || "",
  };

  try {
    const resp = await fetch(`${CRM_URL}/api/webhooks/at_informa`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-crm-callback-secret": CRM_CALLBACK_SECRET,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error(`[crm-callback] CRM webhook returned ${resp.status}: ${text}`);
    } else {
      console.log(`[crm-callback] Notified CRM: lead #${params.crmLeadId} → ${params.result}`);
    }
  } catch (err) {
    console.error("[crm-callback] Failed to notify CRM:", err);
  }
}
