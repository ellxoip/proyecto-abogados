import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import ChangePasswordForm from "./ChangePasswordForm";

export const dynamic = "force-dynamic";

/**
 * Pantalla de cambio voluntario de contraseña para clientes.
 *
 * El cliente ya conoce su clave (la usó en PagaCuotas), por lo que el
 * acceso a esta página es voluntario — no se fuerza redirección desde
 * el middleware. Otros roles no deberían llegar acá: los devolvemos a
 * la raíz.
 */
export default async function CambiarPasswordPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "CLIENTE") redirect("/admin");

  return <ChangePasswordForm />;
}
