"use client";

import { useState, useTransition } from "react";
import { LayoutTemplate, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TEMPLATES, type TemplateKey } from "@/lib/pnl-templates";
import { applyPnlTemplate, rebuildPnl } from "./actions";

export function PnlToolbar({
  tenantId,
  recommended,
  current,
  hasLines,
  canEdit,
}: {
  tenantId: string;
  recommended: TemplateKey;
  current?: TemplateKey;
  hasLines: boolean;
  canEdit: boolean;
}) {
  const [template, setTemplate] = useState<TemplateKey>(current ?? recommended);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; message: string }>, loading: string) =>
    start(async () => {
      const id = toast.loading(loading);
      const r = await fn();
      toast.dismiss(id);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });

  const apply = () => run(() => applyPnlTemplate(tenantId, template), "Εφαρμογή προτύπου και υπολογισμός…");

  return (
    <>
      <Select value={template} onValueChange={(v) => setTemplate(v as TemplateKey)} disabled={!canEdit || pending}>
        <SelectTrigger size="sm" className="w-72">
          <SelectValue>{TEMPLATES[template].label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(TEMPLATES) as TemplateKey[]).map((k) => (
            <SelectItem key={k} value={k}>
              {TEMPLATES[k].label}
              {k === recommended ? " (προτείνεται)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" disabled={!canEdit || pending} onClick={() => (hasLines ? setConfirm(true) : apply())}>
        <LayoutTemplate />
        Εφαρμογή προτύπου
      </Button>
      <Button size="sm" disabled={!canEdit || pending || !hasLines} onClick={() => run(() => rebuildPnl(tenantId), "Υπολογισμός αποτελεσμάτων…")}>
        <RefreshCcw className={pending ? "animate-spin" : undefined} />
        Υπολογισμός
      </Button>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Αντικατάσταση της δομής;</AlertDialogTitle>
            <AlertDialogDescription>
              Οι τρέχουσες γραμμές και κανόνες του tenant θα αντικατασταθούν από το πρότυπο «{TEMPLATES[template].label}».
              Οι αλλαγές που έχετε κάνει θα χαθούν.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction onClick={apply}>Αντικατάσταση</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
