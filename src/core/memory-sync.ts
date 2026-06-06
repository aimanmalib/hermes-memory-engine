import type { MemoryEntry, SyncStatus } from "./types.js";

/** Serialized memory bundle for sync */
export interface SyncPayload {
  version: number;
  timestamp: string;
  memories: MemoryEntry[];
  checksum: string;
}

/** Sync backend interface */
export interface SyncBackend {
  /** Name of the backend */
  readonly name: string;
  /** Upload memories to remote */
  upload(payload: SyncPayload): Promise<void>;
  /** Download memories from remote */
  download(): Promise<SyncPayload | null>;
  /** Check if remote has data */
  exists(): Promise<boolean>;
  /** Delete remote data */
  delete(): Promise<boolean>;
}

/** Conflict resolution strategy */
export type ConflictStrategy = "local" | "remote" | "merge" | "manual";

/** Sync result */
export interface SyncResult {
  status: "ok" | "conflict" | "error";
  pushed: number;
  pulled: number;
  conflicts: Array<{
    localEntry: MemoryEntry;
    remoteEntry: MemoryEntry;
  }>;
  error?: string;
}

/**
 * MemorySync — cloud sync engine.
 *
 * Syncs memories between local storage and a remote backend.
 * Supports incremental sync (only changed files) and conflict resolution.
 */
export class MemorySync {
  private backend: SyncBackend;
  private conflictStrategy: ConflictStrategy;

  constructor(backend: SyncBackend, conflictStrategy: ConflictStrategy = "merge") {
    this.backend = backend;
    this.conflictStrategy = conflictStrategy;
  }

  /** Push local memories to remote */
  async push(memories: MemoryEntry[]): Promise<SyncResult> {
    try {
      const payload = this.createPayload(memories);
      await this.backend.upload(payload);
      return { status: "ok", pushed: memories.length, pulled: 0, conflicts: [] };
    } catch (err) {
      return {
        status: "error",
        pushed: 0,
        pulled: 0,
        conflicts: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Pull remote memories to local */
  async pull(): Promise<{ memories: MemoryEntry[]; result: SyncResult }> {
    try {
      const payload = await this.backend.download();
      if (!payload) {
        return {
          memories: [],
          result: { status: "ok", pushed: 0, pulled: 0, conflicts: [] },
        };
      }

      return {
        memories: payload.memories,
        result: {
          status: "ok",
          pushed: 0,
          pulled: payload.memories.length,
          conflicts: [],
        },
      };
    } catch (err) {
      return {
        memories: [],
        result: {
          status: "error",
          pushed: 0,
          pulled: 0,
          conflicts: [],
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /** Bidirectional sync — merge local and remote */
  async sync(localMemories: MemoryEntry[]): Promise<SyncResult> {
    // Get remote state
    const remotePayload = await this.backend.download();
    const remoteMemories = remotePayload?.memories ?? [];

    // Build lookup maps
    const localMap = new Map(localMemories.map((m) => [m.id, m]));
    const remoteMap = new Map(remoteMemories.map((m) => [m.id, m]));

    const conflicts: SyncResult["conflicts"] = [];
    const merged: MemoryEntry[] = [];
    const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);

    for (const id of allIds) {
      const local = localMap.get(id);
      const remote = remoteMap.get(id);

      if (local && !remote) {
        // Only local — push to remote
        merged.push(local);
      } else if (!local && remote) {
        // Only remote — pull to local
        merged.push(remote);
      } else if (local && remote) {
        // Both exist — check for conflict
        const resolved = this.resolveConflict(local, remote);
        if (resolved === null) {
          conflicts.push({ localEntry: local, remoteEntry: remote });
          // Keep local in the merge for now
          merged.push(local);
        } else {
          merged.push(resolved);
        }
      }
    }

    // Push merged state
    const payload = this.createPayload(merged);
    await this.backend.upload(payload);

    return {
      status: conflicts.length > 0 ? "conflict" : "ok",
      pushed: merged.length,
      pulled: remoteMemories.length,
      conflicts,
    };
  }

  /** Check sync status */
  async getStatus(): Promise<SyncStatus> {
    const exists = await this.backend.exists();
    if (!exists) {
      return { lastSync: null, pending: 0, conflicts: 0 };
    }

    const payload = await this.backend.download();
    return {
      lastSync: payload ? new Date(payload.timestamp) : null,
      pending: 0,
      conflicts: 0,
    };
  }

  /** Resolve a conflict between local and remote versions */
  private resolveConflict(
    local: MemoryEntry,
    remote: MemoryEntry
  ): MemoryEntry | null {
    switch (this.conflictStrategy) {
      case "local":
        return local;
      case "remote":
        return remote;
      case "merge": {
        // Keep the newer one, merge tags and metadata
        const [newer, older] =
          local.updatedAt > remote.updatedAt
            ? [local, remote]
            : [remote, local];

        return {
          ...newer,
          tags: [...new Set([...local.tags, ...remote.tags])],
          metadata: {
            ...older.metadata,
            ...newer.metadata,
            mergedFrom: [local.id, remote.id],
            conflictResolved: new Date().toISOString(),
          },
        };
      }
      case "manual":
        return null; // Signal conflict for manual resolution
    }
  }

  /** Create a sync payload with checksum */
  private createPayload(memories: MemoryEntry[]): SyncPayload {
    const content = JSON.stringify(memories);
    const checksum = this.simpleHash(content);

    return {
      version: 1,
      timestamp: new Date().toISOString(),
      memories,
      checksum,
    };
  }

  /** Simple hash for payload integrity (not cryptographic) */
  private simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash.toString(16);
  }
}
