import { auth } from "@/lib/auth";
import { Role } from "@/lib/db-enums";
import { notFound } from "next/navigation";

export default async function ProductividadLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  
  // Exclusivo para SuperAdmin
  if (!session || session.user.role !== Role.SUPER_ADMIN) {
    return notFound();
  }

  return <>{children}</>;
}
