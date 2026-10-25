import { forbidden } from "next/navigation";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { isPlatformStaff, requireUser } from "@/lib/rbac";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireUser();
  if (!isPlatformStaff(user)) forbidden();

  return (
    <SidebarProvider>
      <AppSidebar user={{ name: user.name, email: user.email, platformRole: user.platformRole }} />
      <SidebarInset className="dg-canvas min-h-svh min-w-0">
        <header className="dg-acrylic sticky top-0 z-20 flex h-11 items-center gap-2 border-b border-border/60 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <span className="text-xs font-medium text-muted-foreground">DG Complete · Διαχείριση πλατφόρμας</span>
          <span className="ml-auto hidden items-center gap-1.5 rounded-full bg-success-50 px-2 py-0.5 text-2xs font-semibold text-success-500 ring-1 ring-success-500/20 ring-inset sm:inline-flex">
            <span className="size-1.5 rounded-full bg-success-500" />
            {process.env.NODE_ENV === "production" ? "Production" : "Development"}
          </span>
        </header>
        <div className="mx-auto w-full max-w-7xl min-w-0 px-4 py-5 sm:px-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
