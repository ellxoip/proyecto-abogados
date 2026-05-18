import { CaseStage, Role } from "@/lib/db-enums";
import { withSystemRls } from "@/lib/rls";
import { enqueueWhatsApp, enqueueEmail } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import bcrypt from "bcryptjs";

/**
 * CRM Onboarding Service — Hive Control v3.0
 * 
 * Receives validated leads from Dante/CRM and:
 * 1. Creates the client with private credentials (name-based password)
 * 2. Creates the case with the invoice already attached
 * 3. Sends credentials to the client via WhatsApp + Email
 * 
 * Hive Control is NOT a payment gateway. The payment is validated externally
 * by Dante. The receipt (comprobante) proves the client already paid.
 */

export type CrmLeadPayload = {
  fullName: string;
  email: string;
  phone: string;
  category: string;          // e.g. "LABORAL", "CIVIL"
  invoiceUrl?: string;       // Comprobante de pago (proves client paid)
  caseCode?: string;         // Optional: if Dante provides a code
};

/**
 * Generates a deterministic, memorable password from the client's name and phone.
 * Logic: First name (capitalized) + last 4 digits of phone = 8 chars
 * Example: "Juan Pérez" + "+56912345678" → "Juan5678"
 */
export function generateClientPassword(fullName: string, phone: string): string {
  // Extract first name, remove accents, capitalize first letter
  const firstName = fullName
    .split(" ")[0]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics (accents)
    .replace(/[^a-zA-Z]/g, "");      // Keep only letters

  const capitalized = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();

  // Extract last 4 digits of phone
  const digits = phone.replace(/\D/g, "");
  const lastFour = digits.slice(-4);

  // Combine: first name (up to 4 chars) + last 4 digits
  const namePart = capitalized.slice(0, 4);
  return `${namePart}${lastFour}`;
}

/**
 * Generate a unique case code if Dante doesn't provide one.
 * Format: AT-CRM-XXXX (sequential based on timestamp)
 */
function generateCaseCode(): string {
  const seq = Date.now().toString(36).toUpperCase().slice(-4);
  return `AT-CRM-${seq}`;
}

export async function onboardClientFromCRM(payload: CrmLeadPayload) {
  const { fullName, email, phone, category, invoiceUrl, caseCode } = payload;

  // The receipt proves the client already paid externally
  const isPaid = !!invoiceUrl;

  // Generate deterministic password
  const plainPassword = generateClientPassword(fullName, phone);
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  return await withSystemRls(async (tx) => {
    // 1. Find or Create Client
    let client = await tx.user.findUnique({ where: { email } });
    let isNewClient = false;

    if (!client) {
      client = await tx.user.create({
        data: {
          fullName,
          email,
          phone,
          role: Role.CLIENTE,
          passwordHash,
          active: true,
        },
      });
      isNewClient = true;
    } else {
      if (client.role !== Role.CLIENTE) {
        throw new Error("El email recibido desde CRM pertenece a un usuario interno. No se puede asociar el caso a ese cliente.");
      }
      // Update existing client with fresh credentials if needed
      await tx.user.update({
        where: { id: client.id },
        data: {
          passwordHash,
          active: true, // Re-enable if was deactivated
          phone,        // Update phone if changed
        },
      });
    }

    // 2. Resolve Category (upsert if it doesn't exist)
    const cat = await tx.category.upsert({
      where: { name: category.toUpperCase() },
      update: {},
      create: { name: category.toUpperCase() },
    });

    // 3. Create Case — invoice already attached
    const code = caseCode || generateCaseCode();
    const kase = await tx.case.create({
      data: {
        code,
        client_id: client.id,
        categoryId: cat.id,
        is_paid: isPaid,
        initial_invoice: invoiceUrl ?? null,
        stage: isPaid ? CaseStage.OPEN : CaseStage.WAITING_CUOTAS,
      },
    });

    // 4. Audit trail
    await logAudit({
      tx,
      action: "PAYMENT_RECORDED",
      caseId: kase.id,
      message: `Lead ingresado desde CRM (Dante). Pagado: ${isPaid ? "SÍ" : "NO"}. Cliente: ${isNewClient ? "Nuevo" : "Existente"}.`,
    });

    // 5. Send private credentials to client via WhatsApp + Email
    await Promise.allSettled([
      enqueueWhatsApp({ kind: "client_credentials", caseId: kase.id }),
      enqueueEmail({ kind: "client_credentials", caseId: kase.id }),
    ]);

    // 6. If paid, also send payment receipt notification
    if (isPaid) {
      await Promise.allSettled([
        enqueueWhatsApp({ kind: "payment_receipt", caseId: kase.id }),
        enqueueEmail({ kind: "payment_receipt", caseId: kase.id }),
      ]);
    } else {
      // If not paid, send initial invoice request
      await Promise.allSettled([
        enqueueWhatsApp({ kind: "initial_invoice", caseId: kase.id }),
        enqueueEmail({ kind: "initial_invoice", caseId: kase.id }),
      ]);
    }

    return {
      ok: true,
      caseId: kase.id,
      caseCode: code,
      clientId: client.id,
      isNewClient,
      isPaid,
      credentials: {
        email,
        password: plainPassword, // Returned so the webhook can log it (not stored in plain text)
      },
    };
  });
}
