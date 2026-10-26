"use client";

import { useState, useTransition } from "react";
import { CloudDownload, Plus, Undo2 } from "lucide-react";
import { toast } from "@/components/dg/notice";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { StatusPill } from "@/components/admin/tone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addSuppression, importMailgunSuppressions, removeSuppression, type ActionResult } from "./actions";

export type SuppressionRow = { email: string; reason: string; source: string; template: string | null; tenant: string | null; createdAt: string };

const REASON = { unsubscribe: { label: "Διαγραφή", tone: "amber" }, complaint: { label: "Αναφορά spam", tone: "red" }, admin: { label: "Από διαχειριστή", tone: "slate" } } as const;
const SOURCE: Record<string, string> = { link: "Σύνδεσμος email", mailgun: "Mailgun", admin: "Χειροκίνητα" };
const notify = (r: ActionResult) => (r.ok ? toast.success(r.message) : toast.error(r.message));

export function Suppressions({ rows, templates }: { rows: SuppressionRow[]; templates: Record<string, string> }) {
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await addSuppression(email);
              notify(r);
              if (r.ok) setEmail("");
            });
          }}
        >
          <Input type="email" aria-label="Email για εξαίρεση" placeholder="email@εταιρεία.gr" value={email} onChange={(e) => setEmail(e.target.value)} className="max-w-xs" />
          <Button type="submit" variant="outline" disabled={pending || !email}>
            <Plus className="size-4" /> Εξαίρεση
          </Button>
        </form>
        <Button variant="outline" disabled={pending} onClick={() => start(async () => void notify(await importMailgunSuppressions()))}>
          <CloudDownload className="size-4" /> Εισαγωγή από Mailgun
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Κανείς δεν έχει ζητήσει να μη λαμβάνει υπενθυμίσεις.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b text-left">
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">Λόγος</th>
                <th className="py-2 pr-3 font-medium">Από</th>
                <th className="py-2 pr-3 font-medium">Πελάτης</th>
                <th className="py-2 pr-3 font-medium">Τελευταίο email</th>
                <th className="py-2 pr-3 font-medium">Πότε</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const reason = REASON[r.reason as keyof typeof REASON] ?? { label: r.reason, tone: "slate" as const };
                return (
                  <tr key={r.email} className="border-b last:border-0">
                    <td className="max-w-64 truncate py-2 pr-3 font-medium">{r.email}</td>
                    <td className="py-2 pr-3">
                      <StatusPill tone={reason.tone}>{reason.label}</StatusPill>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{SOURCE[r.source] ?? r.source}</td>
                    <td className="max-w-48 truncate py-2 pr-3">{r.tenant ?? "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.template ? (templates[r.template] ?? r.template) : "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{r.createdAt}</td>
                    <td className="py-2 text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" disabled={pending}>
                            <Undo2 className="size-4" /> Επανεγγραφή
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Επανεγγραφή του {r.email};</AlertDialogTitle>
                            <AlertDialogDescription>
                              Θα λαμβάνει ξανά υπενθυμίσεις και θα αφαιρεθεί και από τις λίστες του Mailgun. Κάντε το μόνο αν το έχει ζητήσει ο ίδιος.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
                            <AlertDialogAction onClick={() => start(async () => void notify(await removeSuppression(r.email)))}>Επανεγγραφή</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
