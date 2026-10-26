// Workflow definition schemas (docs/05 §1–§3). Lenient where the editor is still simpler than the
// spec: `normalizeDefinition` (normalize.ts) turns editor/legacy shapes into these before parsing.
import { z } from "zod";

export const LocatorCandidate = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("testId"), value: z.string().min(1), score: z.number().optional() }),
  z.object({ kind: z.literal("role"), role: z.string().min(1), name: z.string().optional(), exact: z.boolean().optional(), score: z.number().optional() }),
  z.object({ kind: z.literal("label"), value: z.string().min(1), exact: z.boolean().optional(), score: z.number().optional() }),
  z.object({ kind: z.literal("placeholder"), value: z.string().min(1), score: z.number().optional() }),
  z.object({ kind: z.literal("text"), value: z.string().min(1), exact: z.boolean().optional(), score: z.number().optional() }),
  z.object({ kind: z.literal("css"), value: z.string().min(1), score: z.number().optional() }),
  z.object({ kind: z.literal("xpath"), value: z.string().min(1), score: z.number().optional() }),
]);
export type LocatorCandidate = z.infer<typeof LocatorCandidate>;

export type Locator = { candidates: LocatorCandidate[]; frame: string[]; nth?: number | string; within?: Locator; description?: string };
export const Locator: z.ZodType<Locator> = z.lazy(() =>
  z.object({
    candidates: z.array(LocatorCandidate).min(1, "Το στοιχείο χρειάζεται τουλάχιστον έναν επιλογέα."),
    frame: z.array(z.string()).default([]),
    // A template ("{{lineIndex}}") selects the row of a repeated block (forEach).
    nth: z.union([z.number().int().min(0), z.string().min(1)]).optional(),
    within: Locator.optional(),
    description: z.string().optional(),
  }),
);

export const INPUT_TYPES = ["string", "number", "integer", "boolean", "date", "datetime", "enum", "array", "object", "file"] as const;

export type InputField = {
  key: string;
  label: string;
  type: (typeof INPUT_TYPES)[number];
  required: boolean;
  sensitive: boolean;
  pii: boolean;
  format?: string;
  pattern?: string;
  enum?: string[];
  min?: number;
  max?: number;
  items?: InputField;
  properties?: InputField[];
  example?: unknown;
  description?: string;
};
export const InputField: z.ZodType<InputField> = z.lazy(() =>
  z.object({
    key: z.string().regex(/^[a-z][a-zA-Z0-9_]*$/, "Κλειδί: λατινικά, ξεκινά με πεζό"),
    label: z.string(),
    type: z.enum(INPUT_TYPES),
    required: z.boolean().default(true),
    sensitive: z.boolean().default(false),
    pii: z.boolean().default(false),
    format: z.string().optional(),
    pattern: z.string().optional(),
    enum: z.array(z.string()).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    items: InputField.optional(),
    properties: z.array(InputField).optional(),
    example: z.unknown().optional(),
    description: z.string().optional(),
  }),
);

export const OutputField = z.object({ key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/), label: z.string().default(""), type: z.string().default("string") });
export type OutputField = z.infer<typeof OutputField>;

const base = {
  id: z.string().min(1),
  label: z.string().default(""),
  timeoutMs: z.number().int().positive().max(600_000).optional(),
  optional: z.boolean().optional(),
  retry: z.object({ attempts: z.number().int().min(1).max(5), delayMs: z.number().int().min(0).max(60_000) }).optional(),
  screenshot: z.enum(["always", "onError", "never"]).optional(),
  when: z.string().optional(),
  commitPoint: z.boolean().optional(),
};

