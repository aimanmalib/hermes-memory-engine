/**
 * Tests for HermesMemoryAdapter (Phase 5.1)
 * Verifies parse/serialize roundtrip for Hermes §-format and integration points.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { HermesMemoryAdapter } from "../src/integrations/hermes.js";
import { MemoryStore } from "../src/core/memory-store.js";
import { FileBackend } from "../src/core/file-backend.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";

describe("HermesMemoryAdapter", () => {
  let adapter: HermesMemoryAdapter;
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `hermes-adapter-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    adapter = new HermesMemoryAdapter({ hermesHome: tempDir });
  });

  afterEach(() => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it("parses Hermes §-separated MEMORY.md format into entries", () => {
    const raw = `Telegram bot @aimclawdbot, home chat_id 8155389481.
§
TUNONE: family biz details here.
§
hermes-memory-engine project at /root/projects/hermes-memory-engine. Phase 1-2 done.`;

    const entries = adapter.parseHermesMemory(raw, "memory");

    expect(entries.length).toBe(3);
    expect(entries[0].content).toContain("Telegram bot @aimclawdbot");
    expect(entries[0].tags).toContain("hermes");
    expect(entries[0].tags).toContain("memory");
    expect(entries[0].agent).toBe("hermes-builtin");
    expect(entries[0].metadata.source).toBe("hermes-builtin");
  });

  it("parses USER.md format", () => {
    const raw = `User communicates in informal Malay/English code-switching.
§
User runs three income streams via Hermes.`;

    const entries = adapter.parseHermesMemory(raw, "user");
    expect(entries.length).toBe(2);
    expect(entries[1].tags).toContain("user");
  });

  it("serializes entries back to §-separated format (roundtrip stable)", () => {
    const raw = `Fact one here.\n§\nFact two with more text.`;
    const entries = adapter.parseHermesMemory(raw, "memory");
    const serialized = adapter.serializeToHermesFormat(entries, "memory");

    // Should be close (trim + join)
    expect(serialized).toContain("Fact one here.");
    expect(serialized).toContain("§");
    expect(serialized).toContain("Fact two with more text.");
  });

  it("readHermesRaw returns empty for missing file, writes raw", async () => {
    const content = "Test fact A.\n§\nTest fact B.";
    await adapter.writeHermesRaw("memory", content);
    const read = await adapter.readHermesRaw("memory");
    expect(read).toBe(content);
  });

  it("importFromHermes parses and can feed a MemoryStore (no crash)", async () => {
    const rawMem = "Project uses TypeScript + Vitest.\n§\n90 tests passing.";
    await adapter.writeHermesRaw("memory", rawMem);

    const store = new MemoryStore(new FileBackend(join(tempDir, "store")));
    await store.init();

    const results = await adapter.importFromHermes(store, ["memory"]);
    expect(results[0].imported).toBe(2);
    expect(results[0].target).toBe("memory");

    const all = await store.listAll();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it("getHermesMemorySnapshot reads both targets", async () => {
    await adapter.writeHermesRaw("memory", "mem fact");
    await adapter.writeHermesRaw("user", "user fact");

    const snap = await adapter.getHermesMemorySnapshot();
    expect(snap.memory).toContain("mem fact");
    expect(snap.user).toContain("user fact");
  });
});
