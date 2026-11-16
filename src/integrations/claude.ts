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
import {
  memoryToolSchemas,
  runMemoryTool,
  type MemoryToolArgs,
  type MemoryToolResult,
} from "./memory-tools.js";

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

    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    const content = data.content?.[0];
    return (content?.text || "").trim();
  }

  getToolSchemas() {
    return memoryToolSchemas();
  }

  async handleToolCall(
    name: string,
    args: MemoryToolArgs,
    store: MemoryStore
  ): Promise<MemoryToolResult> {
    return runMemoryTool(name, args, store);
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
