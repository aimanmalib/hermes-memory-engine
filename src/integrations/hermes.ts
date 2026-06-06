/**
 * Hermes Agent Integration Adapter
 * 
 * Provides read/write compatibility with Hermes Agent's built-in memory format
 * (MEMORY.md / USER.md in ~/.hermes/memories/).
 * 
 * Supports:
 * - Parsing the §-separated fact format used by Hermes
 * - Serializing MemoryEntry[] back to Hermes format
 * - Auto-import of existing Hermes memories into the engine
 * - Bidirectional sync between engine and Hermes built-in memory
 * 
 * This enables the Hermes Memory Engine to serve as an external memory
 * provider or companion store for Hermes Agent (which supports pluggable
 * memory providers via its plugin system).
 * 
 * @see https://github.com/aimanmalib/hermes-memory-engine
 * @license MIT
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { MemoryEntry, AgentId } from "../core/types.js";
import { MemoryStore } from "../core/memory-store.js";

/** Hermes memory targets (matches Hermes built-in) */
export type HermesTarget = "memory" | "user";

/** Config for Hermes integration */
export interface HermesAdapterConfig {
  hermesHome?: string; // defaults to ~/.hermes or $HERMES_HOME
  defaultAgent?: AgentId; // default "hermes-builtin"
  importTags?: string[]; // tags to attach on import, e.g. ["hermes-import"]
}

/** Result of import/sync operations */
export interface HermesImportResult {
  imported: number;
  skipped: number;
  target: HermesTarget;
  entries: MemoryEntry[];
}

/**
 * HermesMemoryAdapter
 * 
 * Adapter to read/write Hermes Agent's native memory files (MEMORY.md / USER.md).
 * Can be used standalone or wired into a MemoryStore for hybrid use.
 */
export class HermesMemoryAdapter {
  private config: Required<HermesAdapterConfig>;
  private hermesMemoriesDir: string;

  constructor(config: HermesAdapterConfig = {}) {
    const home = config.hermesHome || 
      process.env.HERMES_HOME || 
      join(process.env.HOME || "/root", ".hermes");
    
    this.config = {
      hermesHome: home,
      defaultAgent: config.defaultAgent || "hermes-builtin",
      importTags: config.importTags || ["hermes", "imported"],
    };
    
    this.hermesMemoriesDir = join(this.config.hermesHome, "memories");
  }

  /** Get full path to a Hermes memory file (MEMORY.md or USER.md) */
  private getMemoryPath(target: HermesTarget): string {
    const filename = target === "memory" ? "MEMORY.md" : "USER.md";
    return join(this.hermesMemoriesDir, filename);
  }

  /**
   * Parse Hermes-format content (entries separated by §) into MemoryEntry[].
   * Handles the raw file format (no prompt wrapper).
   */
  parseHermesMemory(content: string, target: HermesTarget): MemoryEntry[] {
    if (!content || !content.trim()) return [];

    const now = new Date();
    const defaultAgent = this.config.defaultAgent;
    const baseTags = [...this.config.importTags, target];

    // Split on § (section sign) — Hermes uses this as entry delimiter
    const rawEntries = content
      .split("§")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    return rawEntries.map((text, idx) => {
      const id = `hermes-${target}-${Date.now().toString(36)}-${idx}`;
      return {
        id,
        content: text,
        tags: baseTags,
        agent: defaultAgent,
        createdAt: now,
        updatedAt: now,
        metadata: {
          source: "hermes-builtin",
          target,
          originalIndex: idx,
        },
        relations: [],
      };
    });
  }

  /** Serialize MemoryEntry[] back to Hermes §-separated format.
   * (target param kept for API symmetry / future per-target formatting; unused in current impl)
   */
  serializeToHermesFormat(entries: MemoryEntry[], _target: HermesTarget): string {
    if (entries.length === 0) return "";

    // Sort by createdAt for deterministic output (Hermes order is append order)
    const sorted = [...entries].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    const lines = sorted.map((e) => e.content.trim()).filter(Boolean);
    return lines.join("\n§\n");
  }

