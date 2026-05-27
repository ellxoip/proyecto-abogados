import { describe, expect, it } from "vitest";
import { logAudit } from "@/lib/audit";
import { _prisma } from "@/lib/db/_client";

describe("logAudit", () => {
  it("persists a basic audit row inside an existing transaction", async () => {
    await _prisma.$transaction(async (tx) => {
      await logAudit({
        tx,
        action: "LOGIN_SUCCESS",
        actorId: undefined,
        message: "ping",
      });
    });

    const rows = await _prisma.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("LOGIN_SUCCESS");
    expect(rows[0].message).toBe("ping");
  });

  it("serializes metadata as JSON-safe object", async () => {
    await _prisma.$transaction(async (tx) => {
      await logAudit({
        tx,
        action: "PAYMENT_RECORDED",
        message: "with meta",
        metadata: { cuota: 1, when: new Date("2025-05-18T00:00:00Z"), nested: { ok: true } },
      });
    });

    const row = await _prisma.auditLog.findFirst();
    expect(row).not.toBeNull();
    const meta = JSON.parse(row!.metadata ?? "{}");
    expect(meta.cuota).toBe(1);
    expect(meta.nested.ok).toBe(true);
    expect(typeof meta.when).toBe("string");
  });

  it("rolls back the audit log if the surrounding transaction fails", async () => {
    await expect(
      _prisma.$transaction(async (tx) => {
        await logAudit({
          tx,
          action: "LOGIN_FAILED",
          message: "should not persist",
        });
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");

    const rows = await _prisma.auditLog.findMany();
    expect(rows).toHaveLength(0);
  });
});
