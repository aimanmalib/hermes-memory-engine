import type { MemoryStore } from "../core/memory-store.js";
/**
 * Claude Integration Adapter
 *
 * Symmetric to OpenAIAdapter.
 * - Implements LLMProvider for MemoryCompressor
 * - Provides tool schemas for Anthropic tool use (memory ops)
 * - System prompt injection
 *
 * Note: Uses Anthropic Messages API (tools supported in newer models like Claude 3.5/Opus).
 */

import type { LLMProvider } from "../core/memory-compress.js";

export interface ClaudeAdapterConfig {
  apiKey: string;
  model?: string; // default claude-3-5-sonnet-20241022 or claude-3-opus
  baseURL?: string;
}

export class ClaudeAdapter implements LLMProvider {
  private apiKey: string;
  private model: string;
  private baseURL: string;

  constructor(config: ClaudeAdapterConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || "claude-3-5-sonnet-20241022";
    this.baseURL = config.baseURL || "https://api.anthropic.com/v1";
  }

  async complete(prompt: string): Promise<string> {
    const res = await fetch(`${this.baseURL}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1000,
        messages: [
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API error: ${res.status} ${err}`);
    }

    const data = await res.json() as any;
    const content = data.content?.[0];
    return (content?.text || "").trim();
  }

  getToolSchemas() {
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

  async handleToolCall(name: string, args: any, store: MemoryStore): Promise<any> {
    switch (name) {
      case "memory_add": {
        const mem = await store.create({
          content: args.content,
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

  async getSystemPromptBlock(store: MemoryStore, agent?: string, limit = 5): Promise<string> {
    const memories = await store.search({ agent, limit });
    if (memories.length === 0) return "";
    const facts = memories.map((m) => `- ${m.content}`).join("\n");
    return `## Relevant Memories\n${facts}\n\nReference these when relevant.`;
  }
}

export function createClaudeAdapter(config: ClaudeAdapterConfig) {
  return new ClaudeAdapter(config);
}
