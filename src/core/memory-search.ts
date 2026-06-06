import type { MemoryEntry, SearchOptions } from "./types.js";

/** Relevance score breakdown */
export interface ScoredResult {
  entry: MemoryEntry;
  score: number;
  matchType: "exact" | "tag" | "partial" | "date" | "none";
}

/** Search engine options */
export interface SearchEngineOptions extends SearchOptions {
  /** Boost weight for tag matches (default: 2.0) */
  tagBoost?: number;
  /** Boost weight for recency (default: 1.5) */
  recencyBoost?: number;
  /** Minimum score threshold (default: 0.1) */
  minScore?: number;
}

/**
 * MemorySearch — full-text + tag + date search with relevance scoring.
 *
 * Goes beyond simple string matching:
 * - Exact phrase matching (highest weight)
 * - Tag-based matching (boosted)
 * - Partial word matching
 * - Recency scoring (newer = higher)
 * - Configurable weights
 */
export class MemorySearch {
  /**
   * Search memories with relevance scoring.
   */
  search(
    memories: MemoryEntry[],
    options: SearchEngineOptions = {}
  ): ScoredResult[] {
    const tagBoost = options.tagBoost ?? 2.0;
    const recencyBoost = options.recencyBoost ?? 1.5;
    const minScore = options.minScore ?? 0.1;
    const query = options.query?.toLowerCase() ?? "";

    // Apply filters first
    let filtered = memories;

    if (options.agent) {
      filtered = filtered.filter((m) => m.agent === options.agent);
    }
    if (options.tags?.length) {
      filtered = filtered.filter((m) =>
        options.tags!.some((t) => m.tags.includes(t))
      );
    }
    if (options.from) {
      filtered = filtered.filter((m) => m.createdAt >= options.from!);
    }
    if (options.to) {
      filtered = filtered.filter((m) => m.createdAt <= options.to!);
    }

    // Score each result
    const scored: ScoredResult[] = [];

    for (const entry of filtered) {
      let score = 0;
      let matchType: ScoredResult["matchType"] = "none";
      const content = entry.content.toLowerCase();

      if (query) {
        // Exact phrase match
        if (content.includes(query)) {
          score += 10;
          matchType = "exact";
        }

        // Word-level matching
        const queryWords = query.split(/\s+/).filter(Boolean);
        const contentWords = content.split(/\s+/).filter(Boolean);

        for (const qWord of queryWords) {
          for (const cWord of contentWords) {
            if (cWord === qWord) {
              score += 3;
              if (matchType !== "exact") matchType = "partial";
            } else if (cWord.includes(qWord) || qWord.includes(cWord)) {
              score += 1;
              if (matchType === "none") matchType = "partial";
            }
          }
        }

        // Tag match boost
        if (options.tags?.length) {
          const tagMatches = options.tags.filter((t) =>
            entry.tags.includes(t)
          );
          score += tagMatches.length * tagBoost;
          if (tagMatches.length > 0 && matchType === "none") {
            matchType = "tag";
          }
        }

        // Only add recency boost if there's already a text match
        if (matchType !== "none") {
          const ageMs = Date.now() - entry.updatedAt.getTime();
          const dayAge = ageMs / (1000 * 60 * 60 * 24);
          score += Math.max(0, recencyBoost - dayAge * 0.1);
        }
      } else if (options.tags?.length) {
        // Tag-only search
        const tagMatches = options.tags.filter((t) => entry.tags.includes(t));
        score += tagMatches.length * tagBoost;
        matchType = "tag";

        // Recency boost for tag matches
        const ageMs = Date.now() - entry.updatedAt.getTime();
        const dayAge = ageMs / (1000 * 60 * 60 * 24);
        score += Math.max(0, recencyBoost - dayAge * 0.1);
      } else {
        // No query, no tags — score by recency only
        score = 1;
      }

      if (score >= minScore) {
        scored.push({ entry, score, matchType });
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Apply pagination
    const offset = options.offset ?? 0;
    const limit = options.limit ?? scored.length;
    return scored.slice(offset, offset + limit);
  }

  /**
   * Find duplicate or near-duplicate memories.
   * Uses simple word overlap (Jaccard similarity).
   */
  findDuplicates(
    memories: MemoryEntry[],
    threshold = 0.7
  ): Array<[MemoryEntry, MemoryEntry, number]> {
    const pairs: Array<[MemoryEntry, MemoryEntry, number]> = [];

    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const similarity = this.jaccardSimilarity(
          memories[i].content,
          memories[j].content
        );
        if (similarity >= threshold) {
          pairs.push([memories[i], memories[j], similarity]);
        }
      }
    }

    return pairs.sort((a, b) => b[2] - a[2]);
  }

  /**
   * Jaccard similarity between two strings (word-level).
   */
  private jaccardSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));

    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }
}
