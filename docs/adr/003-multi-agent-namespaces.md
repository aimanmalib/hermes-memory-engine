# ADR-003: Multi-Agent Namespace Isolation

## Status

Accepted

## Context

Multiple AI agents may share a memory system. Each agent should:
- Have its own private memories
- Optionally access shared memories
- Not see other agents' private memories

## Decision

Use **agent ID as namespace prefix** in the `agent` field of each memory entry.

- Private: `{ agent: "researcher" }` — only researcher sees this
- Shared: `{ agent: "shared" }` — any agent with `canAccessShared: true` sees this

`AgentRegistry` creates per-agent `MemoryStore` views that filter by agent ID. `SharedMemory` manages cross-agent permissions (read/write/admin).

## Consequences

**Pros:**
- Simple — no separate databases per agent
- Flexible permission model
- Shared memories work naturally with search

**Cons:**
- All agents share same backend (no resource isolation)
- Permission checks are application-level, not database-level