  /**
   * Read raw Hermes memory file for a target.
   * Returns the exact file content (or empty string if missing).
   */
  async readHermesRaw(target: HermesTarget): Promise<string> {
    const path = this.getMemoryPath(target);
    try {
      return await readFile(path, "utf-8");
    } catch (err: any) {
      if (err.code === "ENOENT") return "";
      throw err;
    }
  }

  /**
   * Write raw content to a Hermes memory file (overwrites).
   * Creates directories if needed. Use with care — prefer sync methods.
   */
  async writeHermesRaw(target: HermesTarget, content: string): Promise<void> {
    await mkdir(this.hermesMemoriesDir, { recursive: true });
    const path = this.getMemoryPath(target);
    await writeFile(path, content, "utf-8");
  }

  /**
   * Import all entries from Hermes built-in memory (MEMORY.md + USER.md) 
   * into a MemoryStore (or return parsed entries).
   */
  async importFromHermes(
    store?: MemoryStore,
    targets: HermesTarget[] = ["memory", "user"]
  ): Promise<HermesImportResult[]> {
    const results: HermesImportResult[] = [];

    for (const target of targets) {
      const raw = await this.readHermesRaw(target);
      const entries = this.parseHermesMemory(raw, target);

      let imported = entries.length;
      let skipped = 0;

      if (store && entries.length > 0) {
        imported = 0;
        // Use the store's create path (avoids direct backend)
        for (const entry of entries) {
          try {
            await store.create({
              content: entry.content,
              tags: entry.tags,
              agent: entry.agent,
              metadata: entry.metadata,
              relations: entry.relations,
            });
            imported++;
          } catch (e: any) {
            // Skip duplicates (MemoryStore should dedupe or throw on exact match)
            if (/duplicate|exists/i.test(String(e))) {
              skipped++;
            } else {
              throw e;
            }
          }
        }
      }

      results.push({
        imported,
        skipped,
        target,
        entries,
      });
    }

    return results;
  }

  /**
   * Export selected entries from a MemoryStore back to Hermes format.
   * Writes to MEMORY.md / USER.md (overwrites the target file).
   * 
   * WARNING: This replaces the entire Hermes built-in memory for that target.
   * Best used after import + filtering, or for migration.
   */
  async exportToHermes(
    store: MemoryStore,
    target: HermesTarget,
    options: { agent?: AgentId; tags?: string[] } = {}
  ): Promise<number> {
    let entries = await store.listAll();

    if (options.agent) {
      entries = entries.filter((e) => e.agent === options.agent);
    }
    if (options.tags?.length) {
      entries = entries.filter((e) =>
        options.tags!.some((t) => e.tags.includes(t))
      );
    }

    // Only entries that originated from or are tagged for this target
    const relevant = entries.filter(
      (e) =>
        e.metadata?.source === "hermes-builtin" ||
        e.tags.includes(target) ||
        e.tags.includes("hermes")
    );

    const serialized = this.serializeToHermesFormat(relevant, target);
    await this.writeHermesRaw(target, serialized);

    return relevant.length;
  }

  /**
   * Bidirectional sync: import from Hermes → store, then (optionally) push
   * changes back. Simple last-write-wins for now.
   */
  async syncBidirectional(
    store: MemoryStore,
    direction: "import" | "export" | "both" = "both"
  ): Promise<{ imported: number; exported: number }> {
    let imported = 0;
    let exported = 0;

    if (direction === "import" || direction === "both") {
      const res = await this.importFromHermes(store);
      imported = res.reduce((n, r) => n + r.imported, 0);
    }

    if (direction === "export" || direction === "both") {
      const memCount = await this.exportToHermes(store, "memory");
      const userCount = await this.exportToHermes(store, "user");
      exported = memCount + userCount;
    }

    return { imported, exported };
  }

  /** Convenience: get current raw Hermes memory content for inspection */
  async getHermesMemorySnapshot(): Promise<{ memory: string; user: string }> {
    return {
      memory: await this.readHermesRaw("memory"),
      user: await this.readHermesRaw("user"),
    };
  }
}

/** Factory helper (matches other backends style) */
export function createHermesAdapter(config?: HermesAdapterConfig) {
  return new HermesMemoryAdapter(config);
}
