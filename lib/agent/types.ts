// Structured answer contract shared by the agent (server) and chat UI (client).

export type ColFormat = "inr" | "inr_short" | "pct" | "int" | "text" | "num";

export interface AnswerTable {
  id: string;
  title: string;
  columns: { key: string; label: string; format?: ColFormat }[];
  rows: Record<string, string | number | null>[];
  note?: string;
}

export interface AnswerChart {
  id: string;
  title: string;
  type: "bar" | "stacked_bar" | "line";
  table_id: string;
  x: string;
  series: { key: string; label: string }[];
  data: Record<string, string | number | null>[];
}

export interface MethodStep {
  tool: string;
  params: Record<string, unknown>;
  summary: string;
}

export interface OpenItemRef {
  id: string;
  key: string;
  kind: string;
  message: string;
  vendor: string | null;
}

export interface Answer {
  text: string;
  tables: AnswerTable[];
  charts: AnswerChart[];
  method: MethodStep[];
  included: string[];
  excluded: string[];
  caveats: string[];
  open_item_refs: OpenItemRef[];
  model: string | null;
  numbers_check: { ok: boolean; unverified: string[]; regenerated: boolean };
  error?: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}