const leaf = [
  z.object({ ...base, type: z.literal("navigate"), url: z.string().min(1, "Δώστε διεύθυνση.") }),
  z.object({ ...base, type: z.literal("click"), locator: Locator, button: z.enum(["left", "right", "middle"]).optional(), clickCount: z.number().int().min(1).max(3).optional(), waitForNavigation: z.boolean().optional() }),
  z.object({ ...base, type: z.literal("fill"), locator: Locator, value: z.string(), clear: z.boolean().default(true), typeDelayMs: z.number().int().min(0).max(1000).optional(), pressAfter: z.string().optional() }),
  z.object({ ...base, type: z.literal("select"), locator: Locator, by: z.enum(["value", "label"]).default("label"), value: z.string() }),
  z.object({ ...base, type: z.literal("check"), locator: Locator }),
  z.object({ ...base, type: z.literal("uncheck"), locator: Locator }),
  z.object({ ...base, type: z.literal("press"), locator: Locator.optional(), key: z.string().min(1) }),
  z.object({ ...base, type: z.literal("upload"), locator: Locator, file: z.string() }),
  z.object({
    ...base,
    type: z.literal("waitFor"),
    locator: Locator.optional(),
    state: z.enum(["visible", "hidden", "attached", "detached"]).default("visible"),
    url: z.string().optional(),
    loadState: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
    ms: z.number().int().min(0).max(10_000).optional(),
  }),
  z.object({
    ...base,
    type: z.literal("assert"),
    locator: Locator.optional(),
    check: z.enum(["visible", "hidden", "textEquals", "textContains", "valueEquals", "urlMatches", "count"]).default("visible"),
    expected: z.union([z.string(), z.number()]).optional(),
    errorMessage: z.string().optional(),
  }),
  z.object({
    ...base,
    type: z.literal("extract"),
    locator: Locator.optional(),
    from: z.enum(["text", "value", "attribute", "url"]).default("text"),
    attribute: z.string().optional(),
    regex: z.string().optional(),
    into: z.string().regex(/^(output|vars)\.[a-zA-Z][a-zA-Z0-9_]*$/, "Προορισμός: output.x ή vars.y"),
  }),
  z.object({
    ...base,
    type: z.literal("extractTable"),
    // The table (or list container). Rows: tbody tr (or tr after the header row).
    locator: Locator,
    // Columns by header text, never by position (docs/26); omitted = every column, keys from the headers.
    columns: z.array(z.object({ key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/), header: z.string() })).optional(),
    limit: z.number().int().min(1).max(5000).default(500),
    into: z.string().regex(/^(output|vars)\.[a-zA-Z][a-zA-Z0-9_]*$/, "Προορισμός: output.x ή vars.y"),
  }),
  z.object({ ...base, type: z.literal("setVar"), name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/), value: z.string() }),
  z.object({ ...base, type: z.literal("switchTab"), match: z.union([z.literal("opener"), z.object({ urlContains: z.string().optional(), index: z.number().int().min(0).optional() })]) }),
  z.object({ ...base, type: z.literal("dialog"), action: z.enum(["accept", "dismiss"]).default("accept"), promptText: z.string().optional() }),
  z.object({ ...base, type: z.literal("screenshot"), name: z.string().default("screenshot"), fullPage: z.boolean().optional() }),
  z.object({ ...base, type: z.literal("humanTask"), instructions: z.string(), timeoutSec: z.number().int().min(30).max(86_400).default(900) }),
  z.object({ ...base, type: z.literal("checkTargetErrors") }),
] as const;

export type Step = z.infer<(typeof leaf)[number]> | IfStep | ForEachStep;
export type IfStep = z.infer<typeof ifBase> & { then: Step[]; else: Step[] };
export type ForEachStep = z.infer<typeof forEachBase> & { steps: Step[] };

const ifBase = z.object({ ...base, type: z.literal("if"), condition: z.union([z.string(), z.object({ exists: Locator })]) });
const forEachBase = z.object({ ...base, type: z.literal("forEach"), items: z.string(), as: z.string().regex(/^[a-z][a-zA-Z0-9_]*$/).default("item"), maxIterations: z.number().int().min(1).max(1000).default(500) });

export const Step: z.ZodType<Step> = z.lazy(() =>
  z.discriminatedUnion("type", [
    ...leaf,
    ifBase.extend({ then: z.array(Step).default([]), else: z.array(Step).default([]) }),
    forEachBase.extend({ steps: z.array(Step).default([]) }),
  ]),
);

export const STEP_TYPES = [...leaf.map((s) => s.shape.type.value), "if", "forEach"] as const;

export const WorkflowDefinition = z.object({
  dslVersion: z.literal(1).default(1),
  name: z.string().default(""),
  description: z.string().optional(),
  targetSystemSlug: z.string().optional(),
  login: z
    .object({ mode: z.enum(["none", "workflow", "reuseSession"]).default("none"), workflowSlug: z.string().optional(), sessionCheck: Locator.optional() })
    .default({ mode: "none" }),
  inputs: z.array(InputField).default([]),
  outputs: z.array(OutputField).default([]),
  vars: z.record(z.string(), z.unknown()).default({}),
  settings: z
    .object({
      defaultTimeoutMs: z.number().int().positive().default(15_000),
      navigationTimeoutMs: z.number().int().positive().default(30_000),
      slowMoMs: z.number().int().min(0).max(5_000).default(0),
      locale: z.string().default("el-GR"),
      timezone: z.string().default("Europe/Athens"),
      viewport: z.object({ width: z.number().int(), height: z.number().int() }).default({ width: 1440, height: 900 }),
    })
    .prefault({}),
  steps: z.array(Step).min(1, "Η ροή δεν έχει βήματα."),
  onError: z.array(Step).default([]),
});
export type WorkflowDefinition = z.infer<typeof WorkflowDefinition>;
