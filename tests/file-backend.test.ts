import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileBackend } from "../src/core/file-backend.js";
import { MemoryStore } from "../src/core/memory-store.js";

describe("FileBackend", () => {
  let tmpDir: string;
  let store: MemoryStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "hme-test-"));
    const backend = new FileBackend(tmpDir);
    store = new MemoryStore(backend);
    await store.init();
  });

  afterEach(async () => {
    await store.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("creates and retrieves a memory", async () => {
    const mem = await store.create({
      content: "Test memory",
      tags: ["test"],
      agent: "agent-1",
    });

    const retrieved = await store.get(mem.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.content).toBe("Test memory");
    expect(retrieved!.tags).toEqual(["test"]);
    expect(retrieved!.agent).toBe("agent-1");
  });

  it("persists to disk as .md with frontmatter", async () => {
    const mem = await store.create({
      content: "Persistent memory",
      tags: ["disk"],
      agent: "agent-a",
    });

    const { readFile } = await import("node:fs/promises");
    const filePath = join(tmpDir, "agent-a", `${mem.id}.md`);
    const raw = await readFile(filePath, "utf-8");

    expect(raw).toContain("Persistent memory");
    expect(raw).toContain("disk");
    expect(raw).toContain("agent-a");
  });

  it("updates a memory on disk", async () => {
    const mem = await store.create({ content: "original", agent: "x" });
    await store.update(mem.id, { content: "updated" });

    const retrieved = await store.get(mem.id);
    expect(retrieved!.content).toBe("updated");
  });

  it("deletes a memory from disk", async () => {
    const mem = await store.create({ content: "to delete", agent: "x" });
    expect(await store.delete(mem.id)).toBe(true);
    expect(await store.get(mem.id)).toBeNull();
  });

  it("lists memories by agent", async () => {
    await store.create({ content: "A1", agent: "alpha" });
    await store.create({ content: "A2", agent: "alpha" });
    await store.create({ content: "B1", agent: "beta" });

    const alpha = await store.listByAgent("alpha");
    expect(alpha.length).toBe(2);
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
});
