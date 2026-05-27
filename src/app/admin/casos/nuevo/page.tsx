import { withRls } from "@/lib/rls";
import { QuickIntakeForm } from "./QuickIntakeForm";
import { auth } from "@/lib/auth";
import { Role } from "@/lib/db-enums";
import { redirect } from "next/navigation";


export default async function NewCasePage() {
  const session = await auth();
  const role = session?.user?.role;

  // Solo SuperAdmin puede capturar ingresos manuales que se derivan al CRM.
  if (role !== Role.SUPER_ADMIN) {
    redirect("/admin/bandeja");
  }

  const categories = await withRls((tx) => tx.category.findMany({ orderBy: { name: "asc" } }));


  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--text)]" style={{ fontFamily: "'Playfair Display', serif" }}>
          Ingreso Manual de Caso
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1 font-medium">
          Captura los datos del cliente y deriva el caso al CRM, donde las agendadoras tomarán el flujo comercial.
        </p>
      </header>

      <QuickIntakeForm categories={categories} />
    </div>
  );
}
