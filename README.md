# Hermes Memory Engine

[![CI](https://github.com/aimanmalib/hermes-memory-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/aimanmalib/hermes-memory-engine/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/hermes-memory-engine)](https://www.npmjs.com/package/hermes-memory-engine)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**A markdown-based memory library for AI agents, written in TypeScript.** Memories are plain `.md` files with YAML frontmatter (or rows in SQLite), with building blocks for multi-agent namespaces, LLM-based compression, cloud sync, encryption and snapshots. It can also read and write the `MEMORY.md` / `USER.md` files used by Hermes Agent.

> **Status:** early (0.x). The API may still change before 1.0.

<p align="center">
  <img src="docs/demo/demo.gif" alt="Terminal demo: hermes-memory init, add three memories for two agents, search, then list and print the Markdown files on disk" width="900">
</p>
<p align="center"><sub>Real output from the published npm package (<code>npm i -g hermes-memory-engine</code>), recorded with <a href="https://github.com/charmbracelet/vhs">VHS</a> from <a href="docs/demo/demo.tape"><code>docs/demo/demo.tape</code></a>. Nothing is sped up.</sub></p>

## Why?

AI agents need persistent, searchable, structured memory. Flat `.md` files are easy to read but hard to query; vector databases are powerful but heavy. This library sits in between:

- **Markdown-first** — one human-readable `.md` file per memory, grouped by agent
- **Pluggable storage** — `FileBackend` or `SQLiteBackend` behind the same `MemoryStore` API
- **Multi-agent** — per-agent namespaces, a shared pool with read/write/admin permissions, token-budgeted prompt context
- **LLM compression** — summarize batches of old memories with any LLM (OpenAI and Claude adapters included)
- **Sync** — push/pull to a GitHub Gist, S3-compatible storage, or your own HTTP endpoint
- **Encryption** — AES-256-GCM helpers (scrypt key derivation) to encrypt memory content before you store or sync it
- **Versioning** — in-memory snapshots with diff and rollback
- **Integrations** — tool schemas and handlers for OpenAI and Claude tool calling; Hermes Agent import/export

## Installation

```bash
npm install hermes-memory-engine
```

Requires Node.js 22.12 or newer. SQLite support uses the native [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) module, which is installed as a dependency.

## Quick Start

### CLI

The package ships a `hermes-memory` command. It stores memories in `./.hermes-memory` in the current directory.

```bash
# Create ./.hermes-memory
npx hermes-memory init

# Add a memory (tags are comma-separated; agent defaults to "default")
npx hermes-memory add "User prefers TypeScript and concise responses" \
  --tags preferences,ui --agent my-agent

# Search memories (optional: --tags, --agent, --limit)
npx hermes-memory search "typescript"

# List recent memories (optional: --agent, --limit)
npx hermes-memory list

# Import Hermes Agent's MEMORY.md / USER.md (default home: $HERMES_HOME or ~/.hermes)
npx hermes-memory import-hermes --home ~/.hermes

# Export back to Hermes format — this OVERWRITES MEMORY.md and USER.md
npx hermes-memory export-hermes --home ~/.hermes

# Demo only: runs compression with a mock LLM and prints the result; nothing is saved
npx hermes-memory compress --threshold 10
```

### Programmatic API

```typescript
import { MemoryStore, FileBackend } from "hermes-memory-engine";

// File-based storage (human-readable .md files)
const store = new MemoryStore(new FileBackend("./my-memories"));
await store.init();

// Create a memory
const memory = await store.create({
  content: "User prefers dark mode and concise responses",
  tags: ["preferences", "ui"],
  agent: "my-agent",
});

// Filter by text, tags, agent or date range
const results = await store.search({
  query: "dark mode",
  tags: ["preferences"],
  limit: 10,
});

// Read, update, list, delete
await store.get(memory.id);
await store.update(memory.id, { content: "User prefers dark mode" });
await store.listByAgent("my-agent");
await store.delete(memory.id);
```

### SQLite backend

```typescript
import { MemoryStore, SQLiteBackend } from "hermes-memory-engine";

const store = new MemoryStore(new SQLiteBackend("./memories.db"));
await store.init();

// Same API — swap backends without changing code
await store.create({ content: "Stored in SQLite", tags: ["example"] });
await store.close();
```

## Features

### Relevance-scored search

`MemoryStore.search` filters; `MemorySearch` ranks results by text match, tag boost and recency:

```typescript
import { MemorySearch, MemoryStore, FileBackend } from "hermes-memory-engine";

const store = new MemoryStore(new FileBackend("./my-memories"));
await store.init();

const ranked = new MemorySearch().search(await store.listAll(), {
  query: "dark mode",
  tagBoost: 2,
  limit: 5,
});
ranked.forEach((r) => console.log(r.score.toFixed(2), r.entry.content));
```

### Memory graph

Link memories with typed relationships (`related_to`, `derived_from`, `supersedes`, `contradicts`, `supports`):

```typescript
import { MemoryGraph, MemoryStore, FileBackend } from "hermes-memory-engine";

const store = new MemoryStore(new FileBackend("./my-memories"));
await store.init();
const a = await store.create({ content: "Project uses TypeScript" });
const b = await store.create({ content: "Project uses strict mode" });

const graph = new MemoryGraph();
graph.addNode(a);
graph.addNode(b);
graph.addEdge(a.id, b.id, "related_to");

const related = graph.findRelated(a.id, 2); // BFS, max depth 2
const clusters = graph.getClusters(); // connected groups
```

### Multi-agent

```typescript
import { AgentRegistry, AgentContext, SharedMemory, FileBackend } from "hermes-memory-engine";

// Agents share one backend; each gets its own namespace
const registry = new AgentRegistry(new FileBackend("./agent-memories"));
await registry.init();

const researcher = await registry.register({
  id: "researcher",
  name: "Research Agent",
  canAccessShared: true,
  canWriteShared: true,
});
await researcher.store.create({ content: "TypeScript adoption is growing", agent: "researcher" });

// Token-budgeted context for a system prompt
const ctx = new AgentContext(researcher.config, 2000);
ctx.loadMemories(await registry.getAgentMemories("researcher"));
const systemPrompt = ctx.toSystemPrompt();

// Shared pool with read / write / admin permissions
const shared = new SharedMemory(researcher.store);
shared.grant("researcher", "write");
shared.grant("writer", "read");
await shared.write("researcher", "Key finding: TS is growing", ["research"]);
const visibleToWriter = await shared.read("writer");
```

### LLM compression

`MemoryCompressor` summarizes batches of memories with any `LLMProvider` (an object with `complete(prompt): Promise<string>`). It returns the summaries; saving them and removing the originals is up to you.

```typescript
import { MemoryCompressor, OpenAIAdapter, MemoryStore, FileBackend } from "hermes-memory-engine";

const store = new MemoryStore(new FileBackend("./my-memories"));
await store.init();

const llm = new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY ?? "" });
const compressor = new MemoryCompressor(llm);

// For each agent with more than 20 memories, summarize the oldest ones
const results = await compressor.autoCompress(await store.listAll(), 20);
for (const r of results) {
  await store.create({ content: r.compressed.content, tags: r.compressed.tags, agent: r.compressed.agent });
}
```

### Cloud sync

`MemorySync` takes a sync backend and a conflict strategy (`local`, `remote`, `merge` — the default — or `manual`):

```typescript
import {
  MemorySync,
  GitHubGistBackend,
  S3Backend,
  HttpBackend,
  MemoryStore,
  FileBackend,
} from "hermes-memory-engine";

const store = new MemoryStore(new FileBackend("./my-memories"));
await store.init();

// GitHub Gist (a new secret gist is created if no gistId is given)
const gistSync = new MemorySync(new GitHubGistBackend({ token: process.env.GITHUB_TOKEN ?? "" }), "merge");
await gistSync.sync(await store.listAll()); // merge local + remote, upload the result

// S3-compatible storage (AWS S3, Cloudflare R2, MinIO, ...)
const s3Sync = new MemorySync(new S3Backend({ bucket: "my-memories", region: "us-east-1" }));
const { memories: remote } = await s3Sync.pull(); // fetch remote entries

// Your own server (PUT/GET/HEAD/DELETE /memories)
const httpSync = new MemorySync(new HttpBackend({ url: "https://example.com/api", token: "..." }));
await httpSync.push(await store.listAll());
```

### Encryption

```typescript
import { MemoryEncryption, MemoryStore, FileBackend } from "hermes-memory-engine";

const store = new MemoryStore(new FileBackend("./my-memories"));
await store.init();
const memory = await store.create({ content: "Sensitive fact" });

const encryption = new MemoryEncryption();
encryption.initWithPassphrase("my-secure-passphrase"); // scrypt-derived AES-256-GCM key

const encrypted = encryption.encryptMemory(memory); // content encrypted, metadata.encrypted = true
const decrypted = encryption.decryptMemory(encrypted);

const batch = encryption.encryptMemories(await store.listAll());
```

### Versioning

Snapshots are kept in memory; persist them yourself if you need them across restarts.

```typescript
import { MemoryVersioning, MemoryStore, FileBackend } from "hermes-memory-engine";

const store = new MemoryStore(new FileBackend("./my-memories"));
await store.init();

const versioning = new MemoryVersioning(50); // keep at most 50 snapshots

const before = versioning.commit(await store.listAll(), "Before refactor");
await store.create({ content: "New fact" });
const after = versioning.commit(await store.listAll(), "After refactor");

const diff = versioning.diff(before.id, after.id); // { added, removed, modified }
const restored = versioning.rollback(before.id); // memories as they were in that snapshot
```

### Integrations

#### OpenAI / Claude adapters

Both adapters can act as the LLM provider for compression and expose memory tools for agent tool calling:

```typescript
import { OpenAIAdapter, ClaudeAdapter, MemoryCompressor, MemoryStore, FileBackend } from "hermes-memory-engine";

const store = new MemoryStore(new FileBackend("./my-memories"));
await store.init();

const openai = new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY ?? "" });

// As LLM provider (for compression)
const compressor = new MemoryCompressor(openai);

// As tool provider: memory_add, memory_search, memory_list
const tools = openai.getToolSchemas(); // OpenAI function-calling format
const result = await openai.handleToolCall("memory_add", { content: "fact" }, store);

// System prompt block with recent memories
const promptBlock = await openai.getSystemPromptBlock(store, "my-agent");

// Same API for Claude (Anthropic Messages API; tool schemas use input_schema)
const claude = new ClaudeAdapter({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });
const claudeTools = claude.getToolSchemas();
```

#### Hermes Agent adapter

Read and write Hermes Agent's `§`-separated `MEMORY.md` / `USER.md` files:

```typescript
import { HermesMemoryAdapter, MemoryStore, FileBackend } from "hermes-memory-engine";

const store = new MemoryStore(new FileBackend("./my-memories"));
await store.init();

// hermesHome defaults to $HERMES_HOME or ~/.hermes
const hermes = new HermesMemoryAdapter({ hermesHome: "/path/to/.hermes" });

// Import MEMORY.md + USER.md into the store
const imported = await hermes.importFromHermes(store);

// Import, then write back (export overwrites the Hermes files)
await hermes.syncBidirectional(store, "both");
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
                  ┌───────────────┐
                  │ Integrations  │
                  │ OpenAI/Claude │
                  │ /Hermes       │
                  └───────────────┘
```

**Design principles:**
- **Pluggable backends** — implement `StorageBackend` or `SyncBackend` to add your own
- **Small dependency footprint** — runtime dependencies are `better-sqlite3`, `gray-matter` and `commander`; HTTP calls use the built-in `fetch`
- **Type-safe** — strict TypeScript, full type exports
- **Human-readable** — markdown files you can inspect, diff and edit by hand

Design decisions are recorded in [`docs/adr/`](docs/adr).

## CLI Reference

All commands use the store in `./.hermes-memory`.

| Command | Options | Description |
|---------|---------|-------------|
| `hermes-memory init [dir]` | | Create the store directory (default `./.hermes-memory`) |
| `hermes-memory add <content>` | `-t, --tags <tags>` · `-a, --agent <agent>` | Add a memory (tags comma-separated; agent defaults to `default`) |
| `hermes-memory search <query>` | `-t, --tags` · `-a, --agent` · `-l, --limit` (10) | Search memories by text, tags and agent |
| `hermes-memory list` | `-a, --agent` · `-l, --limit` (20) | List recent memories |
| `hermes-memory import-hermes` | `--home <path>` | Import Hermes Agent `MEMORY.md` / `USER.md` |
| `hermes-memory export-hermes` | `--home <path>` | Export to Hermes format (overwrites `MEMORY.md` / `USER.md`) |
| `hermes-memory compress` | `-a, --agent` · `--threshold <n>` (5) | Demo of compression with a mock LLM; prints results, saves nothing |
| `hermes-memory --version` / `--help` | | Show version / help |

## How this was built

hermes-memory-engine was built with AI coding assistance (Claude Code) under the direction of its author, Muhammad Aiman.

The evidence that it works is meant to be checkable:

- The test suite, run with `npm test`.
- CI on Node 22 and 24 for every pull request.
- The npm package [hermes-memory-engine](https://www.npmjs.com/package/hermes-memory-engine), published from this repository's CI with a provenance attestation.
- 2 tagged releases, with notes in [CHANGELOG.md](CHANGELOG.md).

## Contributing

Development needs Node.js 22.12 or newer.

1. Fork the repo
2. `npm ci`
3. `npm run typecheck && npm run lint && npm test`
4. `npm run build`
5. Open a PR (Conventional Commits, please)

Security issues: see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Muhammad Aiman

---

Built by [Sasa Teguh](https://sasateguh.com) · Malaysia
