"use client";

import { Eye, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { revealCubeEnv, rotateCubeSecrets } from "./actions";
import { CopyBlock } from "./copy-block";

export function EnvPanel() {
  const [env, setEnv] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reveal() {
    startTransition(async () => {
      const result = await revealCubeEnv();
      if (result.ok) setEnv(result.env);
      else toast.error(result.message);
    });
  }

  function rotate() {
    startTransition(async () => {
      const result = await rotateCubeSecrets();
      if (result.ok) {
        toast.success(result.message);
        setEnv(null);
      } else toast.error(result.message);
    });
  }

  return (
    <div className="space-y-3">
      {env ? (
        <CopyBlock text={env} filename="dgsmartbi-cube.env" maxHeight="16rem" />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={reveal} disabled={pending}>
            <Eye />
            Εμφάνιση environment variables
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={pending}>
                <RefreshCw />
                Νέα secrets
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Δημιουργία νέων secrets;</AlertDialogTitle>
                <AlertDialogDescription>
                  Το Cube θα σταματήσει να δέχεται αιτήματα της εφαρμογής μέχρι να ενημερωθούν τα environment
                  variables στο Coolify και να γίνει redeploy. Οι κωδικοί των ρόλων r_&lt;tenant&gt; αλλάζουν επίσης,
                  οπότε οι υπάρχοντες πελάτες πρέπει να ξαναγίνουν provision.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Άκυρο</AlertDialogCancel>
                <AlertDialogAction onClick={rotate}>Δημιουργία</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
