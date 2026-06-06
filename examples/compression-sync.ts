/**
 * LLM compression + cloud sync example
 */
import {
  MemoryStore,
  FileBackend,
  MemoryCompressor,
  OpenAIAdapter,
  MemorySync,
  GitHubGistBackend,
} from "../src/index.js";

async function main() {
  const store = new MemoryStore(new FileBackend("./compressed-memories"));
  await store.init();

  // Add some memories (some old, some new)
  await store.create({
    content: "Old memory that should be compressed for efficiency",
    tags: ["old"],
    agent: "default",
  });

  await store.create({
    content: "Recent important memory to preserve",
    tags: ["important", "recent"],
    agent: "default",
  });

  // 1. LLM Compression (requires OPENAI_API_KEY)
  if (process.env.OPENAI_API_KEY) {
    const llm = new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY });
    const compressor = new MemoryCompressor(llm);

    // Get all memories and auto-compress when agent has more than threshold
    const allMemories = await store.listAll();
    const results = await compressor.autoCompress(allMemories, 1, {
      preserveTags: ["important"],
    });
    console.log("Compression results:", results.length, "groups compressed");
  } else {
    console.log("Set OPENAI_API_KEY to test LLM compression");
  }

  // 2. Cloud Sync (requires GITHUB_TOKEN)
  if (process.env.GITHUB_TOKEN) {
    const sync = new MemorySync(
      new GitHubGistBackend({ token: process.env.GITHUB_TOKEN }),
      "merge"
    );

    const allMemories = await store.listAll();
    const syncResult = await sync.sync(allMemories);
    console.log("Sync result:", syncResult.status, "- pushed:", syncResult.pushed, "pulled:", syncResult.pulled);
  } else {
    console.log("Set GITHUB_TOKEN to test cloud sync");
  }

  console.log("Done!");
}

main().catch(console.error);
