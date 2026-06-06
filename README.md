# Hermes Memory Engine

A production-grade, markdown-based AI memory system with multi-agent support, LLM-powered compression, and cloud sync.

## Why?

AI agents need persistent, searchable, structured memory. Existing solutions are either too simple (flat `.md` files) or too complex (full databases). Hermes Memory Engine bridges the gap:

- **Markdown-first** — memories are human-readable `.md` files with YAML frontmatter
- **Multi-agent** — isolated namespaces with shared memory pools
- **LLM-powered** — auto-compress and summarize old memories
- **Cloud sync** — GitHub Gist, S3, or custom backends
- **Extensible** — plugin system for custom storage, compression, and sync

## Quick Start

```bash
npx hermes-memory init
npx hermes-memory add "User prefers dark mode and concise responses"
npx hermes-memory search "user preferences"
```

## Programmatic API

```typescript
import { MemoryStore } from "hermes-memory-engine";

const store = new MemoryStore(backend); // FileBackend or SQLiteBackend
await store.init();

// Create a memory
const memory = await store.create({
  content: "User prefers TypeScript over JavaScript",
  tags: ["preferences", "coding"],
  agent: "my-agent",
});

// Search memories
const results = await store.search({
  tags: ["preferences"],
  agent: "my-agent",
});

// Update a memory
await store.update(memory.id, {
  content: "User strongly prefers TypeScript over JavaScript",
});

// Delete a memory
await store.delete(memory.id);
```

## Memory Graph

Memories can be linked with typed relationships:

```typescript
import { MemoryGraph } from "hermes-memory-engine";

const graph = new MemoryGraph();
graph.addNode(memoryA);
graph.addNode(memoryB);
graph.addEdge(memoryA.id, memoryB.id, "related_to");

// Find all related memories (BFS, depth-limited)
const related = graph.findRelated(memoryA.id, { maxDepth: 2 });
```

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  CLI / API   │────▶│  MemoryStore │────▶│   Backend    │
│              │     │              │     │ (File/SQLite)│
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
                     ┌──────┴───────┐
                     │  MemoryGraph │
                     │  (relations) │
                     └──────────────┘
```

## Roadmap
- [x] Core memory store (file + SQLite backends)
- [x] Memory graph (linked memories)
- [x] Multi-agent support with isolated namespaces
- [x] LLM-powered memory compression
- [x] Full-text + semantic search
- [x] Cloud sync (GitHub Gist, S3)
- [x] Encryption at rest
- [x] Versioning
- [x] Phase 1-4 complete (90 tests passing, build green)
- [ ] Phase 5: Integration & CLI
  - [x] Hermes Agent adapter (done + verified)
  - [x] Claude/OpenAI adapters (basic LLMProvider + tool schemas + injection scaffolded)
  - [ ] Full `hermes-memory` CLI (commander dep ready)
- [ ] Phase 6: Polish & Launch (docs, 90%+ coverage, npm, Codex OSS app)

## License

MIT

## Integrations (Phase 5.2)

### OpenAI / Claude Adapters

Use as LLM provider for compression or as tool provider for agents:

```ts
import { OpenAIAdapter, ClaudeAdapter, MemoryCompressor, MemoryStore, FileBackend } from "hermes-memory-engine";

const openai = new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY });
const compressor = new MemoryCompressor(openai);

// Or for tool calling
const schemas = openai.getToolSchemas();
const result = await openai.handleToolCall("memory_add", { content: "fact" }, store);
```

Same for `ClaudeAdapter`.

Both support `getSystemPromptBlock(store, agent)` for injecting recent memories into system prompts.

## CLI (Phase 5.3)

```bash
npx hermes-memory init
npx hermes-memory add "User prefers concise answers" --tags style --agent default
npx hermes-memory search "concise"
npx hermes-memory list
npx hermes-memory import-hermes --home ~/.hermes
npx hermes-memory compress --threshold 5
```

