"use client";

import type { LucideIcon } from "lucide-react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type RowAction = {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Draw a separator above this item. */
  separated?: boolean;
  hidden?: boolean;
};

/** The "⋯" menu at the end of every data-table row. Dialogs it opens must live outside the menu. */
export function RowActions({ actions, label, disabled }: { actions: RowAction[]; label?: string; disabled?: boolean }) {
  const visible = actions.filter((a) => !a.hidden);
  if (visible.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Ενέργειες" disabled={disabled} className="data-[state=open]:bg-muted">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {label && (
          <>
            <DropdownMenuLabel className="truncate text-xs text-muted-foreground">{label}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        {visible.map((a) => (
          <div key={a.label}>
            {a.separated && <DropdownMenuSeparator />}
            <DropdownMenuItem
              variant={a.destructive ? "destructive" : "default"}
              disabled={a.disabled}
              onSelect={a.onSelect}
            >
              {a.icon && <a.icon />}
              {a.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
