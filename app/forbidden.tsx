import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <ShieldAlert className="size-10 text-brand" />
      <h1 className="text-2xl font-semibold">Δεν έχετε πρόσβαση</h1>
      <p className="max-w-md text-muted-foreground">
        Ο λογαριασμός σας δεν έχει δικαίωμα για αυτή τη σελίδα. Αν πιστεύετε ότι είναι λάθος, επικοινωνήστε με τον
        διαχειριστή.
      </p>
      <Button asChild variant="outline">
        <Link href="/">Επιστροφή</Link>
      </Button>
    </main>
  );
}
