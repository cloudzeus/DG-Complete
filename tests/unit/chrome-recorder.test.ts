import { describe, expect, it } from "vitest";
import { importChromeRecording, parseDefinition, toInputKey, validateForPublish } from "@/lib/dsl";

// Shape of a DevTools Recorder export (Chrome 120+).
const REC = {
  title: "Νέα καταχώριση",
  steps: [
    { type: "setViewport", width: 1280, height: 800 },
    { type: "navigate", url: "http://localhost:4100/login", assertedEvents: [{ type: "navigation", url: "http://localhost:4100/login" }] },
    { type: "click", selectors: [["aria/Όνομα χρήστη"], ["#username"], ["xpath///*[@id=\"username\"]"]] },
    { type: "change", value: "demo", selectors: [["aria/Όνομα χρήστη"], ["#username"]] },
    { type: "change", value: "demo1234", selectors: [["aria/Κωδικός"], ["#password"]] },
    { type: "click", selectors: [["aria/Είσοδος[role=\"button\"]"], ["button"]], assertedEvents: [{ type: "navigation" }] },
    { type: "change", value: "094014201", selectors: [["aria/ΑΦΜ"], ["#afm"]] },
    { type: "change", value: "Δοκιμή Α.Ε.", selectors: [["aria/Επωνυμία"], ["#name"]] },
    { type: "keyDown", key: "Enter" },
    { type: "keyUp", key: "Enter" },
    { type: "click", selectors: [["[data-testid=entry-id]"]] },
  ],
};

describe("Chrome Recorder import", () => {
  it("turns a recording into a valid definition with inputs and secrets", () => {
    const r = importChromeRecording(REC, { baseUrl: "http://localhost:4100" });
    expect(r.steps[0]).toMatchObject({ type: "navigate", url: "/login" });
    expect(r.steps.find((s) => s.value === "{{secrets.username}}")).toBeTruthy();
    expect(r.steps.find((s) => s.value === "{{secrets.password}}")).toBeTruthy();
    expect(JSON.stringify(r)).not.toContain("demo1234");
    expect(r.inputs.map((i) => i.key)).toEqual(["afm", "eponymia"]);
    expect(r.steps.find((s) => s.type === "click" && String(s.label).includes("Είσοδος"))).toMatchObject({ locator: { candidates: [{ kind: "role", role: "button", name: "Είσοδος" }, { kind: "css", value: "button" }] } });
    expect(r.steps.at(-1)).toMatchObject({ locator: { candidates: [{ kind: "testId", value: "entry-id" }] } });
    const def = { steps: r.steps, inputs: r.inputs.map((i) => ({ ...i, required: true })) };
    expect(parseDefinition(def).ok).toBe(true);
    expect(validateForPublish(def).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("makes latin input keys from Greek labels", () => {
    const taken = new Set<string>();
    expect(toInputKey("ΑΦΜ", taken)).toBe("afm");
    expect(toInputKey("Ημερομηνία έκδοσης", taken)).toBe("imerominiaEkdosis");
    expect(toInputKey("ΑΦΜ", taken)).toBe("afm2");
  });
});
