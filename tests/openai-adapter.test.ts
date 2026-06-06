/**
 * Tests for OpenAIAdapter (Phase 5.2)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { OpenAIAdapter } from "../src/integrations/openai.js";
import { MemoryStore } from "../src/core/memory-store.js";
import { FileBackend } from "../src/core/file-backend.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";

describe("OpenAIAdapter", () => {
  let adapter: OpenAIAdapter;
  let tempDir: string;
  let store: MemoryStore;

  beforeEach(() => {
    tempDir = join(tmpdir(), `openai-adapter-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    adapter = new OpenAIAdapter({ apiKey: "sk-test-mock", baseURL: "http://localhost:9999" }); // mock URL
    const backend = new FileBackend(join(tempDir, "store"));
    store = new MemoryStore(backend);
    // @ts-ignore init sync for test
    store.init();
  });

  afterEach(() => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it("implements LLMProvider.complete (mocked)", async () => {
    // We can't call real API without key, so test the interface exists
    expect(typeof adapter.complete).toBe("function");
  });

  it("provides tool schemas for memory ops", () => {
    const schemas = adapter.getToolSchemas();
    expect(schemas.length).toBeGreaterThanOrEqual(3);
    expect(schemas.some((s: any) => s.function?.name === "memory_add")).toBe(true);
    expect(schemas.some((s: any) => s.function?.name === "memory_search")).toBe(true);
  });

  it("getSystemPromptBlock returns context from store", async () => {
    await store.create({ content: "User prefers TypeScript", agent: "test", tags: ["pref"] });
    const block = await adapter.getSystemPromptBlock(store, "test", 3);
    expect(block).toContain("Relevant Memories");
    expect(block).toContain("TypeScript");
  });

  it("handleToolCall can add memory (mock store)", async () => {
    const result = await adapter.handleToolCall("memory_add", {
      content: "Test fact from tool call",
      tags: ["tool"],
      agent: "test",
    }, store);

    expect(result.success).toBe(true);
    const all = await store.listAll();
    expect(all.some((m) => m.content.includes("Test fact"))).toBe(true);
  });
});
