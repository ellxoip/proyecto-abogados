import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import ChangePasswordForm from "./ChangePasswordForm";

export const dynamic = "force-dynamic";

/**
 * Pantalla de rotación de contraseña inicial. El portal layout fuerza a
 * cualquier cliente con `mustChangePassword = true` a aterrizar acá antes
 * de poder ver el resto del portal. Cuando rota la clave, el flag baja a
 * false (vía server action + session.update) y el layout deja pasar.
 *
 * Otros roles no deberían llegar acá; los devolvemos a la raíz.
 */
export default async function CambiarPasswordPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "CLIENTE") redirect("/admin");

  // Si el cliente ya no necesita rotar (recargó la página tras cambiar),
  // lo dejamos volver al portal sin perder el viaje.
  if (!session.user.mustChangePassword) redirect("/portal");

  return <ChangePasswordForm />;
}
