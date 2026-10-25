"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERIOD_PRESETS, type PeriodPreset } from "@/lib/period";

/** Period selector (presets + custom dates). Writes ?period / from / to and keeps the page. */
export function PeriodPicker({ preset, from, to, label }: { preset: PeriodPreset; from: string; to: string; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  const go = (params: Record<string, string | null>) => {
    const sp = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    router.push(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={preset}
        onValueChange={(v) => (v === "custom" ? setOpen(true) : go({ period: v, from: null, to: null }))}
      >
        <SelectTrigger className="h-9 w-56 bg-card" aria-label="Περίοδος">
          <CalendarRange className="text-dg-red-500" />
          <SelectValue>{label}</SelectValue>
        </SelectTrigger>
        <SelectContent align="end">
          {(Object.keys(PERIOD_PRESETS) as PeriodPreset[]).map((p) => (
            <SelectItem key={p} value={p}>
              {PERIOD_PRESETS[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 bg-card text-xs">
            Ημερομηνίες…
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="pp-from" className="text-xs">Από</Label>
              <Input id="pp-from" type="date" value={f} max={t} onChange={(e) => setF(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pp-to" className="text-xs">Έως</Label>
              <Input id="pp-to" type="date" value={t} min={f} onChange={(e) => setT(e.target.value)} />
            </div>
          </div>
          <p className="text-2xs text-muted-foreground">Σύγκριση με τις ίδιες ημερομηνίες του προηγούμενου έτους.</p>
          <Button
            size="sm"
            className="w-full"
            disabled={!f || !t || f > t}
            onClick={() => {
              setOpen(false);
              go({ period: "custom", from: f, to: t });
            }}
          >
            Εφαρμογή
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
