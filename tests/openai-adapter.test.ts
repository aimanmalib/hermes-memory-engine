/**
 * Tests for OpenAIAdapter (Phase 5.2) + expanded coverage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { OpenAIAdapter, createOpenAIAdapter } from "../src/integrations/openai.js";
import { MemoryStore } from "../src/core/memory-store.js";
import { FileBackend } from "../src/core/file-backend.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("OpenAIAdapter", () => {
  let adapter: OpenAIAdapter;
  let tempDir: string;
  let store: MemoryStore;

  beforeEach(async () => {
    mockFetch.mockReset();
    tempDir = join(tmpdir(), `openai-adapter-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    adapter = new OpenAIAdapter({ apiKey: "sk-test-mock", baseURL: "http://localhost:9999" });
    const backend = new FileBackend(join(tempDir, "store"));
    store = new MemoryStore(backend);
    await store.init();
  });

  afterEach(() => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it("implements LLMProvider.complete (mocked)", async () => {
    expect(typeof adapter.complete).toBe("function");
  });

  it("complete calls fetch and returns response content", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "  Summarized result  " } }],
      }),
    });

    const result = await adapter.complete("Summarize this");
    expect(result).toBe("Summarized result");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:9999/chat/completions",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("complete throws on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "Rate limited",
    });

    await expect(adapter.complete("test")).rejects.toThrow("OpenAI API error: 429");
  });

  it("complete returns empty string when no content", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [] }),
    });

    const result = await adapter.complete("test");
    expect(result).toBe("");
  });

  it("provides tool schemas for memory ops", () => {
    const schemas = adapter.getToolSchemas();
    expect(schemas.length).toBe(3);
    expect(schemas.some((s: any) => s.function?.name === "memory_add")).toBe(true);
    expect(schemas.some((s: any) => s.function?.name === "memory_search")).toBe(true);
    expect(schemas.some((s: any) => s.function?.name === "memory_list")).toBe(true);
  });

  it("getSystemPromptBlock returns context from store", async () => {
    await store.create({ content: "User prefers TypeScript", agent: "test", tags: ["pref"] });
    const block = await adapter.getSystemPromptBlock(store, "test", 3);
    expect(block).toContain("Relevant Memories");
    expect(block).toContain("TypeScript");
  });

  it("getSystemPromptBlock returns empty string when no memories", async () => {
    const block = await adapter.getSystemPromptBlock(store, "nonexistent");
    expect(block).toBe("");
  });

  it("handleToolCall can add memory (mock store)", async () => {
    const result = await adapter.handleToolCall("memory_add", {
      content: "Test fact from tool call",
      tags: ["tool"],
      agent: "test",
    }, store);

    expect(result.success).toBe(true);
    expect(result.id).toBeDefined();
    const all = await store.listAll();
    expect(all.some((m) => m.content.includes("Test fact"))).toBe(true);
  });

  it("handleToolCall memory_add with defaults", async () => {
    const result = await adapter.handleToolCall("memory_add", {
      content: "Minimal memory",
    }, store);
    expect(result.success).toBe(true);
  });

  it("handleToolCall memory_search returns results", async () => {
    await store.create({ content: "TypeScript is great", agent: "test", tags: ["code"] });
    await store.create({ content: "Python is also great", agent: "test", tags: ["code"] });

    const result = await adapter.handleToolCall("memory_search", {
      query: "typescript",
      agent: "test",
    }, store);

    expect(result.results).toBeDefined();
    expect(result.results.length).toBe(1);
    expect(result.results[0].content).toContain("TypeScript");
  });

  it("handleToolCall memory_list returns memories", async () => {
    await store.create({ content: "Memory one", agent: "test", tags: [] });
    await store.create({ content: "Memory two", agent: "test", tags: [] });

    const result = await adapter.handleToolCall("memory_list", {
      agent: "test",
      limit: 10,
    }, store);

    expect(result.memories).toBeDefined();
    expect(result.memories.length).toBe(2);
  });

  it("handleToolCall throws on unknown tool", async () => {
    await expect(adapter.handleToolCall("unknown_tool", {}, store)).rejects.toThrow(
      "Unknown tool: unknown_tool"
    );
  });

  it("uses custom model when specified", () => {
    const custom = new OpenAIAdapter({ apiKey: "sk-test", model: "gpt-4o" });
    // Just verify it constructs without error
    expect(custom).toBeDefined();
  });

  it("createOpenAIAdapter factory works", () => {
    const created = createOpenAIAdapter({ apiKey: "sk-test" });
    expect(created).toBeInstanceOf(OpenAIAdapter);
  });
});
