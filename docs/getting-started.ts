/**
 * @file Getting Started with Hermes Memory Engine
 *
 * This guide walks you through the basics of using Hermes Memory Engine
 * in your project.
 */

/**
 * ## Installation
 *
 * ```bash
 * npm install hermes-memory-engine
 * ```
 *
 * ## Basic Usage
 *
 * ### 1. Create a Memory Store
 *
 * ```typescript
 * import { MemoryStore, FileBackend } from "hermes-memory-engine";
 *
 * const store = new MemoryStore(new FileBackend("./memories"));
 * await store.init();
 * ```
 *
 * ### 2. Add Memories
 *
 * ```typescript
 * const memory = await store.create({
 *   content: "User prefers dark mode",
 *   tags: ["preferences", "ui"],
 *   agent: "my-agent",
 * });
 * ```
 *
 * ### 3. Search Memories
 *
 * ```typescript
 * const results = await store.search({
 *   query: "dark mode",
 *   tags: ["preferences"],
 * });
 * ```
 *
 * ### 4. Multi-Agent Support
 *
 * ```typescript
 * import { AgentRegistry, AgentContext, FileBackend } from "hermes-memory-engine";
 *
 * const registry = new AgentRegistry(new FileBackend("./agent-memories"));
 * await registry.init();
 * const researcher = await registry.register({
 *   id: "researcher",
 *   name: "Research Agent",
 *   canAccessShared: true,
 *   canWriteShared: true,
 * });
 *
 * // Each agent has isolated memories
 * const ctx = new AgentContext(researcher.config, 2000);
 * ctx.loadMemories(await registry.getAgentMemories("researcher"));
 * const prompt = ctx.toSystemPrompt();
 * ```
 *
 * ### 5. LLM Compression
 *
 * ```typescript
 * import { MemoryCompressor, OpenAIAdapter } from "hermes-memory-engine";
 *
 * const llm = new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY ?? "" });
 * const compressor = new MemoryCompressor(llm);
 *
 * // Summarize the oldest memories of each agent that has more than 20.
 * // Returns the summaries; persisting them is up to you.
 * const results = await compressor.autoCompress(await store.listAll(), 20);
 * ```
 *
 * ### 6. Cloud Sync
 *
 * ```typescript
 * import { MemorySync, GitHubGistBackend } from "hermes-memory-engine";
 *
 * const sync = new MemorySync(new GitHubGistBackend({ token: "ghp_..." }), "merge");
 * await sync.sync(await store.listAll());
 * ```
 *
 * See the README for the full feature list.
 */
