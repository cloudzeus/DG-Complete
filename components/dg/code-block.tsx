import { CopyButton } from "./copy-button";

// Code sample with copy. Server-rendered; only the copy button is client.
export function CodeBlock({ code, language, title }: { code: string; language?: string; title?: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border/70 bg-foreground text-background">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5">
        <span className="font-mono text-2xs tracking-wide text-white/60 uppercase">{title ?? language}</span>
        <div className="text-white/80 [&_button]:text-white/80 [&_button:hover]:bg-white/10 [&_button:hover]:text-white">
          <CopyButton value={code} />
        </div>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
