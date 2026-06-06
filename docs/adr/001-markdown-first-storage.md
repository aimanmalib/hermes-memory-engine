# ADR-001: Markdown-First Storage

## Status

Accepted

## Context

AI agents need persistent memory. Options include:
1. Pure database (SQLite, PostgreSQL)
2. Pure markdown files
3. Hybrid (markdown + index)

## Decision

Use **markdown files with YAML frontmatter** as the primary storage format, with SQLite as an optional indexed backend.

Each memory = one `.md` file:
```yaml
---
id: abc123
created: 2025-01-15T10:30:00Z
tags: [preferences, coding]
agent: my-agent
---
User prefers TypeScript over JavaScript
```

## Consequences

**Pros:**
- Human-readable — users can inspect, edit, and diff memories
- Git-friendly — version control works out of the box
- No database dependency for basic usage
- Easy to migrate between systems

**Cons:**
- Slower than pure database for large memory sets
- File system limits (many small files)
- No ACID guarantees without SQLite backend

## Mitigation

SQLite backend provides indexed queries and ACID transactions when needed. Users choose at init time — same API either way.
