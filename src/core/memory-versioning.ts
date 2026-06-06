import type { MemoryEntry } from "./types.js";

/** A snapshot of all memories at a point in time */
export interface MemorySnapshot {
  id: string;
  timestamp: Date;
  memories: MemoryEntry[];
  message: string;
}

/** Diff entry between two snapshots */
export interface MemoryDiff {
  added: MemoryEntry[];
  removed: MemoryEntry[];
  modified: Array<{
    before: MemoryEntry;
    after: MemoryEntry;
    changes: string[];
  }>;
}

/**
 * MemoryVersioning — in-memory version history for memories.
 *
 * Keeps snapshots of memory state at each save point.
 * Supports diff, rollback, and history browsing.
 *
 * For production use, persist snapshots to disk or database.
 */
export class MemoryVersioning {
  private snapshots: MemorySnapshot[] = [];
  private maxSnapshots: number;

  constructor(maxSnapshots = 100) {
    this.maxSnapshots = maxSnapshots;
  }

  /** Save a snapshot of current memory state */
  commit(memories: MemoryEntry[], message: string): MemorySnapshot {
    const snapshot: MemorySnapshot = {
      id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
      memories: memories.map((m) => ({ ...m, metadata: { ...m.metadata } })),
      message,
    };

    this.snapshots.push(snapshot);

    // Trim if over limit
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-this.maxSnapshots);
    }

    return snapshot;
  }

  /** Get all snapshots (history) */
  history(): MemorySnapshot[] {
    return [...this.snapshots];
  }

  /** Get a specific snapshot by ID */
  getSnapshot(id: string): MemorySnapshot | null {
    return this.snapshots.find((s) => s.id === id) ?? null;
  }

  /** Get the latest snapshot */
  latest(): MemorySnapshot | null {
    return this.snapshots.length > 0
      ? this.snapshots[this.snapshots.length - 1]
      : null;
  }

  /** Rollback to a previous snapshot (returns the memories from that snapshot) */
  rollback(snapshotId: string): MemoryEntry[] | null {
    const snapshot = this.getSnapshot(snapshotId);
    if (!snapshot) return null;
    return snapshot.memories.map((m) => ({ ...m }));
  }

  /** Diff between two snapshots */
  diff(fromId: string, toId: string): MemoryDiff | null {
    const from = this.getSnapshot(fromId);
    const to = this.getSnapshot(toId);
    if (!from || !to) return null;

    return this.computeDiff(from.memories, to.memories);
  }

  /** Diff from the previous snapshot to the latest */
  diffLatest(): MemoryDiff | null {
    if (this.snapshots.length < 2) return null;
    const prev = this.snapshots[this.snapshots.length - 2];
    const curr = this.snapshots[this.snapshots.length - 1];
    return this.computeDiff(prev.memories, curr.memories);
  }

  /** Get the number of snapshots */
  get size(): number {
    return this.snapshots.length;
  }

  /** Clear all history */
  clear(): void {
    this.snapshots = [];
  }

  /** Compute diff between two memory arrays */
  private computeDiff(before: MemoryEntry[], after: MemoryEntry[]): MemoryDiff {
    const beforeMap = new Map(before.map((m) => [m.id, m]));
    const afterMap = new Map(after.map((m) => [m.id, m]));

    const added: MemoryEntry[] = [];
    const removed: MemoryEntry[] = [];
    const modified: MemoryDiff["modified"] = [];

    // Find added and modified
    for (const [id, afterEntry] of afterMap) {
      const beforeEntry = beforeMap.get(id);
      if (!beforeEntry) {
        added.push(afterEntry);
      } else {
        const changes = this.detectChanges(beforeEntry, afterEntry);
        if (changes.length > 0) {
          modified.push({ before: beforeEntry, after: afterEntry, changes });
        }
      }
    }

    // Find removed
    for (const [id, beforeEntry] of beforeMap) {
      if (!afterMap.has(id)) {
        removed.push(beforeEntry);
      }
    }

    return { added, removed, modified };
  }

  /** Detect what changed between two versions of a memory */
  private detectChanges(before: MemoryEntry, after: MemoryEntry): string[] {
    const changes: string[] = [];

    if (before.content !== after.content) changes.push("content");
    if (JSON.stringify(before.tags) !== JSON.stringify(after.tags))
      changes.push("tags");
    if (JSON.stringify(before.metadata) !== JSON.stringify(after.metadata))
      changes.push("metadata");
    if (JSON.stringify(before.relations) !== JSON.stringify(after.relations))
      changes.push("relations");

    return changes;
  }
}
