/* global process, console */
// Print the Hermes-imported entries of a file-backed store as
// {"memory": [...], "user": [...]}, each list sorted by text (the store has no
// order of its own; order is checked through export-hermes instead).
// Usage: node store-dump.mjs <path to dist/index.js> <store dir>
import { pathToFileURL } from "node:url";

const [dist, dir] = process.argv.slice(2);
const { FileBackend, MemoryStore } = await import(pathToFileURL(dist).href);
const store = new MemoryStore(new FileBackend(dir));
await store.init();
const out = { memory: [], user: [] };
for (const e of await store.listAll()) {
  const target = e.metadata?.target;
  if (target === "memory" || target === "user") out[target].push(e.content);
}
for (const k of Object.keys(out)) out[k].sort();
console.log(JSON.stringify(out));
await store.close();
