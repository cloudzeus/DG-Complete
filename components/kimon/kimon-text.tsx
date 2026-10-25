import { Fragment, type ReactNode } from "react";

// The small subset of Markdown Κίμων writes (paragraphs, **bold**, lists, ### headings), rendered as
// React elements — never as HTML, so nothing in an answer can inject markup.

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

type Block = { kind: "p" | "h" | "ul" | "ol"; lines: string[] };

function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const last = out.at(-1);
    if (!line.trim()) out.push({ kind: "p", lines: [] });
    else if (heading) out.push({ kind: "h", lines: [heading[1]] });
    else if (bullet) {
      if (last?.kind === "ul") last.lines.push(bullet[1]);
      else out.push({ kind: "ul", lines: [bullet[1]] });
    } else if (numbered) {
      if (last?.kind === "ol") last.lines.push(numbered[1]);
      else out.push({ kind: "ol", lines: [numbered[1]] });
    }
    else if (last?.kind === "p") last.lines.push(line);
    else out.push({ kind: "p", lines: [line] });
  }
  return out.filter((b) => b.lines.length);
}

export function KimonText({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-foreground/90">
      {blocks(text).map((b, i) => {
        if (b.kind === "h") return <h4 key={i} className="pt-1 font-semibold text-foreground">{inline(b.lines[0])}</h4>;
        if (b.kind === "ul" || b.kind === "ol") {
          const List = b.kind === "ul" ? "ul" : "ol";
          return (
            <List key={i} className={b.kind === "ul" ? "list-disc space-y-1 pl-5" : "list-decimal space-y-1 pl-5"}>
              {b.lines.map((l, j) => (
                <li key={j}>{inline(l)}</li>
              ))}
            </List>
          );
        }
        return (
          <p key={i}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
