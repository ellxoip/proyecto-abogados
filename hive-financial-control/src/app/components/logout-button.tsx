"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={onLogout}
      className="w-full text-left rounded-md px-3 py-2 text-sm text-white/90 hover:bg-white/10"
    >
      Cerrar Sesión
    </button>
  );
}
