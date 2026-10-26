import { cn } from "@/lib/utils";
import { FieldError } from "./form-errors";

// Form fields — plain HTML controls, styled with DG tokens, server-rendered (ADR-023).
// Error messages come from the Server Action through <FieldError>.

const CONTROL =
  "w-full min-w-0 rounded-sm border border-input bg-card px-3 text-sm outline-none transition-colors duration-150 placeholder:text-muted-foreground/70 focus-visible:border-sisyphus-500 focus-visible:ring-2 focus-visible:ring-sisyphus-500/30 disabled:opacity-60";

type Base = { name: string; label: string; hint?: string; required?: boolean; className?: string };

export function Field({ name, label, hint, required, className, children }: Base & { children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={name} className="flex items-center gap-1 text-sm font-medium">
        {label}
        {required && (
          <span aria-hidden className="text-danger-500">
            *
          </span>
        )}
      </label>
      {children}
      {hint && (
        <p id={`${name}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      <FieldError name={name} />
    </div>
  );
}

export function TextField({
  type = "text",
  placeholder,
  defaultValue,
  autoComplete,
  inputMode,
  large,
  ...base
}: Base & { type?: string; placeholder?: string; defaultValue?: string | number; autoComplete?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; large?: boolean }) {
  return (
    <Field {...base}>
      <input
        id={base.name}
        name={base.name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        inputMode={inputMode}
        required={base.required}
        aria-describedby={`${base.name}-hint ${base.name}-error`}
        className={cn(CONTROL, large ? "h-11 text-base" : "h-9")}
      />
    </Field>
  );
}

export function FileField({ accept, ...base }: Base & { accept?: string }) {
  return (
    <Field {...base}>
      <input
        id={base.name}
        name={base.name}
        type="file"
        accept={accept}
        required={base.required}
        aria-describedby={`${base.name}-hint ${base.name}-error`}
        className={cn(CONTROL, "h-9 py-1.5 file:mr-3 file:rounded-xs file:border-0 file:bg-muted file:px-2 file:text-sm file:font-medium")}
      />
    </Field>
  );
}

export function TextareaField({ placeholder, defaultValue, rows = 4, mono, ...base }: Base & { placeholder?: string; defaultValue?: string; rows?: number; mono?: boolean }) {
  return (
    <Field {...base}>
      <textarea
        id={base.name}
        name={base.name}
        rows={rows}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required={base.required}
        aria-describedby={`${base.name}-hint ${base.name}-error`}
        className={cn(CONTROL, "py-2", mono && "font-mono text-xs")}
      />
    </Field>
  );
}

export function SelectField({ options, defaultValue, placeholder, ...base }: Base & { options: { value: string; label: string }[]; defaultValue?: string; placeholder?: string }) {
  return (
    <Field {...base}>
      <select
        id={base.name}
        name={base.name}
        defaultValue={defaultValue ?? ""}
        required={base.required}
        aria-describedby={`${base.name}-hint ${base.name}-error`}
        className={cn(CONTROL, "h-9 px-2")}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Group of checkboxes sharing one name → the action receives an array. */
export function CheckboxGroup({ options, defaultValues = [], columns = 1, ...base }: Base & { options: { value: string; label: string; hint?: string }[]; defaultValues?: string[]; columns?: 1 | 2 }) {
  return (
    <fieldset className={cn("space-y-1.5", base.className)}>
      <legend className="mb-1.5 flex items-center gap-1 text-sm font-medium">
        {base.label}
        {base.required && <span aria-hidden className="text-danger-500">*</span>}
      </legend>
      <div className={cn("grid gap-1.5", columns === 2 && "sm:grid-cols-2")}>
        {options.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-start gap-2 rounded-sm border border-border/70 px-3 py-2 text-sm transition-colors duration-150 hover:bg-muted/50 has-checked:border-sisyphus-300 has-checked:bg-sisyphus-50">
            <input type="checkbox" name={base.name} value={o.value} defaultChecked={defaultValues.includes(o.value)} className="mt-0.5 size-4 accent-sisyphus-500" />
            <span className="min-w-0">
              <span className="block">{o.label}</span>
              {o.hint && <span className="block text-xs text-muted-foreground">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
      {base.hint && <p className="text-xs text-muted-foreground">{base.hint}</p>}
      <FieldError name={base.name} />
    </fieldset>
  );
}

export function RadioCards({ options, defaultValue, ...base }: Base & { options: { value: string; label: string; hint?: string }[]; defaultValue?: string }) {
  return (
    <fieldset className={cn("space-y-1.5", base.className)}>
      <legend className="mb-1.5 text-sm font-medium">{base.label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/70 p-3 text-sm transition-colors duration-150 hover:bg-muted/50 has-checked:border-sisyphus-500 has-checked:bg-sisyphus-50">
            <input type="radio" name={base.name} value={o.value} defaultChecked={defaultValue === o.value} className="mt-0.5 size-4 accent-sisyphus-500" />
            <span>
              <span className="block font-medium">{o.label}</span>
              {o.hint && <span className="block text-xs text-muted-foreground">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
      <FieldError name={base.name} />
    </fieldset>
  );
}

export function SwitchField({ name, label, hint, defaultChecked }: { name: string; label: string; hint?: string; defaultChecked?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-border/70 p-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span
        aria-hidden
        className="relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full bg-muted-foreground/30 transition-colors duration-150 peer-checked:bg-sisyphus-500 peer-focus-visible:ring-2 peer-focus-visible:ring-sisyphus-500/40 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-card after:shadow-fluent-2 after:transition-transform after:duration-150 peer-checked:after:translate-x-4"
      />
    </label>
  );
}

export function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}

export function FormRow({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 *:min-w-0 sm:grid-cols-2">{children}</div>;
}
