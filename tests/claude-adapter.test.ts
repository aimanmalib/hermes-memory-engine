/**
 * Tests for ClaudeAdapter (Phase 5.2) + expanded coverage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ClaudeAdapter, createClaudeAdapter } from "../src/integrations/claude.js";
import { MemoryStore } from "../src/core/memory-store.js";
import { FileBackend } from "../src/core/file-backend.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("ClaudeAdapter", () => {
  let adapter: ClaudeAdapter;
  let tempDir: string;
  let store: MemoryStore;

  beforeEach(async () => {
    mockFetch.mockReset();
    tempDir = join(tmpdir(), `claude-adapter-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    adapter = new ClaudeAdapter({ apiKey: "sk-ant-test", baseURL: "http://localhost:9999" });
    const backend = new FileBackend(join(tempDir, "store"));
    store = new MemoryStore(backend);
    await store.init();
  });

  afterEach(() => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it("implements LLMProvider.complete", () => {
    expect(typeof adapter.complete).toBe("function");
  });

  it("complete calls fetch and returns response content", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: "  Summarized by Claude  " }],
      }),
    });

    const result = await adapter.complete("Summarize this");
    expect(result).toBe("Summarized by Claude");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:9999/messages",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("complete throws on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    await expect(adapter.complete("test")).rejects.toThrow("Claude API error: 401");
  });

  it("complete returns empty string when no content", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [] }),
    });

    const result = await adapter.complete("test");
    expect(result).toBe("");
  });

  it("provides Anthropic-style tool schemas", () => {
    const schemas = adapter.getToolSchemas();
    expect(schemas.length).toBe(3);
    expect(schemas.some((s: any) => s.name === "memory_add")).toBe(true);
    expect(schemas.some((s: any) => s.name === "memory_search")).toBe(true);
    expect(schemas.some((s: any) => s.name === "memory_list")).toBe(true);
    // Anthropic uses input_schema, not function.parameters
    expect(schemas[0].input_schema).toBeDefined();
  });

  it("getSystemPromptBlock works", async () => {
    await store.create({ content: "Claude loves clean code", agent: "test" });
    const block = await adapter.getSystemPromptBlock(store, "test");
    expect(block).toContain("Relevant Memories");
    expect(block).toContain("Claude loves clean code");
  });

  it("getSystemPromptBlock returns empty string when no memories", async () => {
    const block = await adapter.getSystemPromptBlock(store, "nonexistent");
    expect(block).toBe("");
  });

  it("handleToolCall memory_add", async () => {
    const result = await adapter.handleToolCall("memory_add", {
      content: "Test fact via Claude",
      tags: ["test"],
      agent: "test",
    }, store);
    expect(result.success).toBe(true);
    expect(result.id).toBeDefined();
  });

  it("handleToolCall memory_add with defaults", async () => {
    const result = await adapter.handleToolCall("memory_add", {
      content: "Minimal",
    }, store);
    expect(result.success).toBe(true);
  });

  it("handleToolCall memory_search", async () => {
    await store.create({ content: "Searchable fact about Claude", agent: "test" });
    const result = await adapter.handleToolCall("memory_search", { query: "Claude", agent: "test" }, store);
    expect(result.results.length).toBeGreaterThan(0);
  });

  it("handleToolCall memory_list", async () => {
    await store.create({ content: "Memory one", agent: "test" });
    await store.create({ content: "Memory two", agent: "test" });
    const result = await adapter.handleToolCall("memory_list", { agent: "test" }, store);
    expect(result.memories.length).toBe(2);
  });

  it("handleToolCall throws on unknown tool", async () => {
    await expect(adapter.handleToolCall("unknown_tool", {}, store)).rejects.toThrow(
      "Unknown tool: unknown_tool"
    );
  });

  it("createClaudeAdapter factory works", () => {
    const created = createClaudeAdapter({ apiKey: "sk-ant-test" });
    expect(created).toBeInstanceOf(ClaudeAdapter);
  });
});
