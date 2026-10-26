"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { FormState } from "@/lib/forms";
import { FormDialog } from "./form-dialog";

// «⋯» actions of a row or a page: links plus a destructive action confirmed in a modal (ADR-023).

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

export function RowActions({
  label,
  open,
  edit,
  destroy,
  align = "end",
}: {
  /** Accessible name, e.g. «Ενέργειες για Taxis». */
  label: string;
  open?: string;
  edit?: string;
  destroy?: { title: string; description: string; action: Action; submitLabel?: string };
  align?: "start" | "end";
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={label}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="min-w-44">
          {open && (
            <DropdownMenuItem asChild>
              <Link href={open}>
                <ExternalLink aria-hidden /> Άνοιγμα
              </Link>
            </DropdownMenuItem>
          )}
          {edit && (
            <DropdownMenuItem asChild>
              <Link href={edit}>
                <Pencil aria-hidden /> Επεξεργασία
              </Link>
            </DropdownMenuItem>
          )}
          {destroy && (
            <>
              {(open || edit) && <DropdownMenuSeparator />}
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
                <Trash2 aria-hidden /> Διαγραφή
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {destroy && (
        <FormDialog open={confirm} onOpenChange={setConfirm} title={destroy.title} description={destroy.description} action={destroy.action} destructive submitLabel={destroy.submitLabel ?? "Διαγραφή"} size="sm" />
      )}
    </>
  );
}
