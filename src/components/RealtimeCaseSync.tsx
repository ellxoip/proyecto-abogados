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
          // Debounce router.refresh() to avoid UI flicker on rapid updates
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            router.refresh();
          }, 500);
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
