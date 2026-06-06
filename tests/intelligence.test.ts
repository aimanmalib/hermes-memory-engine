import { describe, it, expect } from "vitest";
import { MemoryCompressor } from "../src/core/memory-compress.js";
import { MemorySearch } from "../src/core/memory-search.js";
import { MemoryConsolidation } from "../src/core/memory-consolidation.js";
import type { MemoryEntry } from "../src/core/types.js";
import type { LLMProvider } from "../src/core/memory-compress.js";

function makeEntry(
  id: string,
  content: string,
  tags: string[] = [],
  agent = "test",
  daysAgo = 0
): MemoryEntry {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return {
    id,
    content,
    tags,
    agent,
    createdAt: d,
    updatedAt: d,
    metadata: {},
    relations: [],
  };
}

// Mock LLM that returns a fixed summary
const mockLLM: LLMProvider = {
  async complete(_prompt: string): Promise<string> {
    return "User prefers TypeScript, dark mode, and concise responses. They work on AI agent infrastructure.";
  },
};

describe("MemoryCompressor", () => {
  it("compresses multiple memories into one", async () => {
    const compressor = new MemoryCompressor(mockLLM);
    const memories = [
      makeEntry("1", "User prefers TypeScript"),
      makeEntry("2", "User likes dark mode"),
      makeEntry("3", "User wants concise responses"),
    ];

    const result = await compressor.compress(memories);

    expect(result.compressed.content).toContain("TypeScript");
    expect(result.compressed.agent).toBe("test");
    expect(result.compressed.metadata.originalCount).toBe(3);
    expect(result.original.length).toBe(3);
    expect(result.ratio).toBeLessThan(1.5); // roughly compressed
  });

  it("returns same memory for single input", async () => {
    const compressor = new MemoryCompressor(mockLLM);
    const memory = makeEntry("1", "Only memory");

    const result = await compressor.compress([memory]);

    expect(result.compressed.id).toBe("1");
    expect(result.ratio).toBe(1.0);
  });

  it("throws on empty input", async () => {
    const compressor = new MemoryCompressor(mockLLM);
    await expect(compressor.compress([])).rejects.toThrow("Cannot compress empty");
  });

  it("auto-compresses when threshold exceeded", async () => {
    const compressor = new MemoryCompressor(mockLLM);
    const memories = [
      makeEntry("1", "Old memory 1", [], "agent-a", 10),
      makeEntry("2", "Old memory 2", [], "agent-a", 9),
      makeEntry("3", "Old memory 3", [], "agent-a", 8),
      makeEntry("4", "Recent memory", [], "agent-a", 1),
      makeEntry("5", "Another recent", [], "agent-a", 0),
    ];

    const results = await compressor.autoCompress(memories, 2);
    expect(results.length).toBe(1);
    expect(results[0].original.length).toBe(3); // 5 - 2 = 3 to compress
  });

  it("estimates token count", () => {
    const compressor = new MemoryCompressor(mockLLM);
    const memories = [makeEntry("1", "a".repeat(100))];
    const tokens = compressor.estimateTokens(memories);
    expect(tokens).toBe(25); // 100 chars / 4
  });
});

