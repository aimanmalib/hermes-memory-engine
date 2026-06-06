import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStore } from "../src/core/memory-store.js";
import type { StorageBackend, MemoryEntry, SearchOptions } from "../src/core/types.js";

/**
 * In-memory backend for testing — no filesystem or SQLite needed.
 */
class InMemoryBackend implements StorageBackend {
  private store = new Map<string, MemoryEntry>();

  async init(): Promise<void> {}
  async close(): Promise<void> {}

  async set(entry: MemoryEntry): Promise<void> {
    this.store.set(entry.id, { ...entry });
  }

  async get(id: string): Promise<MemoryEntry | null> {
    const entry = this.store.get(id);
    return entry ? { ...entry } : null;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async search(options: SearchOptions): Promise<MemoryEntry[]> {
    let results = Array.from(this.store.values());

    if (options.agent) {
      results = results.filter((e) => e.agent === options.agent);
    }
    if (options.tags && options.tags.length > 0) {
      results = results.filter((e) =>
        options.tags!.some((t) => e.tags.includes(t))
      );
    }
    if (options.query) {
      const q = options.query.toLowerCase();
      results = results.filter((e) => e.content.toLowerCase().includes(q));
    }
    if (options.from) {
      results = results.filter((e) => e.createdAt >= options.from!);
    }
    if (options.to) {
      results = results.filter((e) => e.createdAt <= options.to!);
    }

    const offset = options.offset ?? 0;
    const limit = options.limit ?? results.length;
    return results.slice(offset, offset + limit);
  }

  async listByAgent(agent: string): Promise<MemoryEntry[]> {
    return Array.from(this.store.values()).filter((e) => e.agent === agent);
  }

  async listAll(): Promise<MemoryEntry[]> {
    return Array.from(this.store.values());
  }
}

describe("MemoryStore", () => {
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore(new InMemoryBackend());
    await store.init();
  });

  it("creates and retrieves a memory", async () => {
    const mem = await store.create({
      content: "User prefers dark mode",
      tags: ["preferences"],
      agent: "test-agent",
    });

    expect(mem.id).toBeTruthy();
    expect(mem.content).toBe("User prefers dark mode");
    expect(mem.tags).toEqual(["preferences"]);
    expect(mem.agent).toBe("test-agent");

    const retrieved = await store.get(mem.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.content).toBe("User prefers dark mode");
  });

  it("returns null for non-existent ID", async () => {
    const result = await store.get("non-existent-id");
    expect(result).toBeNull();
  });

  it("updates a memory", async () => {
    const mem = await store.create({ content: "original" });
    const updated = await store.update(mem.id, { content: "updated" });

    expect(updated).not.toBeNull();
    expect(updated!.content).toBe("updated");
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(
      mem.updatedAt.getTime()
    );
  });

  it("returns null when updating non-existent memory", async () => {
    const result = await store.update("bad-id", { content: "nope" });
    expect(result).toBeNull();
  });

  it("deletes a memory", async () => {
    const mem = await store.create({ content: "to delete" });
    const deleted = await store.delete(mem.id);
    expect(deleted).toBe(true);

    const retrieved = await store.get(mem.id);
    expect(retrieved).toBeNull();
  });

  it("searches by tags", async () => {
    await store.create({ content: "A", tags: ["important"] });
    await store.create({ content: "B", tags: ["casual"] });
    await store.create({ content: "C", tags: ["important", "urgent"] });

    const results = await store.search({ tags: ["important"] });
    expect(results.length).toBe(2);
    expect(results.map((r) => r.content).sort()).toEqual(["A", "C"]);
  });

  it("searches by query text", async () => {
    await store.create({ content: "TypeScript is great" });
    await store.create({ content: "Python is also fine" });

    const results = await store.search({ query: "typescript" });
    expect(results.length).toBe(1);
    expect(results[0].content).toBe("TypeScript is great");
  });

  it("searches by agent", async () => {
    await store.create({ content: "A", agent: "agent-1" });
    await store.create({ content: "B", agent: "agent-2" });

    const results = await store.search({ agent: "agent-1" });
    expect(results.length).toBe(1);
    expect(results[0].agent).toBe("agent-1");
  });

  it("lists by agent", async () => {
    await store.create({ content: "X", agent: "alpha" });
    await store.create({ content: "Y", agent: "alpha" });
    await store.create({ content: "Z", agent: "beta" });

    const alpha = await store.listByAgent("alpha");
    expect(alpha.length).toBe(2);
  });

  it("lists all memories", async () => {
    await store.create({ content: "A" });
    await store.create({ content: "B" });
    await store.create({ content: "C" });

    const all = await store.listAll();
    expect(all.length).toBe(3);
  });

  it("searches with pagination", async () => {
    for (let i = 0; i < 10; i++) {
      await store.create({ content: `Memory ${i}`, tags: ["batch"] });
    }

    const page1 = await store.search({ tags: ["batch"], limit: 3, offset: 0 });
    const page2 = await store.search({ tags: ["batch"], limit: 3, offset: 3 });
    expect(page1.length).toBe(3);
    expect(page2.length).toBe(3);
    expect(page1[0].id).not.toBe(page2[0].id);
  });
});
