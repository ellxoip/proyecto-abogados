"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase, isPlaceholder } from "@/lib/supabase-client";
import { RealtimeChannel } from "@supabase/supabase-js";

export function RealtimeCaseSync({ caseId, realtimeToken }: { caseId: string; realtimeToken?: string }) {
  const router = useRouter();

  useEffect(() => {
    if (isPlaceholder) return;
    if (realtimeToken) {

      supabase.realtime.setAuth(realtimeToken);
    }

    let debounceTimer: NodeJS.Timeout;

    const channel: RealtimeChannel = supabase.channel(`sync-case-${caseId}`);

    // Helper para debounce uniforme entre los distintos hooks.
    const triggerRefresh = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => router.refresh(), 500);
    };

    channel
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "cases",
          filter: `id=eq.${caseId}`,
        },
        (payload) => {
          console.log("[RealtimeCaseSync] Case updated:", payload);
          triggerRefresh();
        }
      )
      // INSERT en `comments` → chat live (texto + audio + adjuntos). Antes
      // el cliente tenía que recargar para ver el mensaje nuevo.
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `caseId=eq.${caseId}`,
        },
        (payload) => {
          console.log("[RealtimeCaseSync] Comment inserted:", payload);
          triggerRefresh();
        }
      )
      // INSERT en `updates` → línea de tiempo del expediente.
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "updates",
          filter: `caseId=eq.${caseId}`,
        },
        (payload) => {
          console.log("[RealtimeCaseSync] Update inserted:", payload);
          triggerRefresh();
        }
      )
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [caseId, router, realtimeToken]);

  return null; // Invisible component
}