describe("MemorySearch", () => {
  const search = new MemorySearch();
  const memories = [
    makeEntry("1", "User prefers TypeScript over JavaScript", ["coding"]),
    makeEntry("2", "User likes dark mode in all apps", ["ui"]),
    makeEntry("3", "TypeScript is better than JavaScript for large projects", ["coding"]),
    makeEntry("4", "User wants concise responses always", ["communication"]),
    makeEntry("5", "AI agents need persistent memory systems", ["ai", "memory"]),
  ];

  it("searches by query with relevance scoring", () => {
    const results = search.search(memories, { query: "typescript" });
    expect(results.length).toBe(2);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    expect(results[0].matchType).toBe("exact");
  });

  it("searches by tags", () => {
    const results = search.search(memories, { tags: ["coding"] });
    expect(results.length).toBe(2);
    expect(results.every((r) => r.entry.tags.includes("coding"))).toBe(true);
  });

  it("combines query and tag search", () => {
    const results = search.search(memories, {
      query: "typescript",
      tags: ["coding"],
    });
    expect(results.length).toBe(2);
    // Both should have high scores
    expect(results[0].score).toBeGreaterThan(5);
  });

  it("filters by agent", () => {
    const results = search.search(memories, { agent: "test" });
    expect(results.length).toBe(5); // all are "test" agent
  });

  it("handles empty query gracefully", () => {
    const results = search.search(memories, {});
    expect(results.length).toBe(5);
  });

  it("paginates results", () => {
    const page1 = search.search(memories, { limit: 2, offset: 0 });
    const page2 = search.search(memories, { limit: 2, offset: 2 });
    expect(page1.length).toBe(2);
    expect(page2.length).toBe(2);
    expect(page1[0].entry.id).not.toBe(page2[0].entry.id);
  });

  it("finds duplicates", () => {
    const dupes = [
      makeEntry("a", "User prefers TypeScript over JavaScript for coding"),
      makeEntry("b", "User prefers TypeScript over JavaScript for development"),
      makeEntry("c", "Completely different topic about cooking"),
    ];

    const pairs = search.findDuplicates(dupes, 0.5);
    expect(pairs.length).toBeGreaterThanOrEqual(1);
    expect(pairs[0][2]).toBeGreaterThanOrEqual(0.5);
  });
});

describe("MemoryConsolidation", () => {
  it("merges duplicate memories", async () => {
    const consolidation = new MemoryConsolidation();
    const memories = [
      makeEntry("1", "User prefers TypeScript over JavaScript", ["coding"]),
      makeEntry("2", "User prefers TypeScript over JavaScript for projects", ["coding"]),
      makeEntry("3", "Completely unrelated memory", ["other"]),
    ];

    const result = await consolidation.consolidate(memories);
    expect(result.merged.length).toBeGreaterThanOrEqual(1);
  });

  it("archives old memories", async () => {
    const consolidation = new MemoryConsolidation();
    const memories = [
      makeEntry("1", "Old memory", [], "test", 200),
      makeEntry("2", "Recent memory", [], "test", 1),
    ];

    const result = await consolidation.consolidate(memories, {
      maxAgeDays: 90,
    });
    expect(result.archived.length).toBe(1);
    expect(result.archived[0].id).toBe("1");
  });

  it("preserves memories with protected tags", async () => {
    const consolidation = new MemoryConsolidation();
    const memories = [
      makeEntry("1", "Important old memory", ["important"], "test", 200),
      makeEntry("2", "Regular old memory", ["regular"], "test", 200),
    ];

    const result = await consolidation.consolidate(memories, {
      maxAgeDays: 90,
      preserveTags: ["important"],
    });
    expect(result.archived.length).toBe(1);
    expect(result.archived[0].id).toBe("2");
  });

  it("enforces per-agent limits", async () => {
    const consolidation = new MemoryConsolidation();
    const memories = [
      makeEntry("1", "A", [], "agent-a", 5),
      makeEntry("2", "B", [], "agent-a", 3),
      makeEntry("3", "C", [], "agent-a", 1),
      makeEntry("4", "D", [], "agent-b", 1),
    ];

    const result = await consolidation.consolidate(memories, {
      maxAgeDays: 365,
      maxPerAgent: 2,
    });
    // agent-a has 3, limit is 2, so 1 should be archived
    expect(result.archived.length).toBe(1);
    expect(result.archived[0].agent).toBe("agent-a");
  });

  it("merges two memories manually", () => {
    const consolidation = new MemoryConsolidation();
    const a = makeEntry("1", "First part", ["tag1"]);
    const b = makeEntry("2", "Second part", ["tag2"]);

    const merged = consolidation.merge(a, b);
    expect(merged.content).toContain("First part");
    expect(merged.content).toContain("Second part");
    expect(merged.tags).toContain("tag1");
    expect(merged.tags).toContain("tag2");
  });
});
