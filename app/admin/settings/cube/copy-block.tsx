"use client";

import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyBlock({ text, filename, maxHeight = "28rem" }: { text: string; filename: string; maxHeight?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Αντιγράφηκε" : "Αντιγραφή"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <Download />
          {filename}
        </Button>
      </div>
      <pre
        className="overflow-auto rounded-md border bg-muted/50 p-4 font-mono text-xs leading-relaxed"
        style={{ maxHeight }}
      >
        {text}
      </pre>
    </div>
  );
}
