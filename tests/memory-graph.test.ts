import { describe, it, expect, beforeEach } from "vitest";
import { MemoryGraph } from "../src/core/memory-graph.js";
import type { MemoryEntry } from "../src/core/types.js";

function makeEntry(id: string, content = "test"): MemoryEntry {
  return {
    id,
    content,
    tags: [],
    agent: "test",
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {},
    relations: [],
  };
}

describe("MemoryGraph", () => {
  let graph: MemoryGraph;

  beforeEach(() => {
    graph = new MemoryGraph();
  });

  it("adds nodes and reports size", () => {
    graph.addNode(makeEntry("a"));
    graph.addNode(makeEntry("b"));
    expect(graph.size).toBe(2);
  });

  it("does not duplicate nodes", () => {
    graph.addNode(makeEntry("a"));
    graph.addNode(makeEntry("a"));
    expect(graph.size).toBe(1);
  });

  it("adds edges and retrieves relations", () => {
    const a = makeEntry("a");
    const b = makeEntry("b");
    graph.addNode(a);
    graph.addNode(b);
    graph.addEdge("a", "b", "related_to");

    const rels = graph.getRelations("a");
    expect(rels.length).toBe(1);
    expect(rels[0].target.id).toBe("b");
    expect(rels[0].type).toBe("related_to");
  });

  it("returns empty relations for unknown node", () => {
    expect(graph.getRelations("unknown")).toEqual([]);
  });

  it("finds related memories via BFS", () => {
    const a = makeEntry("a");
    const b = makeEntry("b");
    const c = makeEntry("c");
    const d = makeEntry("d");

    graph.addNode(a);
    graph.addNode(b);
    graph.addNode(c);
    graph.addNode(d);
    graph.addEdge("a", "b", "related_to");
    graph.addEdge("b", "c", "derived_from");
    graph.addEdge("c", "d", "supports");

    // depth 1: only b
    const depth1 = graph.findRelated("a", 1);
    expect(depth1.map((e) => e.id)).toEqual(["b"]);

    // depth 2: b and c
    const depth2 = graph.findRelated("a", 2);
    expect(depth2.map((e) => e.id).sort()).toEqual(["b", "c"]);

    // depth 3: b, c, d
    const depth3 = graph.findRelated("a", 3);
    expect(depth3.map((e) => e.id).sort()).toEqual(["b", "c", "d"]);
  });

  it("handles cycles without infinite loop", () => {
    graph.addNode(makeEntry("a"));
    graph.addNode(makeEntry("b"));
    graph.addEdge("a", "b", "related_to");
    graph.addEdge("b", "a", "related_to");

    const related = graph.findRelated("a", 5);
    expect(related.length).toBe(1);
    expect(related[0].id).toBe("b");
  });

  it("finds connected clusters", () => {
    // Cluster 1: a-b
    graph.addNode(makeEntry("a"));
    graph.addNode(makeEntry("b"));
    graph.addEdge("a", "b", "related_to");

    // Cluster 2: c-d-e
    graph.addNode(makeEntry("c"));
    graph.addNode(makeEntry("d"));
    graph.addNode(makeEntry("e"));
    graph.addEdge("c", "d", "related_to");
    graph.addEdge("d", "e", "related_to");

    // Isolated: f
    graph.addNode(makeEntry("f"));

    const clusters = graph.getClusters();
    expect(clusters.length).toBe(3);

    const sizes = clusters.map((c) => c.length).sort();
    expect(sizes).toEqual([1, 2, 3]);
  });

  it("removes a node and its edges", () => {
    graph.addNode(makeEntry("a"));
    graph.addNode(makeEntry("b"));
    graph.addEdge("a", "b", "related_to");

    graph.removeNode("a");
    expect(graph.size).toBe(1);
    expect(graph.getRelations("b").length).toBe(0);
  });

  it("clears the graph", () => {
    graph.addNode(makeEntry("a"));
    graph.addNode(makeEntry("b"));
    graph.clear();
    expect(graph.size).toBe(0);
  });
});
