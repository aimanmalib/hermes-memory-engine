import type { AgentId, MemoryEntry } from "../core/types.js";
import type { AgentConfig } from "./agent-registry.js";

/** Serialized agent context for prompt injection */
export interface SerializedContext {
  agent: {
    id: AgentId;
    name: string;
    description?: string;
  };
  memories: Array<{
    content: string;
    tags: string[];
    createdAt: string;
  }>;
  tokenEstimate: number;
}

/**
 * AgentContext — per-agent memory view with serialization and compression.
 *
 * Provides a filtered view of memories for a specific agent,
 * suitable for injection into LLM prompts.
 */
export class AgentContext {
  private config: AgentConfig;
  private memories: MemoryEntry[] = [];
  private maxTokens: number;

  constructor(config: AgentConfig, maxTokens = 4000) {
    this.config = config;
    this.maxTokens = maxTokens;
  }

  /** Load memories into the context */
  loadMemories(memories: MemoryEntry[]): void {
    this.memories = memories
      .filter(
        (m) =>
          m.agent === this.config.id ||
          (m.agent === "shared" && this.config.canAccessShared)
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  /** Get the most recent N memories */
  getRecent(limit = 10): MemoryEntry[] {
    return this.memories.slice(0, limit);
  }

  /** Get memories matching a tag */
  getByTag(tag: string): MemoryEntry[] {
    return this.memories.filter((m) => m.tags.includes(tag));
  }

  /** Serialize context for prompt injection */
  serialize(limit = 20): SerializedContext {
    const selected = this.memories.slice(0, limit);
    const content = selected.map((m) => m.content).join("\n");
    const tokenEstimate = Math.ceil(content.length / 4); // rough estimate

    return {
      agent: {
        id: this.config.id,
        name: this.config.name,
        description: this.config.description,
      },
      memories: selected.map((m) => ({
        content: m.content,
        tags: m.tags,
        createdAt: m.createdAt.toISOString(),
      })),
      tokenEstimate,
    };
  }

  /**
   * Compress context to fit within token limit.
   * Keeps most recent memories, drops oldest if over limit.
   */
  compress(): SerializedContext {
    const ctx = this.serialize();
    if (ctx.tokenEstimate <= this.maxTokens) return ctx;

    // Binary search for the right number of memories
    let low = 1;
    let high = ctx.memories.length;
    let best = ctx;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = this.serialize(mid);
      if (candidate.tokenEstimate <= this.maxTokens) {
        best = candidate;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return best;
  }

  /** Format as system prompt string */
  toSystemPrompt(): string {
    const ctx = this.compress();
    const lines = [
      `You are agent "${ctx.agent.name}" (${ctx.agent.id}).`,
      ctx.agent.description ? `Description: ${ctx.agent.description}` : "",
      "",
      "Your memories:",
      ...ctx.memories.map(
        (m, i) => `${i + 1}. ${m.content} [${m.tags.join(", ")}]`
      ),
      "",
      `(${ctx.memories.length} memories, ~${ctx.tokenEstimate} tokens)`,
    ].filter(Boolean);

    return lines.join("\n");
  }

  /** Get the number of loaded memories */
  get size(): number {
    return this.memories.length;
  }
}
