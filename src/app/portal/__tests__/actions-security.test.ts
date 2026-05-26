import { describe, expect, it, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { _prisma } from "@/lib/db/_client";

// Mock auth + next/headers cookies. Las acciones leen ambos.
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
}));

const cookieStore = new Map<string, { value: string }>();
const cookiesMock = {
  get: (name: string) => cookieStore.get(name),
  set: (name: string, value: string) => {
    cookieStore.set(name, { value });
  },
  delete: (name: string) => cookieStore.delete(name),
};

vi.mock("next/headers", () => ({
  cookies: () => cookiesMock,
}));

const {
  verifySecondaryIdentity,
  isCaseVerified,
  verifyDownloadAccess,
  hasDownloadAccess,
} = await import("@/app/portal/actions-security");

beforeEach(() => {
  authMock.mockReset();
  cookieStore.clear();
});

async function seedClient(opts: { password?: string; secondaryCode?: string | null }) {
  const pwd = opts.password ?? "Y732HX";
  const hash = await bcrypt.hash(pwd, 12);
  return _prisma.user.create({
    data: {
      fullName: "Cliente Verify",
      email: "vc@test.cl",
      phone: "+56900000010",
      role: "CLIENTE",
      passwordHash: hash,
      secondary_code: opts.secondaryCode ?? null,
      mustChangePassword: false,
    },
  });
}

describe("verifySecondaryIdentity", () => {
  it("rechaza sin sesión", async () => {
    authMock.mockResolvedValue(null);
    const r = await verifySecondaryIdentity("CASE-1", "1234");
    expect(r.ok).toBe(false);
  });

  it("rechaza con código incorrecto", async () => {
    const user = await seedClient({ secondaryCode: "1234" });
    authMock.mockResolvedValue({ user: { id: user.id, role: "CLIENTE" } });

    const r = await verifySecondaryIdentity("CASE-1", "WRONG");
    expect(r.ok).toBe(false);
    expect(cookieStore.has("verified_case_CASE-1")).toBe(false);
  });

  it("setea cookie cuando el código coincide", async () => {
    const user = await seedClient({ secondaryCode: "9999" });
    authMock.mockResolvedValue({ user: { id: user.id, role: "CLIENTE" } });

    const r = await verifySecondaryIdentity("CASE-1", "9999");
    expect(r.ok).toBe(true);
    expect(cookieStore.get("verified_case_CASE-1")?.value).toBe("true");

    expect(await isCaseVerified("CASE-1")).toBe(true);
    expect(await isCaseVerified("CASE-2")).toBe(false);
  });
});

describe("verifyDownloadAccess", () => {
  it("rechaza sin sesión", async () => {
    authMock.mockResolvedValue(null);
    const r = await verifyDownloadAccess("CASE-1", "Y732HX");
    expect(r.ok).toBe(false);
  });

  it("rechaza con password incorrecta y NO setea cookie", async () => {
    const user = await seedClient({ password: "Y732HX" });
    authMock.mockResolvedValue({ user: { id: user.id, role: "CLIENTE" } });

    const r = await verifyDownloadAccess("CASE-1", "MALA");
    expect(r.ok).toBe(false);
    expect(cookieStore.has("dl_access_CASE-1")).toBe(false);
  });

  it("acepta password correcta, setea cookie y permite hasDownloadAccess", async () => {
    const user = await seedClient({ password: "Y732HX" });
    authMock.mockResolvedValue({ user: { id: user.id, role: "CLIENTE" } });

    const r = await verifyDownloadAccess("CASE-1", "Y732HX");
    expect(r.ok).toBe(true);
    expect(cookieStore.get("dl_access_CASE-1")?.value).toBe("1");
    expect(await hasDownloadAccess("CASE-1")).toBe(true);
    expect(await hasDownloadAccess("CASE-2")).toBe(false);
  });
});
