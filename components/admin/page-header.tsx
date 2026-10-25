import type { LucideIcon } from "lucide-react";
import { IconTile, type Tone } from "@/components/admin/tone";

export function PageHeader({
  title,
  description,
  actions,
  icon,
  tone = "blue",
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  eyebrow?: string;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {icon && <IconTile icon={icon} tone={tone} size="lg" />}
        <div className="min-w-0 space-y-0.5">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="max-w-2xl text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Card title row with a small coloured icon tile. */
export function SectionTitle({
  icon,
  tone = "blue",
  children,
  extra,
}: {
  icon: LucideIcon;
  tone?: Tone;
  children: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2.5">
      <IconTile icon={icon} tone={tone} size="sm" />
      <span>{children}</span>
      {extra}
    </span>
  );
}
