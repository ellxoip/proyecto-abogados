"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isPlaceholder } from "@/lib/supabase-client";
import { Users } from "lucide-react";

export function LiveInboxCounter({ count, realtimeToken }: { count: number; realtimeToken?: string }) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (isPlaceholder) return;
    if (realtimeToken) {
      supabase.realtime.setAuth(realtimeToken);
    }

    const channel = supabase.channel('inbox-cases-insert');

    channel
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cases" },
        () => {
          setIsUpdating(true);
          router.refresh();
          setTimeout(() => setIsUpdating(false), 2000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, realtimeToken]);

  return (
    <div className={`relative flex items-center gap-3 px-4 py-2 rounded-sm border transition-all duration-300 ${isUpdating ? "border-[var(--gold)] bg-[var(--surface-2)] shadow-md scale-105" : "bg-[var(--surface)] border-[var(--border-glass)] shadow-sm"}`}>
      <Users className={`w-4 h-4 transition-colors ${isUpdating ? "text-[var(--gold)] animate-bounce" : "text-[var(--gold)]"}`} />
      <span className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]">
        {count} Casos Encontrados
      </span>
      {isUpdating && (
         <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
           <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--gold)] opacity-75"></span>
           <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--gold)]"></span>
         </span>
      )}
    </div>
  );
}
