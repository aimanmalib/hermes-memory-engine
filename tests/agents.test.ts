import { describe, it, expect, beforeEach } from "vitest";
import { AgentRegistry } from "../src/agents/agent-registry.js";
import { AgentContext } from "../src/agents/agent-context.js";
import { SharedMemory } from "../src/agents/shared-memory.js";
import { MemoryStore } from "../src/core/memory-store.js";
import type { AgentConfig } from "../src/agents/agent-registry.js";
import type { StorageBackend, MemoryEntry, SearchOptions } from "../src/core/types.js";

class InMemoryBackend implements StorageBackend {
  private store = new Map<string, MemoryEntry>();
  async init(): Promise<void> {}
  async close(): Promise<void> {}
  async set(entry: MemoryEntry): Promise<void> { this.store.set(entry.id, { ...entry }); }
  async get(id: string): Promise<MemoryEntry | null> { return this.store.get(id) ? { ...this.store.get(id)! } : null; }
  async delete(id: string): Promise<boolean> { return this.store.delete(id); }
  async search(options: SearchOptions): Promise<MemoryEntry[]> {
    let results = Array.from(this.store.values());
    if (options.agent) results = results.filter(e => e.agent === options.agent);
    if (options.tags?.length) results = results.filter(e => options.tags!.some(t => e.tags.includes(t)));
    if (options.query) { const q = options.query.toLowerCase(); results = results.filter(e => e.content.toLowerCase().includes(q)); }
    const offset = options.offset ?? 0;
    return results.slice(offset, offset + (options.limit ?? results.length));
  }
  async listByAgent(agent: string): Promise<MemoryEntry[]> { return Array.from(this.store.values()).filter(e => e.agent === agent); }
  async listAll(): Promise<MemoryEntry[]> { return Array.from(this.store.values()); }
}

describe("AgentRegistry", () => {
  let registry: AgentRegistry;

  beforeEach(async () => {
    registry = new AgentRegistry(new InMemoryBackend());
    await registry.init();
  });

  const agentA: AgentConfig = { id: "agent-a", name: "Agent A", canAccessShared: true, canWriteShared: true };
  const agentB: AgentConfig = { id: "agent-b", name: "Agent B", canAccessShared: true, canWriteShared: false };

  it("registers and retrieves agents", async () => {
    await registry.register(agentA);
    expect(registry.has("agent-a")).toBe(true);
    expect(registry.size).toBe(1);
  });

  it("throws on duplicate registration", async () => {
    await registry.register(agentA);
    await expect(registry.register(agentA)).rejects.toThrow("already registered");
  });

  it("unregisters an agent", async () => {
    await registry.register(agentA);
    registry.unregister("agent-a");
    expect(registry.has("agent-a")).toBe(false);
  });

  it("lists all agents", async () => {
    await registry.register(agentA);
    await registry.register(agentB);
    const list = registry.list();
    expect(list.length).toBe(2);
  });

  it("writes and reads shared memories", async () => {
    await registry.register(agentA);
    const shared = await registry.writeShared("shared knowledge", ["shared"]);
    expect(shared.agent).toBe("shared");

    const memories = await registry.readShared(["shared"]);
    expect(memories.length).toBe(1);
    expect(memories[0].content).toBe("shared knowledge");
  });
});

describe("AgentContext", () => {
  const config: AgentConfig = { id: "ctx-agent", name: "Context Agent", canAccessShared: true, canWriteShared: true };

  it("loads and filters memories", () => {
    const ctx = new AgentContext(config);
    const now = new Date();
    ctx.loadMemories([
      { id: "1", content: "mine", tags: [], agent: "ctx-agent", createdAt: now, updatedAt: now, metadata: {}, relations: [] },
      { id: "2", content: "other", tags: [], agent: "other", createdAt: now, updatedAt: now, metadata: {}, relations: [] },
      { id: "3", content: "shared", tags: [], agent: "shared", createdAt: now, updatedAt: now, metadata: {}, relations: [] },
    ]);
    expect(ctx.size).toBe(2); // own + shared (has canAccessShared)
  });

  it("serializes for prompt injection", () => {
    const ctx = new AgentContext(config);
    const now = new Date();
    ctx.loadMemories([
      { id: "1", content: "remember this", tags: ["important"], agent: "ctx-agent", createdAt: now, updatedAt: now, metadata: {}, relations: [] },
    ]);
    const serialized = ctx.serialize();
    expect(serialized.agent.id).toBe("ctx-agent");
    expect(serialized.memories.length).toBe(1);
    expect(serialized.memories[0].content).toBe("remember this");
  });

  it("generates system prompt", () => {
    const ctx = new AgentContext(config);
    const now = new Date();
    ctx.loadMemories([
      { id: "1", content: "user likes dark mode", tags: ["prefs"], agent: "ctx-agent", createdAt: now, updatedAt: now, metadata: {}, relations: [] },
    ]);
    const prompt = ctx.toSystemPrompt();
    expect(prompt).toContain("Context Agent");
    expect(prompt).toContain("user likes dark mode");
  });
});

