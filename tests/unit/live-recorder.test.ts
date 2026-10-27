import { describe, expect, it } from "vitest";
import { candidatesFor, type ElementInfo } from "@/lib/recorder/describe";

const base: ElementInfo = { tag: "input", type: null, id: "afm", name: "afm", testId: null, role: "textbox", ariaLabel: null, label: "ΑΦΜ", placeholder: null, text: null, css: "#afm", required: false };

describe("live recorder locators", () => {
  it("ranks role/label before css for a labelled field", () => {
    expect(candidatesFor(base)).toEqual([
      { kind: "role", role: "textbox", name: "ΑΦΜ" },
      { kind: "label", value: "ΑΦΜ" },
      { kind: "css", value: 'input[name="afm"]' },
      { kind: "css", value: "#afm" },
    ]);
  });
  it("uses the text of a button and a data-testid first", () => {
    const btn: ElementInfo = { ...base, tag: "button", role: "button", label: null, text: "Αποθήκευση", name: null, id: null, css: "form > button", testId: "save" };
    expect(candidatesFor(btn).slice(0, 2)).toEqual([{ kind: "testId", value: "save" }, { kind: "role", role: "button", name: "Αποθήκευση" }]);
  });
});

describe("explainLoadError", () => {
  it("turns Chromium network errors into an actionable message", async () => {
    const { explainLoadError } = await import("@/lib/recorder/live");
    expect(explainLoadError("page.goto: net::ERR_NAME_NOT_RESOLVED at https://x").code).toBe("ERR_NAME_NOT_RESOLVED");
    expect(explainLoadError("page.goto: Timeout 30000ms exceeded.").message).toMatch(/ελληνικές διευθύνσεις/);
    expect(explainLoadError("net::ERR_CERT_AUTHORITY_INVALID").message).toMatch(/SSL/);
  });
});
