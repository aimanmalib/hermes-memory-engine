import type { AgentId, MemoryEntry } from "../core/types.js";
import { MemoryStore } from "../core/memory-store.js";
import type { StorageBackend } from "../core/types.js";

/** Agent configuration */
export interface AgentConfig {
  id: AgentId;
  name: string;
  description?: string;
  /** Whether this agent can access shared memories */
  canAccessShared: boolean;
  /** Whether this agent can write to shared memories */
  canWriteShared: boolean;
  /** Custom metadata for the agent */
  metadata?: Record<string, unknown>;
}

/** Agent instance with its own memory namespace */
export interface AgentInstance {
  config: AgentConfig;
  store: MemoryStore;
  registeredAt: Date;
}

/**
 * AgentRegistry — manages multiple AI agents with isolated memory namespaces.
 *
 * Each agent gets its own MemoryStore view that filters by agent ID.
 * Shared memories use the special "shared" agent namespace.
 */
export class AgentRegistry {
  private agents = new Map<AgentId, AgentInstance>();
  private backend: StorageBackend;
  private sharedStore: MemoryStore;

  constructor(backend: StorageBackend) {
    this.backend = backend;
    this.sharedStore = new MemoryStore(backend);
  }

  async init(): Promise<void> {
    await this.sharedStore.init();
  }

  /** Register a new agent */
  async register(config: AgentConfig): Promise<AgentInstance> {
    if (this.agents.has(config.id)) {
      throw new Error(`Agent '${config.id}' is already registered`);
    }

    // Each agent gets its own store view (same backend, filtered by agent ID)
    const store = new MemoryStore(this.backend);
    // Don't re-init — backend is already initialized
    // The store delegates to the same backend

    const instance: AgentInstance = {
      config,
      store,
      registeredAt: new Date(),
    };

    this.agents.set(config.id, instance);
    return instance;
  }

  /** Unregister an agent */
  unregister(id: AgentId): boolean {
    return this.agents.delete(id);
  }

  /** Get an agent by ID */
  get(id: AgentId): AgentInstance | undefined {
    return this.agents.get(id);
  }

  /** List all registered agents */
  list(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  /** Check if an agent is registered */
  has(id: AgentId): boolean {
    return this.agents.has(id);
  }

  /** Get the shared memory store (cross-agent pool) */
  getSharedStore(): MemoryStore {
    return this.sharedStore;
  }

  /** Write a memory to the shared pool */
  async writeShared(
    content: string,
    tags: string[] = [],
    metadata: Record<string, unknown> = {}
  ): Promise<MemoryEntry> {
    return this.sharedStore.create({
      content,
      tags,
      agent: "shared",
      metadata,
    });
  }

  /** Read shared memories */
  async readShared(
    tags?: string[],
    query?: string
  ): Promise<MemoryEntry[]> {
    return this.sharedStore.search({
      agent: "shared",
      tags,
      query,
    });
  }

  /** Get all memories for a specific agent */
  async getAgentMemories(id: AgentId): Promise<MemoryEntry[]> {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`Agent '${id}' not found`);
    return agent.store.listByAgent(id);
  }

  /** Get agent count */
  get size(): number {
    return this.agents.size;
  }
}
