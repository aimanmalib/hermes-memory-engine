import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SQLiteBackend } from "../src/core/sqlite-backend.js";
import { MemoryStore } from "../src/core/memory-store.js";

describe("SQLiteBackend", () => {
  let tmpDir: string;
  let store: MemoryStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "hme-sqlite-"));
    const dbPath = join(tmpDir, "test.db");
    const backend = new SQLiteBackend(dbPath);
    store = new MemoryStore(backend);
    await store.init();
  });

  afterEach(async () => {
    await store.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("creates and retrieves a memory", async () => {
    const mem = await store.create({
      content: "SQLite memory",
      tags: ["db"],
      agent: "agent-1",
    });

    const retrieved = await store.get(mem.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.content).toBe("SQLite memory");
    expect(retrieved!.tags).toEqual(["db"]);
  });

  it("updates a memory", async () => {
    const mem = await store.create({ content: "original" });
    await store.update(mem.id, { content: "updated" });

    const retrieved = await store.get(mem.id);
    expect(retrieved!.content).toBe("updated");
  });

  it("deletes a memory", async () => {
    const mem = await store.create({ content: "to delete" });
    expect(await store.delete(mem.id)).toBe(true);
    expect(await store.get(mem.id)).toBeNull();
  });

  it("searches by tags", async () => {
    await store.create({ content: "Tagged", tags: ["important"] });
    await store.create({ content: "Not tagged", tags: ["casual"] });

    const results = await store.search({ tags: ["important"] });
    expect(results.length).toBe(1);
    expect(results[0].content).toBe("Tagged");
  });

  it("searches by query", async () => {
    await store.create({ content: "TypeScript rocks" });
    await store.create({ content: "Python is ok" });

    const results = await store.search({ query: "typescript" });
    expect(results.length).toBe(1);
  });

  it("searches by agent", async () => {
    await store.create({ content: "A", agent: "x" });
    await store.create({ content: "B", agent: "y" });

    const results = await store.search({ agent: "x" });
    expect(results.length).toBe(1);
    expect(results[0].agent).toBe("x");
  });

  it("lists by agent", async () => {
    await store.create({ content: "A", agent: "alpha" });
    await store.create({ content: "B", agent: "alpha" });
    await store.create({ content: "C", agent: "beta" });

    const results = await store.listByAgent("alpha");
    expect(results.length).toBe(2);
  });

  it("handles pagination", async () => {
    for (let i = 0; i < 10; i++) {
      await store.create({ content: `Item ${i}`, tags: ["batch"] });
    }

    const page1 = await store.search({ tags: ["batch"], limit: 3, offset: 0 });
    const page2 = await store.search({ tags: ["batch"], limit: 3, offset: 3 });
    expect(page1.length).toBe(3);
    expect(page2.length).toBe(3);
  });

  it("stores and retrieves metadata", async () => {
    const mem = await store.create({
      content: "With metadata",
      metadata: { source: "test", priority: 42 },
    });

    const retrieved = await store.get(mem.id);
    expect(retrieved!.metadata.source).toBe("test");
    expect(retrieved!.metadata.priority).toBe(42);
  });

  it("stores and retrieves relations", async () => {
    const a = await store.create({ content: "A" });
    const b = await store.create({ content: "B" });

    await store.update(a.id, {
      relations: [{ targetId: b.id, type: "related_to" }],
    });

    const updated = await store.get(a.id);
    expect(updated!.relations.length).toBe(1);
    expect(updated!.relations[0].targetId).toBe(b.id);
    expect(updated!.relations[0].type).toBe("related_to");
  });
});
