/**
 * Basic usage example — File Backend
 */
import {
  MemoryStore,
  FileBackend,
  MemoryGraph,
} from "../src/index.js";

async function main() {
  // 1. Create store with file backend
  const store = new MemoryStore(new FileBackend("./example-memories"));
  await store.init();

  // 2. Add memories
  const mem1 = await store.create({
    content: "User prefers TypeScript over JavaScript",
    tags: ["preferences", "coding"],
    agent: "assistant",
  });

  const mem2 = await store.create({
    content: "User works at a startup in San Francisco",
    tags: ["personal", "work"],
    agent: "assistant",
  });

  const mem3 = await store.create({
    content: "User prefers dark mode in all applications",
    tags: ["preferences", "ui"],
    agent: "assistant",
  });

  // 3. Search memories
  const results = await store.search({ query: "typescript" });
  console.log("Search results:", results.length);

  // 4. List all memories
  const all = await store.listAll();
  console.log("All memories:", all.length);

  // 5. Build a memory graph
  const graph = new MemoryGraph();
  graph.addNode(mem1);
  graph.addNode(mem3);
  graph.addEdge(mem1.id, mem3.id, "related_to");

  const related = graph.findRelated(mem1.id, 2);
  console.log("Related to mem1:", related.length);

  // 6. Update a memory
  await store.update(mem1.id, {
    content: "User strongly prefers TypeScript over JavaScript",
  });

  // 7. Delete a memory
  await store.delete(mem2.id);

  console.log("Done! Check ./example-memories/ for .md files");
}

main().catch(console.error);
