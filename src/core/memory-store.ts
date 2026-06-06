import { randomUUID } from "node:crypto";
import type {
  MemoryEntry,
  MemoryId,
  CreateMemoryInput,
  UpdateMemoryInput,
  SearchOptions,
  StorageBackend,
  AgentId,
} from "./types.js";

const DEFAULT_AGENT: AgentId = "default";

/**
 * Generate a unique memory ID
 */
export function generateId(): MemoryId {
  return randomUUID();
}

/**
 * Core memory engine — read/write/manage memory entries.
 * Delegates persistence to a pluggable StorageBackend.
 */
export class MemoryStore {
  private backend: StorageBackend;

  constructor(backend: StorageBackend) {
    this.backend = backend;
  }

  /** Initialize the store (call once before use) */
  async init(): Promise<void> {
    await this.backend.init();
  }

  /** Create a new memory entry */
  async create(input: CreateMemoryInput): Promise<MemoryEntry> {
    const now = new Date();
    const entry: MemoryEntry = {
      id: generateId(),
      content: input.content,
      tags: input.tags ?? [],
      agent: input.agent ?? DEFAULT_AGENT,
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata ?? {},
      relations: input.relations ?? [],
    };
    await this.backend.set(entry);
    return entry;
  }

  /** Get a memory by ID */
  async get(id: MemoryId): Promise<MemoryEntry | null> {
    return this.backend.get(id);
  }

  /** Update an existing memory */
  async update(
    id: MemoryId,
    input: UpdateMemoryInput
  ): Promise<MemoryEntry | null> {
    const existing = await this.backend.get(id);
    if (!existing) return null;

    const updated: MemoryEntry = {
      ...existing,
      content: input.content ?? existing.content,
      tags: input.tags ?? existing.tags,
      metadata: input.metadata ?? existing.metadata,
      relations: input.relations ?? existing.relations,
      updatedAt: new Date(),
    };
    await this.backend.set(updated);
    return updated;
  }

  /** Delete a memory by ID */
  async delete(id: MemoryId): Promise<boolean> {
    return this.backend.delete(id);
  }

  /** Search memories with filters */
  async search(options: SearchOptions): Promise<MemoryEntry[]> {
    return this.backend.search(options);
  }

  /** List all memories for a specific agent */
  async listByAgent(agent: AgentId): Promise<MemoryEntry[]> {
    return this.backend.listByAgent(agent);
  }

  /** List all memories */
  async listAll(): Promise<MemoryEntry[]> {
    return this.backend.listAll();
  }

  /** Close the store and release resources */
  async close(): Promise<void> {
    await this.backend.close();
  }
}
