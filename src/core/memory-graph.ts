import type { MemoryEntry, MemoryId, MemoryRelation } from "./types.js";

/** A node in the memory graph */
interface GraphNode {
  entry: MemoryEntry;
  edges: Map<MemoryId, MemoryRelation>;
}

/**
 * MemoryGraph — manages linked memory relationships.
 * Supports traversal, finding related memories, and building clusters.
 */
export class MemoryGraph {
  private nodes = new Map<MemoryId, GraphNode>();

  /** Add a memory entry to the graph */
  addNode(entry: MemoryEntry): void {
    if (!this.nodes.has(entry.id)) {
      this.nodes.set(entry.id, { entry, edges: new Map() });
    }
    // Add edges from the entry's relations
    for (const rel of entry.relations) {
      this.addEdge(entry.id, rel.targetId, rel.type);
    }
  }

  /** Add a directed edge between two memories */
  addEdge(fromId: MemoryId, toId: MemoryId, type: MemoryRelation): void {
    const from = this.nodes.get(fromId);
    const to = this.nodes.get(toId);
    if (from && to) {
      from.edges.set(toId, type);
    }
  }

  /** Remove a node and all its edges */
  removeNode(id: MemoryId): void {
    this.nodes.delete(id);
    // Remove edges pointing to this node
    for (const node of this.nodes.values()) {
      node.edges.delete(id);
    }
  }

  /** Get all direct relations for a memory */
  getRelations(id: MemoryId): Array<{ target: MemoryEntry; type: MemoryRelation }> {
    const node = this.nodes.get(id);
    if (!node) return [];

    const results: Array<{ target: MemoryEntry; type: MemoryRelation }> = [];
    for (const [targetId, type] of node.edges) {
      const targetNode = this.nodes.get(targetId);
      if (targetNode) {
        results.push({ target: targetNode.entry, type });
      }
    }
    return results;
  }

  /** Find all memories related to a given memory (BFS, depth-limited) */
  findRelated(id: MemoryId, maxDepth = 2): MemoryEntry[] {
    const visited = new Set<MemoryId>();
    const result: MemoryEntry[] = [];
    const queue: Array<{ id: MemoryId; depth: number }> = [{ id, depth: 0 }];

    while (queue.length > 0) {
      const { id: currentId, depth } = queue.shift()!;
      if (visited.has(currentId) || depth > maxDepth) continue;
      visited.add(currentId);

      const node = this.nodes.get(currentId);
      if (!node) continue;

      if (currentId !== id) {
        result.push(node.entry);
      }

      if (depth < maxDepth) {
        for (const [neighborId] of node.edges) {
          if (!visited.has(neighborId)) {
            queue.push({ id: neighborId, depth: depth + 1 });
          }
        }
      }
    }

    return result;
  }

  /** Get all connected components (clusters) */
  getClusters(): MemoryEntry[][] {
    const visited = new Set<MemoryId>();
    const clusters: MemoryEntry[][] = [];

    for (const [id] of this.nodes) {
      if (visited.has(id)) continue;
      const cluster: MemoryEntry[] = [];
      const queue: MemoryId[] = [id];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const node = this.nodes.get(currentId);
        if (!node) continue;

        cluster.push(node.entry);
        for (const [neighborId] of node.edges) {
          if (!visited.has(neighborId)) {
            queue.push(neighborId);
          }
        }
      }

      if (cluster.length > 0) {
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  /** Get the number of nodes in the graph */
  get size(): number {
    return this.nodes.size;
  }

  /** Clear the graph */
  clear(): void {
    this.nodes.clear();
  }
}
