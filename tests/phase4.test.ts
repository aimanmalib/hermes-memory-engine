import { describe, it, expect, beforeEach } from "vitest";
import { MemorySync } from "../src/core/memory-sync.js";
import { MemoryEncryption } from "../src/core/memory-encryption.js";
import { MemoryVersioning } from "../src/core/memory-versioning.js";
import type { SyncBackend, SyncPayload } from "../src/core/memory-sync.js";
import type { MemoryEntry } from "../src/core/types.js";

function makeEntry(id: string, content = "test", tags: string[] = [], daysAgo = 0): MemoryEntry {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return { id, content, tags, agent: "test", createdAt: d, updatedAt: d, metadata: {}, relations: [] };
}

// In-memory sync backend for testing
class InMemorySyncBackend implements SyncBackend {
  readonly name = "memory";
  private data: SyncPayload | null = null;
  async upload(payload: SyncPayload): Promise<void> { this.data = JSON.parse(JSON.stringify(payload)); }
  async download(): Promise<SyncPayload | null> { return this.data ? JSON.parse(JSON.stringify(this.data)) : null; }
  async exists(): Promise<boolean> { return this.data !== null; }
  async delete(): Promise<boolean> { this.data = null; return true; }
}

describe("MemorySync", () => {
  let backend: InMemorySyncBackend;
  let sync: MemorySync;

  beforeEach(() => {
    backend = new InMemorySyncBackend();
    sync = new MemorySync(backend, "merge");
  });

  it("pushes memories to remote", async () => {
    const memories = [makeEntry("1", "hello"), makeEntry("2", "world")];
    const result = await sync.push(memories);
    expect(result.status).toBe("ok");
    expect(result.pushed).toBe(2);

    // Verify data is on the backend
    expect(await backend.exists()).toBe(true);
  });

  it("pulls memories from remote", async () => {
    const memories = [makeEntry("1", "pulled")];
    await sync.push(memories);

    const { memories: pulled, result } = await sync.pull();
    expect(result.status).toBe("ok");
    expect(pulled.length).toBe(1);
    expect(pulled[0].content).toBe("pulled");
  });

  it("returns empty on pull with no data", async () => {
    const { memories, result } = await sync.pull();
    expect(result.status).toBe("ok");
    expect(memories.length).toBe(0);
  });

  it("syncs bidirectionally with merge", async () => {
    // Push initial state
    await sync.push([makeEntry("1", "local only")]);

    // Simulate remote has different data
    await backend.upload({
      version: 1,
      timestamp: new Date().toISOString(),
      memories: [makeEntry("2", "remote only")],
      checksum: "0",
    });

    // Sync should merge both
    const result = await sync.sync([makeEntry("1", "local only")]);
    expect(result.status).toBe("ok");
    expect(result.pushed).toBe(2); // both entries merged
  });

  it("resolves conflicts with local strategy", async () => {
    const localSync = new MemorySync(backend, "local");

    // Remote has an older version
    await backend.upload({
      version: 1,
      timestamp: new Date().toISOString(),
      memories: [makeEntry("1", "remote version", [], 5)],
      checksum: "0",
    });

    // Local has a newer version
    const result = await localSync.sync([makeEntry("1", "local version", [], 0)]);
    expect(result.status).toBe("ok");

    // Verify local version was kept
    const downloaded = await backend.download();
    expect(downloaded!.memories[0].content).toBe("local version");
  });

  it("gets sync status", async () => {
    const status = await sync.getStatus();
    expect(status.lastSync).toBeNull();

    await sync.push([makeEntry("1", "test")]);
    const status2 = await sync.getStatus();
    expect(status2.lastSync).not.toBeNull();
  });
});

