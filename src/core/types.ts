/**
 * Core types for Hermes Memory Engine
 */

/** Unique identifier for a memory entry */
export type MemoryId = string;

/** Agent identifier */
export type AgentId = string;

/** Relationship types between memories */
export type MemoryRelation =
  | "related_to"
  | "derived_from"
  | "supersedes"
  | "contradicts"
  | "supports";

/** A single memory entry */
export interface MemoryEntry {
  id: MemoryId;
  content: string;
  tags: string[];
  agent: AgentId;
  createdAt: Date;
  updatedAt: Date;
  /** Frontmatter metadata from markdown */
  metadata: Record<string, unknown>;
  /** Related memory IDs with relationship type */
  relations: Array<{ targetId: MemoryId; type: MemoryRelation }>;
}

/** Input for creating a new memory */
export interface CreateMemoryInput {
  content: string;
  tags?: string[];
  agent?: AgentId;
  metadata?: Record<string, unknown>;
  relations?: Array<{ targetId: MemoryId; type: MemoryRelation }>;
}

/** Input for updating a memory */
export interface UpdateMemoryInput {
  content?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  relations?: Array<{ targetId: MemoryId; type: MemoryRelation }>;
}

/** Search query options */
export interface SearchOptions {
  query?: string;
  tags?: string[];
  agent?: AgentId;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

/** Storage backend interface */
export interface StorageBackend {
  /** Initialize the storage (create tables/directories) */
  init(): Promise<void>;
  /** Store a memory entry */
  set(entry: MemoryEntry): Promise<void>;
  /** Get a memory by ID */
  get(id: MemoryId): Promise<MemoryEntry | null>;
  /** Delete a memory by ID */
  delete(id: MemoryId): Promise<boolean>;
  /** Search memories */
  search(options: SearchOptions): Promise<MemoryEntry[]>;
  /** List all memories for an agent */
  listByAgent(agent: AgentId): Promise<MemoryEntry[]>;
  /** Get all memories */
  listAll(): Promise<MemoryEntry[]>;
  /** Close the storage backend */
  close(): Promise<void>;
}

/** Compression result */
export interface CompressionResult {
  original: MemoryEntry[];
  compressed: MemoryEntry;
  ratio: number;
}

/** Sync status */
export interface SyncStatus {
  lastSync: Date | null;
  pending: number;
  conflicts: number;
}

/** Plugin interface */
export interface MemoryPlugin {
  name: string;
  version: string;
  init(engine: unknown): Promise<void>;
  destroy(): Promise<void>;
}
