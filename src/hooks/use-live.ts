import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Calls onChange (debounced) whenever a pull lands or a round updates. */
export function useLive(onChange: () => void, matchupId?: string) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const fire = () => {
      clearTimeout(t);
      t = setTimeout(() => cb.current(), 400);
    };
    const filter = matchupId ? `matchup_id=eq.${matchupId}` : undefined;
    const ch = supabase
      .channel(`live-${matchupId ?? "all"}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds", ...(filter && { filter }) }, fire)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pulls", ...(filter && { filter }) }, fire)
      .subscribe();
    return () => {
      clearTimeout(t);
      supabase.removeChannel(ch);
    };
  }, [matchupId]);
}
