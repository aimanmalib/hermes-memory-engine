/**
 * OpenAI Integration Adapter
 *
 * Provides:
 * - LLMProvider implementation for MemoryCompressor (using OpenAI chat completions)
 * - Tool schemas and handlers for memory operations (function calling)
 * - System prompt injection helpers with memory context
 *
 * Usage for compression:
 *   const adapter = new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY });
 *   const compressor = new MemoryCompressor(adapter);
 *
 * For tool calling in agents:
 *   adapter.getToolSchemas()  // returns OpenAI function schemas
 *   adapter.handleToolCall(name, args, store)
 */

import type { LLMProvider } from "../core/memory-compress.js";
import type { CreateMemoryInput } from "../core/types.js";
import type { MemoryStore } from "../core/memory-store.js";

export interface OpenAIAdapterConfig {
  apiKey: string;
  model?: string; // default gpt-4o-mini or similar
  baseURL?: string; // for proxies like 9router
}

export class OpenAIAdapter implements LLMProvider {
  private apiKey: string;
  private model: string;
  private baseURL: string;

  constructor(config: OpenAIAdapterConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || "gpt-4o-mini";
    this.baseURL = config.baseURL || "https://api.openai.com/v1";
  }

  /** LLMProvider.complete for use in MemoryCompressor */
  async complete(prompt: string): Promise<string> {
    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 1000,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error: ${res.status} ${err}`);
    }

    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content?.trim() || "";
  }

  /** Tool schemas for OpenAI function calling (memory ops) */
  getToolSchemas() {
    return [
      {
        type: "function",
        function: {
          name: "memory_add",
          description: "Add a new memory entry to the store",
          parameters: {
            type: "object",
            properties: {
              content: { type: "string", description: "The memory content/fact" },
              tags: { type: "array", items: { type: "string" }, description: "Optional tags" },
              agent: { type: "string", description: "Agent namespace" },
            },
            required: ["content"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "memory_search",
          description: "Search memories by query or tags",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              agent: { type: "string" },
              limit: { type: "number" },
            },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "memory_list",
          description: "List recent memories for an agent",
          parameters: {
            type: "object",
            properties: {
              agent: { type: "string" },
              limit: { type: "number" },
            },
          },
        },
      },
    ];
  }

  /** Handle a tool call from OpenAI (requires a MemoryStore) */
  async handleToolCall(
    name: string,
    args: any,
    store: MemoryStore
  ): Promise<any> {
    switch (name) {
      case "memory_add": {
        const input: CreateMemoryInput = {
          content: args.content,
          tags: args.tags || [],
          agent: args.agent || "default",
        };
        const mem = await store.create(input);
        return { success: true, id: mem.id, message: "Memory added" };
      }
      case "memory_search": {
        const results = await store.search({
          query: args.query,
          tags: args.tags,
          agent: args.agent,
          limit: args.limit || 10,
        });
        return { results: results.map((m) => ({ id: m.id, content: m.content, tags: m.tags })) };
      }
      case "memory_list": {
        const results = await store.search({
          agent: args.agent,
          limit: args.limit || 20,
        });
        return { memories: results };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /** Generate system prompt block with recent memories for injection */
  async getSystemPromptBlock(store: MemoryStore, agent?: string, limit = 5): Promise<string> {
    const memories = await store.search({ agent, limit });
    if (memories.length === 0) return "";

    const facts = memories
      .map((m) => `- ${m.content} [tags: ${m.tags.join(", ")}]`)
      .join("\n");

    return `## Relevant Memories (from hermes-memory-engine)\n${facts}\n\nUse these facts when answering.`;
  }
}

export function createOpenAIAdapter(config: OpenAIAdapterConfig) {
  return new OpenAIAdapter(config);
}
