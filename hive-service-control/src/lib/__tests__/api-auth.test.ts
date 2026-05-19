import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/api-auth";

function buildReq(authHeader?: string) {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers["authorization"] = authHeader;
  return new NextRequest("http://test/api/v1/clientes", { headers });
}

describe("requireApiKey", () => {
  const ORIGINAL = process.env.EXTERNAL_API_KEY;

  beforeEach(() => {
    vi.stubEnv("EXTERNAL_API_KEY", "external-test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    if (ORIGINAL !== undefined) process.env.EXTERNAL_API_KEY = ORIGINAL;
  });

  it("returns null when token matches", () => {
    const result = requireApiKey(buildReq("Bearer external-test-key"));
    expect(result).toBeNull();
  });

  it("returns 401 when token does not match", async () => {
    const result = requireApiKey(buildReq("Bearer wrong"));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("returns 401 when authorization header is missing", async () => {
    const result = requireApiKey(buildReq());
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("returns 401 when header does not start with Bearer", async () => {
    const result = requireApiKey(buildReq("Basic abc"));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("returns 500 when EXTERNAL_API_KEY is not configured", async () => {
    vi.stubEnv("EXTERNAL_API_KEY", "");
    const result = requireApiKey(buildReq("Bearer anything"));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(500);
  });
});
