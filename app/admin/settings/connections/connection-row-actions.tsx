"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Pencil, PlugZap, Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteConnection, testStoredConnection } from "./actions";
import { ConnectionDialog, type ConnectionFormValues } from "./connection-dialog";

export function ConnectionRowActions({
  values,
  tenants,
  allowedPurposes,
}: {
  values: ConnectionFormValues;
  tenants: { id: string; name: string }[];
  allowedPurposes: ("CUBE_WAREHOUSE" | "TENANT_SOURCE")[];
}) {
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  function test() {
    startTransition(async () => {
      const result = await testStoredConnection(values.id!);
      if (result.ok) toast.success(`Η σύνδεση πέτυχε (${result.latencyMs} ms)`);
      else toast.error("Η σύνδεση απέτυχε", { description: result.error });
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteConnection(values.id!);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      setConfirmDelete(false);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Ενέργειες" disabled={pending}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={test}>
            <PlugZap />
            Δοκιμή σύνδεσης
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil />
            Επεξεργασία
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 />
            Διαγραφή
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConnectionDialog
        tenants={tenants}
        allowedPurposes={allowedPurposes}
        values={values}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Διαγραφή σύνδεσης «{values.name}»;</AlertDialogTitle>
            <AlertDialogDescription>
              Τα κρυπτογραφημένα credentials θα διαγραφούν οριστικά. Η βάση δεδομένων δεν επηρεάζεται.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction onClick={remove} disabled={pending}>
              Διαγραφή
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
