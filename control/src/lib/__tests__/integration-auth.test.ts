import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyIntegrationAuth, getCorrelationId } from "@/lib/integration-auth";

const ENV_BACKUP: Record<string, string | undefined> = {};
const ENV_VARS = [
  "INTEGRATION_INTERNAL_API_KEY",
  "INTEGRATION_INGEST_SECRET",
  "CRON_SECRET",
] as const;

beforeEach(() => {
  for (const k of ENV_VARS) {
    ENV_BACKUP[k] = process.env[k];
  }
  process.env.INTEGRATION_INTERNAL_API_KEY = "internal-secret-123";
  process.env.INTEGRATION_INGEST_SECRET = "ingest-secret-456";
  process.env.CRON_SECRET = "cron-secret-789";
});

afterEach(() => {
  for (const k of ENV_VARS) {
    if (ENV_BACKUP[k] === undefined) delete process.env[k];
    else process.env[k] = ENV_BACKUP[k];
  }
});

function reqWith(headers: Record<string, string>) {
  return new Request("http://test/x", { method: "POST", headers });
}

describe("verifyIntegrationAuth", () => {
  it("accepts x-api-key for internal kind", () => {
    expect(
      verifyIntegrationAuth(reqWith({ "x-api-key": "internal-secret-123" }), { kind: "internal" }),
    ).toBe(true);
  });

  it("accepts Bearer for internal kind", () => {
    expect(
      verifyIntegrationAuth(
        reqWith({ authorization: "Bearer internal-secret-123" }),
        { kind: "internal" },
      ),
    ).toBe(true);
  });

  it("rejects wrong credential", () => {
    expect(
      verifyIntegrationAuth(reqWith({ "x-api-key": "WRONG" }), { kind: "internal" }),
    ).toBe(false);
  });

  it("rejects when no header present", () => {
    expect(verifyIntegrationAuth(reqWith({}), { kind: "internal" })).toBe(false);
  });

  it("rejects ingest secret used in internal slot", () => {
    expect(
      verifyIntegrationAuth(reqWith({ "x-api-key": "ingest-secret-456" }), { kind: "internal" }),
    ).toBe(false);
  });

  it("accepts x-integration-secret for ingest kind", () => {
    expect(
      verifyIntegrationAuth(
        reqWith({ "x-integration-secret": "ingest-secret-456" }),
        { kind: "ingest" },
      ),
    ).toBe(true);
  });

  it("accepts x-cron-secret for cron kind", () => {
    expect(
      verifyIntegrationAuth(reqWith({ "x-cron-secret": "cron-secret-789" }), { kind: "cron" }),
    ).toBe(true);
  });

  it("fail-closed when env var is missing", () => {
    delete process.env.CRON_SECRET;
    expect(
      verifyIntegrationAuth(reqWith({ "x-cron-secret": "anything" }), { kind: "cron" }),
    ).toBe(false);
  });

  it("rejects malformed Authorization header (no Bearer prefix)", () => {
    expect(
      verifyIntegrationAuth(reqWith({ authorization: "internal-secret-123" }), { kind: "internal" }),
    ).toBe(false);
  });
});

describe("getCorrelationId", () => {
  it("uses header when present", () => {
    expect(getCorrelationId(reqWith({ "x-correlation-id": "abc-123" }))).toBe("abc-123");
  });

  it("falls back to body value when no header", () => {
    expect(getCorrelationId(reqWith({}), "body-cid")).toBe("body-cid");
  });

  it("header takes precedence over body", () => {
    expect(getCorrelationId(reqWith({ "x-correlation-id": "h" }), "b")).toBe("h");
  });

  it("auto-generates svc- prefixed id when no input", () => {
    const id = getCorrelationId(reqWith({}));
    expect(id.startsWith("svc-")).toBe(true);
    expect(id.length).toBeGreaterThan(10);
  });

  it("ignores absurdly long header values", () => {
    const huge = "x".repeat(500);
    const id = getCorrelationId(reqWith({ "x-correlation-id": huge }));
    expect(id).not.toBe(huge);
    expect(id.startsWith("svc-")).toBe(true);
  });
});