describe("MemoryEncryption", () => {
  let encryption: MemoryEncryption;

  beforeEach(() => {
    encryption = new MemoryEncryption();
  });

  it("derives key from passphrase", () => {
    const salt = encryption.initWithPassphrase("my-secret-password");
    expect(salt.length).toBe(32);
    expect(encryption.isReady).toBe(true);
  });

  it("encrypts and decrypts text", () => {
    encryption.initWithPassphrase("test-password");

    const plaintext = "User prefers dark mode and TypeScript";
    const encrypted = encryption.encrypt(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.length).toBeGreaterThan(0);

    const decrypted = encryption.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext for same input (random IV)", () => {
    encryption.initWithPassphrase("test-password");

    const text = "same input";
    const enc1 = encryption.encrypt(text);
    const enc2 = encryption.encrypt(text);

    expect(enc1).not.toBe(enc2); // Different IVs
    expect(encryption.decrypt(enc1)).toBe(encryption.decrypt(enc2));
  });

  it("fails to decrypt with wrong key", () => {
    encryption.initWithPassphrase("correct-password");
    const encrypted = encryption.encrypt("secret");

    const wrongEncryption = new MemoryEncryption();
    wrongEncryption.initWithPassphrase("wrong-password");

    expect(() => wrongEncryption.decrypt(encrypted)).toThrow();
  });

  it("encrypts and decrypts memory entries", () => {
    encryption.initWithPassphrase("test-password");

    const entry = makeEntry("1", "sensitive user data", ["private"]);
    const encrypted = encryption.encryptMemory(entry);

    expect(encrypted.content).not.toBe("sensitive user data");
    expect(encrypted.metadata.encrypted).toBe(true);

    const decrypted = encryption.decryptMemory(encrypted);
    expect(decrypted.content).toBe("sensitive user data");
    expect(decrypted.metadata.encrypted).toBe(false);
  });

  it("batch encrypts/decrypts memories", () => {
    encryption.initWithPassphrase("batch-test");

    const entries = [
      makeEntry("1", "memory one"),
      makeEntry("2", "memory two"),
      makeEntry("3", "memory three"),
    ];

    const encrypted = encryption.encryptMemories(entries);
    expect(encrypted.every((e) => e.metadata.encrypted === true)).toBe(true);

    const decrypted = encryption.decryptMemories(encrypted);
    expect(decrypted[0].content).toBe("memory one");
    expect(decrypted[1].content).toBe("memory two");
    expect(decrypted[2].content).toBe("memory three");
  });

  it("throws when not initialized", () => {
    expect(() => encryption.encrypt("test")).toThrow("not initialized");
  });
});

describe("MemoryVersioning", () => {
  let versioning: MemoryVersioning;

  beforeEach(() => {
    versioning = new MemoryVersioning();
  });

  it("commits and retrieves snapshots", () => {
    const memories = [makeEntry("1", "v1")];
    const snap = versioning.commit(memories, "initial");

    expect(snap.id).toBeTruthy();
    expect(versioning.size).toBe(1);
    expect(versioning.latest()?.memories[0].content).toBe("v1");
  });

  it("tracks history", () => {
    versioning.commit([makeEntry("1", "v1")], "first");
    versioning.commit([makeEntry("1", "v2")], "second");
    versioning.commit([makeEntry("1", "v3")], "third");

    expect(versioning.size).toBe(3);
    expect(versioning.history().map((s) => s.message)).toEqual([
      "first", "second", "third",
    ]);
  });

  it("rolls back to a previous snapshot", () => {
    versioning.commit([makeEntry("1", "v1")], "first");
    const snap2 = versioning.commit([makeEntry("1", "v2")], "second");

    const rolled = versioning.rollback(snap2.id);
    expect(rolled).not.toBeNull();
    expect(rolled![0].content).toBe("v2");
  });

  it("computes diff between snapshots", () => {
    const snap1 = versioning.commit(
      [makeEntry("1", "old"), makeEntry("2", "keep")],
      "v1"
    );
    const snap2 = versioning.commit(
      [makeEntry("1", "new"), makeEntry("2", "keep"), makeEntry("3", "added")],
      "v2"
    );

    const diff = versioning.diff(snap1.id, snap2.id);
    expect(diff).not.toBeNull();
    expect(diff!.added.length).toBe(1);
    expect(diff!.added[0].content).toBe("added");
    expect(diff!.modified.length).toBe(1);
    expect(diff!.modified[0].changes).toContain("content");
    expect(diff!.removed.length).toBe(0);
  });

  it("computes diffLatest", () => {
    versioning.commit([makeEntry("1", "v1")], "first");
    versioning.commit([makeEntry("1", "v2"), makeEntry("2", "new")], "second");

    const diff = versioning.diffLatest();
    expect(diff).not.toBeNull();
    expect(diff!.modified.length).toBe(1);
    expect(diff!.added.length).toBe(1);
  });

  it("enforces max snapshots limit", () => {
    const small = new MemoryVersioning(3);
    for (let i = 0; i < 5; i++) {
      small.commit([makeEntry("1", `v${i}`)], `commit ${i}`);
    }
    expect(small.size).toBe(3);
    expect(small.history()[0].message).toBe("commit 2"); // oldest kept
  });

  it("snapshots are independent (no mutation)", () => {
    const memories = [makeEntry("1", "original")];
    const snap = versioning.commit(memories, "v1");

    // Mutate original
    memories[0].content = "mutated";

    // Snapshot should still have original
    expect(snap.memories[0].content).toBe("original");
  });

  it("clears history", () => {
    versioning.commit([makeEntry("1", "v1")], "first");
    versioning.clear();
    expect(versioning.size).toBe(0);
  });
});
