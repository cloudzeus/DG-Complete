import { describe, expect, it } from "vitest";
import { resolveSoftOneIds } from "@/lib/softone-form";

describe("resolveSoftOneIds", () => {
  it("returns only the four ids, never the rest of the form (password)", () => {
    const input = { company: "10", branch: "1000", module: "0", refId: "502", username: "u", password: "secret", id: undefined };
    const r = resolveSoftOneIds(input, []);
    expect(r).toEqual({ ok: true, auto: false, ids: { company: "10", branch: "1000", module: "0", refId: "502" } });
  });
});
