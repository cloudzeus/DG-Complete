"use client";

import { useMemo, useState, useTransition } from "react";
import { RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { renderEmail, sampleVars, TEMPLATES } from "@/lib/email-templates";
import { cn } from "@/lib/utils";
import { resetTemplate, saveTemplate, sendTestEmail } from "./actions";

// Edit a template (subject + body with {{variables}}) next to a live preview with sample data.

export type StoredTemplate = { key: string; subject: string; body: string; edited: boolean };

export function TemplatesEditor({ templates }: { templates: StoredTemplate[] }) {
  const [active, setActive] = useState(templates[0]?.key ?? "");
  const stored = templates.find((t) => t.key === active)!;
  const def = TEMPLATES.find((t) => t.key === active)!;
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>({});
  const discard = (key: string) =>
    setDrafts((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
  const draft = useMemo(() => drafts[active] ?? { subject: stored.subject, body: stored.body }, [drafts, active, stored]);
  const dirty = draft.subject !== stored.subject || draft.body !== stored.body;
  const [pending, start] = useTransition();
  const preview = useMemo(() => renderEmail(draft, sampleVars(def)), [draft, def]);

  const set = (patch: Partial<typeof draft>) => setDrafts((d) => ({ ...d, [active]: { ...draft, ...patch } }));
  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        after?.();
      } else toast.error(r.message);
    });

  return (
    <div className="grid gap-5 xl:grid-cols-[14rem_minmax(0,1fr)_minmax(0,1fr)]">
      <nav className="flex gap-1 overflow-x-auto xl:flex-col">
        {templates.map((t) => {
          const d = TEMPLATES.find((x) => x.key === t.key)!;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={cn(
                "min-h-11 shrink-0 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                active === t.key && "bg-sisyphus-50/70 font-medium text-sisyphus-700 dark:bg-white/5",
              )}
            >
              {d.name}
              {(t.edited || drafts[t.key]) && <span className="ml-1.5 text-2xs text-muted-foreground">{drafts[t.key] ? "• αλλαγές" : "επεξεργασμένο"}</span>}
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 space-y-4">
        <p className="text-sm text-muted-foreground">{def.description}</p>
        <div className="space-y-1.5">
          <Label htmlFor="tpl-subject">Θέμα</Label>
          <Input id="tpl-subject" value={draft.subject} onChange={(e) => set({ subject: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tpl-body">Κείμενο</Label>
          <Textarea id="tpl-body" value={draft.body} onChange={(e) => set({ body: e.target.value })} rows={16} className="font-mono text-xs leading-relaxed" />
          <p className="text-xs text-muted-foreground">
            Κενή γραμμή = νέα παράγραφος · **έντονα** · «- » στην αρχή = λίστα · [[Κείμενο κουμπιού|{"{{link}}"}]] = κουμπί.
          </p>
        </div>
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">Μεταβλητές (κλικ για προσθήκη)</div>
          <div className="flex flex-wrap gap-1.5">
            {def.vars.map((v) => (
              <button key={v.key} type="button" onClick={() => set({ body: `${draft.body}{{${v.key}}}` })} title={`π.χ. ${v.sample}`}>
                <Badge variant="outline" className="cursor-pointer font-mono text-2xs hover:bg-muted">
                  {`{{${v.key}}}`} · {v.label}
                </Badge>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {stored.edited && (
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => resetTemplate(active), () => discard(active))}>
              <RotateCcw className="size-3.5" /> Αρχικό κείμενο
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => sendTestEmail(active, dirty ? draft : undefined))}>
            <Send className="size-3.5" /> Δοκιμαστικό σε εμένα
          </Button>
          <Button type="button" size="sm" disabled={pending || !dirty} onClick={() => run(() => saveTemplate(active, draft.subject, draft.body), () => discard(active))}>
            Αποθήκευση
          </Button>
        </div>
      </div>

      <div className="min-w-0 space-y-2">
        <div className="text-xs text-muted-foreground">
          Προεπισκόπηση με δείγμα · Θέμα: <span className="font-medium text-foreground">{preview.subject}</span>
        </div>
        <iframe title="Προεπισκόπηση email" srcDoc={preview.html} sandbox="" className="h-[36rem] w-full rounded-lg border bg-[#f5f3f0]" />
      </div>
    </div>
  );
}