describe("SharedMemory", () => {
  let shared: SharedMemory;
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore(new InMemoryBackend());
    await store.init();
    shared = new SharedMemory(store);
  });

  it("grants and checks permissions", () => {
    shared.grant("agent-1", "read");
    expect(shared.hasPermission("agent-1", "read")).toBe(true);
    expect(shared.hasPermission("agent-1", "write")).toBe(false);
  });

  it("admin implies write implies read", () => {
    shared.grant("agent-1", "admin");
    expect(shared.hasPermission("agent-1", "read")).toBe(true);
    expect(shared.hasPermission("agent-1", "write")).toBe(true);
    expect(shared.hasPermission("agent-1", "admin")).toBe(true);
  });

  it("blocks unauthorized writes", async () => {
    shared.grant("agent-1", "read");
    await expect(shared.write("agent-1", "test")).rejects.toThrow("does not have write permission");
  });

  it("allows authorized writes", async () => {
    shared.grant("agent-1", "write");
    const mem = await shared.write("agent-1", "shared knowledge");
    expect(mem.agent).toBe("shared");
    expect(mem.metadata.writtenBy).toBe("agent-1");
  });

  it("blocks unauthorized deletes", async () => {
    shared.grant("agent-1", "write");
    const mem = await shared.write("agent-1", "to delete");
    await expect(shared.delete("agent-1", mem.id)).rejects.toThrow("admin");
  });

  it("allows admin deletes", async () => {
    shared.grant("agent-1", "admin");
    const mem = await shared.write("agent-1", "to delete");
    expect(await shared.delete("agent-1", mem.id)).toBe(true);
  });

  it("lists permissions", () => {
    shared.grant("a", "read");
    shared.grant("b", "write");
    const perms = shared.listPermissions();
    expect(perms.length).toBe(2);
  });

  it("revokes permissions", () => {
    shared.grant("agent-1", "write");
    expect(shared.hasPermission("agent-1", "write")).toBe(true);
    shared.revoke("agent-1");
    expect(shared.hasPermission("agent-1", "write")).toBe(false);
  });

  it("returns false for unknown agent permission check", () => {
    expect(shared.hasPermission("unknown", "read")).toBe(false);
  });

  it("reads shared memories with permission", async () => {
    shared.grant("agent-1", "read");
    await store.create({ content: "shared fact", tags: ["shared"], agent: "shared" });
    const results = await shared.read("agent-1");
    expect(results.length).toBe(1);
    expect(results[0].content).toBe("shared fact");
  });

  it("blocks unauthorized reads", async () => {
    await expect(shared.read("agent-1")).rejects.toThrow("does not have read permission");
  });

  it("reads shared memories with query filter", async () => {
    shared.grant("agent-1", "read");
    await store.create({ content: "typescript is great", tags: ["code"], agent: "shared" });
    await store.create({ content: "python is also great", tags: ["code"], agent: "shared" });
    const results = await shared.read("agent-1", "typescript");
    expect(results.length).toBe(1);
  });

  it("updates shared memories with write permission", async () => {
    shared.grant("agent-1", "write");
    const mem = await shared.write("agent-1", "original content");
    const updated = await shared.update("agent-1", mem.id, "updated content");
    expect(updated).not.toBeNull();
    expect(updated!.content).toBe("updated content");
    expect(updated!.metadata.updatedBy).toBe("agent-1");
  });

  it("blocks unauthorized updates", async () => {
    shared.grant("agent-1", "read");
    await expect(shared.update("agent-1", "fake-id", "new content")).rejects.toThrow(
      "does not have write permission"
    );
  });

  it("links two shared memories", async () => {
    shared.grant("agent-1", "write");
    const mem1 = await shared.write("agent-1", "memory one");
    const mem2 = await shared.write("agent-1", "memory two");
    await shared.link("agent-1", mem1.id, mem2.id, "related_to");

    const retrieved = await store.get(mem1.id);
    expect(retrieved!.relations).toHaveLength(1);
    expect(retrieved!.relations[0].targetId).toBe(mem2.id);
    expect(retrieved!.relations[0].type).toBe("related_to");
  });

  it("blocks unauthorized links", async () => {
    shared.grant("agent-1", "read");
    await expect(shared.link("agent-1", "a", "b", "related_to")).rejects.toThrow(
      "does not have write permission"
    );
  });

  it("link throws when source memory not found", async () => {
    shared.grant("agent-1", "write");
    await expect(shared.link("agent-1", "nonexistent", "also-fake", "related_to")).rejects.toThrow(
      "not found"
    );
  });

  it("write with tags and metadata", async () => {
    shared.grant("agent-1", "write");
    const mem = await shared.write("agent-1", "tagged memory", ["important", "shared"], { source: "test" });
    expect(mem.tags).toContain("important");
    expect(mem.metadata.source).toBe("test");
    expect(mem.metadata.writtenBy).toBe("agent-1");
  });
});
