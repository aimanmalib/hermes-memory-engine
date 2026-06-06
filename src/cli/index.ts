/**
 * hermes-memory CLI
 * npx hermes-memory ...
 */

import { Command } from "commander";
import { join } from "node:path";
import { MemoryStore } from "../core/memory-store.js";
import { FileBackend } from "../core/file-backend.js";
import { HermesMemoryAdapter } from "../integrations/hermes.js";

const program = new Command();

program
  .name("hermes-memory")
  .description("Hermes Memory Engine — markdown-based AI memory CLI")
  .version("0.1.0");

function getDefaultStoreDir() {
  return join(process.cwd(), ".hermes-memory");
}

async function getStore(dir?: string): Promise<MemoryStore> {
  const baseDir = dir || getDefaultStoreDir();
  const backend = new FileBackend(baseDir);
  const store = new MemoryStore(backend);
  await store.init();
  return store;
}

program
  .command("init [dir]")
  .description("Initialize a local memory store directory")
  .action(async (dir) => {
    const target = dir || getDefaultStoreDir();
    const backend = new FileBackend(target);
    const store = new MemoryStore(backend);
    await store.init();
    console.log(`✅ Initialized memory store at ${target}`);
    console.log("Use: hermes-memory add \"your fact here\"");
  });

program
  .command("add <content>")
  .description("Add a new memory entry")
  .option("-t, --tags <tags>", "comma-separated tags")
  .option("-a, --agent <agent>", "agent namespace", "default")
  .action(async (content, opts) => {
    const store = await getStore();
    const tags = opts.tags ? opts.tags.split(",").map((t: string) => t.trim()) : [];
    const memory = await store.create({
      content,
      tags,
      agent: opts.agent,
    });
    console.log(`✅ Added memory ${memory.id}`);
    console.log(`   Agent: ${memory.agent}`);
    if (tags.length) console.log(`   Tags: ${tags.join(", ")}`);
  });

program
  .command("search <query>")
  .description("Search memories (full-text + tags)")
  .option("-t, --tags <tags>", "filter by comma-separated tags")
  .option("-a, --agent <agent>", "filter by agent")
  .option("-l, --limit <n>", "max results", "10")
  .action(async (query, opts) => {
    const store = await getStore();
    const tags = opts.tags ? opts.tags.split(",").map((t: string) => t.trim()) : undefined;
    const results = await store.search({
      query,
      tags,
      agent: opts.agent,
      limit: parseInt(opts.limit, 10),
    });
    if (results.length === 0) {
      console.log("No matches.");
      return;
    }
    console.log(`Found ${results.length} memory(ies):\n`);
    results.forEach((m, i) => {
      console.log(`${i + 1}. [${m.agent}] ${m.content.substring(0, 120)}${m.content.length > 120 ? "..." : ""}`);
      if (m.tags.length) console.log(`   Tags: ${m.tags.join(", ")}`);
      console.log(`   ID: ${m.id}`);
    });
  });

program
  .command("list")
  .description("List recent memories")
  .option("-a, --agent <agent>", "filter by agent")
  .option("-l, --limit <n>", "max results", "20")
  .action(async (opts) => {
    const store = await getStore();
    const results = await store.search({
      agent: opts.agent,
      limit: parseInt(opts.limit, 10),
    });
    if (results.length === 0) {
      console.log("No memories yet. Try: hermes-memory add \"...\"");
      return;
    }
    console.log(`Recent memories (${results.length}):\n`);
    results.forEach((m, i) => {
      console.log(`${i + 1}. [${m.agent}] ${m.content.substring(0, 100)}${m.content.length > 100 ? "..." : ""}`);
    });
  });

program
  .command("import-hermes")
  .description("Import existing memories from Hermes built-in (MEMORY.md / USER.md)")
  .option("--home <path>", "custom HERMES_HOME")
  .action(async (opts) => {
    const adapter = new HermesMemoryAdapter({ hermesHome: opts.home });
    const store = await getStore();
    const results = await adapter.importFromHermes(store);
    let total = 0;
    results.forEach((r) => {
      total += r.imported;
      console.log(`Imported ${r.imported} from ${r.target}`);
    });
    console.log(`✅ Total imported: ${total}`);
  });

program
  .command("export-hermes")
  .description("Export engine memories back to Hermes built-in format (overwrites MEMORY.md/USER.md)")
  .option("--home <path>", "custom HERMES_HOME")
  .action(async (opts) => {
    const adapter = new HermesMemoryAdapter({ hermesHome: opts.home });
    const store = await getStore();
    const memCount = await adapter.exportToHermes(store, "memory");
    const userCount = await adapter.exportToHermes(store, "user");
    console.log(`✅ Exported ${memCount} to MEMORY.md, ${userCount} to USER.md`);
  });

program
  .command("compress")
  .description("Compress old memories (demo with mock LLM; real via OpenAI/Claude adapter)")
  .option("-a, --agent <agent>", "filter by agent")
  .option("--threshold <n>", "min memories per agent before compress", "5")
  .action(async (opts) => {
    const store = await getStore();
    const all = await store.search({ agent: opts.agent });
    if (all.length === 0) {
      console.log("No memories to compress.");
      return;
    }
    const mockLLM = {
      async complete(_prompt: string): Promise<string> {
        return `Compressed summary: consolidated ${all.length} memories into key facts, decisions and preferences. (Demo - no real LLM used)`;
      },
    };
    const { MemoryCompressor } = await import("../core/memory-compress.js");
    const compressor = new MemoryCompressor(mockLLM as any);
    const results = await compressor.autoCompress(all, parseInt(opts.threshold, 10));
    console.log(`✅ Compressed ${results.length} batch(es) (demo).`);
    results.forEach((r, i) => {
      console.log(`${i + 1}. Ratio: ${(r.ratio * 100).toFixed(0)}%`);
    });
  });

program.parseAsync(process.argv).catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
