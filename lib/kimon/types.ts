// Κίμων — shapes shared by the server (agent, API) and the client (chat UI).

export type KimonFormat = "text" | "eur" | "int" | "num" | "pct" | "date";
export type KimonColumn = { key: string; label: string; format?: KimonFormat };

export type KimonTable = {
  type: "table";
  id: string;
  title: string;
  columns: KimonColumn[];
  rows: Record<string, string | number | null>[];
  /** The Cube query behind the table — the Excel export re-runs it for the full result. */
  query?: Record<string, unknown>;
  truncated?: boolean;
};

export type KimonChart = {
  type: "chart";
  id: string;
  title: string;
  kind: "bar" | "line" | "area" | "pie";
  x: string;
  xFormat?: KimonFormat;
  series: { key: string; label: string; format?: KimonFormat }[];
  rows: Record<string, string | number | null>[];
};

export type KimonLink = { type: "link"; id: string; label: string; href: string };

export type KimonArtifact = KimonTable | KimonChart | KimonLink;

/** Where the user is while asking: the dashboard page and its period. */
export type KimonContext = { page?: string; period?: string; from?: string; to?: string };

export type KimonMessageView = {
  id: string;
  role: "user" | "assistant";
  content: string;
  artifacts: KimonArtifact[];
  error?: string | null;
  createdAt: string;
};

/** Streamed by POST /api/kimon (NDJSON, one event per line). */
export type KimonEvent =
  | { type: "chat"; chatId: string; title: string }
  | { type: "status"; text: string }
  | { type: "artifact"; artifact: KimonArtifact }
  | { type: "answer"; message: KimonMessageView }
  | { type: "error"; error: string };
