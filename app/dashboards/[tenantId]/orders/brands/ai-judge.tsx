"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { judgeBrandAlternatives } from "./actions";

/** While alternatives wait for an AI verdict: ask for it in the background, then refresh the page. */
export function AiJudge({ tenantId, mtrmark, pending }: { tenantId: string; mtrmark: number; pending: number }) {
  const router = useRouter();
  const started = useRef<number | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!pending || started.current === mtrmark) return;
    started.current = mtrmark;
    judgeBrandAlternatives(tenantId, mtrmark).then(
      () => router.refresh(),
      () => setFailed(true),
    );
  }, [tenantId, mtrmark, pending, router]);
  if (!pending) return null;
  return (
    <div role="status" className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 text-xs text-violet-800 dark:border-violet-900 dark:bg-violet-950/20 dark:text-violet-300">
      <Sparkles className={failed ? "size-4" : "size-4 animate-pulse"} />
      {failed
        ? "Η αξιολόγηση με AI δεν ολοκληρώθηκε — τα εναλλακτικά βασίζονται στις περιγραφές."
        : `Το AI αξιολογεί ${pending} πιθανά εναλλακτικά (ποσοστό συμφωνίας ως υποκατάστατο)… η σελίδα θα ανανεωθεί μόνη της.`}
    </div>
  );
}
