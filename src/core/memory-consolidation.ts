import type { MemoryEntry, MemoryId } from "./types.js";
import { MemorySearch } from "./memory-search.js";
import { MemoryCompressor } from "./memory-compress.js";
import type { LLMProvider } from "./memory-compress.js";

/** Retention policy configuration */
export interface RetentionPolicy {
  /** Maximum age in days before archival */
  maxAgeDays: number;
  /** Tag patterns to never archive (e.g., ["important", "permanent"]) */
  preserveTags?: string[];
  /** Maximum number of memories per agent (oldest archived) */
  maxPerAgent?: number;
}

/** Consolidation result */
export interface ConsolidationResult {
  /** Memories that were merged */
  merged: Array<{ sources: MemoryEntry[]; result: MemoryEntry }>;
  /** Memories that were archived */
  archived: MemoryEntry[];
  /** Memories that were removed as duplicates */
  duplicatesRemoved: MemoryEntry[];
}

/**
 * MemoryConsolidation — auto-consolidate, merge, and archive memories.
 *
 * - Merge duplicate/near-duplicate memories
 * - Archive old memories based on retention policy
 * - Compress memory clusters using LLM
 */
export class MemoryConsolidation {
  private search: MemorySearch;
  private compressor: MemoryCompressor | null;

  constructor(llm?: LLMProvider) {
    this.search = new MemorySearch();
    this.compressor = llm ? new MemoryCompressor(llm) : null;
  }

  /**
   * Consolidate a set of memories:
   * 1. Find and merge duplicates
   * 2. Archive old memories
   * 3. Enforce per-agent limits
   */
  async consolidate(
    memories: MemoryEntry[],
    policy: RetentionPolicy = { maxAgeDays: 90 }
  ): Promise<ConsolidationResult> {
    const result: ConsolidationResult = {
      merged: [],
      archived: [],
      duplicatesRemoved: [],
    };

    // Step 1: Find duplicates
    const duplicates = this.search.findDuplicates(memories, 0.7);

    const removedIds = new Set<MemoryId>();
    const processed = new Set<string>();

    for (const [a, b, similarity] of duplicates) {
      const key = [a.id, b.id].sort().join("-");
      if (processed.has(key)) continue;
      processed.add(key);

      if (removedIds.has(a.id) || removedIds.has(b.id)) continue;

      // Keep the newer one, merge content
      const [keep, remove] =
        a.updatedAt > b.updatedAt ? [a, b] : [b, a];

      const mergedContent = this.compressor
        ? // Use LLM to merge if available
          (
            await this.compressor.compress([keep, remove])
          ).compressed.content
        : // Simple merge: keep newer + append unique info from older
          `${keep.content}\n\n[merged from ${remove.id}]: ${remove.content}`;

      const merged: MemoryEntry = {
        ...keep,
        content: mergedContent,
        tags: [...new Set([...keep.tags, ...remove.tags])],
        updatedAt: new Date(),
        metadata: {
          ...keep.metadata,
          mergedFrom: [keep.id, remove.id],
          similarity,
        },
      };

      result.merged.push({ sources: [keep, remove], result: merged });
      removedIds.add(remove.id);
    }

    // Step 2: Archive old memories
    const now = Date.now();
    const maxAgeMs = policy.maxAgeDays * 24 * 60 * 60 * 1000;
    const preserveTags = new Set(policy.preserveTags ?? []);

    for (const mem of memories) {
      if (removedIds.has(mem.id)) continue;

      const age = now - mem.createdAt.getTime();
      if (age > maxAgeMs) {
        // Check if any tags should preserve this memory
        const shouldPreserve = mem.tags.some((t) => preserveTags.has(t));
        if (!shouldPreserve) {
          result.archived.push(mem);
          removedIds.add(mem.id);
        }
      }
    }

    // Step 3: Enforce per-agent limits
    if (policy.maxPerAgent) {
      const byAgent = new Map<string, MemoryEntry[]>();
      for (const mem of memories) {
        if (removedIds.has(mem.id)) continue;
        const group = byAgent.get(mem.agent) ?? [];
        group.push(mem);
        byAgent.set(mem.agent, group);
      }

      for (const [, agentMemories] of byAgent) {
        if (agentMemories.length <= policy.maxPerAgent) continue;

        // Sort newest first, archive the excess
        agentMemories.sort(
          (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
        );

        const excess = agentMemories.slice(policy.maxPerAgent);
        for (const mem of excess) {
          if (!removedIds.has(mem.id)) {
            result.archived.push(mem);
            removedIds.add(mem.id);
          }
        }
      }
    }

    result.duplicatesRemoved = memories.filter((m) =>
      removedIds.has(m.id)
    );

    return result;
  }

  /**
   * Merge two memories into one (simple concatenation).
   */
  merge(a: MemoryEntry, b: MemoryEntry): MemoryEntry {
    return {
      id: a.id,
      content: `${a.content}\n\n${b.content}`,
      tags: [...new Set([...a.tags, ...b.tags])],
      agent: a.agent,
      createdAt: a.createdAt < b.createdAt ? a.createdAt : b.createdAt,
      updatedAt: new Date(),
      metadata: {
        mergedFrom: [a.id, b.id],
      },
      relations: [...a.relations, ...b.relations],
    };
  }
}
