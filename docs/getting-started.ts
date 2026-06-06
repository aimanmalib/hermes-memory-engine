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
 * npm install @aimanmalib/hermes-memory-engine
 * ```
 *
 * ## Basic Usage
 *
 * ### 1. Create a Memory Store
 *
 * ```typescript
 * import { MemoryStore, FileBackend } from "@aimanmalib/hermes-memory-engine";
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
 * import { AgentRegistry, AgentContext } from "@aimanmalib/hermes-memory-engine";
 *
 * const registry = new AgentRegistry(store);
 * registry.register("researcher", { name: "Research Agent" });
 * registry.register("writer", { name: "Writing Agent" });
 *
 * // Each agent has isolated memories
 * const ctx = new AgentContext(registry, store);
 * const prompt = await ctx.generateSystemPrompt("researcher", { maxTokens: 2000 });
 * ```
 *
 * ### 5. LLM Compression
 *
 * ```typescript
 * import { MemoryCompressor, OpenAIAdapter } from "@aimanmalib/hermes-memory-engine";
 *
 * const llm = new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY });
 * const compressor = new MemoryCompressor(llm);
 *
 * await compressor.autoCompress(store, { maxAgeDays: 30 });
 * ```
 *
 * ### 6. Cloud Sync
 *
 * ```typescript
 * import { MemorySync, GitHubGistBackend } from "@aimanmalib/hermes-memory-engine";
 *
 * const sync = new MemorySync(store, new GitHubGistBackend({ token: "ghp_..." }));
 * await sync.sync();
 * ```
 */
