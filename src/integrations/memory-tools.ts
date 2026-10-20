import type { AgentId, MemoryEntry, MemoryId } from "../core/types.js";

/**
 * Arguments an LLM may pass to the memory tools (`memory_add`,
 * `memory_search`, `memory_list`). Tool-call arguments arrive as parsed
 * JSON, so every field is optional and validated by the handler.
 */
export interface MemoryToolArgs {
  content?: string;
  tags?: string[];
  agent?: AgentId;
  query?: string;
  limit?: number;
}

/** Result returned by `handleToolCall` on the OpenAI and Claude adapters. */
export interface MemoryToolResult {
  /** `memory_add`: whether the memory was stored */
  success?: boolean;
  /** `memory_add`: ID of the new memory */
  id?: MemoryId;
  /** `memory_add`: human-readable status (OpenAI adapter) */
  message?: string;
  /** `memory_search`: matching memories */
  results?: Array<Pick<MemoryEntry, "id" | "content" | "tags">>;
  /** `memory_list`: recent memories */
  memories?: MemoryEntry[];
}

/** Throws when `memory_add` is called without usable content. */
export function requireContent(args: MemoryToolArgs): string {
  if (typeof args.content !== "string" || args.content.trim() === "") {
    throw new Error("memory_add requires a non-empty 'content' string");
  }
  return args.content;
}
