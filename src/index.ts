export { MemoryStore } from "./core/memory-store.js";
export { MemoryGraph } from "./core/memory-graph.js";
export { FileBackend } from "./core/file-backend.js";
export { SQLiteBackend } from "./core/sqlite-backend.js";
export { AgentRegistry } from "./agents/agent-registry.js";
export { AgentContext } from "./agents/agent-context.js";
export { SharedMemory } from "./agents/shared-memory.js";
export type {
  MemoryEntry,
  MemoryId,
  AgentId,
  MemoryRelation,
  CreateMemoryInput,
  UpdateMemoryInput,
  SearchOptions,
  StorageBackend,
  CompressionResult,
  SyncStatus,
  MemoryPlugin,
} from "./core/types.js";
export type { AgentConfig, AgentInstance } from "./agents/agent-registry.js";
export type { SerializedContext } from "./agents/agent-context.js";
export type { Permission, AgentPermission } from "./agents/shared-memory.js";
