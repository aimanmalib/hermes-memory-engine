/**
 * Multi-agent example — isolated namespaces + shared memory
 */
import {
  MemoryStore,
  FileBackend,
  SQLiteBackend,
  AgentRegistry,
  AgentContext,
  SharedMemory,
} from "../src/index.js";

async function main() {
  // 1. Create registry with a backend
  const backend = new FileBackend("./agent-memories");
  const registry = new AgentRegistry(backend);
  await registry.init();

  // 2. Register agents with config
  await registry.register({
    id: "researcher",
    name: "Research Agent",
    description: "Finds and summarizes information",
    canAccessShared: true,
    canWriteShared: true,
  });

  await registry.register({
    id: "writer",
    name: "Writing Agent",
    description: "Produces blog posts and documentation",
    canAccessShared: true,
    canWriteShared: false,
  });

  // 3. Each agent creates memories in their namespace
  const researcherAgent = registry.get("researcher")!;
  await researcherAgent.store.create({
    content: "TypeScript adoption grew 12% in 2025",
    tags: ["research", "typescript"],
    agent: "researcher",
  });

  const writerAgent = registry.get("writer")!;
  await writerAgent.store.create({
    content: "Draft blog post about TypeScript best practices",
    tags: ["draft", "typescript"],
    agent: "writer",
  });

  // 4. Generate per-agent context for system prompt injection
  const researcherMemories = await registry.getAgentMemories("researcher");
  const ctx = new AgentContext(
    { id: "researcher", name: "Research Agent", canAccessShared: true, canWriteShared: true },
    2000
  );
  ctx.loadMemories(researcherMemories);
  const prompt = ctx.toSystemPrompt();
  console.log("Researcher prompt:\n", prompt);

  // 5. Cross-agent shared memory with permissions
  const shared = new SharedMemory(researcherAgent.store);
  shared.grant("researcher", "admin");
  shared.grant("writer", "read");

  // Researcher writes to shared pool
  const sharedMem = await shared.write("researcher", "Key finding: TS is growing", ["shared-research"]);

  // Writer reads shared pool
  const writerShared = await shared.read("writer");
  console.log("Writer sees shared memories:", writerShared.length);

  console.log("Done! Check ./agent-memories/ for per-agent directories");
}

main().catch(console.error);
