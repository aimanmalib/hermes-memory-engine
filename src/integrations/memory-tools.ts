import type { MemoryStore } from "../core/memory-store.js";
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

/**
 * The memory tools in Anthropic tool-use shape (`input_schema`). This is the
 * single source for the tool names and schemas shared by the Claude adapter
 * and the MCP server. Callers get a fresh copy, so mutating it is safe.
 */
export function memoryToolSchemas() {
  return [
    {
      name: "memory_add",
      description: "Add a new memory entry to the store",
      input_schema: {
        type: "object",
        properties: {
          content: { type: "string", description: "The memory content/fact" },
          tags: { type: "array", items: { type: "string" } },
          agent: { type: "string" },
        },
        required: ["content"],
      },
    },
    {
      name: "memory_search",
      description: "Search memories by query or tags",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          agent: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
    {
      name: "memory_list",
      description: "List recent memories",
      input_schema: {
        type: "object",
        properties: {
          agent: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  ];
}

/** Runs one memory tool against a store. Throws `Unknown tool` for other names. */
export async function runMemoryTool(
  name: string,
  args: MemoryToolArgs,
  store: MemoryStore
): Promise<MemoryToolResult> {
  switch (name) {
    case "memory_add": {
      const mem = await store.create({
        content: requireContent(args),
        tags: args.tags || [],
        agent: args.agent || "default",
      });
      return { success: true, id: mem.id };
    }
    case "memory_search": {
      const results = await store.search({
        query: args.query,
        tags: args.tags,
        agent: args.agent,
        limit: args.limit || 10,
      });
      return { results };
    }
    case "memory_list": {
      const results = await store.search({ agent: args.agent, limit: args.limit || 20 });
      return { memories: results };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
