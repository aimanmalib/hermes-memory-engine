import type { AgentId, MemoryEntry, MemoryRelation } from "../core/types.js";
import { MemoryStore } from "../core/memory-store.js";

/** Permission levels for shared memory access */
export type Permission = "read" | "write" | "admin";

/** Agent permission entry */
export interface AgentPermission {
  agent: AgentId;
  permission: Permission;
}

/**
 * SharedMemory — cross-agent memory sharing with permissions.
 *
 * Manages a shared memory pool where multiple agents can read/write
 * based on their permission levels.
 */
export class SharedMemory {
  private store: MemoryStore;
  private permissions = new Map<AgentId, Permission>();

  constructor(store: MemoryStore) {
    this.store = store;
  }

  /** Grant permission to an agent */
  grant(agent: AgentId, permission: Permission): void {
    this.permissions.set(agent, permission);
  }

  /** Revoke permission from an agent */
  revoke(agent: AgentId): void {
    this.permissions.delete(agent);
  }

  /** Check if an agent has a specific permission */
  hasPermission(agent: AgentId, required: Permission): boolean {
    const level = this.permissions.get(agent);
    if (!level) return false;

    const hierarchy: Permission[] = ["read", "write", "admin"];
    return hierarchy.indexOf(level) >= hierarchy.indexOf(required);
  }

  /** Write a shared memory (requires write permission) */
  async write(
    agent: AgentId,
    content: string,
    tags: string[] = [],
    metadata: Record<string, unknown> = {}
  ): Promise<MemoryEntry> {
    if (!this.hasPermission(agent, "write")) {
      throw new Error(`Agent '${agent}' does not have write permission`);
    }

    return this.store.create({
      content,
      tags,
      agent: "shared",
      metadata: { ...metadata, writtenBy: agent },
    });
  }

  /** Read shared memories (requires read permission) */
  async read(
    agent: AgentId,
    query?: string,
    tags?: string[]
  ): Promise<MemoryEntry[]> {
    if (!this.hasPermission(agent, "read")) {
      throw new Error(`Agent '${agent}' does not have read permission`);
    }

    return this.store.search({
      agent: "shared",
      query,
      tags,
    });
  }

  /** Update a shared memory (requires write permission) */
  async update(
    agent: AgentId,
    memoryId: string,
    content?: string,
    tags?: string[]
  ): Promise<MemoryEntry | null> {
    if (!this.hasPermission(agent, "write")) {
      throw new Error(`Agent '${agent}' does not have write permission`);
    }

    return this.store.update(memoryId, {
      content,
      tags,
      metadata: { updatedBy: agent, updatedAt: new Date().toISOString() },
    });
  }

  /** Delete a shared memory (requires admin permission) */
  async delete(agent: AgentId, memoryId: string): Promise<boolean> {
    if (!this.hasPermission(agent, "admin")) {
      throw new Error(`Agent '${agent}' does not have admin permission`);
    }

    return this.store.delete(memoryId);
  }

  /** Link two shared memories */
  async link(
    agent: AgentId,
    sourceId: string,
    targetId: string,
    type: MemoryRelation
  ): Promise<void> {
    if (!this.hasPermission(agent, "write")) {
      throw new Error(`Agent '${agent}' does not have write permission`);
    }

    const source = await this.store.get(sourceId);
    if (!source) throw new Error(`Memory '${sourceId}' not found`);

    const relations = [...source.relations, { targetId, type }];
    await this.store.update(sourceId, { relations });
  }

  /** List all agents with permissions */
  listPermissions(): AgentPermission[] {
    return Array.from(this.permissions.entries()).map(
      ([agent, permission]) => ({ agent, permission })
    );
  }
}
