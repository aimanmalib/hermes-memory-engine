import type { MemoryEntry, CompressionResult } from "./types.js";

/** LLM provider interface for compression */
export interface LLMProvider {
  /** Send a prompt and get a completion */
  complete(prompt: string): Promise<string>;
}

/** Options for memory compression */
export interface CompressOptions {
  /** Maximum number of memories to compress at once */
  batchSize?: number;
  /** Minimum number of memories before compression triggers */
  minThreshold?: number;
  /** Custom system prompt for compression */
  systemPrompt?: string;
  /** Whether to preserve originals after compression */
  preserveOriginals?: boolean;
}

const DEFAULT_SYSTEM_PROMPT = `You are a memory compression agent. Given a list of memories, create a single concise summary that preserves all key information, decisions, preferences, and facts. Remove redundancy but keep specificity. Output ONLY the compressed memory text, nothing else.`;

/**
 * MemoryCompressor — LLM-powered memory summarization.
 *
 * Compresses multiple related memories into a single summary,
 * preserving key information while reducing token count.
 */
export class MemoryCompressor {
  private llm: LLMProvider;
  private systemPrompt: string;

  constructor(llm: LLMProvider, systemPrompt?: string) {
    this.llm = llm;
    this.systemPrompt = systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  }

  /**
   * Compress a batch of memories into a single summary.
   * Returns the compression result with ratio.
   */
  async compress(
    memories: MemoryEntry[],
    options: CompressOptions = {}
  ): Promise<CompressionResult> {
    if (memories.length === 0) {
      throw new Error("Cannot compress empty memory list");
    }

    if (memories.length === 1) {
      return {
        original: memories,
        compressed: memories[0],
        ratio: 1.0,
      };
    }

    const batchSize = options.batchSize ?? 50;
    const batch = memories.slice(0, batchSize);

    // Build the prompt
    const memoryTexts = batch
      .map(
        (m, i) =>
          `[${i + 1}] (${m.createdAt.toISOString()}) ${m.content} [tags: ${m.tags.join(", ")}]`
      )
      .join("\n");

    const prompt = `${this.systemPrompt}\n\nMemories to compress:\n${memoryTexts}\n\nCompressed summary:`;

    const summary = await this.llm.complete(prompt);

    // Calculate compression ratio (rough char-based)
    const originalLength = batch.reduce((sum, m) => sum + m.content.length, 0);
    const compressedLength = summary.length;
    const ratio = compressedLength / originalLength;

    // Merge all tags from originals
    const allTags = [...new Set(batch.flatMap((m) => m.tags))];

    // Create the compressed memory entry
    const compressed: MemoryEntry = {
      id: `compressed-${Date.now()}`,
      content: summary.trim(),
      tags: [...allTags, "compressed"],
      agent: batch[0].agent,
      createdAt: batch[0].createdAt,
      updatedAt: new Date(),
      metadata: {
        compressedFrom: batch.map((m) => m.id),
        originalCount: batch.length,
        compressionRatio: ratio,
      },
      relations: [],
    };

    return {
      original: batch,
      compressed,
      ratio,
    };
  }

  /**
   * Auto-compress memories that exceed a threshold.
   * Groups by agent, compresses oldest memories first.
   */
  async autoCompress(
    memories: MemoryEntry[],
    threshold: number,
    options: CompressOptions = {}
  ): Promise<CompressionResult[]> {
    // Group by agent
    const byAgent = new Map<string, MemoryEntry[]>();
    for (const mem of memories) {
      const group = byAgent.get(mem.agent) ?? [];
      group.push(mem);
      byAgent.set(mem.agent, group);
    }

    const results: CompressionResult[] = [];

    for (const [, agentMemories] of byAgent) {
      if (agentMemories.length <= threshold) continue;

      // Sort oldest first — compress old memories
      agentMemories.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      );

      // Take the oldest batch to compress
      const toCompress = agentMemories.slice(
        0,
        agentMemories.length - threshold
      );

      if (toCompress.length > 1) {
        const result = await this.compress(toCompress, options);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Estimate the token count of a memory (rough: 1 token ≈ 4 chars).
   */
  estimateTokens(memories: MemoryEntry[]): number {
    const totalChars = memories.reduce(
      (sum, m) => sum + m.content.length,
      0
    );
    return Math.ceil(totalChars / 4);
  }
}
