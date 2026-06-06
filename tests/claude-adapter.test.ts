/**
 * Tests for ClaudeAdapter (Phase 5.2)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ClaudeAdapter } from "../src/integrations/claude.js";
import { MemoryStore } from "../src/core/memory-store.js";
import { FileBackend } from "../src/core/file-backend.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";

describe("ClaudeAdapter", () => {
  let adapter: ClaudeAdapter;
  let tempDir: string;
  let store: MemoryStore;

  beforeEach(() => {
    tempDir = join(tmpdir(), `claude-adapter-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    adapter = new ClaudeAdapter({ apiKey: "sk-ant-test", baseURL: "http://localhost:9999" });
    const backend = new FileBackend(join(tempDir, "store"));
    store = new MemoryStore(backend);
    store.init();
  });

  afterEach(() => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it("implements LLMProvider.complete", () => {
    expect(typeof adapter.complete).toBe("function");
  });

  it("provides Anthropic-style tool schemas", () => {
    const schemas = adapter.getToolSchemas();
    expect(schemas.length).toBeGreaterThanOrEqual(3);
    expect(schemas.some((s: any) => s.name === "memory_add")).toBe(true);
  });

  it("getSystemPromptBlock works", async () => {
    await store.create({ content: "Claude loves clean code", agent: "test" });
    const block = await adapter.getSystemPromptBlock(store, "test");
    expect(block).toContain("Relevant Memories");
  });

  it("handleToolCall memory_search", async () => {
    await store.create({ content: "Searchable fact about Claude", agent: "test" });
    const result = await adapter.handleToolCall("memory_search", { query: "Claude", agent: "test" }, store);
    expect(result.results.length).toBeGreaterThan(0);
  });
});
