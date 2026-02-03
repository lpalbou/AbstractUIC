export type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonValue[]
  | { [key: string]: JsonValue };

export type MemoryScope = 'run' | 'session' | 'global' | 'all';
export type RecallLevel = 'urgent' | 'standard' | 'deep';

export interface KgAssertion {
  subject: string;
  predicate: string;
  object: string;
  scope?: string;
  owner_id?: string;
  observed_at?: string;
  valid_from?: string | null;
  valid_until?: string | null;
  confidence?: number | null;
  provenance?: Record<string, JsonValue> | null;
  attributes?: Record<string, JsonValue> | null;
}

export interface KgQueryParams {
  run_id?: string;
  scope: MemoryScope;
  owner_id?: string;
  recall_level?: RecallLevel;
  query_text?: string;
  subject?: string;
  predicate?: string;
  object?: string;
  since?: string;
  until?: string;
  active_at?: string;
  min_score?: number;
  limit?: number;
  max_input_tokens?: number;
  model?: string;
}

export interface KgQueryResult {
  ok: boolean;
  count?: number;
  items?: KgAssertion[];
  effort?: JsonValue;
  warnings?: JsonValue;
  packets?: JsonValue[];
  packets_version?: number;
  packed_count?: number;
  active_memory_text?: string;
  dropped?: number;
  estimated_tokens?: number;
  raw?: JsonValue;
}
