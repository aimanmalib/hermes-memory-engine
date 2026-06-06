# 🧠 Hermes Memory Engine

[![CI](https://github.com/aimanmalib/hermes-memory-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/aimanmalib/hermes-memory-engine/actions)
[![npm](https://img.shields.io/npm/v/@aimanmalib/hermes-memory-engine)](https://www.npmjs.com/package/@aimanmalib/hermes-memory-engine)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-104%20passing-brightgreen)](https://github.com/aimanmalib/hermes-memory-engine/actions)

**A production-grade, markdown-based AI memory system for agents.** Multi-agent support, LLM-powered compression, cloud sync, encryption, and versioning — all in a single npm package.

## Why?

AI agents need persistent, searchable, structured memory. Existing solutions are either too simple (flat `.md` files) or too complex (full vector databases). Hermes Memory Engine bridges the gap:

- 📝 **Markdown-first** — memories are human-readable `.md` files with YAML frontmatter
- 🤖 **Multi-agent** — isolated namespaces with shared memory pools
- 🧹 **LLM-powered compression** — auto-summarize old memories to save context
- ☁️ **Cloud sync** — GitHub Gist, S3, or custom HTTP backends
- 🔒 **Encryption** — AES-256-GCM encryption at rest (optional)
- 📊 **Versioning** — snapshot history with diff and rollback
- 🔌 **Integrations** — Hermes Agent, OpenAI, and Claude adapters built-in

## Installation

```bash
npm install @aimanmalib/hermes-memory-engine
```

Or use the CLI directly:

```bash
npx hermes-memory init
```

## Quick Start

### CLI

```bash
# Initialize a memory store
npx hermes-memory init

# Add a memory
npx hermes-memory add "User prefers TypeScript and concise responses" \
  --tags preferences --agent my-agent

# Search memories
npx hermes-memory search "typescript"

# List recent memories
npx hermes-memory list

# Import from Hermes Agent format
npx hermes-memory import-hermes --home ~/.hermes

# Export to Hermes Agent format
npx hermes-memory export-hermes --home ~/.hermes

# Compress old memories (LLM-powered)
npx hermes-memory compress --threshold 10
```

### Programmatic API

```typescript
import {
  MemoryStore,
  FileBackend,
  SQLiteBackend,
} from "@aimanmalib/hermes-memory-engine";

// File-based storage (human-readable .md files)
const store = new MemoryStore(new FileBackend("./my-memories"));
await store.init();

// Create memories
const memory = await store.create({
  content: "User prefers dark mode and concise responses",
  tags: ["preferences", "ui"],
  agent: "my-agent",
});

// Search with relevance scoring
const results = await store.search({
  query: "dark mode",
  tags: ["preferences"],
  limit: 10,
});

// CRUD operations
await store.update(memory.id, { content: "Updated memory" });
await store.delete(memory.id);
await store.list({ agent: "my-agent", limit: 20 });
```

### SQLite Backend (for production)

```typescript
import { MemoryStore, SQLiteBackend } from "@aimanmalib/hermes-memory-engine";

const store = new MemoryStore(new SQLiteBackend("./memories.db"));
await store.init();

// Same API — swap backends without changing code
const memory = await store.create({
  content: "Production memory with indexed queries",
  tags: ["production"],
});
```

## Features

### Memory Graph

Link memories with typed relationships — `related_to`, `derived_from`, `supersedes`:

```typescript
import { MemoryGraph } from "@aimanmalib/hermes-memory-engine";

const graph = new MemoryGraph();
graph.addNode(memoryA);
graph.addNode(memoryB);
graph.addEdge(memoryA.id, memoryB.id, "related_to");

// BFS traversal, depth-limited
const related = graph.findRelated(memoryA.id, { maxDepth: 2 });

// Cycle-safe, cluster detection
const clusters = graph.detectClusters();
```

### Multi-Agent

```typescript
import {
  AgentRegistry,
  AgentContext,
  SharedMemory,
} from "@aimanmalib/hermes-memory-engine";

// Register agents with isolated namespaces
const registry = new AgentRegistry(store);
registry.register("agent-1", { name: "Research Agent" });
registry.register("agent-2", { name: "Writing Agent" });

// Per-agent context (token-aware compression for prompts)
const context = new AgentContext(registry, store);
const promptBlock = await context.generateSystemPrompt("agent-1", {
  maxTokens: 2000,
});

// Cross-agent shared memory with permissions
const shared = new SharedMemory(store);
shared.share(memory.id, "agent-2", "read");
```

### LLM Compression

```typescript
import {
  MemoryCompressor,
  OpenAIAdapter,
} from "@aimanmalib/hermes-memory-engine";

const llm = new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY });
const compressor = new MemoryCompressor(llm);

// Auto-compress memories older than 30 days
await compressor.autoCompress(store, {
  maxAgeDays: 30,
  preserveTags: ["important"],
});
```

### Cloud Sync

```typescript
import {
  MemorySync,
  GitHubGistBackend,
  S3Backend,
} from "@aimanmalib/hermes-memory-engine";

// Sync to GitHub Gist
const gistSync = new MemorySync(store, new GitHubGistBackend({ token: "ghp_..." }));
await gistSync.sync(); // Bidirectional

// Sync to S3/R2/MinIO
const s3Sync = new MemorySync(store, new S3Backend({
  bucket: "my-memories",
  region: "us-east-1",
  accessKeyId: "...",
  secretAccessKey: "...",
}));
await s3Sync.sync({ strategy: "merge" }); // local | remote | merge | manual
```

### Encryption

```typescript
import { MemoryEncryption } from "@aimanmalib/hermes-memory-engine";

const encryption = new MemoryEncryption("my-secure-passphrase");

// Encrypt at rest
const encrypted = encryption.encrypt(memory);
const decrypted = encryption.decrypt(encrypted);

// Batch operations
const encryptedBatch = encryption.encryptBatch(memories);
```

### Versioning

```typescript
import { MemoryVersioning } from "@aimanmalib/hermes-memory-engine";

const versioning = new MemoryVersioning({ maxSnapshots: 50 });

// Snapshot the current state
versioning.commit(store, "Before refactor");

// Diff between snapshots
const diff = versioning.diff(snapshot1, snapshot2);
// { added: [...], removed: [...], modified: [...] }

// Rollback
versioning.rollback(store, snapshot1);
```

### Integrations

#### OpenAI / Claude Adapters

Dual-purpose: use as LLM provider for compression OR as tool-calling schemas for agents:

```typescript
import {
  OpenAIAdapter,
  ClaudeAdapter,
} from "@aimanmalib/hermes-memory-engine";

// As LLM provider (for compression)
const openai = new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY });
const compressor = new MemoryCompressor(openai);

// As tool provider (for agent tool calling)
const schemas = openai.getToolSchemas();
const result = await openai.handleToolCall("memory_add", { content: "fact" }, store);

// System prompt injection with memory context
const promptBlock = await openai.getSystemPromptBlock(store, "my-agent");
```

Same API for `ClaudeAdapter` (Anthropic Messages API).

#### Hermes Agent Adapter

Read/write Hermes Agent's native `§`-format memory files:

```typescript
import { HermesMemoryAdapter } from "@aimanmalib/hermes-memory-engine";

const hermes = new HermesMemoryAdapter();

// Import from ~/.hermes/memories/
const memories = await hermes.importFromHermes(store, "~/.hermes");

// Bidirectional sync
await hermes.syncBidirectional(store, "~/.hermes");
```

## Architecture

```
┌─────────────┐    ┌─────────────┐    ┌──────────────┐
│  CLI / API  │───▶│ MemoryStore │───▶│   Backend    │
│             │    │             │    │ File / SQLite│
└─────────────┘    └──────┬──────┘    └──────────────┘
                          │
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
    ┌─────────────┐ ┌───────────┐ ┌────────────┐
    │ MemoryGraph │ │  Agents   │ │  Sync/Enc  │
    │ (relations) │ │ (multi)   │ │ (cloud)    │
    └─────────────┘ └───────────┘ └────────────┘
           │              │              │
           └──────────────┼──────────────┘
                          ▼
                   ┌─────────────┐
                   │ Integrations│
                   │ OpenAI/Claude│
                   │ /Hermes     │
                   └─────────────┘
```

**Design principles:**
- **Pluggable backends** — swap File ↔ SQLite ↔ custom without changing API
- **Zero dependencies for core** — only `better-sqlite3` for SQLite backend
- **Type-safe** — strict TypeScript, full type exports
- **Human-readable** — markdown files you can inspect, diff, and edit by hand

## CLI Reference

| Command | Description |
|---------|-------------|
| `hermes-memory init` | Initialize a memory store in current directory |
| `hermes-memory add "content"` | Add a memory (`--tags`, `--agent`) |
| `hermes-memory search "query"` | Search memories (full-text + tag filter) |
| `hermes-memory list` | List recent memories (`--agent`, `--limit`) |
| `hermes-memory import-hermes` | Import from Hermes Agent format (`--home`) |
| `hermes-memory export-hermes` | Export to Hermes Agent format (`--home`) |
| `hermes-memory compress` | LLM-powered compression (`--threshold`) |

## Project Status

| Phase | Status | Components |
|-------|--------|------------|
| 1. Foundation | ✅ | MemoryStore, FileBackend, SQLiteBackend, MemoryGraph |
| 2. Multi-Agent | ✅ | AgentRegistry, AgentContext, SharedMemory |
| 3. Intelligence | ✅ | MemoryCompressor, MemorySearch, MemoryConsolidation |
| 4. Sync & Distribution | ✅ | MemorySync, Gist/S3/HTTP backends, Encryption, Versioning |
| 5. Integration & CLI | ✅ | Hermes/OpenAI/Claude adapters, full CLI |
| 6. Polish & Launch | 🔄 | This phase |

**104 tests passing** · **Build clean** · **MIT License**

## Contributing

1. Fork the repo
2. `npm install` (uses `--legacy-peer-deps` if needed)
3. `npm test` — run all tests
4. `npm run build` — verify build
5. Open a PR

Conventional commits. All PRs credit `aimanmalib`.

## License

MIT © Aiman Malib
