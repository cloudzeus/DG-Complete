"use client";

import Link from "next/link";
import { Building2, Check, ChevronsUpDown, LogOut, Shield, UserRound } from "lucide-react";
import { signOutAction } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function TenantSwitcher({ current, tenants }: { current: { id: string; name: string }; tenants: { id: string; name: string }[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 max-w-56 gap-1.5 px-2 font-semibold">
          <Building2 aria-hidden className="size-4 text-muted-foreground" />
          <span className="truncate">{current.name}</span>
          <ChevronsUpDown aria-hidden className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="eyebrow">Οργανισμός</DropdownMenuLabel>
        {tenants.map((t) => (
          <DropdownMenuItem key={t.id} asChild>
            <Link href={`/t/${t.id}`} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{t.name}</span>
              {t.id === current.id && <Check aria-hidden className="size-4 text-sisyphus-600" />}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenu({ name, email, staff }: { name: string; email: string; staff: boolean }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 rounded-full" aria-label={`Λογαριασμός: ${name}`}>
          <span className="grid size-7 place-items-center rounded-full bg-sisyphus-500 text-2xs font-semibold text-white">{initials}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate font-semibold">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <UserRound aria-hidden /> Ο λογαριασμός μου
          </Link>
        </DropdownMenuItem>
        {staff && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <Shield aria-hidden /> Διαχείριση πλατφόρμας
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut aria-hidden /> Αποσύνδεση
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
