import {
  AtInformaPlanPagosResponseSchema,
  NotifyAtInformaPago,
  NotifyAtInformaPagoSchema,
} from "./schemas";

type FetchOptions = Omit<RequestInit, "headers"> & {
  headers?: HeadersInit;
};

type PlanPagosFilters = {
  cliente_id?: string;
  caso_id?: string;
  estado?: "UNPAID" | "OVERDUE" | "PAID" | "RESTORED";
  solo_pendientes?: boolean;
  desde?: string;
  hasta?: string;
};

function getConfig() {
  const baseUrl = process.env.AT_INFORMA_API_URL;
  const apiKey = process.env.AT_INFORMA_API_KEY;

  if (!baseUrl) {
    throw new Error("AT_INFORMA_API_URL no está definido.");
  }
  if (!apiKey) {
    throw new Error("AT_INFORMA_API_KEY no está definido.");
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey,
  };
}

export async function atInformaFetch(path: string, options: FetchOptions = {}) {
  const { baseUrl, apiKey } = getConfig();
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const fallback = `AT-INFORMA respondió ${response.status} ${response.statusText}`;
    let detail = "";

    try {
      const maybeJson = (await response.json()) as { error?: string; message?: string };
      detail = maybeJson.error ?? maybeJson.message ?? "";
    } catch {
      // no-op
    }

    throw new Error(detail ? `${fallback}: ${detail}` : fallback);
  }

  return response;
}

export async function getAtInformaPlanPagos(filters: PlanPagosFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });

  const suffix = params.toString();
  const response = await atInformaFetch(`/api/v1/plan-pagos${suffix ? `?${suffix}` : ""}`, {
    method: "GET",
  });
  const json = await response.json();
  return AtInformaPlanPagosResponseSchema.parse(json);
}

export async function notifyAtInformaPago(payload: NotifyAtInformaPago) {
  const parsedPayload = NotifyAtInformaPagoSchema.parse(payload);

  const response = await atInformaFetch("/api/v1/pagos", {
    method: "POST",
    body: JSON.stringify(parsedPayload),
  });

  const text = await response.text();
  if (!text) {
    return { success: true };
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { success: true, raw: text };
  }
}

export type { PlanPagosFilters };
