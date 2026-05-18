type AtInformaClientOptions = {
  baseUrl?: string;
  token?: string;
  fetchFn?: typeof fetch;
};

type PlanPagosOptions = {
  soloPendientes?: boolean;
};

export class AtInformaClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: AtInformaClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? process.env.AT_INFORMA_BASE_URL ?? "";
    this.token = options.token ?? process.env.AT_INFORMA_TOKEN ?? "";
    this.fetchFn = options.fetchFn ?? fetch;

    if (!this.baseUrl) {
      throw new Error("AT_INFORMA_BASE_URL no est\u00e1 definido.");
    }
    if (!this.token) {
      throw new Error("AT_INFORMA_TOKEN no est\u00e1 definido.");
    }
  }

  async getClientes() {
    return this.request<unknown[]>("/api/v1/clientes");
  }

  async getPlanPagos(options: PlanPagosOptions = {}) {
    const query = options.soloPendientes ? "?solo_pendientes=true" : "";
    return this.request<unknown[]>(`/api/v1/plan-pagos${query}`);
  }

  async getCobranza() {
    return this.request<unknown[]>("/api/v1/cobranza");
  }

  async registrarPago(payload: Record<string, unknown>) {
    return this.request<unknown>("/api/v1/pagos", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async createLegalCase(payload: Record<string, unknown>) {
    return this.request<{ ok: boolean; caseId?: string; clientId?: string }>(
      "/api/internal/integration/cases",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`AT-INFORMA ${response.status}: ${message}`);
    }

    return (await response.json()) as T;
  }
}
