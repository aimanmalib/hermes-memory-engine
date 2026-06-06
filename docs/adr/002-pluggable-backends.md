# ADR-002: Pluggable Backend Architecture

## Status

Accepted

## Context

Memory storage needs to work across different environments:
- Development (file-based, inspectable)
- Production (SQLite, fast queries)
- Cloud (sync to Gist, S3, HTTP)

## Decision

Use a **pluggable backend interface** (`StorageBackend`) that all backends implement:

```typescript
interface StorageBackend {
  init(): Promise<void>;
  get(id: string): Promise<MemoryEntry | null>;
  set(id: string, entry: MemoryEntry): Promise<void>;
  delete(id: string): Promise<boolean>;
  list(options?: ListOptions): Promise<MemoryEntry[]>;
  close(): Promise<void>;
}
```

`MemoryStore` accepts any backend — swap without changing application code.

## Consequences

**Pros:**
- Test with in-memory backend, deploy with SQLite
- Users can implement custom backends (Redis, DynamoDB, etc.)
- Core logic is backend-agnostic

**Cons:**
- Interface must be stable — breaking changes affect all backends
- Some backend-specific features (FTS5, WAL mode) require backend-specific config
