"use client";

import { useState, useTransition } from "react";
import { FileText, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { sendCustomerStatement, statementDraft } from "@/app/dashboards/[tenantId]/collections/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Customer statement: PDF preview and "send to the customer" (email with the PDF attached). */
export function StatementActions({ tenantId, trdr, name }: { tenantId: string; trdr: number | string; name?: string }) {
  const [open, setOpen] = useState(false);
  const [loading, startLoad] = useTransition();
  const [sending, startSend] = useTransition();
  const [draft, setDraft] = useState<{ to: string; subject: string; message: string; canSend: boolean } | null>(null);
  const [ai, setAi] = useState(true);
  const pdfUrl = `/api/smart/statement?tenant=${encodeURIComponent(tenantId)}&trdr=${encodeURIComponent(String(trdr))}`;

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" asChild>
        <a href={pdfUrl} target="_blank" rel="noopener">
          <FileText /> Καρτέλα PDF
        </a>
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={() =>
          startLoad(async () => {
            try {
              setDraft(await statementDraft(tenantId, Number(trdr)));
              setOpen(true);
            } catch (e) {
              toast.error((e as Error).message);
            }
          })
        }
      >
        {loading ? <Loader2 className="animate-spin" /> : <Mail />} Αποστολή στον πελάτη
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Αποστολή καρτέλας</DialogTitle>
            <DialogDescription>{name ? `${name} — ` : ""}η καρτέλα επισυνάπτεται ως PDF· οι απαντήσεις έρχονται στο δικό σας email.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              {!draft.canSend && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">Δεν έχετε δικαίωμα αποστολής — ζητήστε το από τον διαχειριστή.</p>}
              <div className="space-y-1">
                <Label htmlFor="st-to">Προς (έως 3, χωρισμένα με κόμμα)</Label>
                <Input id="st-to" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} placeholder="email@πελάτη.gr" />
                {!draft.to && <p className="text-2xs text-muted-foreground">Δεν υπάρχει email στην καρτέλα του πελάτη στο SoftOne.</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="st-subject">Θέμα</Label>
                <Input id="st-subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="st-msg">Μήνυμα</Label>
                <Textarea id="st-msg" rows={8} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={ai} onCheckedChange={(v) => setAi(v === true)} className="mt-0.5" />
                <span>
                  Σύντομο προσωπικό σημείωμα με AI στην αρχή της καρτέλας
                  <span className="block text-2xs text-muted-foreground">Χρησιμοποιεί AI tokens.</span>
                </span>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Άκυρο
            </Button>
            <Button
              disabled={!draft?.canSend || !draft.to || sending}
              onClick={() =>
                startSend(async () => {
                  if (!draft) return;
                  const r = await sendCustomerStatement(tenantId, Number(trdr), { to: draft.to, subject: draft.subject, message: draft.message, aiNote: ai });
                  if (r.ok) {
                    toast.success(r.message);
                    setOpen(false);
                  } else toast.error(r.message);
                })
              }
            >
              {sending ? <Loader2 className="animate-spin" /> : <Mail />} Αποστολή
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
